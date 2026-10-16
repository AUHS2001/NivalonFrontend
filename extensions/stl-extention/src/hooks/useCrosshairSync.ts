import { useEffect, useRef, useCallback } from 'react';
import * as THREE from 'three';
import {
  Enums,
  eventTarget,
  cache,
} from '@cornerstonejs/core';
import { Enums as ToolEnums } from '@cornerstonejs/tools';
import { CrosshairSyncConfig } from '../types/three.types';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { redrawContourOverlay } from '../utils/vertebraContourOverlayManager';

// --- Constants ---
const CROSSHAIR_CENTER_GAP = 20; // pixels — matches 2D referenceLinesCenterGapRadius
const CROSSHAIR_LINE_WIDTH = 1;  // pixels — matches 2D crosshair default lineWidth
const THROTTLE_MS = 16;
const CAMERA_LERP_FACTOR = 0.12;
const STL_CAMERA_FOV = 45; // must match SingleSpinalCord.tsx PerspectiveCamera FOV
const TAN_HALF_FOV = Math.tan(THREE.MathUtils.degToRad(STL_CAMERA_FOV / 2)); // ~0.4142
const MIN_CAMERA_DISTANCE = 50;
const MAX_CAMERA_DISTANCE = 2000;

type ViewOrientation = 'axial' | 'sagittal' | 'coronal';

// ─── Camera orientation presets ───
// Must match DICOM MPR camera conventions exactly so screen directions align:
//   Axial:    vpn=[0,0,-1], viewUp=[0,-1,0]  → camera below, -Y up
//   Sagittal: vpn=[1,0,0],  viewUp=[0,0,1]   → camera right, +Z up
//   Coronal:  vpn=[0,-1,0], viewUp=[0,0,1]   → camera anterior, +Z up
const ORIENTATION_OFFSETS: Record<ViewOrientation, { dir: THREE.Vector3; up: THREE.Vector3 }> = {
  axial: {
    dir: new THREE.Vector3(0, 0, 1),    // camera above patient — T7 (superior) appears in front
    up: new THREE.Vector3(0, 1, 0),
  },
  sagittal: {
    dir: new THREE.Vector3(1, 0, 0),
    up: new THREE.Vector3(0, 0, 1),
  },
  coronal: {
    dir: new THREE.Vector3(0, -1, 0),
    up: new THREE.Vector3(0, 0, 1),
  },
};

// ─── Medical imaging crosshair colors (matching 2D DICOM viewport colors from initToolGroups.ts) ───
// All 3 planes needed: as the camera orbits, one plane goes face-on (hidden) while
// the other 2 remain visible — exactly matching the corresponding 2D viewport.
const COLORS = {
  axial: 'rgb(200, 0, 0)',      // Red    — Z-normal plane
  sagittal: 'rgb(200, 200, 0)', // Yellow — X-normal plane
  coronal: 'rgb(0, 200, 0)',    // Green  — Y-normal plane
};

// ─── SVG crosshair overlay (same approach as 2D DICOM CrosshairsTool — SVG lines over canvas) ───

interface SVGCrosshairLines {
  axialPos: SVGLineElement;
  axialNeg: SVGLineElement;
  sagittalPos: SVGLineElement;
  sagittalNeg: SVGLineElement;
  coronalPos: SVGLineElement;
  coronalNeg: SVGLineElement;
  centerCircle: SVGCircleElement;
}

function createSVGOverlay(container: HTMLElement): SVGSVGElement {
  // Ensure the container is a positioning context for the absolute SVG
  if (getComputedStyle(container).position === 'static') {
    container.style.position = 'relative';
  }
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('class', 'crosshair-svg-overlay');
  svg.style.position = 'absolute';
  svg.style.top = '0';
  svg.style.left = '0';
  svg.style.width = '100%';
  svg.style.height = '100%';
  svg.style.pointerEvents = 'none';
  svg.style.zIndex = '200';
  svg.style.overflow = 'hidden';
  container.appendChild(svg);
  return svg;
}

function createSVGLine(svg: SVGSVGElement, color: string): SVGLineElement {
  const ns = 'http://www.w3.org/2000/svg';
  const line = document.createElementNS(ns, 'line');
  line.setAttribute('stroke', color);
  line.setAttribute('stroke-width', String(CROSSHAIR_LINE_WIDTH));
  line.setAttribute('stroke-opacity', '1');
  line.setAttribute('visibility', 'hidden');
  svg.appendChild(line);
  return line;
}

function createCenterCircle(svg: SVGSVGElement): SVGCircleElement {
  const ns = 'http://www.w3.org/2000/svg';
  const circle = document.createElementNS(ns, 'circle');
  circle.setAttribute('r', '8');
  circle.setAttribute('fill', 'rgba(255, 0, 0, 0.15)');
  circle.setAttribute('stroke', 'rgb(255, 0, 0)'); // red center pointer
  circle.setAttribute('stroke-width', '2');
  circle.setAttribute('visibility', 'hidden');
  svg.appendChild(circle);
  return circle;
}

function createCrosshairSVGLines(svg: SVGSVGElement): SVGCrosshairLines {
  return {
    axialPos: createSVGLine(svg, COLORS.axial),
    axialNeg: createSVGLine(svg, COLORS.axial),
    sagittalPos: createSVGLine(svg, COLORS.sagittal),
    sagittalNeg: createSVGLine(svg, COLORS.sagittal),
    coronalPos: createSVGLine(svg, COLORS.coronal),
    coronalNeg: createSVGLine(svg, COLORS.coronal),
    centerCircle: createCenterCircle(svg),
  };
}

