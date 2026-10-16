import * as THREE from 'three';
import { Enums } from '@cornerstonejs/core';

/**
 * Vertebra contour overlay manager.
 * Projects actual STL mesh cross-sections onto DICOM viewports with
 * a glowing neon visual style.
 *
 * Coordinate system: STL vertices (after applyMatrix4(matrixWorld)) are in
 * DICOM LPS mm world space — the same coordinate space as viewport.worldToCanvas().
 */

// Fallback colors per vertebra type — matches the colorMap in useSTLLoader
// (used when the 3D mesh material is white / not yet colored).
const TYPE_FALLBACK_COLORS: { [key: string]: number } = {
  C: 0x3498db,   // Cervical  — Blue
  T: 0x2ecc71,   // Thoracic  — Green
  L: 0xe74c3c,   // Lumbar    — Red
  S: 0xf1c40f,   // Sacral    — Yellow
  X: 0xf1c40f,   // Unknown   — Yellow (sacrum-like)
};

interface VertebraData {
  label:    string;
  mesh:     THREE.Mesh;   // live ref — read material.color at draw time
  positions: Float32Array;
  indices:   Uint32Array;
  triCount:  number;
  bboxMin:  [number, number, number];
  bboxMax:  [number, number, number];
}

interface ContourState {
  vertebrae: VertebraData[];
  enabled:   boolean;
  canvases:  Map<string, HTMLCanvasElement>;
  eventListeners: Array<{ element: any; event: string; handler: (e: any) => void }>;
}

const state: ContourState = {
  vertebrae: [],
  enabled:   false,
  canvases:  new Map(),
  eventListeners: [],
};

let servicesManagerRef: any = null;

// ─── helpers ─────────────────────────────────────────────────────────────────

function hexToRgb(hex: number): [number, number, number] {
  return [(hex >> 16) & 0xFF, (hex >> 8) & 0xFF, hex & 0xFF];
}

/**
 * Read the current material color of the mesh so the contour always matches
 * whatever the 3D model is showing (color mode, label view, etc.).
 * Falls back to per-type colors when the mesh is white / uncolored.
 */
function getLiveColor(vert: VertebraData): number {
  try {
    const mat = vert.mesh?.material as THREE.MeshPhongMaterial | undefined;
    if (mat?.color) {
      const c = mat.color.getHex();
      // Skip white (0xffffff) and black (0x000000) — use type fallback instead
      if (c !== 0xffffff && c !== 0xFFFFFF && c !== 0) return c;
    }
  } catch { /* ignore */ }
  const type = vert.label.charAt(0);
  return TYPE_FALLBACK_COLORS[type] ?? 0x64B5F6;
}

// =============== Store mesh geometry ===============

export function storeMeshDataForContours(meshes: THREE.Mesh[]) {
  state.vertebrae = [];

  meshes.forEach((mesh, index) => {
    const userData = mesh.userData;
    // Exclude implants (I), organs (A/H), and meshes with no geometry type.
    // Everything else (C, T, L, S, and unnamed sacrum-like 'X' meshes) is included.
    if (!userData) return;
    if (['I', 'A', 'H'].includes(userData.type)) return;

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

    const key = userData.fullName || `${userData.type}${userData.number}` || `mesh_${index}`;

    state.vertebrae.push({
      label: key, mesh, positions, indices, triCount,
      bboxMin: [minX, minY, minZ], bboxMax: [maxX, maxY, maxZ],
    });
  });

  const typeOrder = ['C', 'T', 'L', 'S', 'X'];
  state.vertebrae.sort((a, b) => {
    const tA = typeOrder.indexOf(a.label.charAt(0));
    const tB = typeOrder.indexOf(b.label.charAt(0));
    if (tA !== tB) return tA - tB;
    const nA = parseInt(a.label.slice(1)) || 999;
    const nB = parseInt(b.label.slice(1)) || 999;
    return nA - nB;
  });

  console.log(`[ContourOverlay] stored ${state.vertebrae.length} vertebrae`);
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
    if (opts.customLayout === 'stl' || viewportId === 'stlViewport') return;
    if (opts.customLayout === '3d-compare' || opts.customLayout === 'local-3d-compare') return;
    try {
      const viewport = cornerstoneViewportService.getCornerstoneViewport(viewportId);
      if (!viewport?.element) return;
      if (typeof viewport.getCamera !== 'function') return;
      if (typeof viewport.worldToCanvas !== 'function') return;
      result.push({ viewportId, viewport, element: viewport.element });
    } catch { /* ignore */ }
  });
  return result;
}

