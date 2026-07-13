import { useRef, useCallback, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { MeshRefs } from '../types/three.types';
import { buildMergedTopology, MergedTopology } from '../utils/wrapMeshEditor';
import { localLaplacianSmooth } from '../utils/smoothGeometry';

// ── Types ──

interface UseFreehandSmoothConfig {
  leftRendererRef: React.MutableRefObject<THREE.WebGLRenderer | undefined>;
  leftSceneRef: React.MutableRefObject<THREE.Scene>;
  cameraRef: React.MutableRefObject<THREE.PerspectiveCamera | undefined>;
  meshRefs: React.MutableRefObject<MeshRefs>;
  leftControlsRef: React.MutableRefObject<OrbitControls | undefined>;
  /** Called before activation — use to snapshot geometries for undo */
  onBeforeActivate?: () => void;
}

interface UseFreehandSmoothReturn {
  isFreehandSmoothActive: boolean;
  isDragMode: boolean;
  toggleDragMode: () => void;
  activateFreehandSmooth: (iterations: number, lambda: number) => void;
  deactivateFreehandSmooth: () => void;
}

// ── Constants ──

const DEFAULT_BRUSH_RADIUS = 5;
const MIN_BRUSH_RADIUS = 1;
const MAX_BRUSH_RADIUS = 30;
const BRUSH_RADIUS_STEP = 1;
const FIXED_CURSOR_RADIUS_PX = 20;

export function useFreehandSmooth(config: UseFreehandSmoothConfig): UseFreehandSmoothReturn {
  const {
    leftRendererRef,
    leftSceneRef,
    cameraRef,
    meshRefs,
    leftControlsRef,
    onBeforeActivate,
  } = config;

  const [isFreehandSmoothActive, setIsFreehandSmoothActive] = useState(false);
  const [isDragMode, setIsDragMode] = useState(false);
  const dragModeRef = useRef(false);

  // Refs for internal state
  const topologiesRef = useRef<Map<number, MergedTopology>>(new Map());
  const brushRadiusRef = useRef(DEFAULT_BRUSH_RADIUS);
  const isPaintingRef = useRef(false);
  const raycasterRef = useRef(new THREE.Raycaster());
  const mouseRef = useRef(new THREE.Vector2());
  const brushCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const lastSmoothTimeRef = useRef(0);
  const smoothIterationsRef = useRef(6);
  const smoothLambdaRef = useRef(0.8);

  // Store handlers for cleanup
  const handlersRef = useRef<{
    mousedown: ((e: MouseEvent) => void) | null;
    mousemove: ((e: MouseEvent) => void) | null;
    mouseup: ((e: MouseEvent) => void) | null;
    wheel: ((e: WheelEvent) => void) | null;
    contextmenu: ((e: Event) => void) | null;
  }>({
    mousedown: null,
    mousemove: null,
    mouseup: null,
    wheel: null,
    contextmenu: null,
  });

  // ── Brush overlay helpers ──

  const createBrushCanvas = useCallback(() => {
    if (brushCanvasRef.current) return;

    const canvas = document.createElement('canvas');
    canvas.style.cssText =
      'position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:160;';
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    document.body.appendChild(canvas);
    brushCanvasRef.current = canvas;
  }, []);

  const removeBrushCanvas = useCallback(() => {
    if (brushCanvasRef.current) {
      brushCanvasRef.current.remove();
      brushCanvasRef.current = null;
    }
  }, []);

  const drawBrushCursor = useCallback(
    (screenX: number, screenY: number) => {
      const canvas = brushCanvasRef.current;
      if (!canvas) return;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // Resize if needed
      if (canvas.width !== window.innerWidth || canvas.height !== window.innerHeight) {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
      }

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Fixed pixel radius — does not change with zoom
      const screenRadius = FIXED_CURSOR_RADIUS_PX;

      // Draw semi-transparent cyan circle
      ctx.beginPath();
      ctx.arc(screenX, screenY, screenRadius, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(0, 255, 255, 0.7)';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = 'rgba(0, 255, 255, 0.1)';
      ctx.fill();
    },
    [],
  );

  // ── Raycast helper ──

  const raycastMeshes = useCallback(
    (event: MouseEvent): THREE.Intersection | null => {
      if (!leftRendererRef.current || !cameraRef.current) return null;

      const canvas = leftRendererRef.current.domElement;
      const rect = canvas.getBoundingClientRect();

      // Only raycast if the mouse is over the 3D canvas
      if (
        event.clientX < rect.left ||
        event.clientX > rect.right ||
        event.clientY < rect.top ||
        event.clientY > rect.bottom
      ) {
        return null;
      }

      mouseRef.current.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouseRef.current.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      raycasterRef.current.setFromCamera(mouseRef.current, cameraRef.current);

      const meshes = meshRefs.current.left.filter((mesh) => mesh.visible);
      const intersects = raycasterRef.current.intersectObjects(meshes, true);

      return intersects.length > 0 ? intersects[0] : null;
    },
    [leftRendererRef, cameraRef, meshRefs],
  );

  // ── Apply smooth at a hit point ──

  const applySmoothAtPoint = useCallback(
    (hit: THREE.Intersection) => {
      const hitMesh = hit.object as THREE.Mesh;
      if (!hitMesh?.geometry) return;

      // Find this mesh's index and topology
      const meshes = meshRefs.current.left;
      const meshIndex = meshes.indexOf(hitMesh);
      if (meshIndex === -1) return;

      const topology = topologiesRef.current.get(meshIndex);
      if (!topology) return;

      // Convert hit point to local space of the mesh
      const localPoint = hitMesh.worldToLocal(hit.point.clone());

      localLaplacianSmooth(
        hitMesh.geometry,
        topology,
        localPoint,
        brushRadiusRef.current,
        smoothIterationsRef.current,
        smoothLambdaRef.current,
      );

      // Re-render
      if (leftRendererRef.current && leftSceneRef.current && cameraRef.current) {
        leftRendererRef.current.render(leftSceneRef.current, cameraRef.current);
      }
    },
    [meshRefs, leftRendererRef, leftSceneRef, cameraRef],
  );

  // ── Activate ──

  const activateFreehandSmooth = useCallback((iterations: number, lambda: number) => {
    const meshes = meshRefs.current?.left || [];
    if (meshes.length === 0) {
      console.log('[FreehandSmooth] No meshes available');
      return;
    }

    // Store user-chosen smoothing parameters
    smoothIterationsRef.current = iterations;
    smoothLambdaRef.current = lambda;

    // Snapshot geometries for undo
    onBeforeActivate?.();

    // Precompute merged topologies
    topologiesRef.current.clear();
    meshes.forEach((mesh, index) => {
      if (mesh.geometry) {
        const topology = buildMergedTopology(mesh.geometry);
        topologiesRef.current.set(index, topology);
      }
    });

    // Create brush overlay
    createBrushCanvas();

    // Hide default cursor on the 3D canvas
    const canvas = leftRendererRef.current?.domElement;
    if (canvas) {
      canvas.style.cursor = 'none';

      // ── Mouse handlers ──

      const onMouseDown = (e: MouseEvent) => {
        if (e.button !== 0) return; // left click only
        if (dragModeRef.current) return; // drag mode — let orbit controls handle it

        isPaintingRef.current = true;

        // Disable orbit controls while painting
        if (leftControlsRef.current) {
          leftControlsRef.current.enabled = false;
        }

        // Apply smooth at click point
        const hit = raycastMeshes(e);
        if (hit) {
          applySmoothAtPoint(hit);
          lastSmoothTimeRef.current = performance.now();
        }
      };

      const onMouseMove = (e: MouseEvent) => {
        if (dragModeRef.current) return; // drag mode — no brush cursor or smoothing

        const hit = raycastMeshes(e);

        // Update brush cursor
        drawBrushCursor(e.clientX, e.clientY);

        if (isPaintingRef.current && hit) {
          // Throttle to ~60fps
          const now = performance.now();
          if (now - lastSmoothTimeRef.current < 16) return;
          lastSmoothTimeRef.current = now;

          applySmoothAtPoint(hit);
        }
      };

      const onMouseUp = (e: MouseEvent) => {
        if (e.button !== 0) return;
        if (dragModeRef.current) return;

        isPaintingRef.current = false;

        // Re-enable orbit controls
        if (leftControlsRef.current) {
          leftControlsRef.current.enabled = true;
        }
      };

      const onWheel = (e: WheelEvent) => {
        if (!e.shiftKey) return;
        e.preventDefault();
        e.stopPropagation();

        const delta = e.deltaY > 0 ? -BRUSH_RADIUS_STEP : BRUSH_RADIUS_STEP;
        brushRadiusRef.current = Math.max(
          MIN_BRUSH_RADIUS,
          Math.min(MAX_BRUSH_RADIUS, brushRadiusRef.current + delta),
        );

        // Redraw cursor at current position with new size
        const hit = raycastMeshes(e as unknown as MouseEvent);
        drawBrushCursor(e.clientX, e.clientY);
      };

      const onContextMenu = (e: Event) => {
        // Prevent context menu while tool is active
      };

      // Store and attach handlers
      handlersRef.current = {
        mousedown: onMouseDown,
        mousemove: onMouseMove,
        mouseup: onMouseUp,
        wheel: onWheel,
        contextmenu: onContextMenu,
      };

      canvas.addEventListener('mousedown', onMouseDown);
      canvas.addEventListener('mousemove', onMouseMove);
      canvas.addEventListener('mouseup', onMouseUp);
      canvas.addEventListener('wheel', onWheel, { passive: false });
    }

    setIsFreehandSmoothActive(true);
    console.log('[FreehandSmooth] Activated');
  }, [
    meshRefs,
    onBeforeActivate,
    createBrushCanvas,
    leftRendererRef,
    leftControlsRef,
    raycastMeshes,
    applySmoothAtPoint,
    drawBrushCursor,
  ]);

  // ── Toggle drag mode ──

  const toggleDragMode = useCallback(() => {
    const newDragMode = !dragModeRef.current;
    dragModeRef.current = newDragMode;
    setIsDragMode(newDragMode);

    const canvas = leftRendererRef.current?.domElement;

    if (newDragMode) {
      // Switch to drag mode: enable orbit, hide brush, restore cursor
      if (leftControlsRef.current) {
        leftControlsRef.current.enabled = true;
      }
      isPaintingRef.current = false;
      if (canvas) canvas.style.cursor = '';
      // Clear the brush overlay
      const brushCanvas = brushCanvasRef.current;
      if (brushCanvas) {
        const ctx = brushCanvas.getContext('2d');
        if (ctx) ctx.clearRect(0, 0, brushCanvas.width, brushCanvas.height);
      }
    } else {
      // Switch back to smooth mode: hide cursor for brush
      if (canvas) canvas.style.cursor = 'none';
    }
  }, [leftRendererRef, leftControlsRef]);

  // ── Deactivate ──

  const deactivateFreehandSmooth = useCallback(() => {
    isPaintingRef.current = false;
    dragModeRef.current = false;
    setIsDragMode(false);

    // Remove brush overlay
    removeBrushCanvas();

    // Remove event listeners
    const canvas = leftRendererRef.current?.domElement;
    if (canvas) {
      canvas.style.cursor = '';

      const h = handlersRef.current;
      if (h.mousedown) canvas.removeEventListener('mousedown', h.mousedown);
      if (h.mousemove) canvas.removeEventListener('mousemove', h.mousemove);
      if (h.mouseup) canvas.removeEventListener('mouseup', h.mouseup);
      if (h.wheel) canvas.removeEventListener('wheel', h.wheel);
      if (h.contextmenu) canvas.removeEventListener('contextmenu', h.contextmenu);

      handlersRef.current = {
        mousedown: null,
        mousemove: null,
        mouseup: null,
        wheel: null,
        contextmenu: null,
      };
    }

    // Re-enable orbit controls
    if (leftControlsRef.current) {
      leftControlsRef.current.enabled = true;
    }

    // Clear topologies
    topologiesRef.current.clear();

    // Re-render
    if (leftRendererRef.current && leftSceneRef.current && cameraRef.current) {
      leftRendererRef.current.render(leftSceneRef.current, cameraRef.current);
    }

    setIsFreehandSmoothActive(false);
    console.log('[FreehandSmooth] Deactivated');
  }, [removeBrushCanvas, leftRendererRef, leftSceneRef, cameraRef, leftControlsRef]);

  return {
    isFreehandSmoothActive,
    isDragMode,
    toggleDragMode,
    activateFreehandSmooth,
    deactivateFreehandSmooth,
  };
}
