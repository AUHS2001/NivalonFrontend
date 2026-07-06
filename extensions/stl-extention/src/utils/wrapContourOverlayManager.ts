import * as THREE from 'three';
import { Enums } from '@cornerstonejs/core';
import {
  MergedTopology,
  InfluenceVertex,
  findInfluenceVertices,
  moveVerticesWithInfluence,
  applyLocalSmoothing,
} from './wrapMeshEditor';

/**
 * Wrap contour overlay manager.
 * Projects blue mesh cross-sections onto DICOM viewports.
 * Click and drag anywhere on the contour outline to reshape the mesh.
 *
 * Architecture forked from vertebraContourOverlayManager.ts.
 * Interaction pattern from spineLabelOverlayManager.ts.
 */

// ── Config ──
const CONTOUR_COLOR = 'rgba(0, 120, 255, 0.9)';
const CONTOUR_HOVER_COLOR = 'rgba(255, 235, 59, 0.9)';
const CONTOUR_LINE_WIDTH = 2;
const HIT_TOLERANCE = 8; // px — how close cursor must be to contour line
const INFLUENCE_RADIUS = 12; // mm in world space — larger radius for smoother deformation
const DRAG_SMOOTH_INTERVAL = 3; // apply light smoothing every N drag frames

// ── Types ──

interface ContourSegment {
  canvasA: [number, number];
  canvasB: [number, number];
  worldA: [number, number, number];
  worldB: [number, number, number];
  meshIndex: number;
}

interface MeshData {
  positions: Float32Array;
  indices: Uint32Array;
  triCount: number;
  bboxMin: [number, number, number];
  bboxMax: [number, number, number];
  meshIndex: number;
  mesh: THREE.Mesh;
  topology: MergedTopology;
}

interface DragState {
  active: boolean;
  startWorldPos: [number, number, number];
  viewportId: string;
  influences: InfluenceVertex[];
  meshData: MeshData;
  frameCount: number;
  dragCenter: [number, number, number]; // current center for re-computing influences
}

interface WrapContourState {
  meshes: MeshData[];
  enabled: boolean;
  canvases: Map<string, HTMLCanvasElement>;
  eventListeners: Array<{ element: any; event: string; handler: (e: any) => void }>;
  segments: Map<string, ContourSegment[]>; // per viewport
  hoverNear: boolean;
  drag: DragState;
  onMeshModified: (() => void) | null;
}

const state: WrapContourState = {
  meshes: [],
  enabled: false,
  canvases: new Map(),
  eventListeners: [],
  segments: new Map(),
  hoverNear: false,
  drag: {
    active: false,
    startWorldPos: [0, 0, 0], viewportId: '',
    influences: [], meshData: null as any,
    frameCount: 0, dragCenter: [0, 0, 0],
  },
  onMeshModified: null,
};

let servicesManagerRef: any = null;

// ── Store mesh data ──

export function storeWrapMeshData(meshes: THREE.Mesh[], topologies: Map<number, MergedTopology>) {
  state.meshes = [];

  meshes.forEach((mesh, index) => {
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

    const topology = topologies.get(index);
    if (!topology) return;

    state.meshes.push({
      positions, indices, triCount,
      bboxMin: [minX, minY, minZ],
      bboxMax: [maxX, maxY, maxZ],
      meshIndex: index, mesh, topology,
    });
  });

  console.log(`[WrapContour] stored ${state.meshes.length} meshes`);
}

// ── Viewport helpers ──

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
      if (!viewport || !viewport.element) return;
      if (typeof viewport.getCamera !== 'function') return;
      if (typeof viewport.worldToCanvas !== 'function') return;
      result.push({ viewportId, viewport, element: viewport.element });
    } catch (e) { /* ignore */ }
  });
  return result;
}

// ── Geometry helpers ──

function canvasLocalCoords(e: MouseEvent, canvas: HTMLCanvasElement) {
  const rect = canvas.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return null;
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  return {
    mx: (e.clientX - rect.left) * scaleX,
    my: (e.clientY - rect.top) * scaleY,
  };
}