// =============== Core drawing ===============

function drawContoursOnViewport(viewportId: string, viewport: any) {
  if (!viewport) return;
  const element = viewport.element;
  if (!element) return;

  // ── Canvas ──
  let canvas = state.canvases.get(viewportId);
  if (!canvas) {
    canvas = document.createElement('canvas');
    canvas.className = 'vertebra-contour-overlay-canvas';
    canvas.style.cssText =
      'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:49;';
    const parent = element.parentElement || element;
    parent.style.position = 'relative';
    parent.appendChild(canvas);
    state.canvases.set(viewportId, canvas);
  }

  const rect = element.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return;
  canvas.width  = rect.width;
  canvas.height = rect.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // ── Slice plane ──
  const camera = viewport.getCamera?.();
  if (!camera) return;
  const { viewPlaneNormal: vpn, focalPoint: fp } = camera;
  if (!vpn || !fp) return;
  const nx = vpn[0], ny = vpn[1], nz = vpn[2];
  const planeD = -(nx * fp[0] + ny * fp[1] + nz * fp[2]);

  // ── Slice tolerance (mm) ──
  let sliceTol = 1.0;
  try {
    const id = viewport.getImageData?.();
    if (id?.spacing) {
      const sp = id.spacing;
      const eff = Math.abs(nx)*sp[0] + Math.abs(ny)*sp[1] + Math.abs(nz)*sp[2];
      sliceTol = Math.max(eff * 0.55, 0.5);
    }
  } catch {}

  // ── Per-vertebra: intersect mesh with slice plane ──
  for (const vert of state.vertebrae) {

    // AABB–plane rejection
    const bMin = vert.bboxMin, bMax = vert.bboxMax;
    let nearD = planeD, farD = planeD;
    for (let a = 0; a < 3; a++) {
      const n = a === 0 ? nx : a === 1 ? ny : nz;
      if (n > 0) { nearD += n * bMin[a]; farD += n * bMax[a]; }
      else       { nearD += n * bMax[a]; farD += n * bMin[a]; }
    }
    if (nearD > sliceTol || farD < -sliceTol) continue;

    // Collect canvas-space segments (buffer so we can draw multi-pass)
    const segs: [number, number, number, number][] = [];

    const pos = vert.positions;
    const idx = vert.indices;

    for (let t = 0; t < vert.triCount; t++) {
      const i0 = idx[t*3], i1 = idx[t*3+1], i2 = idx[t*3+2];

      const ax = pos[i0*3], ay = pos[i0*3+1], az = pos[i0*3+2];
      const bx = pos[i1*3], by = pos[i1*3+1], bz = pos[i1*3+2];
      const cx = pos[i2*3], cy = pos[i2*3+1], cz = pos[i2*3+2];

      const da = nx*ax + ny*ay + nz*az + planeD;
      const db = nx*bx + ny*by + nz*bz + planeD;
      const dc = nx*cx + ny*cy + nz*cz + planeD;

      if ((da > 0 && db > 0 && dc > 0) || (da < 0 && db < 0 && dc < 0)) continue;

      let p1x = 0, p1y = 0, p1z = 0, p2x = 0, p2y = 0, p2z = 0, count = 0;

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

      try {
        const cA = viewport.worldToCanvas([p1x, p1y, p1z]);
        const cB = viewport.worldToCanvas([p2x, p2y, p2z]);
        if (cA && cB && !isNaN(cA[0]) && !isNaN(cB[0])) {
          segs.push([cA[0], cA[1], cB[0], cB[1]]);
        }
      } catch { /* skip */ }
    }

    if (segs.length === 0) continue;

    const [r, g, b] = hexToRgb(getLiveColor(vert));
    const colorBase  = `${r},${g},${b}`;

    // ── PASS 1: subtle glow halo ──
    ctx.save();
    ctx.shadowColor  = `rgba(${colorBase},0.7)`;
    ctx.shadowBlur   = 5;
    ctx.strokeStyle  = `rgba(${colorBase},0.25)`;
    ctx.lineWidth    = 3;
    ctx.lineCap      = 'round';
    ctx.beginPath();
    for (const [ax, ay, bx2, by2] of segs) {
      ctx.moveTo(ax, ay); ctx.lineTo(bx2, by2);
    }
    ctx.stroke();
    ctx.restore();

    // ── PASS 2: crisp main stroke ──
    ctx.save();
    ctx.shadowBlur   = 0;
    ctx.strokeStyle  = `rgba(${colorBase},0.95)`;
    ctx.lineWidth    = 1.2;
    ctx.lineCap      = 'round';
    ctx.beginPath();
    for (const [ax, ay, bx2, by2] of segs) {
      ctx.moveTo(ax, ay); ctx.lineTo(bx2, by2);
    }
    ctx.stroke();
    ctx.restore();
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
    try { element.removeEventListener(event, handler); } catch { /* ignore */ }
  });
  state.eventListeners = [];

  const viewports = getViewportsForOverlay(servicesManager);
  viewports.forEach(({ viewportId, viewport, element }) => {
    let timeout: ReturnType<typeof setTimeout> | null = null;

    // Clear the canvas immediately so stale outline doesn't persist on the new slice.
    // The redraw is scheduled after a short delay to let the viewport finish rendering
    // so worldToCanvas returns correct coordinates.
    const clearCanvas = () => {
      const cvs = state.canvases.get(viewportId);
      if (cvs) {
        const c = cvs.getContext('2d');
        c?.clearRect(0, 0, cvs.width, cvs.height);
      }
    };

    // Debounce for manual camera interactions (scroll, pan) — 60ms
    const scheduleRedraw = (delay = 60) => {
      if (timeout) clearTimeout(timeout);
      timeout = setTimeout(() => {
        if (state.enabled && state.vertebrae.length > 0) {
          drawContoursOnViewport(viewportId, viewport);
        }
      }, delay);
    };

    const handleCameraModified = () => {
      clearCanvas();
      scheduleRedraw(60);
    };

    // IMAGE_RENDERED means the GPU has finished painting a new frame.
    // Redraw quickly (10ms) so the overlay aligns with the newly displayed image.
    // This fixes the "disturbed outline after programmatic zoom-navigation" issue
    // where the overlay was drawn before the render completed.
    const handleRendered = () => {
      scheduleRedraw(10);
    };

    const handleWheel = () => {
      scheduleRedraw();
    };

    const cameraEvent = Enums.Events.CAMERA_MODIFIED;
    if (cameraEvent) {
      element.addEventListener(cameraEvent, handleCameraModified);
      state.eventListeners.push({ element, event: cameraEvent, handler: handleCameraModified });
    }

    const renderEvents = [
      Enums.Events.VOLUME_NEW_IMAGE,
      Enums.Events.STACK_NEW_IMAGE,
      Enums.Events.IMAGE_RENDERED,
    ];
    renderEvents.forEach(ev => {
      if (ev) {
        element.addEventListener(ev, handleRendered);
        state.eventListeners.push({ element, event: ev, handler: handleRendered });
      }
    });

    element.addEventListener('wheel', handleWheel);
    state.eventListeners.push({ element, event: 'wheel', handler: handleWheel });
  });
}

function removeOverlay() {
  state.eventListeners.forEach(({ element, event, handler }) => {
    try { element.removeEventListener(event, handler); } catch { /* ignore */ }
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

/**
 * Force a redraw on all viewports. Call this after programmatic navigation
 * (e.g. clicking a 3D vertebra) so the overlay catches up with the new slice.
 */
export function redrawContourOverlay() {
  if (!state.enabled || !servicesManagerRef) return;
  // First draw at 80ms covers the case where the render completes quickly.
  // Second draw at 400ms catches slow renders (complex volumes, first frame after zoom)
  // where IMAGE_RENDERED fires late and the 80ms draw was ahead of the displayed frame.
  setTimeout(() => redrawAll(), 80);
  setTimeout(() => redrawAll(), 400);
}
