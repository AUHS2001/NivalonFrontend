import * as THREE from 'three';
import { Enums, cache } from '@cornerstonejs/core';

/**
 * Vertebra contour overlay manager.
 * Draws colored bone OUTLINE on DICOM viewports using CT voxel data directly.
 * Only the outer edge of bone is drawn — no fill, no interior.
 *
 * Pipeline:
 * 1. Threshold CT for bone (HU > 250) near spine
 * 2. Morphological close (dilate+erode) to seal internal gaps
 * 3. Assign bone pixels to nearest vertebra
 * 4. Boundary detection: bone pixel with at least one background neighbor
 * 5. Draw boundary pixels directly on canvas as small colored dots
 */

const VERTEBRA_COLORS: { [key: string]: number } = {
  C1: 0x4169E1, C2: 0x4682B4, C3: 0x5F9EA0, C4: 0x6495ED, C5: 0x00CED1, C6: 0x20B2AA, C7: 0x48D1CC,
  T1: 0xCD5C5C, T2: 0xDC143C, T3: 0xB22222, T4: 0xC71585, T5: 0xDB7093, T6: 0xFF69B4,
  T7: 0xFFB6C1, T8: 0xFFA07A, T9: 0xFA8072, T10: 0xE9967A, T11: 0xF08080, T12: 0xCD5C5C,
  L1: 0xADFF2F, L2: 0xBDB76B, L3: 0xFF00FF, L4: 0x9932CC, L5: 0x32CD32,
  S1: 0x00FFFF, S2: 0xFF00FF, S3: 0xDA70D6, S4: 0xBA55D3, S5: 0x9400D3,
};

const DEFAULT_COLORS = [0xCD5C5C, 0xADFF2F, 0xBDB76B, 0xFF00FF, 0x9932CC, 0x32CD32, 0x00FFFF, 0xDA70D6, 0xFFD700, 0xFF6347];

const BONE_HU_THRESHOLD = 250;
const VERTEBRA_RADIUS_MM = 80;

interface VertebraInfo {
  label: string;
  color: number;
  cssColor: string; // precomputed rgba string
  stlCenter: THREE.Vector3;
  dicomCenter: [number, number, number];
}

interface ContourState {
  vertebrae: VertebraInfo[];
  stlBoundsMin: THREE.Vector3;
  stlBoundsMax: THREE.Vector3;
  enabled: boolean;
  canvases: Map<string, HTMLCanvasElement>;
  eventListeners: Array<{ element: any; event: string; handler: (e: any) => void }>;
  dicomZComputed: boolean;
}

const state: ContourState = {
  vertebrae: [],
  stlBoundsMin: new THREE.Vector3(),
  stlBoundsMax: new THREE.Vector3(),
  enabled: false,
  canvases: new Map(),
  eventListeners: [],
  dicomZComputed: false,
};

let servicesManagerRef: any = null;

function hexToRGBA(hex: number, alpha: number): string {
  const r = (hex >> 16) & 0xFF;
  const g = (hex >> 8) & 0xFF;
  const b = hex & 0xFF;
  return `rgba(${r},${g},${b},${alpha})`;
}

export function storeMeshDataForContours(meshes: THREE.Mesh[]) {
  state.vertebrae = [];
  state.dicomZComputed = false;

  const globalMin = new THREE.Vector3(Infinity, Infinity, Infinity);
  const globalMax = new THREE.Vector3(-Infinity, -Infinity, -Infinity);

  meshes.forEach((mesh, index) => {
    const userData = mesh.userData;
    if (!userData || !['C', 'T', 'L', 'S'].includes(userData.type)) return;

    const geometry = mesh.geometry;
    geometry.computeBoundingBox();
    if (!geometry.boundingBox) return;

    mesh.updateMatrixWorld(true);
    const center = new THREE.Vector3();
    geometry.boundingBox.getCenter(center);
    center.applyMatrix4(mesh.matrixWorld);

    const key = userData.fullName || `${userData.type}${userData.number}`;
    const color = VERTEBRA_COLORS[key] || DEFAULT_COLORS[index % DEFAULT_COLORS.length];

    state.vertebrae.push({
      label: key,
      color,
      cssColor: hexToRGBA(color, 0.55),
      stlCenter: center.clone(),
      dicomCenter: [0, 0, 0],
    });

    const bmin = geometry.boundingBox.min.clone().applyMatrix4(mesh.matrixWorld);
    const bmax = geometry.boundingBox.max.clone().applyMatrix4(mesh.matrixWorld);
    globalMin.min(bmin);
    globalMax.max(bmax);
  });

  state.stlBoundsMin.copy(globalMin);
  state.stlBoundsMax.copy(globalMax);

  const typeOrder = ['C', 'T', 'L', 'S'];
  state.vertebrae.sort((a, b) => {
    const tA = typeOrder.indexOf(a.label.charAt(0));
    const tB = typeOrder.indexOf(b.label.charAt(0));
    if (tA !== tB) return tA - tB;
    return parseInt(a.label.slice(1)) - parseInt(b.label.slice(1));
  });

  console.log(`VertebraContourOverlay: stored ${state.vertebrae.length} vertebrae`);
}

