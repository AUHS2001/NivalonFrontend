import * as THREE from 'three';
import { Enums } from '@cornerstonejs/core';

/**
 * Vertebra contour overlay manager.
 * Projects actual STL mesh cross-sections onto DICOM viewports.
 *
 * STL vertex positions are already in DICOM LPS world coordinates
 * (confirmed by useSTLLoader.ts: "STLs are already in LPS - no transformation needed").
 * We use them directly with viewport.worldToCanvas() for projection.
 */

const VERTEBRA_COLORS: { [key: string]: number } = {
  C1: 0x4169E1, C2: 0x4682B4, C3: 0x5F9EA0, C4: 0x6495ED, C5: 0x00CED1, C6: 0x20B2AA, C7: 0x48D1CC,
  T1: 0xCD5C5C, T2: 0xDC143C, T3: 0xB22222, T4: 0xC71585, T5: 0xDB7093, T6: 0xFF69B4,
  T7: 0xFFB6C1, T8: 0xFFA07A, T9: 0xFA8072, T10: 0xE9967A, T11: 0xF08080, T12: 0xCD5C5C,
  L1: 0xADFF2F, L2: 0xBDB76B, L3: 0xFF00FF, L4: 0x9932CC, L5: 0x32CD32,
  S1: 0x00FFFF, S2: 0xFF00FF, S3: 0xDA70D6, S4: 0xBA55D3, S5: 0x9400D3,
};
const DEFAULT_COLORS = [0xCD5C5C, 0xADFF2F, 0xBDB76B, 0xFF00FF, 0x9932CC, 0x32CD32, 0x00FFFF, 0xDA70D6, 0xFFD700, 0xFF6347];

// ---- Types ----

interface VertebraData {
  label: string;
  color: number;
  // STL positions are already in LPS DICOM world coordinates
  positions: Float32Array;      // [x,y,z, ...]
  indices: Uint32Array;         // triangle indices
  triCount: number;
  bboxMin: [number, number, number];
  bboxMax: [number, number, number];
}

interface ContourState {
  vertebrae: VertebraData[];
  enabled: boolean;
  canvases: Map<string, HTMLCanvasElement>;
  eventListeners: Array<{ element: any; event: string; handler: (e: any) => void }>;
}

const state: ContourState = {
  vertebrae: [],
  enabled: false,
  canvases: new Map(),
  eventListeners: [],
};

let servicesManagerRef: any = null;

// =============== Store mesh geometry ===============

export function storeMeshDataForContours(meshes: THREE.Mesh[]) {
  state.vertebrae = [];

  meshes.forEach((mesh, index) => {
    const userData = mesh.userData;
    if (!userData || !['C', 'T', 'L', 'S'].includes(userData.type)) return;

    const geometry = mesh.geometry;
    if (!geometry) return;
    const posAttr = geometry.getAttribute('position');
    if (!posAttr) return;

    mesh.updateMatrixWorld(true);
    const mat = mesh.matrixWorld;
    const vertCount = posAttr.count;
    const positions = new Float32Array(vertCount * 3);
    const v = new THREE.Vector3();

    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

    for (let i = 0; i < vertCount; i++) {
      v.set(posAttr.getX(i), posAttr.getY(i), posAttr.getZ(i));
      v.applyMatrix4(mat);
      positions[i * 3]     = v.x;
      positions[i * 3 + 1] = v.y;
      positions[i * 3 + 2] = v.z;
      if (v.x < minX) minX = v.x; if (v.x > maxX) maxX = v.x;
      if (v.y < minY) minY = v.y; if (v.y > maxY) maxY = v.y;
      if (v.z < minZ) minZ = v.z; if (v.z > maxZ) maxZ = v.z;
    }

    // Triangle indices
    let indices: Uint32Array;
    let triCount: number;
    if (geometry.index) {
      const src = geometry.index.array;
      indices = new Uint32Array(src.length);
      for (let i = 0; i < src.length; i++) indices[i] = src[i];
      triCount = indices.length / 3;
    } else {
      indices = new Uint32Array(vertCount);
      for (let i = 0; i < vertCount; i++) indices[i] = i;
      triCount = vertCount / 3;
    }

    const key = userData.fullName || `${userData.type}${userData.number}`;
    const color = VERTEBRA_COLORS[key] || DEFAULT_COLORS[index % DEFAULT_COLORS.length];

    state.vertebrae.push({
      label: key,
      color,
      positions,
      indices,
      triCount,
      bboxMin: [minX, minY, minZ],
      bboxMax: [maxX, maxY, maxZ],
    });
  });

  // Sort anatomically
  const typeOrder = ['C', 'T', 'L', 'S'];
  state.vertebrae.sort((a, b) => {
    const tA = typeOrder.indexOf(a.label.charAt(0));
    const tB = typeOrder.indexOf(b.label.charAt(0));
    if (tA !== tB) return tA - tB;
    return parseInt(a.label.slice(1)) - parseInt(b.label.slice(1));
  });

  console.log(`[ContourOverlay] stored ${state.vertebrae.length} vertebrae (LPS world coords)`);
  if (state.vertebrae.length > 0) {
    const first = state.vertebrae[0];
    const last = state.vertebrae[state.vertebrae.length - 1];
    console.log('[ContourOverlay] bounds:', {
      first: { label: first.label, min: first.bboxMin.map(v => v.toFixed(1)), max: first.bboxMax.map(v => v.toFixed(1)) },
      last: { label: last.label, min: last.bboxMin.map(v => v.toFixed(1)), max: last.bboxMax.map(v => v.toFixed(1)) },
    });
  }
}