/** Squared distance from point (px,py) to line segment (ax,ay)-(bx,by) */
function pointToSegmentDistSq(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax, dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq < 0.001) {
    const ex = px - ax, ey = py - ay;
    return ex * ex + ey * ey;
  }
  let t = ((px - ax) * dx + (py - ay) * dy) / lenSq;
  if (t < 0) t = 0; else if (t > 1) t = 1;
  const cx = ax + t * dx, cy = ay + t * dy;
  const ex = px - cx, ey = py - cy;
  return ex * ex + ey * ey;
}

/** Find the closest contour segment to a canvas point. Returns segment + interpolated world pos, or null. */
function findClosestSegment(mx: number, my: number, viewportId: string): { seg: ContourSegment; worldPos: [number, number, number]; dist: number } | null {
  const segs = state.segments.get(viewportId);
  if (!segs || segs.length === 0) return null;

  let bestDist = Infinity;
  let bestSeg: ContourSegment | null = null;
  let bestT = 0;

  for (const seg of segs) {
    const d = pointToSegmentDistSq(mx, my, seg.canvasA[0], seg.canvasA[1], seg.canvasB[0], seg.canvasB[1]);
    if (d < bestDist) {
      bestDist = d;
      bestSeg = seg;
      // Compute t parameter for closest point
      const dx = seg.canvasB[0] - seg.canvasA[0], dy = seg.canvasB[1] - seg.canvasA[1];
      const lenSq = dx * dx + dy * dy;
      if (lenSq < 0.001) { bestT = 0.5; }
      else {
        let t = ((mx - seg.canvasA[0]) * dx + (my - seg.canvasA[1]) * dy) / lenSq;
        if (t < 0) t = 0; else if (t > 1) t = 1;
        bestT = t;
      }
    }
  }

  if (!bestSeg) return null;
  const dist = Math.sqrt(bestDist);
  const worldPos: [number, number, number] = [
    bestSeg.worldA[0] + bestT * (bestSeg.worldB[0] - bestSeg.worldA[0]),
    bestSeg.worldA[1] + bestT * (bestSeg.worldB[1] - bestSeg.worldA[1]),
    bestSeg.worldA[2] + bestT * (bestSeg.worldB[2] - bestSeg.worldA[2]),
  ];
  return { seg: bestSeg, worldPos, dist };
}

// ── Core: mesh-plane intersection (no dots) ──