// ---- Helpers ----

function getViewportsAndBounds(servicesManager: any) {
  const { cornerstoneViewportService, viewportGridService } = servicesManager?.services || {};
  if (!cornerstoneViewportService || !viewportGridService) {
    return { viewports: [], volumeBounds: null };
  }
  const viewportState = viewportGridService.getState();
  const viewports = viewportState?.viewports;
  if (!viewports) return { viewports: [], volumeBounds: null };

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

function getVolumeData(servicesManager: any) {
  const { viewports } = getViewportsAndBounds(servicesManager);
  if (viewports.length === 0) return null;

  for (const { viewport } of viewports) {
    try {
      let vol: any = null;
      if (typeof viewport.getAllVolumeIds === 'function') {
        const volumeIds = viewport.getAllVolumeIds();
        for (const vid of volumeIds) { vol = (cache as any).getVolume?.(vid); if (vol) break; }
      }
      if (!vol) {
        const actors = viewport.getActors?.();
        if (actors?.length) { vol = (cache as any).getVolume?.((actors[0] as any).referencedId || actors[0].uid); }
      }
      if (!vol) continue;
      let scalarData: any;
      try { scalarData = vol.getScalarData(); }
      catch { scalarData = vol.voxelManager?.getCompleteScalarDataArray?.(); }
      const dims: number[] = Array.from(vol.dimensions);
      const sp: number[] = Array.from(vol.spacing);
      const ori: number[] = Array.from(vol.origin);
      const dir: number[] = vol.direction ? Array.from(vol.direction) : [1, 0, 0, 0, 1, 0, 0, 0, 1];
      let vtkImgData: any = null;
      try { vtkImgData = vol.imageData; } catch {}
      if (!scalarData || dims.length < 3 || dims[0] === 0) continue;
      return { scalarData, dims, sp, ori, dir, vtkImgData };
    } catch (e) { continue; }
  }
  return null;
}

/**
 * Compute DICOM world positions using the EXACT same transform as
 * voxelMaskingManager: vtkImageData.getBounds() for correct world-space
 * volume extent, NO Y negation (both STL and DICOM are LPS).
 */
function computeDicomPositions(volumeBounds: any, vtkImgData?: any) {
  if (state.dicomZComputed || state.vertebrae.length === 0) return;

  // STL bounding box center and size
  const stlSize = new THREE.Vector3().subVectors(state.stlBoundsMax, state.stlBoundsMin);
  const stlCenter = new THREE.Vector3().addVectors(state.stlBoundsMin, state.stlBoundsMax).multiplyScalar(0.5);

  let volumeCenter: number[];
  let uniformScale: number;

  if (vtkImgData && typeof vtkImgData.getBounds === 'function') {
    // Use vtkImageData.getBounds() for correct world-space extent
    // (handles non-identity direction matrices correctly)
    const bounds: number[] = vtkImgData.getBounds();
    volumeCenter = [
      (bounds[0] + bounds[1]) / 2,
      (bounds[2] + bounds[3]) / 2,
      (bounds[4] + bounds[5]) / 2,
    ];
    const volumeZExtent = Math.abs(bounds[5] - bounds[4]);
    uniformScale = stlSize.z > 0.001 ? volumeZExtent / stlSize.z : 1;
  } else {
    // Fallback: direction-aware formula
    const dir = volumeBounds.direction || [1, 0, 0, 0, 1, 0, 0, 0, 1];
    const dims = volumeBounds.dimensions;
    const sp = volumeBounds.spacing;
    const ori = volumeBounds.origin;
    const halfI = ((dims[0] - 1) / 2) * sp[0];
    const halfJ = ((dims[1] - 1) / 2) * sp[1];
    const halfK = ((dims[2] - 1) / 2) * sp[2];
    volumeCenter = [
      ori[0] + dir[0] * halfI + dir[1] * halfJ + dir[2] * halfK,
      ori[1] + dir[3] * halfI + dir[4] * halfJ + dir[5] * halfK,
      ori[2] + dir[6] * halfI + dir[7] * halfJ + dir[8] * halfK,
    ];
    const volumeZSize = dims[2] * sp[2];
    uniformScale = stlSize.z > 0.001 ? volumeZSize / stlSize.z : 1;
  }

  state.vertebrae.forEach(v => {
    const offset = new THREE.Vector3().subVectors(v.stlCenter, stlCenter);
    v.dicomCenter = [
      volumeCenter[0] + offset.x * uniformScale,
      volumeCenter[1] + offset.y * uniformScale,  // NO Y negation — both STL and DICOM are LPS
      volumeCenter[2] + offset.z * uniformScale,
    ];
  });

  state.dicomZComputed = true;

  // Debug: log computed DICOM positions
  console.log('VertebraContourOverlay: DICOM positions computed:');
  state.vertebrae.forEach(v => {
    console.log(`  ${v.label}: Z=${v.dicomCenter[2].toFixed(1)} (X=${v.dicomCenter[0].toFixed(1)}, Y=${v.dicomCenter[1].toFixed(1)})`);
  });
}

// Morphological dilate 3x3
function dilate3x3(mask: Uint8Array, w: number, h: number): Uint8Array {
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!mask[x + y * w]) continue;
      for (let dy = -1; dy <= 1; dy++) {
        const ny = y + dy;
        if (ny < 0 || ny >= h) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          if (nx >= 0 && nx < w) out[nx + ny * w] = 1;
        }
      }
    }
  }
  return out;
}

