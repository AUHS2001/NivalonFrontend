import * as THREE from 'three';
import { cache, imageLoader } from '@cornerstonejs/core';
import { segmentation as cstSegmentation, Enums as csToolsEnums, Types as cstTypes } from '@cornerstonejs/tools';
import { addColorLUT } from '@cornerstonejs/tools/segmentation/addColorLUT';
import { getNextColorLUTIndex } from '@cornerstonejs/tools/segmentation/getNextColorLUTIndex';
import { triggerSegmentationDataModified } from '@cornerstonejs/tools/segmentation/triggerSegmentationEvents';

export interface VoxelUndoSnapshot {
  maskedVoxels: Map<number, number>; // linearIndex → original HU
  volumeId: string;
}

interface VolumeInfo {
  volume: any;
  dims: number[];
  spacing: number[];
  origin: number[];
  direction: number[];
  vtkImageData: any;
  volumeId: string;
}

const BONE_HU_THRESHOLD = 250;
const AIR_HU = -1000;

// ---- Red overlay state ----
const BONE_REMOVAL_SEG_ID = 'boneRemovalOverlay';
const LABELMAP = csToolsEnums.SegmentationRepresentations.Labelmap;
let overlayInitialized = false;
let overlayImageIds: string[] = [];

// ---- Volume access (reuses pattern from vertebraContourOverlayManager.ts) ----

function getViewportsAndBounds(servicesManager: any) {
  const { cornerstoneViewportService, viewportGridService } = servicesManager?.services || {};
  if (!cornerstoneViewportService || !viewportGridService) {
    return { viewports: [] as any[], volumeBounds: null as any };
  }
  const viewportState = viewportGridService.getState();
  const viewports = viewportState?.viewports;
  if (!viewports) return { viewports: [] as any[], volumeBounds: null as any };

  const result: Array<{ viewportId: string; viewport: any; element: HTMLElement }> = [];
  let volumeBounds: any = null;

  const entries = viewports instanceof Map
    ? Array.from(viewports.entries())
    : Object.entries(viewports);

  entries.forEach(([viewportId, viewportInfo]: [string, any]) => {
    const opts = viewportInfo?.viewportOptions || {};
    if (opts.customLayout === 'karachi' || viewportId === 'karachiViewport') return;
    try {
      const viewport = cornerstoneViewportService.getCornerstoneViewport(viewportId);
      if (viewport && viewport.element) {
        result.push({ viewportId, viewport, element: viewport.element });
        if (!volumeBounds) {
          try {
            const imageData = viewport.getImageData?.();
            if (imageData) {
              volumeBounds = {
                origin: imageData.origin || [0, 0, 0],
                dimensions: imageData.dimensions || [512, 512, 100],
                spacing: imageData.spacing || [1, 1, 1],
              };
            }
          } catch (e) { /* ignore */ }
        }
      }
    } catch (e) { /* ignore */ }
  });
  return { viewports: result, volumeBounds };
}

export function getVolumeAndData(servicesManager: any): VolumeInfo | null {
  const { viewports } = getViewportsAndBounds(servicesManager);
  if (viewports.length === 0) return null;

  for (const { viewport } of viewports) {
    try {
      let vol: any = null;
      let volumeId = '';

      if (typeof viewport.getAllVolumeIds === 'function') {
        const volumeIds = viewport.getAllVolumeIds();
        for (const vid of volumeIds) {
          vol = (cache as any).getVolume?.(vid);
          if (vol) { volumeId = vid; break; }
        }
      }
      if (!vol) {
        const actors = viewport.getActors?.();
        if (actors?.length) {
          const id = (actors[0] as any).referencedId || actors[0].uid;
          vol = (cache as any).getVolume?.(id);
          if (vol) volumeId = id;
        }
      }
      if (!vol) continue;

      let vtkImageData: any = null;
      try { vtkImageData = vol.imageData; } catch {}

      const dims: number[] = Array.from(vol.dimensions);
      const spacing: number[] = Array.from(vol.spacing);
      const origin: number[] = Array.from(vol.origin);
      const direction: number[] = vol.direction ? Array.from(vol.direction) : [1, 0, 0, 0, 1, 0, 0, 0, 1];

      if (dims.length < 3 || dims[0] === 0) continue;
      if (!vol.imageIds || vol.imageIds.length === 0) continue;

      return { volume: vol, dims, spacing, origin, direction, vtkImageData, volumeId };
    } catch (e) { continue; }
  }
  return null;
}