// =============== Viewport helpers ===============

function getViewportsForOverlay(servicesManager: any) {
  const { cornerstoneViewportService, viewportGridService } = servicesManager?.services || {};
  if (!cornerstoneViewportService || !viewportGridService) return [];

  const viewportState = viewportGridService.getState();
  const viewports = viewportState?.viewports;
  if (!viewports) return [];

  const result: Array<{ viewportId: string; viewport: any; element: HTMLElement }> = [];

  const entries = viewports instanceof Map
    ? Array.from(viewports.entries())
    : Object.entries(viewports);

  entries.forEach(([viewportId, viewportInfo]: [string, any]) => {
    const opts = viewportInfo?.viewportOptions || {};
    // Skip custom 3D layouts — only draw on DICOM 2D viewports
    if (opts.customLayout === 'stl' || viewportId === 'stlViewport') return;
    if (opts.customLayout === '3d-compare' || opts.customLayout === 'local-3d-compare') return;
    try {
      const viewport = cornerstoneViewportService.getCornerstoneViewport(viewportId);
      if (!viewport || !viewport.element) return;
      if (typeof viewport.getCamera !== 'function') return;
      if (typeof viewport.worldToCanvas !== 'function') return;
      result.push({ viewportId, viewport, element: viewport.element });
    } catch (e) { /* ignore */ }
  });
  return result;
}

// =============== Core: mesh-plane intersection drawing ===============