// Morphological erode 3x3
function erode3x3(mask: Uint8Array, w: number, h: number): Uint8Array {
  const out = new Uint8Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      if (mask[(x-1)+(y-1)*w] && mask[x+(y-1)*w] && mask[(x+1)+(y-1)*w] &&
          mask[(x-1)+y*w]     && mask[x+y*w]     && mask[(x+1)+y*w] &&
          mask[(x-1)+(y+1)*w] && mask[x+(y+1)*w] && mask[(x+1)+(y+1)*w]) {
        out[x + y * w] = 1;
      }
    }
  }
  return out;
}

// ---- Core drawing ----

function drawContoursOnViewport(viewportId: string, viewport: any) {
  if (!viewport) return;
  const element = viewport.element;
  if (!element) return;

  let canvas = state.canvases.get(viewportId);
  if (!canvas) {
    canvas = document.createElement('canvas');
    canvas.className = 'vertebra-contour-overlay-canvas';
    canvas.style.cssText = `
      position: absolute; top: 0; left: 0;
      width: 100%; height: 100%;
      pointer-events: none; z-index: 49;
    `;
    const parent = element.parentElement || element;
    parent.style.position = 'relative';
    parent.appendChild(canvas);
    state.canvases.set(viewportId, canvas);
  }

  const rect = element.getBoundingClientRect();
  canvas.width = rect.width;
  canvas.height = rect.height;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const volData = getVolumeData(servicesManagerRef);
  if (!volData) return;

  const { scalarData, dims, sp, ori, dir, vtkImgData } = volData;

  // Compute DICOM positions using the exact same volume data used for rendering
  if (!state.dicomZComputed) {
    computeDicomPositions({ origin: ori, dimensions: dims, spacing: sp, direction: dir }, vtkImgData);
  }

  const camera = viewport.getCamera?.();
  if (!camera) return;
  const { viewPlaneNormal, focalPoint } = camera;
  if (!viewPlaneNormal || !focalPoint) return;

  // Direction columns
  const colI = [dir[0], dir[3], dir[6]];
  const colJ = [dir[1], dir[4], dir[7]];
  const colK = [dir[2], dir[5], dir[8]];

  const vpn = viewPlaneNormal;
  const dotI = Math.abs(vpn[0] * colI[0] + vpn[1] * colI[1] + vpn[2] * colI[2]);
  const dotJ = Math.abs(vpn[0] * colJ[0] + vpn[1] * colJ[1] + vpn[2] * colJ[2]);
  const dotK = Math.abs(vpn[0] * colK[0] + vpn[1] * colK[1] + vpn[2] * colK[2]);

  let sliceAxis: number;
  if (dotK >= dotI && dotK >= dotJ) sliceAxis = 2;
  else if (dotJ >= dotI) sliceAxis = 1;
  else sliceAxis = 0;

  let fi: number, fj: number, fk: number;
  if (vtkImgData && typeof vtkImgData.worldToIndex === 'function') {
    const idx = [0, 0, 0];
    vtkImgData.worldToIndex(focalPoint, idx);
    fi = idx[0]; fj = idx[1]; fk = idx[2];
  } else {
    const ox = focalPoint[0] - ori[0], oy = focalPoint[1] - ori[1], oz = focalPoint[2] - ori[2];
    fi = (dir[0] * ox + dir[3] * oy + dir[6] * oz) / sp[0];
    fj = (dir[1] * ox + dir[4] * oy + dir[7] * oz) / sp[1];
    fk = (dir[2] * ox + dir[5] * oy + dir[8] * oz) / sp[2];
  }

  const focalIdx = [fi, fj, fk];
  const sliceIdx = Math.round(focalIdx[sliceAxis]);
  if (sliceIdx < 0 || sliceIdx >= dims[sliceAxis]) return;

  const axes = [0, 1, 2].filter(a => a !== sliceAxis);
  const ax0 = axes[0], ax1 = axes[1];
  const w = dims[ax0], h = dims[ax1];
  if (w < 2 || h < 2) return;

  const sliceSize = dims[0] * dims[1];

  const toLinearIdx = (u: number, v: number): number => {
    const idx = [0, 0, 0];
    idx[sliceAxis] = sliceIdx;
    idx[ax0] = u;
    idx[ax1] = v;
    return idx[0] + idx[1] * dims[0] + idx[2] * sliceSize;
  };

  const idxToWorld = (ix: number, iy: number, iz: number): [number, number, number] => {
    if (vtkImgData && typeof vtkImgData.indexToWorld === 'function') {
      const out: [number, number, number] = [0, 0, 0];
      vtkImgData.indexToWorld([ix, iy, iz], out);
      return out;
    }
    const sx = ix * sp[0], sy = iy * sp[1], sz = iz * sp[2];
    return [
      ori[0] + dir[0] * sx + dir[1] * sy + dir[2] * sz,
      ori[1] + dir[3] * sx + dir[4] * sy + dir[5] * sz,
      ori[2] + dir[6] * sx + dir[7] * sy + dir[8] * sz,
    ];
  };

  const toIdx3 = (u: number, v: number): [number, number, number] => {
    const idx: [number, number, number] = [0, 0, 0];
    idx[sliceAxis] = sliceIdx;
    idx[ax0] = u;
    idx[ax1] = v;
    return idx;
  };

  // Affine: (u,v) → world
  const r0 = toIdx3(0, 0), r1 = toIdx3(w - 1, 0), r2 = toIdx3(0, h - 1);
  const w0 = idxToWorld(r0[0], r0[1], r0[2]);
  const w1 = idxToWorld(r1[0], r1[1], r1[2]);
  const w2 = idxToWorld(r2[0], r2[1], r2[2]);

  const wm1 = w - 1, hm1 = h - 1;
  const wxA = w0[0], wxB = (w1[0] - w0[0]) / wm1, wxC = (w2[0] - w0[0]) / hm1;
  const wyA = w0[1], wyB = (w1[1] - w0[1]) / wm1, wyC = (w2[1] - w0[1]) / hm1;
  const wzA = w0[2], wzB = (w1[2] - w0[2]) / wm1, wzC = (w2[2] - w0[2]) / hm1;

  // Canvas affine: (u,v) → canvas pixel position
  let c0: number[], c1: number[], c2: number[];
  try {
    c0 = viewport.worldToCanvas(w0);
    c1 = viewport.worldToCanvas(w1);
    c2 = viewport.worldToCanvas(w2);
  } catch { return; }
  if (!c0 || !c1 || !c2 ||
      isNaN(c0[0]) || isNaN(c0[1]) ||
      isNaN(c1[0]) || isNaN(c1[1]) ||
      isNaN(c2[0]) || isNaN(c2[1])) return;

  const cxA = c0[0], cxB = (c1[0] - c0[0]) / wm1, cxC = (c2[0] - c0[0]) / hm1;
  const cyA = c0[1], cyB = (c1[1] - c0[1]) / wm1, cyC = (c2[1] - c0[1]) / hm1;

  // ===== STEP 1: Build bone mask =====
  const radiusSq = VERTEBRA_RADIUS_MM * VERTEBRA_RADIUS_MM;
  const rawMask = new Uint8Array(w * h);
  for (let v = 0; v < h; v++) {
    for (let u = 0; u < w; u++) {
      const li = toLinearIdx(u, v);
      if (li < 0 || li >= scalarData.length || scalarData[li] <= BONE_HU_THRESHOLD) continue;
      const px = wxA + wxB * u + wxC * v;
      const py = wyA + wyB * u + wyC * v;
      const pz = wzA + wzB * u + wzC * v;
      let nearSpine = false;
      for (let vi = 0; vi < state.vertebrae.length; vi++) {
        const dc = state.vertebrae[vi].dicomCenter;
        const dx = px - dc[0], dy = py - dc[1], dz = pz - dc[2];
        if (dx * dx + dy * dy + dz * dz < radiusSq) { nearSpine = true; break; }
      }
      if (nearSpine) rawMask[u + v * w] = 1;
    }
  }

  // ===== STEP 2: CC filter (remove noise < 20px) =====
  const floodQ = new Int32Array(w * h * 2);
  const ccLabel = new Int32Array(w * h);
  const ccSizes: number[] = [0];
  let nextLabel = 1;
  for (let v2 = 0; v2 < h; v2++) {
    for (let u2 = 0; u2 < w; u2++) {
      const idx = u2 + v2 * w;
      if (!rawMask[idx] || ccLabel[idx]) continue;
      const label = nextLabel++;
      let size = 0, cH = 0, cT = 0;
      floodQ[0] = u2; floodQ[1] = v2; cT = 2;
      ccLabel[idx] = label;
      while (cH < cT) {
        const cu = floodQ[cH++], cv = floodQ[cH++];
        size++;
        const nb = [cu-1,cv, cu+1,cv, cu,cv-1, cu,cv+1];
        for (let ni = 0; ni < 8; ni += 2) {
          const nu = nb[ni], nv = nb[ni+1];
          if (nu < 0 || nu >= w || nv < 0 || nv >= h) continue;
          const nIdx = nu + nv * w;
          if (!rawMask[nIdx] || ccLabel[nIdx]) continue;
          ccLabel[nIdx] = label;
          floodQ[cT++] = nu; floodQ[cT++] = nv;
        }
      }
      ccSizes.push(size);
    }
  }
  let cleanMask = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    if (ccLabel[i] > 0 && ccSizes[ccLabel[i]] >= 20) cleanMask[i] = 1;
  }

  // ===== STEP 3: Flood fill from image boundary to find exterior =====
  // Everything NOT reachable from edges = interior (bone + internal holes FILLED).
  // This is critical: without this, every trabecular gap creates boundary pixels
  // and the result looks like a filled mess instead of a clean outer outline.
  const ext = new Uint8Array(w * h);
  let fHead = 0, fTail = 0;
  // Seed from image edges
  for (let u2 = 0; u2 < w; u2++) {
    if (!cleanMask[u2])            { ext[u2] = 1;            floodQ[fTail++] = u2; floodQ[fTail++] = 0; }
    if (!cleanMask[u2 + (h-1)*w]) { ext[u2+(h-1)*w] = 1;   floodQ[fTail++] = u2; floodQ[fTail++] = h-1; }
  }
  for (let v2 = 1; v2 < h - 1; v2++) {
    if (!cleanMask[v2*w])          { ext[v2*w] = 1;          floodQ[fTail++] = 0;   floodQ[fTail++] = v2; }
    if (!cleanMask[(w-1)+v2*w])   { ext[(w-1)+v2*w] = 1;   floodQ[fTail++] = w-1; floodQ[fTail++] = v2; }
  }
  while (fHead < fTail) {
    const pu = floodQ[fHead++], pv = floodQ[fHead++];
    const nbs = [pu-1,pv, pu+1,pv, pu,pv-1, pu,pv+1];
    for (let ni = 0; ni < 8; ni += 2) {
      const nu = nbs[ni], nv = nbs[ni+1];
      if (nu < 0 || nu >= w || nv < 0 || nv >= h) continue;
      const idx2 = nu + nv * w;
      if (ext[idx2] || cleanMask[idx2]) continue;
      ext[idx2] = 1;
      floodQ[fTail++] = nu; floodQ[fTail++] = nv;
    }
  }
  // filledMask: NOT exterior = bone with internal holes filled
  const filledMask = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) filledMask[i] = ext[i] ? 0 : 1;

  // ===== STEP 4: Assign filled bone pixels to nearest vertebra =====
  // Use Z-axis distance only: vertebrae are stacked along Z (superior-inferior).
  // X/Y errors in DICOM center computation would cause wrong assignments if we
  // used full 3D distance. Z is the definitive discriminator between vertebrae.
  const labelMap = new Int8Array(w * h).fill(-1);
  for (let v2 = 0; v2 < h; v2++) {
    for (let u2 = 0; u2 < w; u2++) {
      if (!filledMask[u2 + v2 * w]) continue;
      const pz = wzA + wzB * u2 + wzC * v2;
      let bestDist = Infinity, bestIdx = -1;
      for (let vi = 0; vi < state.vertebrae.length; vi++) {
        const dz = pz - state.vertebrae[vi].dicomCenter[2];
        const d = dz * dz;
        if (d < bestDist) { bestDist = d; bestIdx = vi; }
      }
      if (bestIdx >= 0) labelMap[u2 + v2 * w] = bestIdx;
    }
  }

  // ===== STEP 5: Boundary detection =====
  // A bone pixel is boundary ONLY if at least one 4-connected neighbor is background.
  // This gives only the OUTER edge — no interior, no fill.
  const boundary = new Uint8Array(w * h);
  for (let v2 = 0; v2 < h; v2++) {
    for (let u2 = 0; u2 < w; u2++) {
      const idx = u2 + v2 * w;
      if (labelMap[idx] < 0) continue; // skip background

      // Check 4-connected neighbors for background
      if (u2 === 0 || u2 === w - 1 || v2 === 0 || v2 === h - 1) {
        boundary[idx] = 1; // edge of image = boundary
        continue;
      }
      if (labelMap[(u2-1) + v2 * w] < 0 ||
          labelMap[(u2+1) + v2 * w] < 0 ||
          labelMap[u2 + (v2-1) * w] < 0 ||
          labelMap[u2 + (v2+1) * w] < 0) {
        boundary[idx] = 1;
      }
    }
  }

  // ===== STEP 6: Draw filled regions + boundary on canvas =====

  // Group ALL filled bone pixels by vertebra label (for semi-transparent fill)
  const fillBuckets = new Map<number, number[]>();
  for (let v2 = 0; v2 < h; v2++) {
    for (let u2 = 0; u2 < w; u2++) {
      const lab = labelMap[u2 + v2 * w];
      if (lab < 0) continue;
      let arr = fillBuckets.get(lab);
      if (!arr) { arr = []; fillBuckets.set(lab, arr); }
      arr.push(u2, v2);
    }
  }

  // Group boundary pixels by vertebra label (for solid outline)
  const boundaryBuckets = new Map<number, number[]>();
  for (let v2 = 0; v2 < h; v2++) {
    for (let u2 = 0; u2 < w; u2++) {
      if (!boundary[u2 + v2 * w]) continue;
      const lab = labelMap[u2 + v2 * w];
      if (lab < 0) continue;
      let arr = boundaryBuckets.get(lab);
      if (!arr) { arr = []; boundaryBuckets.set(lab, arr); }
      arr.push(u2, v2);
    }
  }

  // Draw filled interior — solid color tint
  fillBuckets.forEach((coords, lab) => {
    if (lab < 0 || lab >= state.vertebrae.length) return;
    const c = state.vertebrae[lab].color;
    const r = (c >> 16) & 0xFF, g = (c >> 8) & 0xFF, b = c & 0xFF;
    ctx.fillStyle = `rgba(${r},${g},${b},0.45)`;
    for (let i = 0; i < coords.length; i += 2) {
      const u = coords[i], v = coords[i + 1];
      const cx = cxA + cxB * u + cxC * v;
      const cy = cyA + cyB * u + cyC * v;
      ctx.fillRect(cx - 0.5, cy - 0.5, 1.5, 1.5);
    }
  });

  // Draw boundary outline — thick and fully opaque
  const dotW = 2;
  const dotH = 2;
  boundaryBuckets.forEach((coords, lab) => {
    if (lab < 0 || lab >= state.vertebrae.length) return;
    const c = state.vertebrae[lab].color;
    const r = (c >> 16) & 0xFF, g = (c >> 8) & 0xFF, b = c & 0xFF;
    ctx.fillStyle = `rgba(${r},${g},${b},1.0)`;
    for (let i = 0; i < coords.length; i += 2) {
      const u = coords[i], v = coords[i + 1];
      const cx = cxA + cxB * u + cxC * v;
      const cy = cyA + cyB * u + cyC * v;
      ctx.fillRect(cx - dotW / 2, cy - dotH / 2, dotW, dotH);
    }
  });
}