/**
 * Get per-slice scalar data arrays from the image cache.
 * These are the ACTUAL TypedArrays that vtkStreamingOpenGLTexture reads
 * from when uploading frames to the GPU via gl.texSubImage3D.
 * Writing to these arrays directly ensures the GPU sees our changes.
 */
function getSliceScalarArrays(volume: any, numSlices: number): (any | null)[] {
  const imageIds = volume.imageIds;
  if (!imageIds || imageIds.length === 0) return [];

  const arrays: (any | null)[] = new Array(numSlices);
  for (let k = 0; k < numSlices; k++) {
    try {
      const image = (cache as any).getImage?.(imageIds[k]);
      if (image?.voxelManager) {
        arrays[k] = image.voxelManager.getScalarData?.() || null;
      } else {
        arrays[k] = null;
      }
    } catch {
      arrays[k] = null;
    }
  }
  return arrays;
}

// ---- Vertex extraction ----

export function extractRemovedVerticesFromLasso(
  meshes: THREE.Mesh[],
  prevGeometries: THREE.BufferGeometry[]
): THREE.Vector3[] {
  const removedVertices: THREE.Vector3[] = [];

  meshes.forEach((mesh, idx) => {
    if (idx >= prevGeometries.length) return;
    const prevGeom = prevGeometries[idx];
    const currGeom = mesh.geometry;

    const prevIndex = prevGeom.getIndex();
    const currIndex = currGeom.getIndex();
    if (!prevIndex) return;
    if (currIndex && prevIndex.count === currIndex.count) return;

    const currTriSet = new Set<string>();
    if (currIndex) {
      for (let i = 0; i < currIndex.count; i += 3) {
        currTriSet.add(`${currIndex.getX(i)}_${currIndex.getX(i + 1)}_${currIndex.getX(i + 2)}`);
      }
    }

    const removedVertexIndices = new Set<number>();
    for (let i = 0; i < prevIndex.count; i += 3) {
      const a = prevIndex.getX(i), b = prevIndex.getX(i + 1), c = prevIndex.getX(i + 2);
      if (!currTriSet.has(`${a}_${b}_${c}`)) {
        removedVertexIndices.add(a);
        removedVertexIndices.add(b);
        removedVertexIndices.add(c);
      }
    }

    const position = prevGeom.getAttribute('position');
    mesh.updateMatrixWorld(true);
    removedVertexIndices.forEach(vi => {
      const v = new THREE.Vector3(
        position.getX(vi), position.getY(vi), position.getZ(vi)
      ).applyMatrix4(mesh.matrixWorld);
      removedVertices.push(v);
    });
  });

  return removedVertices;
}

export function extractRemovedVerticesFromClick(removedMesh: THREE.Mesh): THREE.Vector3[] {
  const vertices: THREE.Vector3[] = [];
  const position = removedMesh.geometry.getAttribute('position');
  if (!position) return vertices;

  removedMesh.updateMatrixWorld(true);
  for (let i = 0; i < position.count; i++) {
    const v = new THREE.Vector3(
      position.getX(i), position.getY(i), position.getZ(i)
    ).applyMatrix4(removedMesh.matrixWorld);
    vertices.push(v);
  }
  return vertices;
}

// ---- STL bounds (same logic as vertebraContourOverlayManager.ts) ----

