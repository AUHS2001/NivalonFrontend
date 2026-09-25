/**
 * Implant Drawing Manager — module-level canvas overlay for drawing implant
 * outlines on DICOM viewports.
 *
 * Usage:
 *   setServicesManager(sm)
 *   setImplantDrawingEnabled(true)
 *   setOnShapeComplete(handler)
 *   — user draws polygon by clicking, double-click closes —
 *   addFinalizedShape(id, viewportId, canvasPoints, color, worldPoints, shapeNormal)
 *   removeFinalizedShape(id)
 */

interface Pt2D { x: number; y: number; }

interface FinalizedShape {
  id: string;
  viewportId: string;
  canvasPoints: Pt2D[];
  worldPoints: Array<[number, number, number]>;
  worldCentroid: [number, number, number];
  shapeNormal: [number, number, number];
  color: string;
}

interface State {
  enabled: boolean;
  inProgress: boolean;
  points: Pt2D[];
  worldPoints: Array<[number, number, number]>;
  activeViewportId: string | null;
  mousePos: Pt2D | null;
  color: string;
  thickness: number;
  canvases: Map<string, HTMLCanvasElement>;
  eventListeners: Array<{ element: HTMLElement; event: string; handler: EventListenerOrEventListenerObject; options?: AddEventListenerOptions }>;
  finalizedShapes: FinalizedShape[];
  onShapeComplete: ((
    worldPoints: Array<[number, number, number]>,
    normal: [number, number, number],
    canvasPoints: Pt2D[],
    viewportId: string
  ) => void) | null;
}

let servicesManagerRef: any = null;

const state: State = {
  enabled: false,
  inProgress: false,
  points: [],
  worldPoints: [],
  activeViewportId: null,
  mousePos: null,
  color: '#00bcd4',
  thickness: 10,
  canvases: new Map(),
  eventListeners: [],
  finalizedShapes: [],
  onShapeComplete: null,
};

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

export function setServicesManager(sm: any) {
  servicesManagerRef = sm;
}

export function setImplantDrawingEnabled(enabled: boolean, sm?: any) {
  if (sm) servicesManagerRef = sm;
  state.enabled = enabled;

  if (!enabled) {
    cancelDrawing();
    detachEventListeners();
    // Keep canvases so finalized shapes remain visible; just remove pointer events
    state.canvases.forEach(canvas => {
      canvas.style.pointerEvents = 'none';
      canvas.style.cursor = 'default';
    });
    redrawAll(); // still paint finalized shapes
  } else {
    attachCanvases();
  }
}

export function setImplantDrawingColor(color: string) {
  state.color = color;
  redrawAll();
}

export function setImplantDrawingThickness(t: number) {
  state.thickness = t;
}

export function setOnShapeComplete(
  cb: (
    worldPoints: Array<[number, number, number]>,
    normal: [number, number, number],
    canvasPoints: Pt2D[],
    viewportId: string
  ) => void
) {
  state.onShapeComplete = cb;
}

export function addFinalizedShape(
  id: string,
  viewportId: string,
  canvasPoints: Pt2D[],
  color: string,
  worldPoints: Array<[number, number, number]> = [],
  shapeNormal: [number, number, number] = [0, 0, 1]
) {
  // Compute world centroid
  const worldCentroid: [number, number, number] = [0, 0, 0];
  if (worldPoints.length > 0) {
    worldPoints.forEach(([x, y, z]) => { worldCentroid[0] += x; worldCentroid[1] += y; worldCentroid[2] += z; });
    worldCentroid[0] /= worldPoints.length;
    worldCentroid[1] /= worldPoints.length;
    worldCentroid[2] /= worldPoints.length;
  }
  state.finalizedShapes.push({ id, viewportId, canvasPoints, worldPoints, worldCentroid, shapeNormal, color });
  redrawAll();
}

export function removeFinalizedShape(id: string) {
  state.finalizedShapes = state.finalizedShapes.filter(s => s.id !== id);
  redrawAll();
}