function drawContoursOnViewport(viewportId: string, viewport: any) {
  if (!viewport) return;
  const element = viewport.element;
  if (!element) return;

  // Canvas setup
  let canvas = state.canvases.get(viewportId);
  if (!canvas) {
    canvas = document.createElement('canvas');
    canvas.className = 'wrap-contour-overlay-canvas';
    canvas.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:49;';
    const parent = element.parentElement || element;
    parent.style.position = 'relative';
    parent.appendChild(canvas);
    state.canvases.set(viewportId, canvas);

    canvas.addEventListener('mousedown', handleCanvasMouseDown);
  }

  const rect = element.getBoundingClientRect();
  canvas.width = rect.width;
  canvas.height = rect.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const camera = viewport.getCamera?.();
  if (!camera) return;
  const { viewPlaneNormal: vpn, focalPoint: fp } = camera;
  if (!vpn || !fp) return;

  const nx = vpn[0], ny = vpn[1], nz = vpn[2];
  const planeD = -(nx * fp[0] + ny * fp[1] + nz * fp[2]);

  let sliceTol = 1.0;
  try {
    const imageData = viewport.getImageData?.();
    if (imageData?.spacing) {
      const sp = imageData.spacing;
      const effectiveSpacing = Math.abs(nx) * sp[0] + Math.abs(ny) * sp[1] + Math.abs(nz) * sp[2];
      sliceTol = Math.max(effectiveSpacing * 0.55, 0.5);
    }
  } catch {}

  const segments: ContourSegment[] = [];

  for (const meshData of state.meshes) {
    const bMin = meshData.bboxMin, bMax = meshData.bboxMax;
    let nearD = planeD, farD = planeD;
    for (let a = 0; a < 3; a++) {
      const n = a === 0 ? nx : a === 1 ? ny : nz;
      if (n > 0) { nearD += n * bMin[a]; farD += n * bMax[a]; }
      else       { nearD += n * bMax[a]; farD += n * bMin[a]; }
    }
    if (nearD > sliceTol || farD < -sliceTol) continue;

    const pos = meshData.positions;
    const idx = meshData.indices;

    // Use hover color if hovering near contour on this viewport
    ctx.strokeStyle = (state.hoverNear && !state.drag.active) ? CONTOUR_HOVER_COLOR : CONTOUR_COLOR;
    ctx.lineWidth = CONTOUR_LINE_WIDTH;
    ctx.beginPath();

    for (let t = 0; t < meshData.triCount; t++) {
      const i0 = idx[t * 3], i1 = idx[t * 3 + 1], i2 = idx[t * 3 + 2];

      const ax = pos[i0*3], ay = pos[i0*3+1], az = pos[i0*3+2];
      const bx = pos[i1*3], by = pos[i1*3+1], bz = pos[i1*3+2];
      const cx2 = pos[i2*3], cy2 = pos[i2*3+1], cz2 = pos[i2*3+2];

      const da = nx*ax + ny*ay + nz*az + planeD;
      const db = nx*bx + ny*by + nz*bz + planeD;
      const dc = nx*cx2 + ny*cy2 + nz*cz2 + planeD;

      if ((da > 0 && db > 0 && dc > 0) || (da < 0 && db < 0 && dc < 0)) continue;

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
        if (count === 0) { p1x = bx+tt*(cx2-bx); p1y = by+tt*(cy2-by); p1z = bz+tt*(cz2-bz); }
        else             { p2x = bx+tt*(cx2-bx); p2y = by+tt*(cy2-by); p2z = bz+tt*(cz2-bz); }
        count++;
      }
      if (count < 2 && dc * da < 0) {
        const tt = dc / (dc - da);
        if (count === 0) { p1x = cx2+tt*(ax-cx2); p1y = cy2+tt*(ay-cy2); p1z = cz2+tt*(az-cz2); }
        else             { p2x = cx2+tt*(ax-cx2); p2y = cy2+tt*(ay-cy2); p2z = cz2+tt*(az-cz2); }
        count++;
      }

      if (count < 2) continue;

      try {
        const canvasA = viewport.worldToCanvas([p1x, p1y, p1z]);
        const canvasB = viewport.worldToCanvas([p2x, p2y, p2z]);
        if (canvasA && canvasB && !isNaN(canvasA[0]) && !isNaN(canvasB[0])) {
          ctx.moveTo(canvasA[0], canvasA[1]);
          ctx.lineTo(canvasB[0], canvasB[1]);

          segments.push({
            canvasA: [canvasA[0], canvasA[1]],
            canvasB: [canvasB[0], canvasB[1]],
            worldA: [p1x, p1y, p1z],
            worldB: [p2x, p2y, p2z],
            meshIndex: meshData.meshIndex,
          });
        }
      } catch { /* skip */ }
    }

    ctx.stroke();
  }

  // Cache segments for hit detection
  state.segments.set(viewportId, segments);
}

// ── Interaction handlers ──

