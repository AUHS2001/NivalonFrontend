import * as THREE from 'three';
import { Enums } from '@cornerstonejs/core';

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

      const worldMatrix = mesh.matrixWorld;
      const min = boundingBox.min.clone().applyMatrix4(worldMatrix);
      const max = boundingBox.max.clone().applyMatrix4(worldMatrix);
      overallBounds.min.min(min);
      overallBounds.max.max(max);
    }
  });

  state.vertebraCenters = centers;
  state.stlBounds = overallBounds;
  // New data loaded — old drag offsets are no longer valid
  state.labelOffsets.clear();
  state.pointDeltas.clear();
  console.log(`SpineLabelOverlay: stored ${centers.length} vertebra centers`);
}

export function hasVertebraData(): boolean {
  return state.vertebraCenters.length >= 2;
}

export function isEnabled(): boolean {
  return state.enabled;
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
    volumeCenter[1] - offset.y * uniformScale,
    volumeCenter[2] + offset.z * uniformScale,
  ];
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
        adj[1] = wp[1] + volumeYSize * 0.06;
      } else if (viewType === 'coronal') {
        adj[2] = wp[2] - volumeHeight * 0.02;
      } else if (viewType === 'axial') {
        adj[1] = wp[1] + volumeYSize * 0.15;
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
        // Glow path
        ctx.beginPath();
        ctx.strokeStyle = glowColor;
        ctx.lineWidth = 8;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.shadowColor = color;
        ctx.shadowBlur = 20;
        valid.forEach((p, i) => { if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y); });
        ctx.stroke();
        // Main path
        ctx.beginPath();
        ctx.strokeStyle = color;
        ctx.lineWidth = 4;
        ctx.shadowBlur = 0;
        valid.forEach((p, i) => { if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y); });
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

  state.drag = { active: false, kind: 'label', originalIndex: -1, startCanvasX: 0, startCanvasY: 0, baseDx: 0, baseDy: 0, viewportId: '' };
  state.hover = { kind: null, originalIndex: -1 };

  // Restore pointer-events on all canvases
  state.canvases.forEach(canvas => {
    canvas.style.pointerEvents = 'none';
    canvas.style.cursor = '';
  });

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
  if (state.vertebraCenters.length < 2 || !state.stlBounds) {
    console.warn('SpineLabelOverlay: no vertebra data available');
    return;
  }

  // Remove existing first
  removeOverlay();

  servicesManagerRef = servicesManager;

  const { volumeBounds } = getViewportsAndBounds(servicesManager);
  const vb = volumeBounds || {
    origin: [-250, -250, -500],
    dimensions: [512, 512, 200],
    spacing: [1, 1, 2.5],
  };

  // Transform STL centers to DICOM world coords
  state.worldPoints = state.vertebraCenters.map(vc =>
    transformSTLToDICOM(vc.center, state.stlBounds!, vb)
  );
  state.vertebraNames = state.vertebraCenters.map(vc => vc.name);
  state.enabled = true;

  // Draw after a short delay for viewports to be ready
  setTimeout(() => {
    redrawAll(servicesManager);
    setupListeners(servicesManager);
    console.log('SpineLabelOverlay: enabled with', state.worldPoints.length, 'points (interactive)');
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
