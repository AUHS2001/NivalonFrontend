import { useEffect, useRef, useCallback, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { MeshRefs } from '../types/three.types';
import { buildMergedTopology, MergedTopology } from '../utils/wrapMeshEditor';
import {
  storeWrapMeshData,
  showWrapContourOverlay,
  hideWrapContourOverlay,
  redrawWrapContours,
} from '../utils/wrapContourOverlayManager';

// ── Types ──

interface UseWrapModeConfig {
  leftRendererRef: React.MutableRefObject<THREE.WebGLRenderer | undefined>;
  leftSceneRef: React.MutableRefObject<THREE.Scene>;
  cameraRef: React.MutableRefObject<THREE.PerspectiveCamera | undefined>;
  meshRefs: React.MutableRefObject<MeshRefs>;
  leftControlsRef: React.MutableRefObject<OrbitControls | undefined>;
  servicesManager: any;
  /** Called before wrap activates — use to snapshot geometries for undo */
  onBeforeActivate?: () => void;
}

interface UseWrapModeReturn {
  isWrapActive: boolean;
  activateWrap: () => void;
  deactivateWrap: () => void;
  canActivateWrap: boolean;
}

// Allowed layouts for wrap mode
const WRAP_LAYOUTS = ['3d-four-up', '3d-main', '3d-primary'];

export function useWrapMode(config: UseWrapModeConfig): UseWrapModeReturn {
  const {
    leftRendererRef,
    leftSceneRef,
    cameraRef,
    meshRefs,
    leftControlsRef,
    servicesManager,
    onBeforeActivate,
  } = config;

  const [isWrapActive, setIsWrapActive] = useState(false);
  const pointerSphereRef = useRef<THREE.Mesh | null>(null);
  const clickHandlerRef = useRef<((e: MouseEvent) => void) | null>(null);
  const raycasterRef = useRef(new THREE.Raycaster());
  const mouseRef = useRef(new THREE.Vector2());
  const topologiesRef = useRef<Map<number, MergedTopology>>(new Map());
  const dicomDotOverlaysRef = useRef<HTMLCanvasElement[]>([]);

  // Layout gating
  const checkLayout = useCallback(() => {
    try {
      const layout = localStorage.getItem('myLayout');
      if (layout && WRAP_LAYOUTS.includes(layout)) return true;
    } catch {}
    try {
      const { cornerstoneViewportService, viewportGridService } = servicesManager?.services || {};
      if (!cornerstoneViewportService || !viewportGridService) return false;
      const viewportState = viewportGridService.getState();
      const viewports = viewportState?.viewports;
      if (!viewports) return false;
      const entries = viewports instanceof Map
        ? Array.from(viewports.entries())
        : Object.entries(viewports);
      for (const [vpId, vpInfo] of entries as [string, any][]) {
        const opts = vpInfo?.viewportOptions || {};
        if (opts.customLayout === 'stl' || vpId === 'stlViewport') continue;
        if (opts.customLayout === '3d-compare' || opts.customLayout === 'local-3d-compare') continue;
        try {
          const vp = cornerstoneViewportService.getCornerstoneViewport(vpId);
          if (vp?.element && typeof vp.getCamera === 'function') return true;
        } catch {}
      }
    } catch {}
    return false;
  }, [servicesManager]);

  const [canActivateWrap, setCanActivateWrap] = useState(false);

  useEffect(() => {
    setCanActivateWrap(checkLayout());
    const interval = setInterval(() => {
      setCanActivateWrap(checkLayout());
    }, 1000);
    return () => clearInterval(interval);
  }, [checkLayout]);

  // ── Remove red dot overlays ──
  const clearDicomDots = useCallback(() => {
    dicomDotOverlaysRef.current.forEach(c => c.remove());
    dicomDotOverlaysRef.current = [];
  }, []);

  // ── Draw red dot on each DICOM viewport at a world point ──
  const showDicomDots = useCallback((dicomPoint: [number, number, number]) => {
    clearDicomDots();

    const { cornerstoneViewportService, viewportGridService } = servicesManager?.services || {};
    if (!cornerstoneViewportService || !viewportGridService) return;

    const viewportState = viewportGridService.getState();
    const viewports = viewportState?.viewports;
    if (!viewports) return;

    const entries = viewports instanceof Map
      ? Array.from(viewports.entries())
      : Object.entries(viewports);

    entries.forEach(([vpId, vpInfo]: [string, any]) => {
      const opts = vpInfo?.viewportOptions || {};
      if (opts.customLayout === 'stl' || vpId === 'stlViewport') return;
      if (opts.customLayout === '3d-compare' || opts.customLayout === 'local-3d-compare') return;
      try {
        const vp = cornerstoneViewportService.getCornerstoneViewport(vpId);
        if (!vp?.element) return;

        const canvasPos = vp.worldToCanvas(dicomPoint);
        if (!canvasPos || isNaN(canvasPos[0])) return;

        const element = vp.element;
        const rect = element.getBoundingClientRect();

        const dotCanvas = document.createElement('canvas');
        dotCanvas.className = 'wrap-dicom-dot-overlay';
        dotCanvas.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:51;';
        dotCanvas.width = rect.width;
        dotCanvas.height = rect.height;

        const parent = element.parentElement || element;
        parent.style.position = 'relative';
        parent.appendChild(dotCanvas);

        const ctx = dotCanvas.getContext('2d');
        if (ctx) {
          // Red dot
          ctx.beginPath();
          ctx.arc(canvasPos[0], canvasPos[1], 6, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(255, 40, 40, 0.9)';
          ctx.fill();
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
          ctx.lineWidth = 2;
          ctx.stroke();

          // Crosshair lines
          const size = 14;
          ctx.beginPath();
          ctx.strokeStyle = 'rgba(255, 40, 40, 0.7)';
          ctx.lineWidth = 1.5;
          ctx.moveTo(canvasPos[0] - size, canvasPos[1]);
          ctx.lineTo(canvasPos[0] - 8, canvasPos[1]);
          ctx.moveTo(canvasPos[0] + 8, canvasPos[1]);
          ctx.lineTo(canvasPos[0] + size, canvasPos[1]);
          ctx.moveTo(canvasPos[0], canvasPos[1] - size);
          ctx.lineTo(canvasPos[0], canvasPos[1] - 8);
          ctx.moveTo(canvasPos[0], canvasPos[1] + 8);
          ctx.lineTo(canvasPos[0], canvasPos[1] + size);
          ctx.stroke();
        }

        dicomDotOverlaysRef.current.push(dotCanvas);
      } catch { /* ignore */ }
    });
  }, [servicesManager, clearDicomDots]);

  // ── Scroll DICOM viewports to a point + show red dot ──
  // STL positions are already in LPS/DICOM world coordinates — no transform needed.
  const scrollViewportsToPoint = useCallback((stlPoint: THREE.Vector3) => {
    const { cornerstoneViewportService, viewportGridService } = servicesManager?.services || {};
    if (!cornerstoneViewportService || !viewportGridService) return;

    const viewportState = viewportGridService.getState();
    const viewports = viewportState?.viewports;
    if (!viewports) return;

    const entries = viewports instanceof Map
      ? Array.from(viewports.entries())
      : Object.entries(viewports);

    // STL coords are already in DICOM world space (LPS)
    const dicomPoint: [number, number, number] = [stlPoint.x, stlPoint.y, stlPoint.z];
    const csViewports: any[] = [];

    entries.forEach(([vpId, vpInfo]: [string, any]) => {
      const opts = vpInfo?.viewportOptions || {};
      if (opts.customLayout === 'stl' || vpId === 'stlViewport') return;
      if (opts.customLayout === '3d-compare' || opts.customLayout === 'local-3d-compare') return;
      try {
        const vp = cornerstoneViewportService.getCornerstoneViewport(vpId);
        if (!vp?.element) return;
        csViewports.push(vp);
      } catch (_) {}
    });

    if (csViewports.length === 0) return;

    // Navigate each viewport to the exact clicked point and zoom in
    csViewports.forEach(vp => {
      try {
        const cam = vp.getCamera();
        if (!cam?.focalPoint || !cam?.viewPlaneNormal) return;

        const cameraUpdate: any = { focalPoint: dicomPoint };

        if (cam.parallelScale) {
          const targetScale = Math.max(cam.parallelScale * 0.4, 30);
          cameraUpdate.parallelScale = targetScale;
        }

        vp.setCamera(cameraUpdate);
        vp.render();
      } catch (_) {}
    });

    // Show red dot indicator on all DICOM viewports after render
    setTimeout(() => showDicomDots(dicomPoint), 100);

    console.log('[WrapMode] Navigated viewports to DICOM:', dicomPoint.map(v => v.toFixed(1)));
  }, [servicesManager, showDicomDots]);

  // ── 3D Click handler (raycasting) ──
  const handle3DClick = useCallback((event: MouseEvent) => {
    if (!leftRendererRef.current || !cameraRef.current) return;

    const canvas = leftRendererRef.current.domElement;
    const rect = canvas.getBoundingClientRect();

    mouseRef.current.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouseRef.current.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    raycasterRef.current.setFromCamera(mouseRef.current, cameraRef.current);

    const meshes = meshRefs.current.left.filter(mesh => mesh.visible);
    const intersects = raycasterRef.current.intersectObjects(meshes, true);

    if (intersects.length > 0) {
      const intersectPoint = intersects[0].point;

      // Move pointer sphere to hit point
      if (pointerSphereRef.current) {
        pointerSphereRef.current.position.copy(intersectPoint);
        pointerSphereRef.current.visible = true;
      }

      // Scroll DICOM viewports to matching slice + show red dot
      scrollViewportsToPoint(intersectPoint);

      // Render the 3D scene to show the sphere
      if (leftRendererRef.current && leftSceneRef.current && cameraRef.current) {
        leftRendererRef.current.render(leftSceneRef.current, cameraRef.current);
      }
    }
  }, [leftRendererRef, leftSceneRef, cameraRef, meshRefs, scrollViewportsToPoint]);

  // ── Activate wrap mode ──
  const activateWrap = useCallback(() => {
    if (!canActivateWrap) return;

    const meshes = meshRefs.current?.left || [];
    if (meshes.length === 0) {
      console.log('[WrapMode] No meshes to wrap');
      return;
    }

    // Snapshot geometries for undo before any modifications
    onBeforeActivate?.();

    // Build merged topologies for each mesh
    topologiesRef.current.clear();
    meshes.forEach((mesh, index) => {
      if (mesh.geometry) {
        const topology = buildMergedTopology(mesh.geometry);
        topologiesRef.current.set(index, topology);
      }
    });

    // Store mesh data for contour computation
    storeWrapMeshData(meshes, topologiesRef.current);

    // Show blue contour overlay
    showWrapContourOverlay(servicesManager, () => {
      // onMeshModified callback: re-render 3D scene
      if (leftRendererRef.current && leftSceneRef.current && cameraRef.current) {
        leftRendererRef.current.render(leftSceneRef.current, cameraRef.current);
      }
    });

    // Create blue pointer sphere
    if (!pointerSphereRef.current && leftSceneRef.current) {
      const sphereGeo = new THREE.SphereGeometry(1.5, 16, 16);
      const sphereMat = new THREE.MeshBasicMaterial({
        color: 0x0078ff,
        transparent: true,
        opacity: 0.8,
        depthTest: false,
      });
      const sphere = new THREE.Mesh(sphereGeo, sphereMat);
      sphere.renderOrder = 999;
      sphere.visible = false;
      leftSceneRef.current.add(sphere);
      pointerSphereRef.current = sphere;
    }

    // Add click handler on 3D canvas
    const canvas = leftRendererRef.current?.domElement;
    if (canvas) {
      const handler = (e: MouseEvent) => handle3DClick(e);
      clickHandlerRef.current = handler;
      canvas.addEventListener('click', handler);
    }

    setIsWrapActive(true);
    console.log('[WrapMode] Activated');
  }, [canActivateWrap, meshRefs, servicesManager, leftRendererRef, leftSceneRef, cameraRef, handle3DClick, onBeforeActivate]);

  // ── Deactivate wrap mode ──
  const deactivateWrap = useCallback(() => {
    hideWrapContourOverlay();
    clearDicomDots();

    if (pointerSphereRef.current && leftSceneRef.current) {
      leftSceneRef.current.remove(pointerSphereRef.current);
      pointerSphereRef.current.geometry.dispose();
      (pointerSphereRef.current.material as THREE.Material).dispose();
      pointerSphereRef.current = null;
    }

    const canvas = leftRendererRef.current?.domElement;
    if (canvas && clickHandlerRef.current) {
      canvas.removeEventListener('click', clickHandlerRef.current);
      clickHandlerRef.current = null;
    }

    topologiesRef.current.clear();

    if (leftRendererRef.current && leftSceneRef.current && cameraRef.current) {
      leftRendererRef.current.render(leftSceneRef.current, cameraRef.current);
    }

    setIsWrapActive(false);
    console.log('[WrapMode] Deactivated');
  }, [leftSceneRef, leftRendererRef, cameraRef, clearDicomDots]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (isWrapActive) {
        hideWrapContourOverlay();
        clearDicomDots();
        if (pointerSphereRef.current && leftSceneRef.current) {
          leftSceneRef.current.remove(pointerSphereRef.current);
          pointerSphereRef.current.geometry.dispose();
          (pointerSphereRef.current.material as THREE.Material).dispose();
          pointerSphereRef.current = null;
        }
        const canvas = leftRendererRef.current?.domElement;
        if (canvas && clickHandlerRef.current) {
          canvas.removeEventListener('click', clickHandlerRef.current);
          clickHandlerRef.current = null;
        }
      }
    };
  }, []);

  return { isWrapActive, activateWrap, deactivateWrap, canActivateWrap };
}