function projectToScreen(
  point: THREE.Vector3,
  camera: THREE.PerspectiveCamera,
  width: number,
  height: number
): [number, number] | null {
  const v = point.clone().project(camera);
  if (v.z > 1) return null; // behind camera
  return [(v.x + 1) / 2 * width, (-v.y + 1) / 2 * height];
}

function extendToEdge(
  cx: number, cy: number,
  dx: number, dy: number,
  width: number, height: number
): [number, number] {
  // Find smallest positive t where the ray (cx+dx*t, cy+dy*t) hits a viewport edge
  let t = 10000;
  if (dx > 1e-6) t = Math.min(t, (width - cx) / dx);
  else if (dx < -1e-6) t = Math.min(t, -cx / dx);
  if (dy > 1e-6) {
    const ty = (height - cy) / dy;
    if (ty > 0) t = Math.min(t, ty);
  } else if (dy < -1e-6) {
    const ty = -cy / dy;
    if (ty > 0) t = Math.min(t, ty);
  }
  if (t < 0) t = 10000;
  return [cx + dx * t, cy + dy * t];
}

function updateSVGCrosshair(
  lines: SVGCrosshairLines,
  crosshairPos: THREE.Vector3,
  camera: THREE.PerspectiveCamera,
  width: number,
  height: number
) {
  const center = projectToScreen(crosshairPos, camera, width, height);
  if (!center) {
    lines.axialPos.setAttribute('visibility', 'hidden');
    lines.axialNeg.setAttribute('visibility', 'hidden');
    lines.sagittalPos.setAttribute('visibility', 'hidden');
    lines.sagittalNeg.setAttribute('visibility', 'hidden');
    lines.coronalPos.setAttribute('visibility', 'hidden');
    lines.coronalNeg.setAttribute('visibility', 'hidden');
    lines.centerCircle.setAttribute('visibility', 'hidden');
    return;
  }

  const [cx, cy] = center;

  // Center circle at the crosshair intersection point
  lines.centerCircle.setAttribute('cx', String(cx));
  lines.centerCircle.setAttribute('cy', String(cy));
  lines.centerCircle.setAttribute('visibility', 'visible');

  // Camera forward direction — analogous to viewPlaneNormal in the 2D CrosshairsTool.
  const cameraForward = camera.getWorldDirection(new THREE.Vector3());

  // Hide the plane most face-on to camera (show only 2 crosshair lines in 3D)
  const hideDots = [
    Math.abs(cameraForward.dot(new THREE.Vector3(0, 0, 1))),  // axial
    Math.abs(cameraForward.dot(new THREE.Vector3(1, 0, 0))),  // sagittal
    Math.abs(cameraForward.dot(new THREE.Vector3(0, 1, 0))),  // coronal
  ];
  const hidePlaneIdx = hideDots.indexOf(Math.max(...hideDots));

  // For each reference plane, compute the intersection direction using the SAME
  // cross-product algorithm as the 2D CrosshairsTool:
  //   direction = cross(viewPlaneNormal, otherPlaneNormal)
  //
  // This gives the line where the reference plane intersects the camera's viewing plane.
  // The plane whose normal is parallel to cameraForward will have cross=0 and be hidden,
  // leaving exactly 2 visible lines — matching the corresponding 2D viewport.
  //
  // Example: axial camera (forward≈Z):
  //   Axial plane:    cross(Z, Z) = 0        → hidden (face-on)
  //   Sagittal plane: cross(Z, X) = Y        → yellow vertical line  ✓
  //   Coronal plane:  cross(Z, Y) = -X       → green horizontal line ✓
  //   (matches exactly what the 2D axial viewport shows)

  const planesDef: Array<{
    planeNormal: THREE.Vector3;
    posLine: SVGLineElement;
    negLine: SVGLineElement;
  }> = [
    { planeNormal: new THREE.Vector3(0, 0, 1), posLine: lines.axialPos, negLine: lines.axialNeg },
    { planeNormal: new THREE.Vector3(1, 0, 0), posLine: lines.sagittalPos, negLine: lines.sagittalNeg },
    { planeNormal: new THREE.Vector3(0, 1, 0), posLine: lines.coronalPos, negLine: lines.coronalNeg },
  ];

  planesDef.forEach(({ planeNormal, posLine, negLine }, planeIdx) => {
    // Hide the plane most aligned with camera direction
    if (planeIdx === hidePlaneIdx) {
      posLine.setAttribute('visibility', 'hidden');
      negLine.setAttribute('visibility', 'hidden');
      return;
    }

    // cross(cameraForward, planeNormal) = world-space intersection direction
    const worldDir = new THREE.Vector3().crossVectors(cameraForward, planeNormal);
    const dirLen = worldDir.length();

    let dx: number, dy: number;

    if (dirLen < 0.001) {
      // Camera looking along this plane's normal — plane is face-on.
      // Fall back to a perpendicular screen direction so the line stays visible.
      const arbAxis = Math.abs(planeNormal.x) < 0.9
        ? new THREE.Vector3(1, 0, 0)
        : new THREE.Vector3(0, 1, 0);
      const fallback = new THREE.Vector3().crossVectors(cameraForward, arbAxis).normalize();
      const worldEnd = crosshairPos.clone().add(fallback);
      const screenEnd = projectToScreen(worldEnd, camera, width, height);
      if (!screenEnd) {
        posLine.setAttribute('visibility', 'hidden');
        negLine.setAttribute('visibility', 'hidden');
        return;
      }
      dx = screenEnd[0] - cx;
      dy = screenEnd[1] - cy;
      const len = Math.sqrt(dx * dx + dy * dy);
      if (len < 0.001) { posLine.setAttribute('visibility', 'hidden'); negLine.setAttribute('visibility', 'hidden'); return; }
      dx /= len; dy /= len;
      posLine.setAttribute('stroke-opacity', '0.4');
      negLine.setAttribute('stroke-opacity', '0.4');
    } else {
      worldDir.divideScalar(dirLen);

      // Project the intersection direction to screen space
      const worldEnd = crosshairPos.clone().add(worldDir);
      const screenEnd = projectToScreen(worldEnd, camera, width, height);
      if (!screenEnd) {
        posLine.setAttribute('visibility', 'hidden');
        negLine.setAttribute('visibility', 'hidden');
        return;
      }

      dx = screenEnd[0] - cx;
      dy = screenEnd[1] - cy;
      const len = Math.sqrt(dx * dx + dy * dy);
      if (len < 0.001) { posLine.setAttribute('visibility', 'hidden'); negLine.setAttribute('visibility', 'hidden'); return; }
      dx /= len; dy /= len;
      posLine.setAttribute('stroke-opacity', '1');
      negLine.setAttribute('stroke-opacity', '1');
    }

    // Positive arm: from center+gap to viewport edge
    const [edgePosX, edgePosY] = extendToEdge(cx, cy, dx, dy, width, height);
    posLine.setAttribute('x1', String(cx + dx * CROSSHAIR_CENTER_GAP));
    posLine.setAttribute('y1', String(cy + dy * CROSSHAIR_CENTER_GAP));
    posLine.setAttribute('x2', String(edgePosX));
    posLine.setAttribute('y2', String(edgePosY));
    posLine.setAttribute('visibility', 'visible');

    // Negative arm: from center-gap to opposite viewport edge
    const [edgeNegX, edgeNegY] = extendToEdge(cx, cy, -dx, -dy, width, height);
    negLine.setAttribute('x1', String(cx - dx * CROSSHAIR_CENTER_GAP));
    negLine.setAttribute('y1', String(cy - dy * CROSSHAIR_CENTER_GAP));
    negLine.setAttribute('x2', String(edgeNegX));
    negLine.setAttribute('y2', String(edgeNegY));
    negLine.setAttribute('visibility', 'visible');
  });
}