export function computeSTLBounds(meshes: THREE.Mesh[]): { min: THREE.Vector3; max: THREE.Vector3 } {
  const min = new THREE.Vector3(Infinity, Infinity, Infinity);
  const max = new THREE.Vector3(-Infinity, -Infinity, -Infinity);

  meshes.forEach(mesh => {
    const userData = mesh.userData;
    if (!userData || !['C', 'T', 'L', 'S'].includes(userData.type)) return;
    const geometry = mesh.geometry;
    geometry.computeBoundingBox();
    if (!geometry.boundingBox) return;
    mesh.updateMatrixWorld(true);
    const bmin = geometry.boundingBox.min.clone().applyMatrix4(mesh.matrixWorld);
    const bmax = geometry.boundingBox.max.clone().applyMatrix4(mesh.matrixWorld);
    min.min(bmin);
    max.max(bmax);
  });

  return { min, max };
}

// ---- Core masking ----

export function maskVoxelsForRemovedVertices(
  removedVertices: THREE.Vector3[],
  stlBounds: { min: THREE.Vector3; max: THREE.Vector3 },
  servicesManager: any,
  maskRadiusMM: number = 2.0
): VoxelUndoSnapshot | null {
  if (removedVertices.length === 0) return null;

  const volumeInfo = getVolumeAndData(servicesManager);
  if (!volumeInfo) {
    console.warn('VoxelMasking: no volume data');
    return null;
  }

  const { volume, dims, spacing, origin, direction, vtkImageData, volumeId } = volumeInfo;

  // Get per-slice scalar arrays — these ARE the buffers the GPU texture reads from.
  // In Cornerstone3D v2 streaming volumes, vtkStreamingOpenGLTexture reads from
  // cache.getImage(imageIds[k]).voxelManager.getScalarData() for each slice k.
  // Writing directly to these arrays means the GPU will see our changes.
  const sliceArrays = getSliceScalarArrays(volume, dims[2]);
  const loadedSlices = sliceArrays.filter(a => a !== null).length;
  if (loadedSlices === 0) {
    console.warn('VoxelMasking: no slice data loaded from image cache');
    return null;
  }
  console.log(`VoxelMasking: ${loadedSlices}/${dims[2]} slices loaded from image cache`);

  const sliceSize = dims[0] * dims[1];

  // STL→DICOM transform (replicating transformSTLToDICOMWorld from useCenterLine.ts)
  const stlSize = new THREE.Vector3().subVectors(stlBounds.max, stlBounds.min);
  const stlCenter = new THREE.Vector3().addVectors(stlBounds.min, stlBounds.max).multiplyScalar(0.5);
  const volumeSize = [
    dims[0] * spacing[0],
    dims[1] * spacing[1],
    dims[2] * spacing[2],
  ];
  const volumeCenter = [
    origin[0] + volumeSize[0] / 2,
    origin[1] + volumeSize[1] / 2,
    origin[2] + volumeSize[2] / 2,
  ];
  const uniformScale = stlSize.z > 0.001 ? volumeSize[2] / stlSize.z : 1;

  const maskedVoxels = new Map<number, number>();

  // Mask radius in voxels per axis
  const radiusVoxels = [
    Math.ceil(maskRadiusMM / spacing[0]),
    Math.ceil(maskRadiusMM / spacing[1]),
    Math.ceil(maskRadiusMM / spacing[2]),
  ];
  const radiusSqMM = maskRadiusMM * maskRadiusMM;

  // Track AABB of masked region for flood fill
  let minI = dims[0], maxI = 0;
  let minJ = dims[1], maxJ = 0;
  let minK = dims[2], maxK = 0;

  for (const vertex of removedVertices) {
    // STL → DICOM world
    const offset = new THREE.Vector3().subVectors(vertex, stlCenter);
    const dicomWorld: [number, number, number] = [
      volumeCenter[0] + offset.x * uniformScale,
      volumeCenter[1] - offset.y * uniformScale, // Negate Y
      volumeCenter[2] + offset.z * uniformScale,
    ];

    // DICOM world → voxel IJK
    let vi: number, vj: number, vk: number;
    if (vtkImageData && typeof vtkImageData.worldToIndex === 'function') {
      const idx = [0, 0, 0];
      vtkImageData.worldToIndex(dicomWorld, idx);
      vi = Math.round(idx[0]);
      vj = Math.round(idx[1]);
      vk = Math.round(idx[2]);
    } else {
      const ox = dicomWorld[0] - origin[0];
      const oy = dicomWorld[1] - origin[1];
      const oz = dicomWorld[2] - origin[2];
      vi = Math.round((direction[0] * ox + direction[3] * oy + direction[6] * oz) / spacing[0]);
      vj = Math.round((direction[1] * ox + direction[4] * oy + direction[7] * oz) / spacing[1]);
      vk = Math.round((direction[2] * ox + direction[5] * oy + direction[8] * oz) / spacing[2]);
    }

    // Mask sphere of voxels around this vertex
    for (let dk = -radiusVoxels[2]; dk <= radiusVoxels[2]; dk++) {
      const k = vk + dk;
      if (k < 0 || k >= dims[2] || !sliceArrays[k]) continue;
      for (let dj = -radiusVoxels[1]; dj <= radiusVoxels[1]; dj++) {
        const j = vj + dj;
        if (j < 0 || j >= dims[1]) continue;
        for (let di = -radiusVoxels[0]; di <= radiusVoxels[0]; di++) {
          const i = vi + di;
          if (i < 0 || i >= dims[0]) continue;

          // Sphere distance check (squared, in mm)
          const distSq = (di * spacing[0]) ** 2 + (dj * spacing[1]) ** 2 + (dk * spacing[2]) ** 2;
          if (distSq > radiusSqMM) continue;

          const pixelIdx = i + j * dims[0];
          const linearIdx = pixelIdx + k * sliceSize;
          const hu = sliceArrays[k][pixelIdx];

          // Only mask bone voxels
          if (hu > BONE_HU_THRESHOLD) {
            if (!maskedVoxels.has(linearIdx)) {
              maskedVoxels.set(linearIdx, hu);
            }
            sliceArrays[k][pixelIdx] = AIR_HU;

            // Update AABB
            if (i < minI) minI = i; if (i > maxI) maxI = i;
            if (j < minJ) minJ = j; if (j > maxJ) maxJ = j;
            if (k < minK) minK = k; if (k > maxK) maxK = k;
          }
        }
      }
    }
  }

  // Flood fill interior: BFS from masked voxels into neighboring bone within AABB
  if (maskedVoxels.size > 0) {
    const pad = 3;
    minI = Math.max(0, minI - pad); maxI = Math.min(dims[0] - 1, maxI + pad);
    minJ = Math.max(0, minJ - pad); maxJ = Math.min(dims[1] - 1, maxJ + pad);
    minK = Math.max(0, minK - pad); maxK = Math.min(dims[2] - 1, maxK + pad);

    const queue: number[] = [];
    const visited = new Set<number>();

    // Seed with already-masked voxels
    maskedVoxels.forEach((_, linearIdx) => {
      queue.push(linearIdx);
      visited.add(linearIdx);
    });

    const neighborOffsets = [
      [-1, 0, 0], [1, 0, 0],
      [0, -1, 0], [0, 1, 0],
      [0, 0, -1], [0, 0, 1],
    ];

    let head = 0;
    while (head < queue.length) {
      const idx = queue[head++];
      const ci = idx % dims[0];
      const cj = Math.floor((idx % sliceSize) / dims[0]);
      const ck = Math.floor(idx / sliceSize);

      for (const [di, dj, dk] of neighborOffsets) {
        const ni = ci + di, nj = cj + dj, nk = ck + dk;
        if (ni < minI || ni > maxI || nj < minJ || nj > maxJ || nk < minK || nk > maxK) continue;
        if (!sliceArrays[nk]) continue;

        const nLinearIdx = ni + nj * dims[0] + nk * sliceSize;
        if (visited.has(nLinearIdx)) continue;
        visited.add(nLinearIdx);

        const nPixelIdx = ni + nj * dims[0];
        if (sliceArrays[nk][nPixelIdx] > BONE_HU_THRESHOLD) {
          maskedVoxels.set(nLinearIdx, sliceArrays[nk][nPixelIdx]);
          sliceArrays[nk][nPixelIdx] = AIR_HU;
          queue.push(nLinearIdx);
        }
      }
    }
  }

  if (maskedVoxels.size === 0) {
    console.warn('VoxelMasking: 0 voxels masked — coordinates may be out of bone range');
    return null;
  }

  console.log(`VoxelMasking: masked ${maskedVoxels.size} voxels`);
  return { maskedVoxels, volumeId };
}