// ---- Orchestration ----

function redrawAll() {
  if (state.vertebrae.length === 0 || !servicesManagerRef) return;

  const { viewports, volumeBounds } = getViewportsAndBounds(servicesManagerRef);
  if (volumeBounds && !state.dicomZComputed) {
    // Try to get vtkImageData for accurate bounds
    const volData = getVolumeData(servicesManagerRef);
    computeDicomPositions(
      { origin: volData?.ori || volumeBounds.origin, dimensions: volData?.dims || volumeBounds.dimensions, spacing: volData?.sp || volumeBounds.spacing, direction: volData?.dir },
      volData?.vtkImgData
    );
  }

  viewports.forEach(({ viewportId, viewport }) => {
    drawContoursOnViewport(viewportId, viewport);
  });
}

function setupListeners(servicesManager: any) {
  state.eventListeners.forEach(({ element, event, handler }) => {
    try { element.removeEventListener(event, handler); } catch (e) { /* ignore */ }
  });
  state.eventListeners = [];

  const { viewports } = getViewportsAndBounds(servicesManager);
  viewports.forEach(({ viewportId, viewport, element }) => {
    let timeout: ReturnType<typeof setTimeout> | null = null;
    const handleChange = () => {
      if (timeout) clearTimeout(timeout);
      timeout = setTimeout(() => {
        if (state.enabled && state.vertebrae.length > 0) {
          drawContoursOnViewport(viewportId, viewport);
        }
      }, 16);
    };

    const events = [
      Enums.Events.CAMERA_MODIFIED,
      Enums.Events.VOLUME_NEW_IMAGE,
      Enums.Events.STACK_NEW_IMAGE,
      Enums.Events.IMAGE_RENDERED,
    ];
    events.forEach(ev => {
      if (ev) {
        element.addEventListener(ev, handleChange);
        state.eventListeners.push({ element, event: ev, handler: handleChange });
      }
    });
    element.addEventListener('wheel', handleChange);
    state.eventListeners.push({ element, event: 'wheel', handler: handleChange });
  });
}

function removeOverlay() {
  state.eventListeners.forEach(({ element, event, handler }) => {
    try { element.removeEventListener(event, handler); } catch (e) { /* ignore */ }
  });
  state.eventListeners = [];
  state.canvases.forEach(canvas => canvas.remove());
  state.canvases.clear();
  state.enabled = false;
  servicesManagerRef = null;
}

export function showContourOverlay(servicesManager: any) {
  removeOverlay();
  servicesManagerRef = servicesManager;

  if (state.vertebrae.length === 0) {
    console.log('VertebraContourOverlay: no vertebra data stored, skipping');
    return;
  }

  state.enabled = true;

  setTimeout(() => {
    redrawAll();
    setupListeners(servicesManager);
    console.log('VertebraContourOverlay: enabled with', state.vertebrae.length, 'vertebrae');
  }, 300);
}

export function hideContourOverlay() {
  removeOverlay();
  console.log('VertebraContourOverlay: disabled');
}
