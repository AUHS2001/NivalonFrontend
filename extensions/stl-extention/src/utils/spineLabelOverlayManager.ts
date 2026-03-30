import * as THREE from 'three';
import { Enums, cache } from '@cornerstonejs/core';

/**
 * Standalone spine label overlay manager.
 * Works independently of React component lifecycle.
 * Stores vertebra center data when STL files load, and can draw/remove
 * spine labels on DICOM viewports at any time.
 * Supports interactive dragging of labels and centerline dots.
 */

interface VertebraCenter {
  name: string;
  center: THREE.Vector3;
  type: string;
  number: number;
}

interface HitRegion {
  kind: 'label' | 'dot';
  originalIndex: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

interface DragState {
  active: boolean;
  kind: 'label' | 'dot';
  originalIndex: number;
  startCanvasX: number;
  startCanvasY: number;
  baseDx: number;
  baseDy: number;
  viewportId: string;
}

interface HoverState {
  kind: 'label' | 'dot' | null;
  originalIndex: number;
}

interface SpineLabelState {
  vertebraCenters: VertebraCenter[];
  stlBounds: { min: THREE.Vector3; max: THREE.Vector3 } | null;
  avgVertebraYExtent: number;   // Average AP extent of individual vertebra meshes (STL local space)
  canalOffsetMM: number;        // Computed posterior offset to spinal canal in DICOM mm
  enabled: boolean;
  canvases: Map<string, HTMLCanvasElement>;
  eventListeners: Array<{ element: any; event: string; handler: (e: any) => void }>;
  worldPoints: Array<[number, number, number]>;
  vertebraNames: string[];
  labelOffsets: Map<string, { dx: number; dy: number }>;
  pointDeltas: Map<number, { dx: number; dy: number; dz: number }>;
  drag: DragState;
  hover: HoverState;
  hitRegions: Map<string, HitRegion[]>;
  mouseListeners: Array<{ element: any; event: string; handler: (e: any) => void }>;
}

let servicesManagerRef: any = null;

const state: SpineLabelState = {
  vertebraCenters: [],
  stlBounds: null,
  avgVertebraYExtent: 0,
  canalOffsetMM: 15,  // Default fallback (mm)
  enabled: false,
  canvases: new Map(),
  eventListeners: [],
  worldPoints: [],
  vertebraNames: [],
  labelOffsets: new Map(),
  pointDeltas: new Map(),
  drag: { active: false, kind: 'label', originalIndex: -1, startCanvasX: 0, startCanvasY: 0, baseDx: 0, baseDy: 0, viewportId: '' },
  hover: { kind: null, originalIndex: -1 },
  hitRegions: new Map(),
  mouseListeners: [],
};

/**
 * Store vertebra center data from loaded STL meshes.
 * Called by useSTLLoader after meshes are created.
 */
export function storeVertebraData(meshes: THREE.Mesh[]) {
  const vertebrae = meshes.filter(mesh => {
    const userData = mesh.userData;
    return userData && ['C', 'T', 'L', 'S'].includes(userData.type);
  });

  const anatomicalOrder = ['C', 'T', 'L', 'S'];
  const sorted = [...(vertebrae.length > 0 ? vertebrae : meshes)].sort((a, b) => {
    const aData = a.userData || {};
    const bData = b.userData || {};
    const aType = aData.type || 'X';
    const bType = bData.type || 'X';
    const typeOrderDiff = anatomicalOrder.indexOf(aType) - anatomicalOrder.indexOf(bType);
    if (typeOrderDiff !== 0) return typeOrderDiff;
    return (aData.number || 0) - (bData.number || 0);
  });

  const centers: VertebraCenter[] = [];
  const overallBounds = {
    min: new THREE.Vector3(Infinity, Infinity, Infinity),
    max: new THREE.Vector3(-Infinity, -Infinity, -Infinity),
  };

  let totalLocalYExtent = 0;
  let vertebraCount = 0;

  sorted.forEach(mesh => {
    const geometry = mesh.geometry;
    geometry.computeBoundingBox();
    const boundingBox = geometry.boundingBox;
    if (boundingBox) {
      // Force matrix update in case render hasn't happened yet
      mesh.updateMatrixWorld(true);
      const center = new THREE.Vector3();
      boundingBox.getCenter(center);
      center.applyMatrix4(mesh.matrixWorld);

      centers.push({
        name: mesh.userData?.fullName || 'Unknown',
        center,
        type: mesh.userData?.type || 'X',
        number: mesh.userData?.number || 0,
      });

      // Accumulate local Y (AP) extent for anatomy-based canal offset
      totalLocalYExtent += (boundingBox.max.y - boundingBox.min.y);
      vertebraCount++;

      const worldMatrix = mesh.matrixWorld;
      const min = boundingBox.min.clone().applyMatrix4(worldMatrix);
      const max = boundingBox.max.clone().applyMatrix4(worldMatrix);
      overallBounds.min.min(min);
      overallBounds.max.max(max);
    }
  });

  state.vertebraCenters = centers;
  state.stlBounds = overallBounds;
  state.avgVertebraYExtent = vertebraCount > 0 ? totalLocalYExtent / vertebraCount : 0;
  // Offsets are now managed by localStorage restore flow — don't clear here
  console.log(`SpineLabelOverlay: stored ${centers.length} vertebra centers, avgVertYExtent=${state.avgVertebraYExtent.toFixed(1)}mm`);
}

export function hasVertebraData(): boolean {
  return state.vertebraCenters.length >= 2;
}

export function isEnabled(): boolean {
  return state.enabled;
}

/**
 * Extract StudyInstanceUID using multiple fallback strategies.
 * Accepts optional servicesManager param (falls back to global ref).
 */
function getStudyUID(sm?: any): string | null {
  const mgr = sm || servicesManagerRef;
  if (!mgr) {
    console.log('SpineLabelOverlay getStudyUID: no servicesManager available');
    return null;
  }

  // Strategy 1: viewportGridService → displaySetService
  try {
    const { viewportGridService, displaySetService } = mgr.services || {};
    if (viewportGridService && displaySetService) {
      const gridState = viewportGridService.getState();
      const viewports = gridState?.viewports;
      if (viewports) {
        const entries = viewports instanceof Map
          ? Array.from(viewports.values())
          : Object.values(viewports);
        for (const vp of entries as any[]) {
          const dsUIDs = vp?.displaySetInstanceUIDs;
          if (dsUIDs && dsUIDs.length > 0) {
            const ds = displaySetService.getDisplaySetByUID(dsUIDs[0]);
            if (ds?.StudyInstanceUID) {
              return ds.StudyInstanceUID;
            }
          }
        }
      }
    }
  } catch (e) {
    console.log('SpineLabelOverlay getStudyUID: strategy 1 (displaySet) failed:', e);
  }

  // Strategy 2: cornerstoneViewportService → viewport image metadata
  try {
    const { cornerstoneViewportService, viewportGridService } = mgr.services || {};
    if (cornerstoneViewportService && viewportGridService) {
      const gridState = viewportGridService.getState();
      const viewports = gridState?.viewports;
      if (viewports) {
        const entries = viewports instanceof Map
          ? Array.from(viewports.entries())
          : Object.entries(viewports);
        for (const [vpId] of entries as [string, any][]) {
          try {
            const vp = cornerstoneViewportService.getCornerstoneViewport(vpId);
            if (!vp) continue;
            // Try getImageIds → metadata
            const imageIds = typeof vp.getImageIds === 'function' ? vp.getImageIds() : [];
            if (imageIds && imageIds.length > 0) {
              // Extract from wadors imageId format: ...studies/UID/series/...
              const match = imageIds[0].match(/studies\/([^/]+)/);
              if (match?.[1]) {
                return match[1];
              }
            }
          } catch (_) { /* try next viewport */ }
        }
      }
    }
  } catch (e) {
    console.log('SpineLabelOverlay getStudyUID: strategy 2 (imageId) failed:', e);
  }

  // Strategy 3: extract from URL
  try {
    const url = window.location.href;
    const urlMatch = url.match(/StudyInstanceUIDs?=([^&]+)/);
    if (urlMatch?.[1]) {
      return decodeURIComponent(urlMatch[1]);
    }
  } catch (e) {
    console.log('SpineLabelOverlay getStudyUID: strategy 3 (URL) failed:', e);
  }

  console.log('SpineLabelOverlay getStudyUID: all strategies failed');
  return null;
}

/**
 * Save current label state to localStorage keyed by study UID.
 * Lightweight: single key per study, no duplication.
 */
function saveLabelsToStorage(studyUID: string): void {
  try {
    const data = {
      worldPoints: state.worldPoints,
      vertebraNames: state.vertebraNames,
      canalOffsetMM: state.canalOffsetMM,
      labelOffsets: Array.from(state.labelOffsets.entries()),
      pointDeltas: Array.from(state.pointDeltas.entries()),
      vertebraCount: state.vertebraCenters.length || state.worldPoints.length,
      timestamp: Date.now(),
    };
    localStorage.setItem(`spine-labels:${studyUID}`, JSON.stringify(data));
    console.log(`SpineLabelOverlay: saved ${state.worldPoints.length} points to localStorage`);
  } catch (e) {
    console.warn('SpineLabelOverlay: localStorage save failed', e);
  }
}

interface CachedLabelData {
  worldPoints: Array<[number, number, number]>;
  vertebraNames: string[];
  canalOffsetMM: number;
  labelOffsets: Map<string, { dx: number; dy: number }>;
  pointDeltas: Map<number, { dx: number; dy: number; dz: number }>;
}

/**
 * Load label state from localStorage for the given studyUID.
 * Returns null if no cache or data is invalid.
 */
function loadLabelsFromStorage(studyUID: string | null): CachedLabelData | null {
  if (!studyUID) return null;
  try {
    const raw = localStorage.getItem(`spine-labels:${studyUID}`);
    if (!raw) return null;
    const data = JSON.parse(raw);
    // Validate: vertebra count must match if STL is loaded, otherwise trust cache
    if (state.vertebraCenters.length > 0 && data.vertebraCount !== state.vertebraCenters.length) {
      console.log(`SpineLabelOverlay: cache count mismatch (cached=${data.vertebraCount}, current=${state.vertebraCenters.length}), skipping`);
      return null;
    }
    if (!Array.isArray(data.worldPoints) || data.worldPoints.length === 0) return null;
    return {
      worldPoints: data.worldPoints,
      vertebraNames: data.vertebraNames || [],
      canalOffsetMM: data.canalOffsetMM || 0,
      labelOffsets: new Map(data.labelOffsets || []),
      pointDeltas: new Map((data.pointDeltas || []).map(([k, v]: [any, any]) => [Number(k), v])),
    };
  } catch (e) {
    return null;
  }
}

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

function transformSTLToDICOM(
  stlPoint: THREE.Vector3,
  stlBounds: { min: THREE.Vector3; max: THREE.Vector3 },
  volumeBounds: { origin: number[]; dimensions: number[]; spacing: number[] }
): [number, number, number] {
  const stlSize = new THREE.Vector3().subVectors(stlBounds.max, stlBounds.min);
  const stlCenter = new THREE.Vector3().addVectors(stlBounds.min, stlBounds.max).multiplyScalar(0.5);
  const volumeSize = [
    volumeBounds.dimensions[0] * volumeBounds.spacing[0],
    volumeBounds.dimensions[1] * volumeBounds.spacing[1],
    volumeBounds.dimensions[2] * volumeBounds.spacing[2],
  ];
  const volumeCenter = [
    volumeBounds.origin[0] + volumeSize[0] / 2,
    volumeBounds.origin[1] + volumeSize[1] / 2,
    volumeBounds.origin[2] + volumeSize[2] / 2,
  ];
  const offset = new THREE.Vector3().subVectors(stlPoint, stlCenter);
  const uniformScale = volumeSize[2] / stlSize.z;

  return [
    volumeCenter[0] + offset.x * uniformScale,
    volumeCenter[1] - offset.y * uniformScale,   // Negate Y: STL +Y is anterior, DICOM LPS +Y is posterior
    volumeCenter[2] + offset.z * uniformScale,
  ];
}

// --- Pure DICOM spinal canal detection (independent of STL) ---

/**
 * Helper: extract volume data from Cornerstone cache.
 */
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
 * Detect spinal foramen center by scanning from posterior toward anterior.
 *
 * On each axial slice the anatomy from posterior to anterior is:
 *   skin → paraspinal muscle → LAMINAE (bone) → FORAMEN (dark) → VERTEBRAL BODY (bone)
 *
 * The foramen is the ONLY dark gap between two bone structures along the AP axis.
 * We scan multiple X columns near the midline and take the median.
 *
 * Two-pass: coarse establishes global median X, refined constrains search.
 */
function detectCanalPureDICOM(
  servicesManager: any
): Array<[number, number, number]> | null {
  const volData = getVolumeData(servicesManager);
  if (!volData) {
    console.log('SpineLabelOverlay: getVolumeData returned null');
    return null;
  }

  const { scalarData, dims, sp, ori, dir, vtkImgData } = volData;
  const sliceSize = dims[0] * dims[1];

  console.log(`SpineLabelOverlay: V6 scan-from-posterior — dims=[${dims}], spacing=[${sp.map((s: number) => s.toFixed(2))}]`);

  const getVoxel = (x: number, y: number, z: number): number | null => {
    if (x < 0 || x >= dims[0] || y < 0 || y >= dims[1] || z < 0 || z >= dims[2]) return null;
    return scalarData[x + y * dims[0] + z * sliceSize];
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

  // Determine posterior direction from direction cosines
  // In LPS/vtk row-major: dir[4] = M[1][1] = how Y changes with j-index
  const jDirY = dir[4];
  const posteriorIsHighJ = jDirY >= 0;
  console.log(`SpineLabelOverlay: dir=[${dir.map((d: number) => d.toFixed(3))}], posteriorIsHighJ=${posteriorIsHighJ}`);

  // Intensity range check
  let gMin = Infinity, gMax = -Infinity;
  const sampleStepZ = Math.max(1, Math.floor(dims[2] / 20));
  for (let iz = 0; iz < dims[2]; iz += sampleStepZ) {
    for (let iy = 0; iy < dims[1]; iy += 4) {
      for (let ix = 0; ix < dims[0]; ix += 4) {
        const v = getVoxel(ix, iy, iz);
        if (v !== null) {
          if (v < gMin) gMin = v;
          if (v > gMax) gMax = v;
        }
      }
    }
  }
  if (gMax - gMin < 200) {
    console.log(`SpineLabelOverlay: intensity range too small (${gMin}..${gMax})`);
    return null;
  }

  const BONE_HU = 200;
  const SOFT_HU = 100;
  const CANAL_MAX_HU = 80; // canal contents: CSF ~0-15, cord ~30-40, fat ~-50

  // ================================================================
  // Scan a single column from posterior toward anterior to find the
  // dark gap between laminae and vertebral body = foramen
  // ================================================================
  function scanColumn(ix: number, iz: number, yStart: number, yEnd: number, yStep: number): number | null {
    let scanState: 'seeking_bone' | 'in_bone' | 'in_canal' = 'seeking_bone';
    let bonePixelsSeen = 0;
    let canalStart = -1;
    let canalEnd = -1;
    let transitionStart = -1; // Track continuous transition zone for VB cortex detection
    // Only truly dark voxels for weighted centroid (excludes transition zone)
    const darkVoxels: Array<{ iy: number; v: number }> = [];

    for (let iy = yStart; yStep > 0 ? iy <= yEnd : iy >= yEnd; iy += yStep) {
      const v = getVoxel(ix, iy, iz);
      if (v === null) continue;

      if (scanState === 'seeking_bone') {
        if (v >= BONE_HU) {
          scanState = 'in_bone';
          bonePixelsSeen = 1;
        }
      } else if (scanState === 'in_bone') {
        if (v >= BONE_HU) {
          bonePixelsSeen++;
        } else if (v < SOFT_HU && bonePixelsSeen >= Math.max(2, Math.ceil(1.5 / sp[1]))) {
          scanState = 'in_canal';
          canalStart = iy;
          if (v < CANAL_MAX_HU) darkVoxels.push({ iy, v });
        } else if (v < BONE_HU) {
          if (bonePixelsSeen < Math.max(2, Math.ceil(1.5 / sp[1]))) {
            scanState = 'seeking_bone';
            bonePixelsSeen = 0;
          } else {
            scanState = 'in_canal';
            canalStart = iy;
            if (v < CANAL_MAX_HU) darkVoxels.push({ iy, v });
          }
        }
      } else if (scanState === 'in_canal') {
        if (v < CANAL_MAX_HU) {
          // If returning to dark after ≥2mm transition, we crossed VB cortex — stop
          if (transitionStart !== -1 && Math.abs(iy - transitionStart) * sp[1] >= 2) break;
          transitionStart = -1;
          canalEnd = iy;
          darkVoxels.push({ iy, v });
        } else if (v >= BONE_HU) {
          if (canalEnd === -1) canalEnd = iy - yStep;
          break;
        } else {
          // Transition zone — count for extent but NOT for centroid
          if (transitionStart === -1) transitionStart = iy;
          const gapMM = Math.abs(iy - canalStart) * sp[1];
          if (gapMM > 20) break;
          canalEnd = iy;
        }
      }
    }

    if (canalStart === -1 || canalEnd === -1) return null;
    const canalSizeMM = Math.abs(canalEnd - canalStart) * sp[1];
    if (canalSizeMM < 3 || canalSizeMM > 25) return null;

    // Trimmed mean of dark voxels — strip outermost 20% (LF posteriorly, PLL anteriorly)
    if (darkVoxels.length >= 2) {
      darkVoxels.sort((a, b) => a.iy - b.iy);
      const trim = darkVoxels.length >= 6 ? Math.max(1, Math.floor(darkVoxels.length * 0.20)) : 0;
      const trimmed = darkVoxels.slice(trim, darkVoxels.length - trim);
      let wSum = 0;
      for (const { iy } of trimmed) wSum += iy;
      return Math.round(wSum / trimmed.length);
    }
    return Math.round((canalStart + canalEnd) / 2);
  }

  // ================================================================
  // Per-slice detection: scan multiple columns near centerX, take median
  // ================================================================
  function detectSlice(
    iz: number,
    searchCenterX: number,
    searchRangeX: number
  ): { ix: number; iy: number } | null {
    const xLo = Math.max(0, searchCenterX - searchRangeX);
    const xHi = Math.min(dims[0] - 1, searchCenterX + searchRangeX);

    // Scan direction: from posterior edge toward anterior
    let yStart: number, yEnd: number, yStep: number;
    if (posteriorIsHighJ) {
      yStart = dims[1] - 1;
      yEnd = Math.floor(dims[1] * 0.2);
      yStep = -1;
    } else {
      yStart = 0;
      yEnd = Math.floor(dims[1] * 0.8);
      yStep = 1;
    }

    // Scan every ~1mm for dense sampling
    const scanStep = Math.max(1, Math.ceil(1 / sp[0]));
    const results: Array<{ ix: number; iy: number }> = [];

    for (let ix = xLo; ix <= xHi; ix += scanStep) {
      const canalY = scanColumn(ix, iz, yStart, yEnd, yStep);
      if (canalY !== null) {
        results.push({ ix, iy: canalY });
      }
    }

    if (results.length < 2) return null;

    // Take the median X and Y of all successful scans
    const sortedIxs = results.map(r => r.ix).sort((a, b) => a - b);
    const sortedIys = results.map(r => r.iy).sort((a, b) => a - b);
    const medIdx = Math.floor(results.length / 2);
    let bestIx = sortedIxs[medIdx];
    let bestIy = sortedIys[medIdx];

    // --- 2D DT helper: compute chamfer DT + weighted centroid in ROI ---
    function dtRefine(cx: number, cy: number, halfMM: number): { ix: number; iy: number } | null {
      const half = Math.ceil(halfMM / Math.min(sp[0], sp[1]));
      const x0 = Math.max(0, cx - half), x1 = Math.min(dims[0] - 1, cx + half);
      const y0 = Math.max(0, cy - half), y1 = Math.min(dims[1] - 1, cy + half);
      const w = x1 - x0 + 1, h = y1 - y0 + 1;
      if (w < 6 || h < 6) return null;
      const INF = 9999;
      const dt = new Uint16Array(w * h);
      for (let ry = 0; ry < h; ry++)
        for (let rx = 0; rx < w; rx++) {
          const v = getVoxel(x0 + rx, y0 + ry, iz);
          // Use CANAL_MAX_HU barrier: isolates canal (<80 HU) from VB marrow/muscle
          dt[rx + ry * w] = (v !== null && v >= CANAL_MAX_HU) ? 0 : INF;
        }
      for (let ry = 1; ry < h - 1; ry++)
        for (let rx = 1; rx < w - 1; rx++) {
          const i = rx + ry * w;
          dt[i] = Math.min(dt[i], dt[(rx-1)+(ry-1)*w]+4, dt[rx+(ry-1)*w]+3, dt[(rx+1)+(ry-1)*w]+4, dt[(rx-1)+ry*w]+3);
        }
      for (let ry = h - 2; ry >= 1; ry--)
        for (let rx = w - 2; rx >= 1; rx--) {
          const i = rx + ry * w;
          dt[i] = Math.min(dt[i], dt[(rx+1)+(ry+1)*w]+4, dt[rx+(ry+1)*w]+3, dt[(rx-1)+(ry+1)*w]+4, dt[(rx+1)+ry*w]+3);
        }
      let peakD = 0, pRx = -1, pRy = -1;
      const m = 3;
      for (let ry = m; ry < h - m; ry++)
        for (let rx = m; rx < w - m; rx++) {
          const d = dt[rx + ry * w];
          if (d <= 0 || d >= INF) continue;
          const v = getVoxel(x0 + rx, y0 + ry, iz);
          if (v === null || v >= 50) continue;
          if (d > peakD) { peakD = d; pRx = rx; pRy = ry; }
        }
      if (pRx < 0) return null;
      // Collect contributing voxels for coordinate-wise trimmed centroid
      const cR = Math.max(3, Math.round(peakD / 6));
      const cPts: { x: number; y: number; d: number }[] = [];
      for (let dy = -cR; dy <= cR; dy++)
        for (let dx = -cR; dx <= cR; dx++) {
          const rx = pRx + dx, ry = pRy + dy;
          if (rx < 0 || rx >= w || ry < 0 || ry >= h) continue;
          const d = dt[rx + ry * w];
          if (d <= 0 || d >= INF) continue;
          const v = getVoxel(x0 + rx, y0 + ry, iz);
          if (v === null || v >= 50) continue;
          cPts.push({ x: x0 + rx, y: y0 + ry, d });
        }
      if (cPts.length >= 4) {
        // Trim outermost 15% in X to remove lateral boundary bias
        cPts.sort((a, b) => a.x - b.x);
        const tX = cPts.length >= 10 ? Math.max(1, Math.floor(cPts.length * 0.15)) : 0;
        let trimmed = cPts.slice(tX, cPts.length - tX);
        // Trim outermost 15% in Y to remove anterior/posterior boundary bias
        trimmed.sort((a, b) => a.y - b.y);
        const tY = trimmed.length >= 10 ? Math.max(1, Math.floor(trimmed.length * 0.15)) : 0;
        trimmed = trimmed.slice(tY, trimmed.length - tY);
        let wcX = 0, wcY = 0, wcW = 0;
        for (const p of trimmed) { wcX += p.x * p.d; wcY += p.y * p.d; wcW += p.d; }
        if (wcW > 0) return { ix: Math.round(wcX / wcW), iy: Math.round(wcY / wcW) };
      }
      return { ix: x0 + pRx, iy: y0 + pRy };
    }

    // Two-iteration DT refinement: coarse (±15mm) then tight (±8mm)
    // Clamp Y after each pass to prevent anterior drift through leaky DT boundaries
    const anchorIy = bestIy;
    const yClampPx = Math.ceil(5 / sp[1]);
    const pass1 = dtRefine(bestIx, bestIy, 15);
    if (pass1) { bestIx = pass1.ix; bestIy = Math.max(anchorIy - yClampPx, Math.min(anchorIy + yClampPx, pass1.iy)); }
    const pass2 = dtRefine(bestIx, bestIy, 8);
    if (pass2) { bestIx = pass2.ix; bestIy = Math.max(anchorIy - yClampPx, Math.min(anchorIy + yClampPx, pass2.iy)); }

    return { ix: bestIx, iy: bestIy };
  }

  // ================================================================
  // PASS 1: COARSE — wide X search to establish spine position
  // ================================================================
  const coarseStep = Math.max(1, Math.round(4 / sp[2]));
  const xCenter = Math.floor(dims[0] / 2);
  const xSearchHalf = Math.floor(dims[0] * 0.15); // ±15% of image width
  const coarseResults: Array<{ ix: number; iy: number; iz: number }> = [];

  for (let iz = 0; iz < dims[2]; iz += coarseStep) {
    const r = detectSlice(iz, xCenter, xSearchHalf);
    if (r) coarseResults.push({ ...r, iz });
  }

  console.log(`SpineLabelOverlay: Coarse — ${coarseResults.length}/${Math.ceil(dims[2] / coarseStep)} slices`);

  if (coarseResults.length < 3) {
    console.log('SpineLabelOverlay: Coarse pass insufficient');
    return null;
  }

  // Global median X = spine midline
  const sortedXs = coarseResults.map(r => r.ix).sort((a, b) => a - b);
  const globalMedianX = sortedXs[Math.floor(sortedXs.length / 2)];
  coarseResults.sort((a, b) => a.iz - b.iz);

  console.log(`SpineLabelOverlay: globalMedianX=${globalMedianX} (image center=${xCenter})`);

  // ================================================================
  // PASS 2: REFINED — adaptive X search using coarse results
  // ================================================================
  const fineStep = Math.max(1, Math.round(2 / sp[2]));
  const refinedXRange = Math.ceil(12 / sp[0]); // ±12mm around adaptive center
  const rawDetections = new Map<number, { ix: number; iy: number }>();

  // Adaptive X center: interpolate from coarse results per-slice
  // This handles spine curvature at endpoints much better than global median
  function getAdaptiveX(iz: number): number {
    if (coarseResults.length === 0) return globalMedianX;
    if (iz <= coarseResults[0].iz) return coarseResults[0].ix;
    if (iz >= coarseResults[coarseResults.length - 1].iz) return coarseResults[coarseResults.length - 1].ix;
    for (let i = 0; i < coarseResults.length - 1; i++) {
      if (iz >= coarseResults[i].iz && iz <= coarseResults[i + 1].iz) {
        const t = (iz - coarseResults[i].iz) / (coarseResults[i + 1].iz - coarseResults[i].iz);
        return Math.round(coarseResults[i].ix + t * (coarseResults[i + 1].ix - coarseResults[i].ix));
      }
    }
    return globalMedianX;
  }

  for (let iz = 0; iz < dims[2]; iz += fineStep) {
    const r = detectSlice(iz, getAdaptiveX(iz), refinedXRange);
    if (r) rawDetections.set(iz, r);
  }

  console.log(`SpineLabelOverlay: Refined — ${rawDetections.size} detections`);

  // ================================================================
  // INTERPOLATION — only between existing detections
  // ================================================================
  const allFineSlices: number[] = [];
  for (let iz = 0; iz < dims[2]; iz += fineStep) allFineSlices.push(iz);

  const detectedSlices = Array.from(rawDetections.keys()).sort((a, b) => a - b);
  const minZ = detectedSlices.length > 0 ? detectedSlices[0] : 0;
  const maxZ = detectedSlices.length > 0 ? detectedSlices[detectedSlices.length - 1] : 0;

  for (const iz of allFineSlices) {
    if (rawDetections.has(iz)) continue;
    if (iz < minZ || iz > maxZ) continue;
    const maxGap = Math.ceil(40 / sp[2]);
    let above: { iz: number; ix: number; iy: number } | null = null;
    let below: { iz: number; ix: number; iy: number } | null = null;
    for (let d = fineStep; d <= maxGap; d += fineStep) {
      if (!above && iz - d >= 0 && rawDetections.has(iz - d)) {
        const r = rawDetections.get(iz - d)!;
        above = { iz: iz - d, ix: r.ix, iy: r.iy };
      }
      if (!below && iz + d < dims[2] && rawDetections.has(iz + d)) {
        const r = rawDetections.get(iz + d)!;
        below = { iz: iz + d, ix: r.ix, iy: r.iy };
      }
      if (above && below) break;
    }
    if (above && below) {
      const t = (iz - above.iz) / (below.iz - above.iz);
      rawDetections.set(iz, {
        ix: Math.round(above.ix + (below.ix - above.ix) * t),
        iy: Math.round(above.iy + (below.iy - above.iy) * t),
      });
    }
  }

  const sortedSlices = Array.from(rawDetections.keys()).sort((a, b) => a - b);
  if (sortedSlices.length < 5) {
    console.log(`SpineLabelOverlay: Only ${sortedSlices.length} points, need ≥5`);
    return null;
  }

  const tracked: Array<{ ix: number; iy: number; iz: number }> = sortedSlices.map(iz => {
    const r = rawDetections.get(iz)!;
    return { ix: r.ix, iy: r.iy, iz };
  });

  // ================================================================
  // STEP 1: OUTLIER REJECTION — clamp points deviating >8mm from local trend
  // Edge-aware: extend window inward at endpoints for stable median
  // ================================================================
  const OUTLIER_W = Math.max(8, Math.ceil(20 / sp[2])); // ~20mm local window
  const MAX_DEV_X = Math.ceil(8 / sp[0]);
  const MAX_DEV_Y = Math.ceil(8 / sp[1]);
  const minCtx = Math.min(OUTLIER_W * 2 + 1, tracked.length);
  const cleaned: typeof tracked = [];
  for (let i = 0; i < tracked.length; i++) {
    let lo = Math.max(0, i - OUTLIER_W);
    let hi = Math.min(tracked.length - 1, i + OUTLIER_W);
    // At edges, extend window inward to get enough context
    if (hi - lo + 1 < minCtx) {
      if (lo === 0) hi = Math.min(tracked.length - 1, minCtx - 1);
      else if (hi === tracked.length - 1) lo = Math.max(0, tracked.length - minCtx);
    }
    const wxs: number[] = [], wys: number[] = [];
    for (let j = lo; j <= hi; j++) {
      wxs.push(tracked[j].ix); wys.push(tracked[j].iy);
    }
    wxs.sort((a, b) => a - b); wys.sort((a, b) => a - b);
    const localMedX = wxs[Math.floor(wxs.length / 2)];
    const localMedY = wys[Math.floor(wys.length / 2)];
    let cx = tracked[i].ix, cy = tracked[i].iy;
    if (Math.abs(cx - localMedX) > MAX_DEV_X) cx = localMedX + Math.sign(cx - localMedX) * MAX_DEV_X;
    if (Math.abs(cy - localMedY) > MAX_DEV_Y) cy = localMedY + Math.sign(cy - localMedY) * MAX_DEV_Y;
    cleaned.push({ ix: cx, iy: cy, iz: tracked[i].iz });
  }

  // ================================================================
  // STEP 2: SMOOTHING — single pass Median (±5) then Mean (±3)
  // Lighter smoothing preserves natural spine curvature (kyphosis/lordosis)
  // ================================================================
  const MED_W = 5;
  const medFiltered: typeof tracked = [];
  for (let i = 0; i < cleaned.length; i++) {
    const wxs: number[] = [], wys: number[] = [];
    for (let j = Math.max(0, i - MED_W); j <= Math.min(cleaned.length - 1, i + MED_W); j++) {
      wxs.push(cleaned[j].ix); wys.push(cleaned[j].iy);
    }
    wxs.sort((a, b) => a - b); wys.sort((a, b) => a - b);
    medFiltered.push({ ix: wxs[Math.floor(wxs.length / 2)], iy: wys[Math.floor(wys.length / 2)], iz: cleaned[i].iz });
  }
  const MEAN_W = 3;
  const smoothed: typeof tracked = [];
  for (let i = 0; i < medFiltered.length; i++) {
    let sIx = 0, sIy = 0, cnt = 0;
    for (let j = Math.max(0, i - MEAN_W); j <= Math.min(medFiltered.length - 1, i + MEAN_W); j++) {
      sIx += medFiltered[j].ix; sIy += medFiltered[j].iy; cnt++;
    }
    smoothed.push({ ix: Math.round(sIx / cnt), iy: Math.round(sIy / cnt), iz: medFiltered[i].iz });
  }

  // ================================================================
  // STEP 3: ENDPOINT EXTRAPOLATION — replace unreliable edge points
  // with linear trend from interior (edges have one-sided smoothing bias)
  // ================================================================
  const EXTRAP_N = 3;  // number of endpoint points to replace
  const FIT_N = 8;     // number of interior points to derive trend
  if (smoothed.length > EXTRAP_N + FIT_N + 2) {
    // Low-Z end: extrapolate first EXTRAP_N points from interior trend
    const fitLo = EXTRAP_N;
    const fitHiLo = Math.min(smoothed.length - 1, EXTRAP_N + FIT_N);
    if (fitHiLo > fitLo + 1) {
      const dxPerStep = (smoothed[fitHiLo].ix - smoothed[fitLo].ix) / (fitHiLo - fitLo);
      const dyPerStep = (smoothed[fitHiLo].iy - smoothed[fitLo].iy) / (fitHiLo - fitLo);
      for (let i = EXTRAP_N - 1; i >= 0; i--) {
        const steps = fitLo - i;
        smoothed[i].ix = Math.round(smoothed[fitLo].ix - dxPerStep * steps);
        smoothed[i].iy = Math.round(smoothed[fitLo].iy - dyPerStep * steps);
      }
    }
    // High-Z end: extrapolate last EXTRAP_N points from interior trend
    const fitHi = smoothed.length - 1 - EXTRAP_N;
    const fitLoHi = Math.max(0, smoothed.length - 1 - EXTRAP_N - FIT_N);
    if (fitHi > fitLoHi + 1) {
      const dxPerStep = (smoothed[fitHi].ix - smoothed[fitLoHi].ix) / (fitHi - fitLoHi);
      const dyPerStep = (smoothed[fitHi].iy - smoothed[fitLoHi].iy) / (fitHi - fitLoHi);
      for (let i = fitHi + 1; i < smoothed.length; i++) {
        const steps = i - fitHi;
        smoothed[i].ix = Math.round(smoothed[fitHi].ix + dxPerStep * steps);
        smoothed[i].iy = Math.round(smoothed[fitHi].iy + dyPerStep * steps);
      }
    }
  }

  // Gentle X clamp (±12mm from global median)
  const maxXDev = Math.ceil(12 / sp[0]);
  for (const p of smoothed) {
    if (p.ix > globalMedianX + maxXDev) p.ix = globalMedianX + maxXDev;
    if (p.ix < globalMedianX - maxXDev) p.ix = globalMedianX - maxXDev;
  }

  const worldPoints = smoothed.map(p => idxToWorld(p.ix, p.iy, p.iz));
  console.log(`SpineLabelOverlay: ${worldPoints.length} foramen centers (AP-scan V6)`);
  return worldPoints;
}

// --- Hit detection ---

function hitTest(mx: number, my: number, regions: HitRegion[]): HitRegion | null {
  // Check labels first (drawn on top visually)
  for (const r of regions) {
    if (r.kind === 'label' && mx >= r.x && mx <= r.x + r.w && my >= r.y && my <= r.y + r.h) {
      return r;
    }
  }
  // Then dots
  for (const r of regions) {
    if (r.kind === 'dot' && mx >= r.x && mx <= r.x + r.w && my >= r.y && my <= r.y + r.h) {
      return r;
    }
  }
  return null;
}

function canvasLocalCoords(e: MouseEvent, canvas: HTMLCanvasElement): { mx: number; my: number } | null {
  const rect = canvas.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return null;
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  return {
    mx: (e.clientX - rect.left) * scaleX,
    my: (e.clientY - rect.top) * scaleY,
  };
}

// --- Drawing ---

function drawOnViewport(
  viewportId: string,
  viewport: any,
  worldPoints: Array<[number, number, number]>,
  vertebraNames: string[]
) {
  if (!viewport || worldPoints.length < 2) return;
  const element = viewport.element;
  if (!element) return;

  let canvas = state.canvases.get(viewportId);
  if (!canvas) {
    canvas = document.createElement('canvas');
    canvas.className = 'spine-label-overlay-canvas';
    canvas.style.cssText = `
      position: absolute; top: 0; left: 0;
      width: 100%; height: 100%;
      pointer-events: none; z-index: 50;
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

  const camera = viewport.getCamera?.();
  if (!camera) return;

  const { viewPlaneNormal, focalPoint } = camera;
  const absNormal = viewPlaneNormal.map((n: number) => Math.abs(n));
  const maxIndex = absNormal.indexOf(Math.max(...absNormal));
  let viewType = 'axial';
  if (maxIndex === 0) viewType = 'sagittal';
  else if (maxIndex === 1) viewType = 'coronal';

  const imageData = viewport.getImageData?.();
  const sp = imageData?.spacing || [1, 1, 1];
  const dim = imageData?.dimensions || [512, 512, 100];
  const ori = imageData?.origin || [0, 0, 0];
  const volumeHeight = dim[2] * sp[2];
  const volumeYSize = dim[1] * sp[1];
  const volumeCenter = [
    ori[0] + (dim[0] * sp[0]) / 2,
    ori[1] + (dim[1] * sp[1]) / 2,
    ori[2] + (dim[2] * sp[2]) / 2,
  ];

  const canvasPoints: Array<{ x: number; y: number; distance: number; originalIndex: number }> = [];

  worldPoints.forEach((worldPoint, idx) => {
    try {
      // Apply world-coordinate point deltas before view adjustments
      const delta = state.pointDeltas.get(idx);
      let wp: [number, number, number] = delta
        ? [worldPoint[0] + delta.dx, worldPoint[1] + delta.dy, worldPoint[2] + delta.dz]
        : [...worldPoint] as [number, number, number];

      let adj = [...wp] as [number, number, number];
      if (viewType === 'sagittal') {
        adj[2] = wp[2] - volumeHeight * 0.02;
        // Anatomy-based posterior shift into spinal canal
        adj[1] = wp[1] + state.canalOffsetMM;
      } else if (viewType === 'coronal') {
        adj[2] = wp[2] - volumeHeight * 0.02;
      } else if (viewType === 'axial') {
        // Anatomy-based posterior shift into spinal canal
        adj[1] = wp[1] + state.canalOffsetMM;
      }

      const cp = viewport.worldToCanvas(adj);
      if (cp && !isNaN(cp[0]) && !isNaN(cp[1])) {
        let distance = 0;
        if (viewType === 'axial') distance = Math.abs(wp[2] - focalPoint[2]);
        else if (viewType === 'sagittal') distance = Math.abs(wp[0] - focalPoint[0]);
        else if (viewType === 'coronal') distance = Math.abs(wp[1] - focalPoint[1]);
        canvasPoints.push({ x: cp[0], y: cp[1], distance, originalIndex: idx });
      }
    } catch (e) { /* skip */ }
  });

  if (canvasPoints.length === 0) return;

  const color = '#00e5ff';
  const glowColor = 'rgba(0, 229, 255, 0.4)';
  const highlightColor = '#ffeb3b';
  ctx.save();

  const regions: HitRegion[] = [];

  if (viewType === 'axial') {
    const closest = canvasPoints.reduce((p, c) => (p.distance < c.distance ? p : c));
    if (closest.distance < 10) {
      const size = 20;
      const { x, y } = closest;
      if (x >= 0 && x <= canvas.width && y >= 0 && y <= canvas.height) {
        ctx.shadowColor = color;
        ctx.shadowBlur = 15;
        ctx.strokeStyle = glowColor;
        ctx.lineWidth = 5;
        ctx.beginPath(); ctx.moveTo(x - size, y); ctx.lineTo(x + size, y); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x, y - size); ctx.lineTo(x, y + size); ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.strokeStyle = color;
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(x - size, y); ctx.lineTo(x + size, y); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x, y - size); ctx.lineTo(x, y + size); ctx.stroke();

        // Dot with hover highlight
        const isHoveredDot = state.hover.kind === 'dot' && state.hover.originalIndex === closest.originalIndex;
        const isDragDot = state.drag.active && state.drag.kind === 'dot' && state.drag.originalIndex === closest.originalIndex;
        const dotRadius = (isHoveredDot || isDragDot) ? 7 : 5;
        ctx.beginPath();
        ctx.fillStyle = color;
        ctx.arc(x, y, dotRadius, 0, Math.PI * 2);
        ctx.fill();
        if (isHoveredDot || isDragDot) {
          ctx.strokeStyle = highlightColor;
          ctx.lineWidth = 2;
          ctx.stroke();
        }

        // Hit region for dot
        regions.push({ kind: 'dot', originalIndex: closest.originalIndex, x: x - 10, y: y - 10, w: 20, h: 20 });

        const name = vertebraNames[closest.originalIndex];
        if (name) {
          ctx.shadowBlur = 0;
          ctx.font = 'bold 14px Arial';

          // Apply label offset
          const offsetKey = `${viewportId}:${closest.originalIndex}`;
          const lOff = state.labelOffsets.get(offsetKey) || { dx: 0, dy: 0 };
          const lx = x + size + 6 + lOff.dx;
          const ly = y + 5 + lOff.dy;

          const isHoveredLabel = state.hover.kind === 'label' && state.hover.originalIndex === closest.originalIndex;
          const isDragLabel = state.drag.active && state.drag.kind === 'label' && state.drag.originalIndex === closest.originalIndex;

          const tw = ctx.measureText(name).width;
          const pad = 4;
          const bgX = lx - pad;
          const bgY = ly - 14;
          const bgW = tw + pad * 2;
          const bgH = 14 + pad * 2;

          ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
          ctx.fillRect(bgX, bgY, bgW, bgH);

          if (isHoveredLabel || isDragLabel) {
            ctx.strokeStyle = highlightColor;
            ctx.lineWidth = 2;
            ctx.strokeRect(bgX, bgY, bgW, bgH);
          }

          ctx.fillStyle = color;
          ctx.fillText(name, lx, ly);

          regions.push({ kind: 'label', originalIndex: closest.originalIndex, x: bgX, y: bgY, w: bgW, h: bgH });
        }
      }
    }
  } else {
    const visible = canvasPoints.filter(p => p.distance < 500);
    const sorted = [...visible].sort((a, b) => a.y - b.y);
    if (sorted.length >= 2) {
      const valid = sorted.filter(p =>
        p.x >= -50 && p.x <= canvas.width + 50 && p.y >= -50 && p.y <= canvas.height + 50
      );
      if (valid.length >= 2) {
        // Cross-section dashed lines (follow dot position)
        valid.forEach(point => {
          if (vertebraNames[point.originalIndex]) {
            ctx.beginPath();
            ctx.strokeStyle = 'rgba(0, 229, 255, 0.25)';
            ctx.lineWidth = 1;
            ctx.setLineDash([4, 4]);
            ctx.moveTo(0, point.y);
            ctx.lineTo(canvas.width, point.y);
            ctx.stroke();
            ctx.setLineDash([]);
          }
        });
        // Smooth curve helper using quadratic Bezier through midpoints
        const drawSmoothCurve = (pts: typeof valid) => {
          if (pts.length < 3) {
            pts.forEach((p, i) => { if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y); });
            return;
          }
          ctx.moveTo(pts[0].x, pts[0].y);
          for (let i = 1; i < pts.length - 1; i++) {
            const xc = (pts[i].x + pts[i + 1].x) / 2;
            const yc = (pts[i].y + pts[i + 1].y) / 2;
            ctx.quadraticCurveTo(pts[i].x, pts[i].y, xc, yc);
          }
          const last = pts[pts.length - 1];
          ctx.lineTo(last.x, last.y);
        };

        // Glow path
        ctx.beginPath();
        ctx.strokeStyle = glowColor;
        ctx.lineWidth = 8;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.shadowColor = color;
        ctx.shadowBlur = 20;
        drawSmoothCurve(valid);
        ctx.stroke();
        // Main path
        ctx.beginPath();
        ctx.strokeStyle = color;
        ctx.lineWidth = 4;
        ctx.shadowBlur = 0;
        drawSmoothCurve(valid);
        ctx.stroke();
        // Dots with hover/drag highlight
        valid.forEach(p => {
          const isHoveredDot = state.hover.kind === 'dot' && state.hover.originalIndex === p.originalIndex;
          const isDragDot = state.drag.active && state.drag.kind === 'dot' && state.drag.originalIndex === p.originalIndex;
          const dotRadius = (isHoveredDot || isDragDot) ? 7 : 4;

          ctx.beginPath();
          ctx.fillStyle = color;
          ctx.shadowColor = color;
          ctx.shadowBlur = 10;
          ctx.arc(p.x, p.y, dotRadius, 0, Math.PI * 2);
          ctx.fill();

          if (isHoveredDot || isDragDot) {
            ctx.shadowBlur = 0;
            ctx.strokeStyle = highlightColor;
            ctx.lineWidth = 2;
            ctx.stroke();
          }

          // Hit region for dot (20x20 box)
          regions.push({ kind: 'dot', originalIndex: p.originalIndex, x: p.x - 10, y: p.y - 10, w: 20, h: 20 });
        });
        // Labels with offsets and hover/drag highlight
        ctx.shadowBlur = 0;
        valid.forEach(point => {
          const name = vertebraNames[point.originalIndex];
          if (!name) return;

          // Apply label offset
          const offsetKey = `${viewportId}:${point.originalIndex}`;
          const lOff = state.labelOffsets.get(offsetKey) || { dx: 0, dy: 0 };
          const labelX = point.x - 55 + lOff.dx;
          const labelY = point.y + lOff.dy;

          const isHoveredLabel = state.hover.kind === 'label' && state.hover.originalIndex === point.originalIndex;
          const isDragLabel = state.drag.active && state.drag.kind === 'label' && state.drag.originalIndex === point.originalIndex;

          // Connecting line from dot to label
          ctx.beginPath();
          ctx.strokeStyle = 'rgba(0, 229, 255, 0.5)';
          ctx.lineWidth = 1;
          ctx.moveTo(point.x - 5, point.y);
          ctx.lineTo(labelX + 30, labelY);
          ctx.stroke();

          ctx.font = 'bold 14px Arial';
          const tw = ctx.measureText(name).width;
          const pad = 4;
          const bgX = labelX - pad;
          const bgY = labelY - 10 - pad;
          const bgW = tw + pad * 2;
          const bgH = 14 + pad * 2;

          ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
          ctx.fillRect(bgX, bgY, bgW, bgH);

          if (isHoveredLabel || isDragLabel) {
            ctx.strokeStyle = highlightColor;
            ctx.lineWidth = 2;
            ctx.strokeRect(bgX, bgY, bgW, bgH);
          }

          ctx.fillStyle = color;
          ctx.fillText(name, labelX, labelY + 4);

          // Hit region for label
          regions.push({ kind: 'label', originalIndex: point.originalIndex, x: bgX, y: bgY, w: bgW, h: bgH });
        });
      }
    }
  }

  ctx.restore();

  // Cache hit regions for this viewport
  state.hitRegions.set(viewportId, regions);
}

// --- Interaction handlers ---

function findViewportForCanvas(canvas: HTMLCanvasElement): { viewportId: string; viewport: any } | null {
  if (!servicesManagerRef) return null;
  const { viewports } = getViewportsAndBounds(servicesManagerRef);
  for (const { viewportId, viewport, element } of viewports) {
    const vc = state.canvases.get(viewportId);
    if (vc === canvas) return { viewportId, viewport };
    // Also match by parent element
    const parent = element.parentElement || element;
    if (parent.contains(canvas)) return { viewportId, viewport };
  }
  return null;
}

function findViewportAndCanvasForElement(el: HTMLElement): { viewportId: string; viewport: any; canvas: HTMLCanvasElement } | null {
  if (!servicesManagerRef) return null;
  const { viewports } = getViewportsAndBounds(servicesManagerRef);
  for (const { viewportId, viewport, element } of viewports) {
    const canvas = state.canvases.get(viewportId);
    if (!canvas) continue;
    const parent = element.parentElement || element;
    if (parent === el || parent.contains(el) || el.contains(parent)) {
      return { viewportId, viewport, canvas };
    }
  }
  return null;
}

function handleParentMouseMove(e: MouseEvent) {
  const parentEl = e.currentTarget as HTMLElement;
  const info = findViewportAndCanvasForElement(parentEl);
  if (!info) return;
  const { viewportId, viewport, canvas } = info;

  const coords = canvasLocalCoords(e, canvas);
  if (!coords) return;
  const { mx, my } = coords;

  // If dragging
  if (state.drag.active) {
    // Only process drag events on the viewport where drag started
    if (viewportId !== state.drag.viewportId) return;

    const deltaCanvasX = mx - state.drag.startCanvasX;
    const deltaCanvasY = my - state.drag.startCanvasY;

    if (state.drag.kind === 'label') {
      // Label drag: pure canvas pixel offset, single viewport
      const offsetKey = `${state.drag.viewportId}:${state.drag.originalIndex}`;
      state.labelOffsets.set(offsetKey, {
        dx: state.drag.baseDx + deltaCanvasX,
        dy: state.drag.baseDy + deltaCanvasY,
      });
      drawOnViewport(viewportId, viewport, state.worldPoints, state.vertebraNames);
    } else if (state.drag.kind === 'dot') {
      // Dot drag: convert canvas delta to world delta
      try {
        const startWorld = viewport.canvasToWorld([state.drag.startCanvasX, state.drag.startCanvasY]);
        const currentWorld = viewport.canvasToWorld([mx, my]);
        if (startWorld && currentWorld) {
          const baseDz = (state.drag as any).__baseDz || 0;
          state.pointDeltas.set(state.drag.originalIndex, {
            dx: state.drag.baseDx + (currentWorld[0] - startWorld[0]),
            dy: state.drag.baseDy + (currentWorld[1] - startWorld[1]),
            dz: baseDz + (currentWorld[2] - startWorld[2]),
          });
          // Redraw all viewports since dot position is shared
          redrawAll(servicesManagerRef);
        }
      } catch (ex) { /* ignore */ }
    }
    return;
  }

  // Hover detection
  const regions = state.hitRegions.get(viewportId) || [];
  const hit = hitTest(mx, my, regions);

  if (hit) {
    state.hover = { kind: hit.kind, originalIndex: hit.originalIndex };
    canvas.style.pointerEvents = 'auto';
    canvas.style.cursor = 'grab';
    // Redraw to show highlight
    drawOnViewport(viewportId, viewport, state.worldPoints, state.vertebraNames);
  } else if (state.hover.kind !== null) {
    state.hover = { kind: null, originalIndex: -1 };
    canvas.style.pointerEvents = 'none';
    canvas.style.cursor = '';
    drawOnViewport(viewportId, viewport, state.worldPoints, state.vertebraNames);
  }
}

function handleCanvasMouseDown(e: MouseEvent) {
  const canvas = e.currentTarget as HTMLCanvasElement;
  const info = findViewportForCanvas(canvas);
  if (!info) return;
  const { viewportId } = info;

  const coords = canvasLocalCoords(e, canvas);
  if (!coords) return;
  const { mx, my } = coords;

  const regions = state.hitRegions.get(viewportId) || [];
  const hit = hitTest(mx, my, regions);
  if (!hit) return;

  e.stopPropagation();
  e.preventDefault();

  // Get current offset as base
  if (hit.kind === 'label') {
    const offsetKey = `${viewportId}:${hit.originalIndex}`;
    const existing = state.labelOffsets.get(offsetKey) || { dx: 0, dy: 0 };
    state.drag = {
      active: true,
      kind: 'label',
      originalIndex: hit.originalIndex,
      startCanvasX: mx,
      startCanvasY: my,
      baseDx: existing.dx,
      baseDy: existing.dy,
      viewportId,
    };
  } else {
    const existing = state.pointDeltas.get(hit.originalIndex);
    state.drag = {
      active: true,
      kind: 'dot',
      originalIndex: hit.originalIndex,
      startCanvasX: mx,
      startCanvasY: my,
      baseDx: existing ? existing.dx : 0,
      baseDy: existing ? existing.dy : 0,
      viewportId,
    };
    // Store base dz for dot drag
    if (existing) {
      (state.drag as any).__baseDz = existing.dz;
    }
  }

  canvas.style.cursor = 'grabbing';
}

function handleWindowMouseUp(_e: MouseEvent) {
  if (!state.drag.active) return;

  // === LOG DRAGGED POSITION ===
  if (state.drag.kind === 'dot') {
    const idx = state.drag.originalIndex;
    const delta = state.pointDeltas.get(idx);
    const origWp = state.worldPoints[idx];
    if (origWp) {
      const finalX = origWp[0] + (delta ? delta.dx : 0);
      const finalY = origWp[1] + (delta ? delta.dy : 0);
      const finalZ = origWp[2] + (delta ? delta.dz : 0);
      const name = state.vertebraNames[idx] || `point_${idx}`;
      console.log(`=== DOT DRAGGED: ${name} (index ${idx}) ===`);
      console.log(`  Original: [${origWp[0].toFixed(2)}, ${origWp[1].toFixed(2)}, ${origWp[2].toFixed(2)}]`);
      console.log(`  Delta:    [${(delta?.dx || 0).toFixed(2)}, ${(delta?.dy || 0).toFixed(2)}, ${(delta?.dz || 0).toFixed(2)}]`);
      console.log(`  Final:    [${finalX.toFixed(2)}, ${finalY.toFixed(2)}, ${finalZ.toFixed(2)}]`);
    }
  }

  state.drag = { active: false, kind: 'label', originalIndex: -1, startCanvasX: 0, startCanvasY: 0, baseDx: 0, baseDy: 0, viewportId: '' };
  state.hover = { kind: null, originalIndex: -1 };

  // Restore pointer-events on all canvases
  state.canvases.forEach(canvas => {
    canvas.style.pointerEvents = 'none';
    canvas.style.cursor = '';
  });

  // Save updated positions to localStorage after drag
  const studyUID = getStudyUID(servicesManagerRef);
  if (studyUID) saveLabelsToStorage(studyUID);

  // Redraw all to clear highlight
  if (servicesManagerRef) {
    redrawAll(servicesManagerRef);
  }
}

// --- Redraw & listeners ---

function redrawAll(servicesManager: any) {
  if (state.worldPoints.length < 2) return;
  const { viewports } = getViewportsAndBounds(servicesManager);
  viewports.forEach(({ viewportId, viewport }) => {
    drawOnViewport(viewportId, viewport, state.worldPoints, state.vertebraNames);
  });
}

function setupListeners(servicesManager: any) {
  // Clean existing viewport event listeners
  state.eventListeners.forEach(({ element, event, handler }) => {
    try { element.removeEventListener(event, handler); } catch (e) { /* ignore */ }
  });
  state.eventListeners = [];

  // Clean existing mouse listeners
  state.mouseListeners.forEach(({ element, event, handler }) => {
    try { element.removeEventListener(event, handler); } catch (e) { /* ignore */ }
  });
  state.mouseListeners = [];

  const { viewports } = getViewportsAndBounds(servicesManager);
  viewports.forEach(({ viewportId, viewport, element }) => {
    let timeout: ReturnType<typeof setTimeout> | null = null;
    const handleChange = () => {
      if (timeout) clearTimeout(timeout);
      timeout = setTimeout(() => {
        if (state.worldPoints.length > 0) {
          drawOnViewport(viewportId, viewport, state.worldPoints, state.vertebraNames);
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

    // --- Mouse interaction listeners ---
    const canvas = state.canvases.get(viewportId);
    if (!canvas) return;

    const parent = element.parentElement || element;

    // Mousemove on parent (receives events even when canvas has pointer-events: none)
    parent.addEventListener('mousemove', handleParentMouseMove);
    state.mouseListeners.push({ element: parent, event: 'mousemove', handler: handleParentMouseMove });

    // Mousedown on canvas (only fires when pointer-events is auto, i.e., hovering over a draggable)
    canvas.addEventListener('mousedown', handleCanvasMouseDown);
    state.mouseListeners.push({ element: canvas, event: 'mousedown', handler: handleCanvasMouseDown });
  });

  // Mouseup on window for reliability (catch release anywhere)
  window.addEventListener('mouseup', handleWindowMouseUp);
  state.mouseListeners.push({ element: window, event: 'mouseup', handler: handleWindowMouseUp });
}

function removeOverlay() {
  // Remove viewport event listeners
  state.eventListeners.forEach(({ element, event, handler }) => {
    try { element.removeEventListener(event, handler); } catch (e) { /* ignore */ }
  });
  state.eventListeners = [];

  // Remove mouse interaction listeners
  state.mouseListeners.forEach(({ element, event, handler }) => {
    try { element.removeEventListener(event, handler); } catch (e) { /* ignore */ }
  });
  state.mouseListeners = [];

  state.canvases.forEach(canvas => canvas.remove());
  state.canvases.clear();
  state.worldPoints = [];
  state.vertebraNames = [];
  state.enabled = false;

  // Clear transient interaction state but KEEP labelOffsets and pointDeltas
  // so drag changes persist across toggle off/on
  state.hitRegions.clear();
  state.drag = { active: false, kind: 'label', originalIndex: -1, startCanvasX: 0, startCanvasY: 0, baseDx: 0, baseDy: 0, viewportId: '' };
  state.hover = { kind: null, originalIndex: -1 };
  servicesManagerRef = null;
}

export function showSpineLabelOverlay(servicesManager: any) {
  // Remove existing first
  removeOverlay();

  servicesManagerRef = servicesManager;

  // Check localStorage for cached positions FIRST (works even without STL data)
  const studyUID = getStudyUID(servicesManager);

  const cached = loadLabelsFromStorage(studyUID);
  if (cached) {
    // Restore from cache — no STL data needed, skip expensive canal detection
    state.worldPoints = cached.worldPoints;
    state.vertebraNames = cached.vertebraNames;
    state.canalOffsetMM = cached.canalOffsetMM;
    state.labelOffsets = cached.labelOffsets;
    state.pointDeltas = cached.pointDeltas;
    state.enabled = true;

    console.log(`SpineLabelOverlay: restored ${state.worldPoints.length} points from cache`);

    setTimeout(() => {
      redrawAll(servicesManager);
      setupListeners(servicesManager);
    }, 300);
    return;
  }

  const hasSTL = state.vertebraCenters.length >= 2 && !!state.stlBounds;

  const { volumeBounds } = getViewportsAndBounds(servicesManager);
  const vb = volumeBounds || {
    origin: [-250, -250, -500],
    dimensions: [512, 512, 200],
    spacing: [1, 1, 2.5],
  };

  // ===== DICOM-based canal detection (independent of STL — always attempted) =====
  const dicomCenterline = detectCanalPureDICOM(servicesManager);

  if (hasSTL) {
    // --- Full path: STL data available ---
    const stlWorldPoints = state.vertebraCenters.map(vc =>
      transformSTLToDICOM(vc.center, state.stlBounds!, vb)
    );
    state.vertebraNames = state.vertebraCenters.map(vc => vc.name);
    state.enabled = true;

    // Anatomy-based canal offset (fallback if DICOM detection fails)
    const stlSize = new THREE.Vector3().subVectors(state.stlBounds!.max, state.stlBounds!.min);
    const volumeSizeZ = vb.dimensions[2] * vb.spacing[2];
    const uniformScale = volumeSizeZ / stlSize.z;
    const fallbackOffset = state.avgVertebraYExtent > 0
      ? state.avgVertebraYExtent * uniformScale * 0.20
      : 15;

    if (dicomCenterline && dicomCenterline.length >= 5) {
      // Map STL vertebra Z-levels onto the DICOM-detected canal centerline.
      state.worldPoints = stlWorldPoints.map(stlPt => {
        let closestDicom = dicomCenterline[0];
        let closestDist = Math.abs(dicomCenterline[0][2] - stlPt[2]);
        for (const dp of dicomCenterline) {
          const dist = Math.abs(dp[2] - stlPt[2]);
          if (dist < closestDist) {
            closestDist = dist;
            closestDicom = dp;
          }
        }
        return [closestDicom[0], closestDicom[1], stlPt[2]] as [number, number, number];
      });
      state.canalOffsetMM = 0;
      console.log('SpineLabelOverlay: using PURE DICOM canal positions (with STL vertebra levels)');
    } else {
      state.worldPoints = stlWorldPoints;
      state.canalOffsetMM = fallbackOffset;
      console.log(`SpineLabelOverlay: DICOM detection unavailable, using STL + offset (${state.canalOffsetMM.toFixed(1)}mm)`);
    }
  } else if (dicomCenterline && dicomCenterline.length >= 5) {
    // --- No STL data, but DICOM canal detection succeeded ---
    // Sample evenly along the detected centerline to generate default vertebra labels
    console.log(`SpineLabelOverlay: no STL data, using DICOM-only canal detection (${dicomCenterline.length} raw points)`);

    // Standard vertebra layout: C1-C7, T1-T12, L1-L5, S1 = 25 vertebrae
    const defaultNames = [
      'C1','C2','C3','C4','C5','C6','C7',
      'T1','T2','T3','T4','T5','T6','T7','T8','T9','T10','T11','T12',
      'L1','L2','L3','L4','L5',
      'S1',
    ];

    // Sort centerline by Z (superior to inferior)
    const sorted = [...dicomCenterline].sort((a, b) => a[2] - b[2]);
    const numLabels = Math.min(defaultNames.length, sorted.length);

    // Sample evenly spaced points from the sorted centerline
    const sampledPoints: Array<[number, number, number]> = [];
    const sampledNames: string[] = [];
    for (let i = 0; i < numLabels; i++) {
      const t = numLabels > 1 ? i / (numLabels - 1) : 0;
      const idx = Math.round(t * (sorted.length - 1));
      sampledPoints.push(sorted[idx]);
      sampledNames.push(defaultNames[i]);
    }

    state.worldPoints = sampledPoints;
    state.vertebraNames = sampledNames;
    state.canalOffsetMM = 0;
    state.enabled = true;
  } else {
    // Neither STL data nor DICOM detection available
    console.warn('SpineLabelOverlay: no STL data and DICOM canal detection failed — cannot generate labels');
    state.enabled = false;
    return;
  }

  // === LOG INITIAL POSITIONS ===
  console.log('=== CENTERLINE INITIAL POSITIONS ===');
  state.worldPoints.forEach((wp, i) => {
    const name = state.vertebraNames[i] || `point_${i}`;
    console.log(`  ${name}: [${wp[0].toFixed(2)}, ${wp[1].toFixed(2)}, ${wp[2].toFixed(2)}]`);
  });
  console.log('=== END INITIAL POSITIONS ===');

  // Draw after a short delay for viewports to be ready, then save
  setTimeout(() => {
    redrawAll(servicesManager);
    setupListeners(servicesManager);
    console.log('SpineLabelOverlay: enabled with', state.worldPoints.length, 'points');

    // Save after render — studyUID is more likely available now
    const saveUID = studyUID || getStudyUID(servicesManager);
    if (saveUID) {
      saveLabelsToStorage(saveUID);
    }
  }, 300);
}

export function hideSpineLabelOverlay() {
  removeOverlay();
  console.log('SpineLabelOverlay: disabled');
}

export function toggleSpineLabelOverlay(servicesManager: any) {
  if (state.enabled) {
    hideSpineLabelOverlay();
  } else {
    showSpineLabelOverlay(servicesManager);
  }
}