// ---- Re-render ----

export function forceRerenderMPRViewports(servicesManager: any): void {
  const volumeInfo = getVolumeAndData(servicesManager);
  if (!volumeInfo) return;

  const { volume, dims, vtkImageData } = volumeInfo;

  // Mark all slices as dirty on the GPU texture so it re-reads from per-image buffers
  if (volume.vtkOpenGLTexture) {
    for (let k = 0; k < dims[2]; k++) {
      volume.vtkOpenGLTexture.setUpdatedFrame(k);
    }
  }

  // Bump vtkImageData MTime so the mapper detects the change
  if (vtkImageData) vtkImageData.modified();

  // Trigger render on all viewports
  try {
    const { cornerstoneViewportService } = servicesManager?.services || {};
    if (!cornerstoneViewportService) return;

    const renderingEngine = cornerstoneViewportService.getRenderingEngine();
    if (renderingEngine) renderingEngine.render();
  } catch (e) {
    console.warn('VoxelMasking: render error', e);
  }
}

// ---- Undo ----

export function restoreVoxels(snapshot: VoxelUndoSnapshot, servicesManager: any): void {
  const volumeInfo = getVolumeAndData(servicesManager);
  if (!volumeInfo) return;

  const { volume, dims } = volumeInfo;
  const sliceArrays = getSliceScalarArrays(volume, dims[2]);
  const sliceSize = dims[0] * dims[1];

  snapshot.maskedVoxels.forEach((originalHU, linearIdx) => {
    const k = Math.floor(linearIdx / sliceSize);
    const pixelIdx = linearIdx % sliceSize;
    if (k >= 0 && k < dims[2] && sliceArrays[k]) {
      sliceArrays[k][pixelIdx] = originalHU;
    }
  });

  console.log(`VoxelMasking: restored ${snapshot.maskedVoxels.size} voxels`);
  forceRerenderMPRViewports(servicesManager);
}