function detectOrientation(viewPlaneNormal: number[]): ViewOrientation {
  const abs = viewPlaneNormal.map(n => Math.abs(n));
  const maxIdx = abs.indexOf(Math.max(...abs));
  if (maxIdx === 0) return 'sagittal';
  if (maxIdx === 1) return 'coronal';
  return 'axial';
}

// ─── Hook ───

export const useCrosshairSync = ({
  leftSceneRef,
  cameraRef,
  meshRefs,
  leftRendererRef,
  leftControlsRef,
  servicesManager,
}: CrosshairSyncConfig) => {
  const svgOverlayRef = useRef<SVGSVGElement | null>(null);
  const svgLinesRef = useRef<SVGCrosshairLines | null>(null);
  const currentCrosshairPosRef = useRef(new THREE.Vector3());
  const crosshairVisibleRef = useRef(false);
  const isActiveRef = useRef(false);
  const listenersRef = useRef<Array<{ element: HTMLElement; event: string; handler: (e: any) => void }>>([]);
  const lastUpdateRef = useRef(0);

  // Active viewport tracking — which viewport the cursor is in / clicked on.
  const activeViewportElementRef = useRef<HTMLElement | null>(null);

  // Crosshair position — prefer toolCenter (exact), fallback to focalPoint
  const latestPositionRef = useRef<[number, number, number] | null>(null);
  // Orientation + zoom only written by events from the ACTIVE viewport
  const latestViewPlaneNormalRef = useRef<number[] | null>(null);
  const latestParallelScaleRef = useRef<number | null>(null);

  // Cached bounds
  const cachedSTLBoundsRef = useRef<{ min: THREE.Vector3; max: THREE.Vector3 } | null>(null);
  const cachedVolumeBoundsRef = useRef<{ origin: number[]; dimensions: number[]; spacing: number[]; direction?: number[] } | null>(null);
  const cachedVtkImageDataRef = useRef<any>(null);

  // Target marker position for lerp
  const targetMarkerPosRef = useRef(new THREE.Vector3());

  // Camera animation state — offset-based to prevent wobble
  const targetControlsTargetRef = useRef(new THREE.Vector3());
  const targetCamOffsetRef = useRef(new THREE.Vector3(0, -400, 0));
  const currentCamOffsetRef = useRef(new THREE.Vector3(0, -400, 0));
  const targetCamUpRef = useRef(new THREE.Vector3(0, 0, 1));
  const currentOrientationRef = useRef<ViewOrientation | null>(null);
  const animFrameRef = useRef<number | null>(null);

  // Drag state for 3D crosshair interaction
  const isDraggingRef = useRef(false);
  const dragPlaneRef = useRef<THREE.Plane | null>(null);

  // ─── Viewport enumeration ───

  const getCornerstoneViewportsAndBounds = useCallback(() => {
    const { cornerstoneViewportService, viewportGridService } = servicesManager?.services || {};
    if (!cornerstoneViewportService || !viewportGridService) {
      return { viewports: [], volumeBounds: null, vtkImageData: null };
    }

    const viewportState = viewportGridService.getState();
    const viewports = viewportState?.viewports;
    if (!viewports) return { viewports: [], volumeBounds: null, vtkImageData: null };

    const result: Array<{
      viewportId: string;
      viewport: any;
      element: HTMLElement;
      orientation: string;
    }> = [];

    let volumeBounds: { origin: number[]; dimensions: number[]; spacing: number[]; direction?: number[] } | null = null;
    let vtkImageData: any = null;

    const viewportEntries = viewports instanceof Map
      ? Array.from(viewports.entries())
      : Object.entries(viewports);

    viewportEntries.forEach(([viewportId, viewportInfo]: [string, any]) => {
      const viewportOptions = viewportInfo?.viewportOptions || {};
      if (viewportOptions.customLayout === 'stl' || viewportId === 'stlViewport') return;

      try {
        const viewport = cornerstoneViewportService.getCornerstoneViewport(viewportId);
        if (viewport && viewport.element) {
          const orientation = viewportOptions.orientation || 'axial';
          result.push({ viewportId, viewport, element: viewport.element, orientation });

          if (!volumeBounds) {
            try {
              const imageData = viewport.getImageData?.();
              if (imageData) {
                volumeBounds = {
                  origin: imageData.origin || [0, 0, 0],
                  dimensions: imageData.dimensions || [512, 512, 100],
                  spacing: imageData.spacing || [1, 1, 1],
                  direction: imageData.direction ? Array.from(imageData.direction) : undefined,
                };
              }
            } catch (_) {}

            // Get vtkImageData for accurate getBounds()
            try {
              const actors = viewport.getActors?.();
              if (actors?.length) {
                const vol = (cache as any).getVolume?.((actors[0] as any).referencedId || actors[0].uid);
                if (vol?.imageData) vtkImageData = vol.imageData;
              }
            } catch (_) {}
          }
        }
      } catch (_) {}
    });

    return { viewports: result, volumeBounds, vtkImageData };
  }, [servicesManager]);

  // ─── STL bounding box ───
  // MUST match useCenterLine.ts calculateSpinalCenterline exactly:
  //   1. Filter to vertebrae only (['C','T','L','S'] types), fallback to all meshes
  //   2. Transform min/max corners individually (NOT Box3.applyMatrix4 which uses 8 corners)

  const getSTLBounds = useCallback(() => {
    const allMeshes = meshRefs.current?.left || [];
    if (allMeshes.length === 0) return null;

    const vertebrae = allMeshes.filter(mesh => {
      const type = mesh.userData?.type;
      return type && ['C', 'T', 'L', 'S'].includes(type);
    });
    const meshes = vertebrae.length > 0 ? vertebrae : allMeshes;

    const bounds = {
      min: new THREE.Vector3(Infinity, Infinity, Infinity),
      max: new THREE.Vector3(-Infinity, -Infinity, -Infinity),
    };

    meshes.forEach(mesh => {
      if (mesh.geometry) {
        mesh.geometry.computeBoundingBox();
        const bb = mesh.geometry.boundingBox;
        if (bb) {
          const min = bb.min.clone().applyMatrix4(mesh.matrixWorld);
          const max = bb.max.clone().applyMatrix4(mesh.matrixWorld);
          bounds.min.min(min);
          bounds.max.max(max);
        }
      }
    });

    return bounds;
  }, [meshRefs]);

  // ─── DICOM LPS → STL ───
  // Uses vtkImageData.getBounds() for correct world-space volume center/extent
  // (same approach as voxelMaskingManager and vertebraContourOverlayManager).
  // NO Y negation — both STL and DICOM are LPS.

  const transformLoggedRef = useRef(false);

  const transformDICOMToSTL = useCallback((
    dicomPoint: [number, number, number],
    stlBounds: { min: THREE.Vector3; max: THREE.Vector3 },
    volumeBounds: { origin: number[]; dimensions: number[]; spacing: number[]; direction?: number[] },
    vtkImgData?: any
  ): THREE.Vector3 => {
    const stlSize = new THREE.Vector3().subVectors(stlBounds.max, stlBounds.min);
    const stlCenter = new THREE.Vector3().addVectors(stlBounds.min, stlBounds.max).multiplyScalar(0.5);

    let volumeCenter: number[];
    let uniformScale: number;

    if (vtkImgData && typeof vtkImgData.getBounds === 'function') {
      // Use vtkImageData.getBounds() for correct world-space extent
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
      const vd = volumeBounds.direction || [1, 0, 0, 0, 1, 0, 0, 0, 1];
      const halfI = ((volumeBounds.dimensions[0] - 1) / 2) * volumeBounds.spacing[0];
      const halfJ = ((volumeBounds.dimensions[1] - 1) / 2) * volumeBounds.spacing[1];
      const halfK = ((volumeBounds.dimensions[2] - 1) / 2) * volumeBounds.spacing[2];
      volumeCenter = [
        volumeBounds.origin[0] + vd[0] * halfI + vd[1] * halfJ + vd[2] * halfK,
        volumeBounds.origin[1] + vd[3] * halfI + vd[4] * halfJ + vd[5] * halfK,
        volumeBounds.origin[2] + vd[6] * halfI + vd[7] * halfJ + vd[8] * halfK,
      ];
      const volumeZSize = volumeBounds.dimensions[2] * volumeBounds.spacing[2];
      uniformScale = stlSize.z > 0.001 ? volumeZSize / stlSize.z : 1;
    }

    // Inverse transform: stlPt = stlCenter + (dicomPt - volumeCenter) / scale
    const stlX = stlCenter.x + (dicomPoint[0] - volumeCenter[0]) / uniformScale;
    const stlY = stlCenter.y + (dicomPoint[1] - volumeCenter[1]) / uniformScale;
    const stlZ = stlCenter.z + (dicomPoint[2] - volumeCenter[2]) / uniformScale;

    // One-time diagnostic log
    if (!transformLoggedRef.current) {
      transformLoggedRef.current = true;
      console.log('[CrosshairSync] TRANSFORM DIAGNOSTICS:', {
        usedBounds: !!(vtkImgData && typeof vtkImgData.getBounds === 'function'),
        stlCenter: { x: stlCenter.x, y: stlCenter.y, z: stlCenter.z },
        stlSize: { x: stlSize.x, y: stlSize.y, z: stlSize.z },
        volumeCenter,
        uniformScale,
        dicomPoint,
        result: { x: stlX, y: stlY, z: stlZ },
      });
    }

    return new THREE.Vector3(stlX, stlY, stlZ);
  }, []);

  // ─── STL → DICOM (inverse of transformDICOMToSTL) ───

  const transformSTLToDICOM = useCallback((
    stlPoint: THREE.Vector3,
    stlBounds: { min: THREE.Vector3; max: THREE.Vector3 },
    volumeBounds: { origin: number[]; dimensions: number[]; spacing: number[]; direction?: number[] },
    vtkImgData?: any
  ): [number, number, number] => {
    const stlSize = new THREE.Vector3().subVectors(stlBounds.max, stlBounds.min);
    const stlCenter = new THREE.Vector3().addVectors(stlBounds.min, stlBounds.max).multiplyScalar(0.5);

    let volumeCenter: number[];
    let uniformScale: number;

    if (vtkImgData && typeof vtkImgData.getBounds === 'function') {
      const bounds: number[] = vtkImgData.getBounds();
      volumeCenter = [
        (bounds[0] + bounds[1]) / 2,
        (bounds[2] + bounds[3]) / 2,
        (bounds[4] + bounds[5]) / 2,
      ];
      const volumeZExtent = Math.abs(bounds[5] - bounds[4]);
      uniformScale = stlSize.z > 0.001 ? volumeZExtent / stlSize.z : 1;
    } else {
      const vd = volumeBounds.direction || [1, 0, 0, 0, 1, 0, 0, 0, 1];
      const halfI = ((volumeBounds.dimensions[0] - 1) / 2) * volumeBounds.spacing[0];
      const halfJ = ((volumeBounds.dimensions[1] - 1) / 2) * volumeBounds.spacing[1];
      const halfK = ((volumeBounds.dimensions[2] - 1) / 2) * volumeBounds.spacing[2];
      volumeCenter = [
        volumeBounds.origin[0] + vd[0] * halfI + vd[1] * halfJ + vd[2] * halfK,
        volumeBounds.origin[1] + vd[3] * halfI + vd[4] * halfJ + vd[5] * halfK,
        volumeBounds.origin[2] + vd[6] * halfI + vd[7] * halfJ + vd[8] * halfK,
      ];
      const volumeZSize = volumeBounds.dimensions[2] * volumeBounds.spacing[2];
      uniformScale = stlSize.z > 0.001 ? volumeZSize / stlSize.z : 1;
    }

    // Inverse: dicomPt = volumeCenter + (stlPt - stlCenter) * scale
    return [
      volumeCenter[0] + (stlPoint.x - stlCenter.x) * uniformScale,
      volumeCenter[1] + (stlPoint.y - stlCenter.y) * uniformScale,
      volumeCenter[2] + (stlPoint.z - stlCenter.z) * uniformScale,
    ];
  }, []);

  // ─── Compute and cache bounds ───

  const ensureCachedBounds = useCallback(() => {
    if (!cachedSTLBoundsRef.current) {
      cachedSTLBoundsRef.current = getSTLBounds();
    }
    if (!cachedVolumeBoundsRef.current) {
      const { volumeBounds, vtkImageData } = getCornerstoneViewportsAndBounds();
      cachedVolumeBoundsRef.current = volumeBounds;
      cachedVtkImageDataRef.current = vtkImageData;
    }
    return {
      stlBounds: cachedSTLBoundsRef.current,
      volumeBounds: cachedVolumeBoundsRef.current,
      vtkImageData: cachedVtkImageDataRef.current,
    };
  }, [getSTLBounds, getCornerstoneViewportsAndBounds]);

  // ─── Self-terminating animation loop ───
  // Lerps marker + camera toward targets, then STOPS so OrbitControls can work freely.
  // OrbitControls is DISABLED during animation to prevent damping conflicts.

  // Helper: re-project SVG lines from current 3D position onto 2D canvas
  const refreshSVG = useCallback(() => {
    const cam = cameraRef.current as THREE.PerspectiveCamera | undefined;
    const renderer = leftRendererRef.current;
    if (!cam || !renderer || !svgLinesRef.current || !crosshairVisibleRef.current) return;
    // Use CSS pixel dimensions (not framebuffer which is scaled by devicePixelRatio)
    const canvas = renderer.domElement;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (width === 0 || height === 0) return;
    // Ensure camera matrices are up-to-date before projecting
    cam.updateMatrixWorld();
    updateSVGCrosshair(svgLinesRef.current, currentCrosshairPosRef.current, cam, width, height);
  }, [cameraRef, leftRendererRef]);

  const startAnimation = useCallback(() => {
    if (animFrameRef.current !== null) return;

    const animate = () => {
      let stillMoving = false;

      // ── Lerp crosshair 3D position (camera stays fixed, only crosshair moves) ──
      if (crosshairVisibleRef.current) {
        const md = currentCrosshairPosRef.current.distanceTo(targetMarkerPosRef.current);
        if (md > 0.05) {
          currentCrosshairPosRef.current.lerp(targetMarkerPosRef.current, 0.25);
          stillMoving = true;
        } else {
          currentCrosshairPosRef.current.copy(targetMarkerPosRef.current);
        }
      }

      // ── Update SVG projection every frame during animation ──
      refreshSVG();

      if (stillMoving) {
        animFrameRef.current = requestAnimationFrame(animate);
      } else {
        animFrameRef.current = null;
      }
    };

    animFrameRef.current = requestAnimationFrame(animate);
  }, [refreshSVG]);

  const stopAnimation = useCallback(() => {
    if (animFrameRef.current !== null) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    const controls = leftControlsRef?.current as OrbitControls | undefined;
    if (controls) controls.enabled = true;
  }, [leftControlsRef]);

  // ─── Throttled visual update ───

  const scheduleUpdate = useCallback(() => {
    const now = Date.now();
    if (now - lastUpdateRef.current < THROTTLE_MS) return;
    lastUpdateRef.current = now;

    if (!isActiveRef.current) return;
    if (!latestPositionRef.current) return;

    const { stlBounds, volumeBounds, vtkImageData } = ensureCachedBounds();
    if (!stlBounds || !volumeBounds) return;

    const stlPos = transformDICOMToSTL(latestPositionRef.current, stlBounds, volumeBounds, vtkImageData);

    // --- Create SVG overlay on first update ---
    if (!svgOverlayRef.current) {
      const container = leftRendererRef.current?.domElement?.parentElement;
      if (!container) return;
      svgOverlayRef.current = createSVGOverlay(container);
      svgLinesRef.current = createCrosshairSVGLines(svgOverlayRef.current);
      currentCrosshairPosRef.current.copy(stlPos);
    }
    targetMarkerPosRef.current.copy(stlPos);
    currentCrosshairPosRef.current.copy(stlPos);
    crosshairVisibleRef.current = true;

    // Directly update SVG projection (no animation needed since camera is fixed)
    refreshSVG();
  }, [leftRendererRef, ensureCachedBounds, transformDICOMToSTL, refreshSVG]);

  // ──��� Event: CAMERA_MODIFIED (fires on viewport elements) ───
  //
  // COMPOSITE POSITION: Each viewport's focalPoint is only authoritative for its
  // scroll axis (the dominant axis of viewPlaneNormal). The other axes reflect
  // the viewport's pan position, NOT the crosshair location.
  //
  //   Sagittal (vpn along X) → focalPoint.X = crosshair X
  //   Coronal  (vpn along Y) → focalPoint.Y = crosshair Y
  //   Axial    (vpn along Z) → focalPoint.Z = crosshair Z
  //
  // By compositing, we get [crosshair_X, crosshair_Y, crosshair_Z] accurately,
  // and the result is immune to viewport panning.

  const handleCameraModifiedRef = useRef<(evt: any, sourceElement: HTMLElement) => void>();
  const focalPointLogCountRef = useRef(0);

  handleCameraModifiedRef.current = (evt: any, sourceElement: HTMLElement) => {
    if (!isActiveRef.current) return;

    const camera = evt?.detail?.camera;
    if (!camera?.focalPoint) return;

    const fp = camera.focalPoint;
    const vpn = camera.viewPlaneNormal;

    // Initialize from first focalPoint received
    if (!latestPositionRef.current) {
      latestPositionRef.current = [fp[0], fp[1], fp[2]];
    }

    // Update ONLY the scroll axis — the one this viewport is authoritative for
    if (vpn) {
      const absVpn = [Math.abs(vpn[0]), Math.abs(vpn[1]), Math.abs(vpn[2])];
      const maxIdx = absVpn.indexOf(Math.max(...absVpn));
      latestPositionRef.current[maxIdx] = fp[maxIdx];

      // Log first 5 updates per viewport axis to see actual values
      if (focalPointLogCountRef.current < 15) {
        focalPointLogCountRef.current++;
        const axisName = maxIdx === 0 ? 'X(sagittal)' : maxIdx === 1 ? 'Y(coronal)' : 'Z(axial)';
        console.log(`[CrosshairSync] ${axisName}: fp[${maxIdx}]=${fp[maxIdx].toFixed(2)}, vpn=[${vpn.map((v: number) => v.toFixed(2))}], composite=[${latestPositionRef.current.map((v: number) => v.toFixed(2))}]`);
      }
    }

    // Orientation + zoom only from the active viewport
    if (sourceElement === activeViewportElementRef.current) {
      if (vpn) {
        latestViewPlaneNormalRef.current = [vpn[0], vpn[1], vpn[2]];
      }
      if (camera.parallelScale != null) {
        latestParallelScaleRef.current = camera.parallelScale;
      }
    }

    scheduleUpdate();
  };

  // ─── Attach listeners ───

  const attachListeners = useCallback(() => {
    // Clean existing viewport listeners
    listenersRef.current.forEach(({ element, event, handler }) => {
      try { element.removeEventListener(event, handler); } catch (_) {}
    });
    listenersRef.current = [];

    const { viewports } = getCornerstoneViewportsAndBounds();

    viewports.forEach(({ element }) => {
      // Active viewport tracking
      const markActive = () => { activeViewportElementRef.current = element; };
      element.addEventListener('mouseenter', markActive);
      listenersRef.current.push({ element, event: 'mouseenter', handler: markActive });
      element.addEventListener('mousedown', markActive);
      listenersRef.current.push({ element, event: 'mousedown', handler: markActive });

      // CAMERA_MODIFIED — position + orientation + zoom
      const onCameraModified = (evt: any) => {
        handleCameraModifiedRef.current?.(evt, element);
      };
      const eventName = Enums.Events.CAMERA_MODIFIED;
      element.addEventListener(eventName, onCameraModified);
      listenersRef.current.push({ element, event: eventName, handler: onCameraModified });
    });

    // ─── 3D canvas drag listeners (move crosshair by dragging in 3D view) ───
    const canvas = leftRendererRef.current?.domElement;
    if (canvas) {
      canvas.style.cursor = 'crosshair';

      const onPointerDown = (e: PointerEvent) => {
        if (!isActiveRef.current) return;
        const cam = cameraRef.current as THREE.PerspectiveCamera | undefined;
        if (!cam || !crosshairVisibleRef.current) return;

        isDraggingRef.current = true;
        const cameraDir = cam.getWorldDirection(new THREE.Vector3());
        dragPlaneRef.current = new THREE.Plane();
        dragPlaneRef.current.setFromNormalAndCoplanarPoint(cameraDir, currentCrosshairPosRef.current.clone());
        canvas.setPointerCapture(e.pointerId);
        e.preventDefault();
      };

      const onPointerMove = (e: PointerEvent) => {
        if (!isDraggingRef.current || !isActiveRef.current) return;
        const cam = cameraRef.current as THREE.PerspectiveCamera | undefined;
        if (!cam || !dragPlaneRef.current) return;

        const rect = canvas.getBoundingClientRect();
        const mouse = new THREE.Vector2(
          ((e.clientX - rect.left) / rect.width) * 2 - 1,
          -((e.clientY - rect.top) / rect.height) * 2 + 1
        );

        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(mouse, cam);

        const intersection = new THREE.Vector3();
        if (!raycaster.ray.intersectPlane(dragPlaneRef.current, intersection)) return;

        // Update 3D crosshair immediately
        currentCrosshairPosRef.current.copy(intersection);
        targetMarkerPosRef.current.copy(intersection);
        refreshSVG();

        // Transform STL → DICOM and update cornerstone viewports
        const { stlBounds, volumeBounds, vtkImageData } = ensureCachedBounds();
        if (!stlBounds || !volumeBounds) return;

        const dicomPoint = transformSTLToDICOM(intersection, stlBounds, volumeBounds, vtkImageData);

        // Update Crosshairs tool center so the tool stays in sync
        try {
          const { toolGroupService } = servicesManager?.services || {};
          if (toolGroupService) {
            const toolGroup = toolGroupService.getToolGroup('mpr');
            const crosshairsTool = (toolGroup as any)?.getToolInstance?.('Crosshairs');
            if (crosshairsTool) {
              crosshairsTool.toolCenter = dicomPoint;
            }
          }
        } catch (_) {}

        // Update all viewport cameras with full DICOM point (matches Crosshairs tool behavior)
        const { viewports: csViewports } = getCornerstoneViewportsAndBounds();
        csViewports.forEach(({ viewport }) => {
          try {
            const cam = viewport.getCamera();
            if (!cam?.focalPoint || !cam?.viewPlaneNormal || !cam?.position) return;
            const vpn = cam.viewPlaneNormal as number[];
            const absVpn = vpn.map(Math.abs);
            const scrollAxis = absVpn.indexOf(Math.max(...absVpn));
            const dp = dicomPoint as [number, number, number];
            const delta = dp[scrollAxis] - cam.focalPoint[scrollAxis];
            const newFP  = [...cam.focalPoint] as [number, number, number];
            const newPos = [...cam.position]   as [number, number, number];
            newFP[scrollAxis]  = dp[scrollAxis];
            newPos[scrollAxis] = cam.position[scrollAxis] + delta;
            viewport.setCamera({ focalPoint: newFP, position: newPos });
            viewport.render();
          } catch (_) {}
        });
        redrawContourOverlay();
      };

      const onPointerUp = () => {
        isDraggingRef.current = false;
        dragPlaneRef.current = null;
      };

      canvas.addEventListener('pointerdown', onPointerDown);
      canvas.addEventListener('pointermove', onPointerMove);
      canvas.addEventListener('pointerup', onPointerUp);

      listenersRef.current.push({ element: canvas, event: 'pointerdown', handler: onPointerDown as any });
      listenersRef.current.push({ element: canvas, event: 'pointermove', handler: onPointerMove as any });
      listenersRef.current.push({ element: canvas, event: 'pointerup', handler: onPointerUp as any });
    }
  }, [getCornerstoneViewportsAndBounds, cameraRef, leftRendererRef, ensureCachedBounds, transformSTLToDICOM, refreshSVG]);

  // ─── Read current viewport state immediately (for initial sync on activation) ───

  const initialSync = useCallback(() => {
    const { viewports } = getCornerstoneViewportsAndBounds();
    if (viewports.length === 0) return;

    // Composite the crosshair position from all viewports' focalPoints
    // (same logic as handleCameraModified, but reading current state instead of events)
    let initialized = false;
    viewports.forEach(({ viewport, element }) => {
      try {
        const camera = viewport.getCamera?.();
        if (!camera?.focalPoint) return;
        const fp = camera.focalPoint;
        const vpn = camera.viewPlaneNormal;

        if (!initialized) {
          latestPositionRef.current = [fp[0], fp[1], fp[2]];
          initialized = true;
        }

        // Each viewport is authoritative for its scroll axis
        if (vpn && latestPositionRef.current) {
          const absVpn = [Math.abs(vpn[0]), Math.abs(vpn[1]), Math.abs(vpn[2])];
          const maxIdx = absVpn.indexOf(Math.max(...absVpn));
          latestPositionRef.current[maxIdx] = fp[maxIdx];
        }
      } catch (_) {}
    });

    // Use the first viewport's orientation + zoom as initial camera state
    const firstVp = viewports[0];
    try {
      const camera = firstVp.viewport.getCamera?.();
      if (camera?.viewPlaneNormal) {
        latestViewPlaneNormalRef.current = [...camera.viewPlaneNormal];
      }
      if (camera?.parallelScale != null) {
        latestParallelScaleRef.current = camera.parallelScale;
      }
      activeViewportElementRef.current = firstVp.element;
    } catch (_) {}

    // Force immediate update (bypass throttle)
    lastUpdateRef.current = 0;
    scheduleUpdate();
  }, [getCornerstoneViewportsAndBounds, scheduleUpdate]);

  // ─── Cleanup ───

  const cleanup = useCallback(() => {
    listenersRef.current.forEach(({ element, event, handler }) => {
      try { element.removeEventListener(event, handler); } catch (_) {}
    });
    listenersRef.current = [];

    stopAnimation();

    // Re-enable OrbitControls on cleanup
    const controls = leftControlsRef?.current as OrbitControls | undefined;
    if (controls) controls.enabled = true;

    // Reset 3D canvas cursor and drag state
    const canvas = leftRendererRef.current?.domElement;
    if (canvas) canvas.style.cursor = '';
    isDraggingRef.current = false;
    dragPlaneRef.current = null;

    // Remove SVG overlay
    if (svgOverlayRef.current) {
      svgOverlayRef.current.parentElement?.removeChild(svgOverlayRef.current);
      svgOverlayRef.current = null;
      svgLinesRef.current = null;
    }
    crosshairVisibleRef.current = false;

    activeViewportElementRef.current = null;
    latestPositionRef.current = null;
    latestViewPlaneNormalRef.current = null;
    latestParallelScaleRef.current = null;
    cachedSTLBoundsRef.current = null;
    cachedVolumeBoundsRef.current = null;
    cachedVtkImageDataRef.current = null;
    currentOrientationRef.current = null;
  }, [stopAnimation, leftControlsRef]);

  // ─── Tool activation listener ───

  useEffect(() => {
    const handleToolActivated = (evt: any) => {
      const { toolName, toolGroupId } = evt?.detail || {};

      if (toolName === 'Crosshairs' && toolGroupId === 'mpr') {
        isActiveRef.current = true;
        cachedSTLBoundsRef.current = null;
        cachedVolumeBoundsRef.current = null;
        cachedVtkImageDataRef.current = null;
        // Disable OrbitControls so dragging doesn't move bones
        const controls = leftControlsRef?.current as OrbitControls | undefined;
        if (controls) controls.enabled = false;
        attachListeners();
        initialSync();
      } else if (isActiveRef.current) {
        isActiveRef.current = false;
        // Re-enable OrbitControls
        const controls = leftControlsRef?.current as OrbitControls | undefined;
        if (controls) controls.enabled = true;
        cleanup();
      }
    };

    // Handle toolbar toggle-off (no TOOL_ACTIVATED fires when deactivating
    // without activating a fallback tool)
    const handleToolToggledOff = (evt: any) => {
      const { toolName } = evt?.detail || {};
      if (toolName === 'Crosshairs' && isActiveRef.current) {
        isActiveRef.current = false;
        // Re-enable OrbitControls
        const controls = leftControlsRef?.current as OrbitControls | undefined;
        if (controls) controls.enabled = true;
        cleanup();
      }
    };

    const toolActivatedEvent = ToolEnums.Events.TOOL_ACTIVATED;
    eventTarget.addEventListener(toolActivatedEvent, handleToolActivated);
    eventTarget.addEventListener('nivalon:toolToggledOff', handleToolToggledOff);

    return () => {
      eventTarget.removeEventListener(toolActivatedEvent, handleToolActivated);
      eventTarget.removeEventListener('nivalon:toolToggledOff', handleToolToggledOff);
      cleanup();
    };
  }, [attachListeners, cleanup, initialSync]);

  // ─── Re-attach listeners after layout changes (e.g. double-click fullscreen toggle) ───
  // When layout changes, viewport DOM elements are destroyed and recreated.
  // The old listeners point to dead elements, so we must re-attach to the new ones.
  // We listen on ELEMENT_ENABLED (fires on the global eventTarget when any viewport
  // element is enabled). We check actual Crosshairs tool state because isActiveRef
  // may have been set to false during the layout transition.

  useEffect(() => {
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    const isCrosshairsToolActive = (): boolean => {
      try {
        const { toolGroupService } = servicesManager?.services || {};
        if (!toolGroupService) return false;
        const tg = toolGroupService.getToolGroup('mpr');
        return tg?.getActivePrimaryMouseButtonTool?.() === 'Crosshairs';
      } catch {
        return false;
      }
    };

    const handleElementEnabled = () => {
      // Debounce: multiple ELEMENT_ENABLED events fire in quick succession
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        if (isCrosshairsToolActive()) {
          isActiveRef.current = true;
          cachedVolumeBoundsRef.current = null;
          cachedSTLBoundsRef.current = null;
          attachListeners();
          initialSync();
        }
      }, 300);
    };

    eventTarget.addEventListener(Enums.Events.ELEMENT_ENABLED, handleElementEnabled);

    return () => {
      eventTarget.removeEventListener(Enums.Events.ELEMENT_ENABLED, handleElementEnabled);
      if (debounceTimer) clearTimeout(debounceTimer);
    };
  }, [servicesManager, attachListeners, initialSync]);

  // ─── Update SVG when user orbits the 3D view (OrbitControls 'change') ───
  useEffect(() => {
    const controls = leftControlsRef?.current as OrbitControls | undefined;
    if (!controls) return;
    const onControlsChange = () => { refreshSVG(); };
    controls.addEventListener('change', onControlsChange);
    return () => { controls.removeEventListener('change', onControlsChange); };
  }, [leftControlsRef, refreshSVG]);
};