export function updateFinalizedShape(
  id: string,
  newWorldPoints: Array<[number, number, number]>
) {
  const shape = state.finalizedShapes.find(s => s.id === id);
  if (!shape) return;
  const c: [number, number, number] = [0, 0, 0];
  newWorldPoints.forEach(([x, y, z]) => { c[0] += x; c[1] += y; c[2] += z; });
  c[0] /= newWorldPoints.length;
  c[1] /= newWorldPoints.length;
  c[2] /= newWorldPoints.length;
  shape.worldPoints = newWorldPoints;
  shape.worldCentroid = c;
  // Clear stored canvas points so all viewports reproject from worldPoints
  shape.canvasPoints = [];
  redrawAll();
}

export function clearAllFinalizedShapes() {
  state.finalizedShapes = [];
  redrawAll();
}

export function cleanup() {
  detachEventListeners();
  state.canvases.forEach(canvas => canvas.parentElement?.removeChild(canvas));
  state.canvases.clear();
  state.finalizedShapes = [];
}

// ─────────────────────────────────────────────────────────────────────────────
// Viewport helpers
// ─────────────────────────────────────────────────────────────────────────────

function getViewports(): Array<{ viewportId: string; viewport: any; element: HTMLElement }> {
  if (!servicesManagerRef) return [];
  try {
    const { cornerstoneViewportService, viewportGridService } = servicesManagerRef.services || {};
    if (!cornerstoneViewportService || !viewportGridService) return [];

    const gridState = viewportGridService.getState();
    const viewports = gridState?.viewports;
    if (!viewports) return [];

    const entries: [string, any][] = viewports instanceof Map
      ? Array.from(viewports.entries())
      : Object.entries(viewports);

    const result: Array<{ viewportId: string; viewport: any; element: HTMLElement }> = [];
    for (const [vpId] of entries) {
      try {
        const vp = cornerstoneViewportService.getCornerstoneViewport(vpId);
        if (vp?.element) result.push({ viewportId: vpId, viewport: vp, element: vp.element });
      } catch (_) { /* skip */ }
    }
    return result;
  } catch {
    return [];
  }
}

function getOrCreateCanvas(viewportId: string, element: HTMLElement): HTMLCanvasElement {
  let canvas = state.canvases.get(viewportId);
  if (canvas && !document.body.contains(canvas)) {
    state.canvases.delete(viewportId);
    canvas = undefined as any;
  }
  if (!canvas) {
    canvas = document.createElement('canvas');
    canvas.className = 'implant-drawing-overlay';
    canvas.style.cssText =
      'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:60;';
    const parent = element.parentElement || element;
    (parent as HTMLElement).style.position = 'relative';
    parent.appendChild(canvas);
    state.canvases.set(viewportId, canvas);
  }
  const rect = element.getBoundingClientRect();
  canvas.width = rect.width || element.clientWidth;
  canvas.height = rect.height || element.clientHeight;
  return canvas;
}

// ─────────────────────────────────────────────────────────────────────────────
// Canvas event handling
// ─────────────────────────────────────────────────────────────────────────────

function attachCanvases() {
  detachEventListeners();
  const viewports = getViewports();

  viewports.forEach(({ viewportId, viewport, element }) => {
    const canvas = getOrCreateCanvas(viewportId, element);
    canvas.style.pointerEvents = 'auto';
    canvas.style.cursor = 'crosshair';

    const onClick: EventListener = (e: Event) =>
      handleClick(e as MouseEvent, viewportId, viewport, canvas);
    const onMouseMove: EventListener = (e: Event) =>
      handleMouseMove(e as MouseEvent, viewportId, canvas);
    const onDblClick: EventListener = (e: Event) =>
      handleDblClick(e as MouseEvent, viewportId, viewport);
    const onContextMenu: EventListener = (e: Event) => {
      e.preventDefault();
      cancelDrawing();
    };

    // Forward wheel events to the underlying viewport element so slice
    // navigation still works while the draw-implant tool is active.
    // After forwarding, schedule a redraw so the per-slice visibility
    // check re-evaluates against the new focal point.
    const onWheel: EventListener = (e: Event) => {
      const we = e as WheelEvent;
      element.dispatchEvent(new WheelEvent('wheel', {
        bubbles: true,
        cancelable: we.cancelable,
        deltaX: we.deltaX,
        deltaY: we.deltaY,
        deltaZ: we.deltaZ,
        deltaMode: we.deltaMode,
        clientX: we.clientX,
        clientY: we.clientY,
        ctrlKey: we.ctrlKey,
        shiftKey: we.shiftKey,
        altKey: we.altKey,
        metaKey: we.metaKey,
      }));
      // Two rAF frames: first for Cornerstone to process the scroll,
      // second for it to update the camera/focal point before we redraw.
      requestAnimationFrame(() => requestAnimationFrame(redrawAll));
    };

    canvas.addEventListener('click', onClick);
    canvas.addEventListener('mousemove', onMouseMove);
    canvas.addEventListener('dblclick', onDblClick);
    canvas.addEventListener('contextmenu', onContextMenu);
    canvas.addEventListener('wheel', onWheel, { passive: true });

    state.eventListeners.push(
      { element: canvas, event: 'click', handler: onClick },
      { element: canvas, event: 'mousemove', handler: onMouseMove },
      { element: canvas, event: 'dblclick', handler: onDblClick },
      { element: canvas, event: 'contextmenu', handler: onContextMenu },
      { element: canvas, event: 'wheel', handler: onWheel, options: { passive: true } },
    );
  });
}