// ---- Red overlay on DICOM views ----

async function ensureBoneRemovalOverlay(servicesManager: any): Promise<boolean> {
  if (overlayInitialized) return true;

  const volumeInfo = getVolumeAndData(servicesManager);
  if (!volumeInfo) {
    console.warn('BoneRemovalOverlay: no volume data');
    return false;
  }

  const { volume } = volumeInfo;
  const referenceImageIds: string[] = volume.imageIds;
  if (!referenceImageIds || referenceImageIds.length === 0) {
    console.warn('BoneRemovalOverlay: no reference imageIds');
    return false;
  }

  try {
    // Create blank labelmap slices derived from the reference images
    const derivedImages = await imageLoader.createAndCacheDerivedLabelmapImages(referenceImageIds);
    overlayImageIds = derivedImages.map((img: any) => img.imageId);

    // Register the segmentation
    cstSegmentation.addSegmentations([
      {
        segmentationId: BONE_REMOVAL_SEG_ID,
        representation: {
          type: LABELMAP,
          data: {
            imageIds: overlayImageIds,
            referencedImageIds: referenceImageIds,
          },
        },
      } as any,
    ]);

    // Create red color LUT: index 0 = transparent, index 1 = semi-transparent red
    const redLUT: [number, number, number, number][] = [
      [0, 0, 0, 0],
      [255, 0, 0, 128],
    ];
    const lutIndex = getNextColorLUTIndex();
    addColorLUT(redLUT as any, lutIndex);

    // Add representation to all MPR viewports
    const { viewports } = getViewportsAndBounds(servicesManager);
    for (const { viewportId } of viewports) {
      try {
        cstSegmentation.addSegmentationRepresentations(viewportId, [
          {
            segmentationId: BONE_REMOVAL_SEG_ID,
            type: LABELMAP,
            config: { colorLUTOrIndex: lutIndex },
          },
        ]);
      } catch (e) {
        console.warn(`BoneRemovalOverlay: failed to add representation to ${viewportId}`, e);
      }
    }

    overlayInitialized = true;
    console.log('BoneRemovalOverlay: initialized with', overlayImageIds.length, 'slices');
    return true;
  } catch (e) {
    console.error('BoneRemovalOverlay: initialization failed', e);
    return false;
  }
}