function drawContoursOnViewport(viewportId: string, viewport: any) {
  if (!viewport) return;
  const element = viewport.element;
  if (!element) return;

  // Canvas setup
  let canvas = state.canvases.get(viewportId);
  if (!canvas) {
    canvas = document.createElement('canvas');
    canvas.className = 'vertebra-contour-overlay-canvas';
    canvas.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:49;';
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

  // Get slice plane from viewport camera
  const camera = viewport.getCamera?.();
  if (!camera) return;
  const { viewPlaneNormal: vpn, focalPoint: fp } = camera;
  if (!vpn || !fp) return;

  const nx = vpn[0], ny = vpn[1], nz = vpn[2];
  const planeD = -(nx * fp[0] + ny * fp[1] + nz * fp[2]);

  // Compute slice tolerance from actual slice spacing along the view direction
  let sliceTol = 1.0;
  try {
    const imageData = viewport.getImageData?.();
    if (imageData?.spacing) {
      const sp = imageData.spacing;
      const effectiveSpacing = Math.abs(nx) * sp[0] + Math.abs(ny) * sp[1] + Math.abs(nz) * sp[2];
      sliceTol = Math.max(effectiveSpacing * 0.55, 0.5);
    }
  } catch {}

  // Process each vertebra mesh
  for (const vert of state.vertebrae) {
    // Quick AABB-plane rejection
    const bMin = vert.bboxMin, bMax = vert.bboxMax;
    let nearD = planeD, farD = planeD;
    for (let a = 0; a < 3; a++) {
      const n = a === 0 ? nx : a === 1 ? ny : nz;
      if (n > 0) { nearD += n * bMin[a]; farD += n * bMax[a]; }
      else       { nearD += n * bMax[a]; farD += n * bMin[a]; }
    }
    if (nearD > sliceTol || farD < -sliceTol) continue;

    // Triangle-plane intersection
    const pos = vert.positions;
    const idx = vert.indices;
    const col = vert.color;
    const cr = (col >> 16) & 0xFF, cg = (col >> 8) & 0xFF, cb = col & 0xFF;

    ctx.strokeStyle = `rgba(${cr},${cg},${cb},0.9)`;
    ctx.lineWidth = 1.0;
    ctx.beginPath();

    for (let t = 0; t < vert.triCount; t++) {
      const i0 = idx[t * 3], i1 = idx[t * 3 + 1], i2 = idx[t * 3 + 2];

      const ax = pos[i0*3], ay = pos[i0*3+1], az = pos[i0*3+2];
      const bx = pos[i1*3], by = pos[i1*3+1], bz = pos[i1*3+2];
      const cx = pos[i2*3], cy = pos[i2*3+1], cz = pos[i2*3+2];

      // Signed distance to plane
      const da = nx*ax + ny*ay + nz*az + planeD;
      const db = nx*bx + ny*by + nz*bz + planeD;
      const dc = nx*cx + ny*cy + nz*cz + planeD;

      // All on same side → skip
      if ((da > 0 && db > 0 && dc > 0) || (da < 0 && db < 0 && dc < 0)) continue;

      // Find 2 edge-crossing intersection points
      let p1x = 0, p1y = 0, p1z = 0;
      let p2x = 0, p2y = 0, p2z = 0;
      let count = 0;

      if (da * db < 0) {
        const tt = da / (da - db);
        if (count === 0) { p1x = ax+tt*(bx-ax); p1y = ay+tt*(by-ay); p1z = az+tt*(bz-az); }
        else             { p2x = ax+tt*(bx-ax); p2y = ay+tt*(by-ay); p2z = az+tt*(bz-az); }
        count++;
      }
      if (db * dc < 0) {
        const tt = db / (db - dc);
        if (count === 0) { p1x = bx+tt*(cx-bx); p1y = by+tt*(cy-by); p1z = bz+tt*(cz-bz); }
        else             { p2x = bx+tt*(cx-bx); p2y = by+tt*(cy-by); p2z = bz+tt*(cz-bz); }
        count++;
      }
      if (count < 2 && dc * da < 0) {
        const tt = dc / (dc - da);
        if (count === 0) { p1x = cx+tt*(ax-cx); p1y = cy+tt*(ay-cy); p1z = cz+tt*(az-cz); }
        else             { p2x = cx+tt*(ax-cx); p2y = cy+tt*(ay-cy); p2z = cz+tt*(az-cz); }
        count++;
      }

      if (count < 2) continue;

      // Project to canvas using viewport.worldToCanvas() directly
      // STL positions are already in LPS world coords — no transform needed
      try {
        const canvasA = viewport.worldToCanvas([p1x, p1y, p1z]);
        const canvasB = viewport.worldToCanvas([p2x, p2y, p2z]);
        if (canvasA && canvasB && !isNaN(canvasA[0]) && !isNaN(canvasB[0])) {
          ctx.moveTo(canvasA[0], canvasA[1]);
          ctx.lineTo(canvasB[0], canvasB[1]);
        }
      } catch { /* skip this segment */ }
    }

    ctx.stroke();
  }
}

// =============== Orchestration ===============

function redrawAll() {
  if (state.vertebrae.length === 0 || !servicesManagerRef) return;

  const viewports = getViewportsForOverlay(servicesManagerRef);
  viewports.forEach(({ viewportId, viewport }) => {
    drawContoursOnViewport(viewportId, viewport);
  });
}

function setupListeners(servicesManager: any) {
  state.eventListeners.forEach(({ element, event, handler }) => {
    try { element.removeEventListener(event, handler); } catch (e) { /* ignore */ }
  });
  state.eventListeners = [];

  const viewports = getViewportsForOverlay(servicesManager);
  viewports.forEach(({ viewportId, viewport, element }) => {
    let timeout: ReturnType<typeof setTimeout> | null = null;
    const handleChange = () => {
      if (timeout) clearTimeout(timeout);
      timeout = setTimeout(() => {
        if (state.enabled && state.vertebrae.length > 0) {
          drawContoursOnViewport(viewportId, viewport);
        }
      }, 30);
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
    console.log('[ContourOverlay] no vertebra data stored, skipping');
    return;
  }

  state.enabled = true;

  setTimeout(() => {
    redrawAll();
    setupListeners(servicesManager);
    console.log('[ContourOverlay] enabled with', state.vertebrae.length, 'vertebrae');
  }, 300);
}

export function hideContourOverlay() {
  removeOverlay();
  console.log('[ContourOverlay] disabled');
}
