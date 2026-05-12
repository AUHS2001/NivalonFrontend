import { useEffect, useRef, useCallback } from 'react';
import * as THREE from 'three';
import {
  Enums,
  eventTarget,
} from '@cornerstonejs/core';
import { Enums as ToolEnums } from '@cornerstonejs/tools';
import { CrosshairSyncConfig } from '../types/three.types';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';

// --- Constants ---
const CROSSHAIR_LINE_LENGTH = 22;
const CROSSHAIR_LINE_RADIUS = 0.6;
const CROSSHAIR_OUTLINE_RADIUS = 1.1;
const CROSSHAIR_SPHERE_RADIUS = 2.0;
const CROSSHAIR_PLANE_SIZE = 14;
const CROSSHAIR_PLANE_OPACITY = 0.12;
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

// ─── Medical imaging crosshair colors ───
// RGB = XYZ convention: Red=sagittal(X), Green=coronal(Y), Blue=axial(Z)
const COLORS = {
  sagittal: 0xff4444, // Red — X axis
  coronal: 0x44ff44,  // Green — Y axis
  axial: 0x4488ff,    // Blue — Z axis
  sagittalDark: 0x661111,
  coronalDark: 0x116611,
  axialDark: 0x113366,
  center: 0xffffff,
  centerRing: 0xffcc00,
};

// ─── Marker creation ───

function createAxisCylinder(
  axis: 'x' | 'y' | 'z',
  length: number,
  radius: number,
  color: number,
  order = 999
): THREE.Mesh {
  const geo = new THREE.CylinderGeometry(radius, radius, length, 8);
  const mat = new THREE.MeshBasicMaterial({ color, depthTest: false, depthWrite: false });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = order;
  if (axis === 'x') mesh.rotation.z = Math.PI / 2;
  if (axis === 'z') mesh.rotation.x = Math.PI / 2;
  return mesh;
}

function createSlicePlane(
  orientation: 'axial' | 'sagittal' | 'coronal',
  size: number,
  color: number,
  opacity: number
): THREE.Mesh {
  const geo = new THREE.PlaneGeometry(size, size);
  const mat = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    depthTest: false,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = 997;

  // Orient the plane perpendicular to its axis
  if (orientation === 'sagittal') mesh.rotation.y = Math.PI / 2; // YZ plane
  if (orientation === 'coronal') mesh.rotation.x = Math.PI / 2;  // XZ plane
  // axial = XY plane (default PlaneGeometry orientation)

  return mesh;
}

function createCrosshairMarker(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'crosshairSyncMarker';
  group.renderOrder = 999;

  // --- Dark outlines behind each axis line ---
  group.add(createAxisCylinder('x', CROSSHAIR_LINE_LENGTH, CROSSHAIR_OUTLINE_RADIUS, COLORS.sagittalDark, 998));
  group.add(createAxisCylinder('y', CROSSHAIR_LINE_LENGTH, CROSSHAIR_OUTLINE_RADIUS, COLORS.coronalDark, 998));
  group.add(createAxisCylinder('z', CROSSHAIR_LINE_LENGTH, CROSSHAIR_OUTLINE_RADIUS, COLORS.axialDark, 998));

  // --- Colored axis lines ---
  group.add(createAxisCylinder('x', CROSSHAIR_LINE_LENGTH, CROSSHAIR_LINE_RADIUS, COLORS.sagittal));
  group.add(createAxisCylinder('y', CROSSHAIR_LINE_LENGTH, CROSSHAIR_LINE_RADIUS, COLORS.coronal));
  group.add(createAxisCylinder('z', CROSSHAIR_LINE_LENGTH, CROSSHAIR_LINE_RADIUS, COLORS.axial));

  // --- Semi-transparent slice planes ---
  group.add(createSlicePlane('axial', CROSSHAIR_PLANE_SIZE, COLORS.axial, CROSSHAIR_PLANE_OPACITY));
  group.add(createSlicePlane('sagittal', CROSSHAIR_PLANE_SIZE, COLORS.sagittal, CROSSHAIR_PLANE_OPACITY));
  group.add(createSlicePlane('coronal', CROSSHAIR_PLANE_SIZE, COLORS.coronal, CROSSHAIR_PLANE_OPACITY));

  // --- Center ring (outer glow) ---
  const ringGeo = new THREE.TorusGeometry(CROSSHAIR_SPHERE_RADIUS * 1.3, 0.4, 8, 24);
  const ringMat = new THREE.MeshBasicMaterial({
    color: COLORS.centerRing,
    depthTest: false,
    depthWrite: false,
    transparent: true,
    opacity: 0.6,
  });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.renderOrder = 999;
  group.add(ring);

  // --- Center sphere ---
  const sphereGeo = new THREE.SphereGeometry(CROSSHAIR_SPHERE_RADIUS, 16, 16);
  const sphereMat = new THREE.MeshBasicMaterial({
    color: COLORS.center,
    depthTest: false,
    depthWrite: false,
  });
  const sphere = new THREE.Mesh(sphereGeo, sphereMat);
  sphere.renderOrder = 999;
  group.add(sphere);

  return group;
}