export async function markRemovedVoxelsRed(
  snapshot: VoxelUndoSnapshot,
  servicesManager: any
): Promise<void> {
  const ok = await ensureBoneRemovalOverlay(servicesManager);
  if (!ok || !snapshot) return;

  const volumeInfo = getVolumeAndData(servicesManager);
  if (!volumeInfo) return;

  const { dims } = volumeInfo;
  const sliceSize = dims[0] * dims[1];
  const modifiedSlices = new Set<number>();

  snapshot.maskedVoxels.forEach((_, linearIdx) => {
    const k = Math.floor(linearIdx / sliceSize);
    const pixelIdx = linearIdx % sliceSize;
    if (k < 0 || k >= overlayImageIds.length) return;

    try {
      const img = (cache as any).getImage?.(overlayImageIds[k]);
      if (img?.voxelManager) {
        const scalarData = img.voxelManager.getScalarData?.();
        if (scalarData) {
          scalarData[pixelIdx] = 1; // segment 1 = red
          modifiedSlices.add(k);
        }
      }
    } catch {}
  });

  if (modifiedSlices.size > 0) {
    // Don't pass modifiedSlicesToUse — a full update ensures sagittal/coronal
    // views fully reconstruct the segmentation overlay (partial slice updates
    // can miss the extremities in reformatted orientations).
    triggerSegmentationDataModified(BONE_REMOVAL_SEG_ID);
  }
  console.log(`BoneRemovalOverlay: marked ${snapshot.maskedVoxels.size} voxels red on ${modifiedSlices.size} slices`);
}

export async function clearRemovedVoxelsRed(
  snapshot: VoxelUndoSnapshot,
  servicesManager: any
): Promise<void> {
  if (!overlayInitialized || !snapshot) return;

  const volumeInfo = getVolumeAndData(servicesManager);
  if (!volumeInfo) return;

  const { dims } = volumeInfo;
  const sliceSize = dims[0] * dims[1];
  const modifiedSlices = new Set<number>();

  snapshot.maskedVoxels.forEach((_, linearIdx) => {
    const k = Math.floor(linearIdx / sliceSize);
    const pixelIdx = linearIdx % sliceSize;
    if (k < 0 || k >= overlayImageIds.length) return;

    try {
      const img = (cache as any).getImage?.(overlayImageIds[k]);
      if (img?.voxelManager) {
        const scalarData = img.voxelManager.getScalarData?.();
        if (scalarData) {
          scalarData[pixelIdx] = 0; // clear segment
          modifiedSlices.add(k);
        }
      }
    } catch {}
  });

  if (modifiedSlices.size > 0) {
    triggerSegmentationDataModified(BONE_REMOVAL_SEG_ID);
  }
  console.log(`BoneRemovalOverlay: cleared ${snapshot.maskedVoxels.size} voxels on ${modifiedSlices.size} slices`);
}

export async function clearAllBoneRemovalOverlay(servicesManager: any): Promise<void> {
  if (!overlayInitialized) return;

  const modifiedSlices: number[] = [];
  for (let k = 0; k < overlayImageIds.length; k++) {
    try {
      const img = (cache as any).getImage?.(overlayImageIds[k]);
      if (img?.voxelManager) {
        const scalarData = img.voxelManager.getScalarData?.();
        if (scalarData) {
          let modified = false;
          for (let i = 0; i < scalarData.length; i++) {
            if (scalarData[i] !== 0) {
              scalarData[i] = 0;
              modified = true;
            }
          }
          if (modified) modifiedSlices.push(k);
        }
      }
    } catch {}
  }

  if (modifiedSlices.length > 0) {
    triggerSegmentationDataModified(BONE_REMOVAL_SEG_ID);
  }
  console.log(`BoneRemovalOverlay: cleared all overlay on ${modifiedSlices.length} slices`);
}