function findViewportAndCanvasForElement(el: HTMLElement): { viewportId: string; viewport: any; canvas: HTMLCanvasElement } | null {
  if (!servicesManagerRef) return null;
  const viewports = getViewportsForOverlay(servicesManagerRef);
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

function findViewportForCanvas(canvas: HTMLCanvasElement): { viewportId: string; viewport: any } | null {
  if (!servicesManagerRef) return null;
  const viewports = getViewportsForOverlay(servicesManagerRef);
  for (const { viewportId, viewport, element } of viewports) {
    const vc = state.canvases.get(viewportId);
    if (vc === canvas) return { viewportId, viewport };
    const parent = element.parentElement || element;
    if (parent.contains(canvas)) return { viewportId, viewport };
  }
  return null;
}

function handleParentMouseMove(e: MouseEvent) {
  if (state.drag.active) return;

  const parentEl = e.currentTarget as HTMLElement;
  const info = findViewportAndCanvasForElement(parentEl);
  if (!info) return;
  const { viewportId, viewport, canvas } = info;

  const coords = canvasLocalCoords(e, canvas);
  if (!coords) return;

  const closest = findClosestSegment(coords.mx, coords.my, viewportId);
  const isNear = closest !== null && closest.dist <= HIT_TOLERANCE;

  if (isNear && !state.hoverNear) {
    state.hoverNear = true;
    canvas.style.pointerEvents = 'auto';
    canvas.style.cursor = 'grab';
    drawContoursOnViewport(viewportId, viewport);
  } else if (!isNear && state.hoverNear) {
    state.hoverNear = false;
    canvas.style.pointerEvents = 'none';
    canvas.style.cursor = '';
    drawContoursOnViewport(viewportId, viewport);
  }
}

function handleWindowMouseMove(e: MouseEvent) {
  if (!state.drag.active) return;

  const dragViewportId = state.drag.viewportId;
  const canvas = state.canvases.get(dragViewportId);
  if (!canvas) return;

  const vpInfo = findViewportForCanvas(canvas);
  if (!vpInfo) return;
  const { viewport } = vpInfo;

  const coords = canvasLocalCoords(e, canvas);
  if (!coords) return;

  try {
    const currentWorld = viewport.canvasToWorld([coords.mx, coords.my]);
    if (currentWorld) {
      const displacement: [number, number, number] = [
        currentWorld[0] - state.drag.startWorldPos[0],
        currentWorld[1] - state.drag.startWorldPos[1],
        currentWorld[2] - state.drag.startWorldPos[2],
      ];

      // Cap displacement per frame to prevent extreme jumps
      const dispLen = Math.sqrt(displacement[0] ** 2 + displacement[1] ** 2 + displacement[2] ** 2);
      const MAX_DISP = 3; // mm per frame
      if (dispLen > MAX_DISP) {
        const scale = MAX_DISP / dispLen;
        displacement[0] *= scale;
        displacement[1] *= scale;
        displacement[2] *= scale;
      }

      const meshData = state.drag.meshData;
      moveVerticesWithInfluence(
        meshData.mesh.geometry,
        meshData.topology,
        state.drag.influences,
        displacement,
      );

      state.drag.frameCount++;

      // Apply light smoothing periodically during drag to prevent knots
      if (state.drag.frameCount % DRAG_SMOOTH_INTERVAL === 0) {
        applyLocalSmoothing(
          meshData.mesh.geometry,
          meshData.topology,
          state.drag.dragCenter,
          INFLUENCE_RADIUS,
          1,   // just 1 iteration during drag for responsiveness
          0.2, // gentle lambda
        );

        // Re-compute influence vertices from current drag center
        // so newly-nearby vertices participate in the deformation
        state.drag.dragCenter = [currentWorld[0], currentWorld[1], currentWorld[2]];
        state.drag.influences = findInfluenceVertices(
          meshData.topology, state.drag.dragCenter, INFLUENCE_RADIUS,
        );
      }

      refreshMeshPositions(meshData);
      state.drag.startWorldPos = [currentWorld[0], currentWorld[1], currentWorld[2]];

      redrawAll();
      state.onMeshModified?.();
    }
  } catch { /* ignore */ }
}

function handleCanvasMouseDown(e: MouseEvent) {
  const canvas = e.currentTarget as HTMLCanvasElement;
  const info = findViewportForCanvas(canvas);
  if (!info) return;
  const { viewportId, viewport } = info;

  const coords = canvasLocalCoords(e, canvas);
  if (!coords) return;

  // Find closest contour segment to click point
  const closest = findClosestSegment(coords.mx, coords.my, viewportId);
  if (!closest || closest.dist > HIT_TOLERANCE) return;

  e.stopPropagation();
  e.preventDefault();

  const worldPos = closest.worldPos;

  // Find the mesh this segment belongs to
  const meshData = state.meshes.find(md => md.meshIndex === closest.seg.meshIndex);
  if (!meshData) return;

  // Find influence vertices around the clicked world point
  const influences = findInfluenceVertices(meshData.topology, worldPos, INFLUENCE_RADIUS);
  if (influences.length === 0) return;

  state.drag = {
    active: true,
    startWorldPos: worldPos,
    viewportId,
    influences,
    meshData,
    frameCount: 0,
    dragCenter: [...worldPos] as [number, number, number],
  };

  canvas.style.cursor = 'grabbing';

  window.addEventListener('mousemove', handleWindowMouseMove);
  window.addEventListener('mouseup', handleWindowMouseUp);
}

function handleWindowMouseUp(_e: MouseEvent) {
  if (!state.drag.active) return;

  const meshData = state.drag.meshData;

  // Apply local smoothing to blend the edit
  applyLocalSmoothing(
    meshData.mesh.geometry,
    meshData.topology,
    state.drag.startWorldPos,
    INFLUENCE_RADIUS,
    3,
    0.3,
  );

  refreshMeshPositions(meshData);

  state.drag = {
    active: false,
    startWorldPos: [0, 0, 0], viewportId: '',
    influences: [], meshData: null as any,
    frameCount: 0, dragCenter: [0, 0, 0],
  };
  state.hoverNear = false;

  state.canvases.forEach(canvas => {
    canvas.style.pointerEvents = 'none';
    canvas.style.cursor = '';
  });

  window.removeEventListener('mousemove', handleWindowMouseMove);
  window.removeEventListener('mouseup', handleWindowMouseUp);

  redrawAll();
  state.onMeshModified?.();
}

// ── Refresh stored positions after editing ──

function refreshMeshPositions(meshData: MeshData) {
  const mesh = meshData.mesh;
  const geometry = mesh.geometry;
  const posAttr = geometry.getAttribute('position');
  if (!posAttr) return;

  mesh.updateMatrixWorld(true);
  const mat = mesh.matrixWorld;
  const vertCount = posAttr.count;
  const v = new THREE.Vector3();

  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

  for (let i = 0; i < vertCount; i++) {
    v.set(posAttr.getX(i), posAttr.getY(i), posAttr.getZ(i));
    v.applyMatrix4(mat);
    meshData.positions[i * 3]     = v.x;
    meshData.positions[i * 3 + 1] = v.y;
    meshData.positions[i * 3 + 2] = v.z;
    if (v.x < minX) minX = v.x; if (v.x > maxX) maxX = v.x;
    if (v.y < minY) minY = v.y; if (v.y > maxY) maxY = v.y;
    if (v.z < minZ) minZ = v.z; if (v.z > maxZ) maxZ = v.z;
  }

  meshData.bboxMin = [minX, minY, minZ];
  meshData.bboxMax = [maxX, maxY, maxZ];
}

// ── Orchestration ──

function redrawAll() {
  if (state.meshes.length === 0 || !servicesManagerRef) return;
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
        if (state.enabled && state.meshes.length > 0) {
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

    const parent = element.parentElement || element;
    parent.addEventListener('mousemove', handleParentMouseMove);
    state.eventListeners.push({ element: parent, event: 'mousemove', handler: handleParentMouseMove });
  });
}