function disposeCrosshairMarker(group: THREE.Group) {
  group.traverse((obj) => {
    const m = obj as THREE.Mesh;
    if (m.geometry) m.geometry.dispose();
    if (m.material) {
      if (Array.isArray(m.material)) m.material.forEach(mt => mt.dispose());
      else (m.material as THREE.Material).dispose();
    }
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
  const markerRef = useRef<THREE.Group | null>(null);
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

  // Target marker position for lerp
  const targetMarkerPosRef = useRef(new THREE.Vector3());

  // Camera animation state — offset-based to prevent wobble
  const targetControlsTargetRef = useRef(new THREE.Vector3());
  const targetCamOffsetRef = useRef(new THREE.Vector3(0, -400, 0));
  const currentCamOffsetRef = useRef(new THREE.Vector3(0, -400, 0));
  const targetCamUpRef = useRef(new THREE.Vector3(0, 0, 1));
  const currentOrientationRef = useRef<ViewOrientation | null>(null);
  const animFrameRef = useRef<number | null>(null);

  // ─── Viewport enumeration ───

  const getCornerstoneViewportsAndBounds = useCallback(() => {
    const { cornerstoneViewportService, viewportGridService } = servicesManager?.services || {};
    if (!cornerstoneViewportService || !viewportGridService) {
      return { viewports: [], volumeBounds: null };
    }

    const viewportState = viewportGridService.getState();
    const viewports = viewportState?.viewports;
    if (!viewports) return { viewports: [], volumeBounds: null };

    const result: Array<{
      viewportId: string;
      viewport: any;
      element: HTMLElement;
      orientation: string;
    }> = [];

    let volumeBounds: { origin: number[]; dimensions: number[]; spacing: number[]; direction?: number[] } | null = null;

    const viewportEntries = viewports instanceof Map
      ? Array.from(viewports.entries())
      : Object.entries(viewports);

    viewportEntries.forEach(([viewportId, viewportInfo]: [string, any]) => {
      const viewportOptions = viewportInfo?.viewportOptions || {};
      if (viewportOptions.customLayout === 'karachi' || viewportId === 'karachiViewport') return;

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
          }
        }
      } catch (_) {}
    });

    return { viewports: result, volumeBounds };
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

  // ─── DICOM LPS → STL (exact inverse of transformSTLToDICOMWorld in useCenterLine.ts) ───
  // Forward transform: dicomPt = volumeCenter + (stlPt - stlCenter) * scale  (Y negated)
  // Inverse:           stlPt  = stlCenter + (dicomPt - volumeCenter) / scale  (Y negated)

  const transformLoggedRef = useRef(false);

  const transformDICOMToSTL = useCallback((
    dicomPoint: [number, number, number],
    stlBounds: { min: THREE.Vector3; max: THREE.Vector3 },
    volumeBounds: { origin: number[]; dimensions: number[]; spacing: number[]; direction?: number[] }
  ): THREE.Vector3 => {
    const stlSize = new THREE.Vector3().subVectors(stlBounds.max, stlBounds.min);
    const stlCenter = new THREE.Vector3().addVectors(stlBounds.min, stlBounds.max).multiplyScalar(0.5);

    // Volume center in world space — must use direction matrix for correct mapping.
    // Without direction, volumes with flipped Z (dir[8]=-1) compute a center that's
    // off by the entire volume height, causing all positions to map near the sacrum.
    const vd = volumeBounds.direction || [1, 0, 0, 0, 1, 0, 0, 0, 1];
    const halfI = ((volumeBounds.dimensions[0] - 1) / 2) * volumeBounds.spacing[0];
    const halfJ = ((volumeBounds.dimensions[1] - 1) / 2) * volumeBounds.spacing[1];
    const halfK = ((volumeBounds.dimensions[2] - 1) / 2) * volumeBounds.spacing[2];

    const volumeCenter = [
      volumeBounds.origin[0] + vd[0] * halfI + vd[1] * halfJ + vd[2] * halfK,
      volumeBounds.origin[1] + vd[3] * halfI + vd[4] * halfJ + vd[5] * halfK,
      volumeBounds.origin[2] + vd[6] * halfI + vd[7] * halfJ + vd[8] * halfK,
    ];

    const volumeSize = [
      volumeBounds.dimensions[0] * volumeBounds.spacing[0],
      volumeBounds.dimensions[1] * volumeBounds.spacing[1],
      volumeBounds.dimensions[2] * volumeBounds.spacing[2],
    ];

    // Uniform scale based on Z axis (volumeHeight / stlHeight)
    const uniformScale = volumeSize[2] / stlSize.z;

    // Map center-to-center with uniform scale. NO Y negation — both systems are LPS,
    // and the STL camera orientations now match DICOM conventions exactly.
    const stlX = stlCenter.x + (dicomPoint[0] - volumeCenter[0]) / uniformScale;
    const stlY = stlCenter.y + (dicomPoint[1] - volumeCenter[1]) / uniformScale;
    const stlZ = stlCenter.z + (dicomPoint[2] - volumeCenter[2]) / uniformScale;

    // One-time diagnostic log
    if (!transformLoggedRef.current) {
      transformLoggedRef.current = true;
      // Per-axis scale factors — if these differ significantly, uniform scale is inaccurate
      const perAxisScale = {
        x: volumeSize[0] / stlSize.x,
        y: volumeSize[1] / stlSize.y,
        z: volumeSize[2] / stlSize.z,
      };
      console.log('[CrosshairSync] TRANSFORM DIAGNOSTICS:', {
        stlBounds: {
          min: { x: stlBounds.min.x, y: stlBounds.min.y, z: stlBounds.min.z },
          max: { x: stlBounds.max.x, y: stlBounds.max.y, z: stlBounds.max.z },
        },
        stlCenter: { x: stlCenter.x, y: stlCenter.y, z: stlCenter.z },
        stlSize: { x: stlSize.x, y: stlSize.y, z: stlSize.z },
        volumeOrigin: volumeBounds.origin,
        volumeDimensions: volumeBounds.dimensions,
        volumeSpacing: volumeBounds.spacing,
        volumeSize,
        volumeCenter,
        uniformScale,
        perAxisScale,
        dicomPoint,
        result: { x: stlX, y: stlY, z: stlZ },
      });
    }

    return new THREE.Vector3(stlX, stlY, stlZ);
  }, []);

  // ─── Compute and cache bounds ───

  const ensureCachedBounds = useCallback(() => {
    if (!cachedSTLBoundsRef.current) {
      cachedSTLBoundsRef.current = getSTLBounds();
    }
    if (!cachedVolumeBoundsRef.current) {
      const { volumeBounds } = getCornerstoneViewportsAndBounds();
      cachedVolumeBoundsRef.current = volumeBounds;
    }
    return {
      stlBounds: cachedSTLBoundsRef.current,
      volumeBounds: cachedVolumeBoundsRef.current,
    };
  }, [getSTLBounds, getCornerstoneViewportsAndBounds]);

  // ─── Self-terminating animation loop ───
  // Lerps marker + camera toward targets, then STOPS so OrbitControls can work freely.
  // OrbitControls is DISABLED during animation to prevent damping conflicts.

  const startAnimation = useCallback(() => {
    if (animFrameRef.current !== null) return;

    const controls = leftControlsRef?.current as OrbitControls | undefined;
    if (controls) controls.enabled = false;

    const animate = () => {
      const cam = cameraRef.current;
      const ctrl = leftControlsRef?.current as OrbitControls | undefined;
      let stillMoving = false;

      // ── Lerp marker ──
      if (markerRef.current && markerRef.current.visible) {
        const md = markerRef.current.position.distanceTo(targetMarkerPosRef.current);
        if (md > 0.05) {
          markerRef.current.position.lerp(targetMarkerPosRef.current, 0.25);
          stillMoving = true;
        } else {
          markerRef.current.position.copy(targetMarkerPosRef.current);
        }
      }

      // ── Lerp camera (offset-based) ──
      if (cam && ctrl) {
        const td = ctrl.target.distanceTo(targetControlsTargetRef.current);
        const od = currentCamOffsetRef.current.distanceTo(targetCamOffsetRef.current);
        const ud = cam.up.distanceTo(targetCamUpRef.current);

        if (td > 0.05 || od > 0.05 || ud > 0.001) {
          ctrl.target.lerp(targetControlsTargetRef.current, CAMERA_LERP_FACTOR);
          currentCamOffsetRef.current.lerp(targetCamOffsetRef.current, CAMERA_LERP_FACTOR);
          cam.position.copy(ctrl.target).add(currentCamOffsetRef.current);
          cam.up.lerp(targetCamUpRef.current, CAMERA_LERP_FACTOR);
          cam.up.normalize();
          cam.lookAt(ctrl.target);
          stillMoving = true;
        }
      }

      if (stillMoving) {
        animFrameRef.current = requestAnimationFrame(animate);
      } else {
        animFrameRef.current = null;
        if (ctrl) ctrl.enabled = true;
      }
    };

    animFrameRef.current = requestAnimationFrame(animate);
  }, [cameraRef, leftControlsRef]);

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

    if (!isActiveRef.current || !leftSceneRef.current) return;
    if (!latestPositionRef.current) return;

    const { stlBounds, volumeBounds } = ensureCachedBounds();
    if (!stlBounds || !volumeBounds) return;

    const stlPos = transformDICOMToSTL(latestPositionRef.current, stlBounds, volumeBounds);

    // --- Marker target ---
    if (!markerRef.current) {
      markerRef.current = createCrosshairMarker();
      leftSceneRef.current.add(markerRef.current);
      markerRef.current.position.copy(stlPos);
    }
    targetMarkerPosRef.current.copy(stlPos);
    markerRef.current.visible = true;

    // --- Camera orientation + zoom ---
    const vpn = latestViewPlaneNormalRef.current;
    if (vpn) {
      const orientation = detectOrientation(vpn);
      const preset = ORIENTATION_OFFSETS[orientation];

      let distance = 400;
      const ps = latestParallelScaleRef.current;
      if (ps != null) {
        const zoomScale = orientation === 'axial' ? 1.8 : 1.0;
        distance = THREE.MathUtils.clamp(
          (ps / TAN_HALF_FOV) * zoomScale,
          MIN_CAMERA_DISTANCE,
          MAX_CAMERA_DISTANCE,
        );
      }

      targetCamOffsetRef.current.copy(preset.dir).multiplyScalar(distance);
      targetCamUpRef.current.copy(preset.up);
      targetControlsTargetRef.current.copy(stlPos);
      currentOrientationRef.current = orientation;
    }

    startAnimation();
  }, [leftSceneRef, ensureCachedBounds, transformDICOMToSTL, startAnimation]);

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
  }, [getCornerstoneViewportsAndBounds]);

  // ─── Cleanup ───

  const cleanup = useCallback(() => {
    listenersRef.current.forEach(({ element, event, handler }) => {
      try { element.removeEventListener(event, handler); } catch (_) {}
    });
    listenersRef.current = [];

    stopAnimation();

    if (markerRef.current && leftSceneRef.current) {
      leftSceneRef.current.remove(markerRef.current);
      disposeCrosshairMarker(markerRef.current);
      markerRef.current = null;
    }

    activeViewportElementRef.current = null;
    latestPositionRef.current = null;
    latestViewPlaneNormalRef.current = null;
    latestParallelScaleRef.current = null;
    cachedSTLBoundsRef.current = null;
    cachedVolumeBoundsRef.current = null;
    currentOrientationRef.current = null;
  }, [leftSceneRef, stopAnimation]);

  // ─── Tool activation listener ───

  useEffect(() => {
    const handleToolActivated = (evt: any) => {
      const { toolName, toolGroupId } = evt?.detail || {};

      if (toolName === 'Crosshairs' && toolGroupId === 'mpr') {
        isActiveRef.current = true;
        cachedSTLBoundsRef.current = null;
        cachedVolumeBoundsRef.current = null;
        attachListeners();
      } else if (isActiveRef.current) {
        isActiveRef.current = false;
        cleanup();
      }
    };

    // Handle toolbar toggle-off (no TOOL_ACTIVATED fires when deactivating
    // without activating a fallback tool)
    const handleToolToggledOff = (evt: any) => {
      const { toolName } = evt?.detail || {};
      if (toolName === 'Crosshairs' && isActiveRef.current) {
        isActiveRef.current = false;
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
  }, [attachListeners, cleanup]);

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
        }
      }, 300);
    };

    eventTarget.addEventListener(Enums.Events.ELEMENT_ENABLED, handleElementEnabled);

    return () => {
      eventTarget.removeEventListener(Enums.Events.ELEMENT_ENABLED, handleElementEnabled);
      if (debounceTimer) clearTimeout(debounceTimer);
    };
  }, [servicesManager, attachListeners]);
};