function detachEventListeners() {
  state.eventListeners.forEach(({ element, event, handler, options }) =>
    element.removeEventListener(event, handler, options)
  );
  state.eventListeners = [];
}

function canvasCoords(e: MouseEvent, canvas: HTMLCanvasElement): Pt2D {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (e.clientX - rect.left) * (canvas.width / rect.width),
    y: (e.clientY - rect.top) * (canvas.height / rect.height),
  };
}

function handleClick(e: MouseEvent, viewportId: string, viewport: any, canvas: HTMLCanvasElement) {
  if (!state.enabled) return;
  if (state.inProgress && state.activeViewportId !== viewportId) return;
  if (e.detail >= 2) return; // handled by dblclick

  const pt = canvasCoords(e, canvas);
  const world = canvasToWorld(viewport, pt.x, pt.y);
  if (!world) return;

  state.inProgress = true;
  state.activeViewportId = viewportId;
  state.points.push(pt);
  state.worldPoints.push(world);
  redrawAll();
}

function handleMouseMove(e: MouseEvent, viewportId: string, canvas: HTMLCanvasElement) {
  if (!state.enabled || !state.inProgress || state.activeViewportId !== viewportId) return;
  state.mousePos = canvasCoords(e, canvas);
  redrawCanvas(viewportId, canvas);
}

function handleDblClick(e: MouseEvent, viewportId: string, viewport: any) {
  if (!state.enabled || !state.inProgress || state.activeViewportId !== viewportId) return;
  if (state.worldPoints.length < 3) { cancelDrawing(); return; }

  const normal = getViewportNormal(viewport);
  const worldPoints = [...state.worldPoints];
  const canvasPoints = [...state.points];
  const vid = state.activeViewportId!;

  cancelDrawing();

  if (state.onShapeComplete) {
    state.onShapeComplete(worldPoints, normal, canvasPoints, vid);
  }
}

function cancelDrawing() {
  state.inProgress = false;
  state.points = [];
  state.worldPoints = [];
  state.activeViewportId = null;
  state.mousePos = null;
  redrawAll();
}

function canvasToWorld(viewport: any, cx: number, cy: number): [number, number, number] | null {
  try {
    const w = viewport.canvasToWorld([cx, cy]);
    if (w && w.length >= 3) return [w[0], w[1], w[2]];
  } catch (_) { /* */ }
  return null;
}

function getViewportNormal(viewport: any): [number, number, number] {
  try {
    const cam = viewport.getCamera?.();
    if (cam?.viewPlaneNormal) {
      const n = cam.viewPlaneNormal;
      return [n[0], n[1], n[2]];
    }
  } catch (_) { /* */ }
  return [0, 0, 1];
}