function removeOverlay() {
  window.removeEventListener('mousemove', handleWindowMouseMove);
  window.removeEventListener('mouseup', handleWindowMouseUp);

  state.eventListeners.forEach(({ element, event, handler }) => {
    try { element.removeEventListener(event, handler); } catch (e) { /* ignore */ }
  });
  state.eventListeners = [];

  state.canvases.forEach(canvas => {
    canvas.removeEventListener('mousedown', handleCanvasMouseDown);
    canvas.remove();
  });
  state.canvases.clear();
  state.segments.clear();
  state.hoverNear = false;
  state.drag = {
    active: false,
    startWorldPos: [0, 0, 0], viewportId: '',
    influences: [], meshData: null as any,
    frameCount: 0, dragCenter: [0, 0, 0],
  };
  state.enabled = false;
  state.onMeshModified = null;
  servicesManagerRef = null;
}

// ── Public API ──

export function showWrapContourOverlay(servicesManager: any, onMeshModified?: () => void) {
  removeOverlay();
  servicesManagerRef = servicesManager;
  state.onMeshModified = onMeshModified || null;

  if (state.meshes.length === 0) {
    console.log('[WrapContour] no mesh data stored, skipping');
    return;
  }

  state.enabled = true;

  setTimeout(() => {
    redrawAll();
    setupListeners(servicesManager);
    console.log('[WrapContour] enabled with', state.meshes.length, 'meshes');
  }, 300);
}

export function hideWrapContourOverlay() {
  removeOverlay();
  console.log('[WrapContour] disabled');
}

export function redrawWrapContours() {
  if (state.enabled) {
    redrawAll();
  }
}