// ─────────────────────────────────────────────────────────────────────────────
// Per-slice visibility check
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns true if the shape's centroid lies on (or very close to) the
 * viewport's current slice.
 *
 * We project the centroid onto the VIEWPORT's own view-plane normal so the
 * check works correctly for any orientation:
 *   • axial viewport   → compares depth along Z
 *   • sagittal viewport → compares depth along X (finds the sagittal slice
 *                          that contains the polygon's centroid)
 *   • coronal viewport  → compares depth along Y
 */
function isShapeOnCurrentSlice(
  viewportId: string,
  worldCentroid: [number, number, number]
): boolean {
  try {
    const { cornerstoneViewportService } = servicesManagerRef?.services || {};
    if (!cornerstoneViewportService) return true;
    const vp = cornerstoneViewportService.getCornerstoneViewport(viewportId);
    if (!vp) return true;
    const cam = vp.getCamera?.();
    if (!cam?.focalPoint || !cam?.viewPlaneNormal) return true;
    const fp = cam.focalPoint as number[];
    const vn = cam.viewPlaneNormal as number[]; // viewport's own normal
    const dx = fp[0] - worldCentroid[0];
    const dy = fp[1] - worldCentroid[1];
    const dz = fp[2] - worldCentroid[2];
    const dist = Math.abs(dx * vn[0] + dy * vn[1] + dz * vn[2]);
    return dist < 8; // 8 mm — covers most CT/MR slice spacings
  } catch {
    return true;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Drawing
// ─────────────────────────────────────────────────────────────────────────────

function redrawAll() {
  state.canvases.forEach((canvas, viewportId) => redrawCanvas(viewportId, canvas));
}

function redrawCanvas(viewportId: string, canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Draw finalized shapes — per-slice: only render when the viewport's current
  // slice passes through the shape's centroid.
  state.finalizedShapes.forEach(s => {
    if (s.worldPoints.length >= 3) {
      if (!isShapeOnCurrentSlice(viewportId, s.worldCentroid)) return;
    }

    // Use stored canvas points only when they are still valid (not cleared by
    // updateFinalizedShape after a drag/resize). Otherwise reproject world coords.
    const useCached = s.viewportId === viewportId && s.canvasPoints.length >= 3;
    if (useCached) {
      drawFilledPolygon(ctx, s.canvasPoints, s.color);
    } else if (s.worldPoints.length >= 3) {
      const pts = worldPointsToCanvas(viewportId, s.worldPoints, canvas);
      if (pts) drawFilledPolygon(ctx, pts, s.color);
    }
  });

  // In-progress polygon
  if (viewportId === state.activeViewportId && state.points.length > 0) {
    drawInProgress(ctx, state.points, state.mousePos, state.color);
  }
}

function worldPointsToCanvas(
  viewportId: string,
  worldPoints: Array<[number, number, number]>,
  canvas: HTMLCanvasElement
): Pt2D[] | null {
  try {
    const { cornerstoneViewportService } = servicesManagerRef?.services || {};
    if (!cornerstoneViewportService) return null;
    const vp = cornerstoneViewportService.getCornerstoneViewport(viewportId);
    if (!vp?.worldToCanvas) return null;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / (rect.width || canvas.width);
    const scaleY = canvas.height / (rect.height || canvas.height);
    return worldPoints.map(([x, y, z]) => {
      const c = vp.worldToCanvas([x, y, z]);
      return { x: c[0] * scaleX, y: c[1] * scaleY };
    });
  } catch {
    return null;
  }
}

function drawFilledPolygon(ctx: CanvasRenderingContext2D, pts: Pt2D[], color: string) {
  if (pts.length < 2) return;
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.closePath();
  ctx.globalAlpha = 0.35;
  ctx.fillStyle = color;
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();
}

function drawInProgress(ctx: CanvasRenderingContext2D, pts: Pt2D[], preview: Pt2D | null, color: string) {
  ctx.save();

  // Line + preview
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  if (preview) ctx.lineTo(preview.x, preview.y);
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.setLineDash([6, 3]);
  ctx.stroke();
  ctx.setLineDash([]);

  // Vertex dots
  pts.forEach((p, i) => {
    ctx.beginPath();
    ctx.arc(p.x, p.y, i === 0 ? 6 : 4, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();

    // First point gets a white ring when polygon is closeable
    if (i === 0 && pts.length >= 3) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 10, 0, Math.PI * 2);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  });

  // Hint label on first click
  if (pts.length === 1) {
    const hintW = 230;
    const hintH = 22;
    const tx = pts[0].x + 14;
    const ty = pts[0].y - 6;
    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    ctx.beginPath();
    ctx.roundRect?.(tx - 4, ty - hintH + 4, hintW, hintH, 4);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = '11px Inter,sans-serif';
    ctx.fillText('Click to add points  •  Dbl-click to finish', tx, ty);
  }

  ctx.restore();
}
