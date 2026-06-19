import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { computeSTLBounds } from '../utils/voxelMaskingManager';

interface UseBoneRemovalProps {
  removalMode: boolean;
  leftRendererRef: React.MutableRefObject<THREE.WebGLRenderer | undefined>;
  leftControlsRef: React.MutableRefObject<any>;
  cameraRef: React.MutableRefObject<THREE.PerspectiveCamera | undefined>;
  meshRefs: React.MutableRefObject<{ left: THREE.Mesh[], right: THREE.Mesh[] }>;
  removalCanvasRef: React.MutableRefObject<HTMLCanvasElement | null>;
  setRemoving: (removing: boolean) => void;
  setUndoStack: React.Dispatch<React.SetStateAction<THREE.BufferGeometry[][]>>;
  setRemovalOutline: React.Dispatch<React.SetStateAction<{ x: number, y: number }[]>>;
  localOnly?: boolean;
  removalOutline: { x: number, y: number }[];
  onRemovalComplete?: (removedWorldVertices: THREE.Vector3[], preRemovalBounds: { min: THREE.Vector3; max: THREE.Vector3 }) => void;
  meshKey?: 'left' | 'right';
}

export const useBoneRemoval = ({
  removalMode,
  leftRendererRef,
  leftControlsRef,
  cameraRef,
  meshRefs,
  removalCanvasRef,
  setRemoving,
  setUndoStack,
  setRemovalOutline,
  removalOutline,
  onRemovalComplete,
  localOnly = false,
  meshKey = 'left'
}: UseBoneRemovalProps) => {
  const removalOutlinePoints = useRef<{ x: number, y: number }[]>([]);

  function isPointInPolygon(point: {x:number,y:number}, poly: {x:number,y:number}[]) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const xi = poly[i].x, yi = poly[i].y;
      const xj = poly[j].x, yj = poly[j].y;
      const intersect = ((yi > point.y) !== (yj > point.y)) &&
        (point.x < (xj - xi) * (point.y - yi) / ((yj - yi) || 1e-7) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  }

  const handleRemoveSelection = (outline: { x: number, y: number }[]) => {
    setRemovalOutline([]);
    setRemoving(true);
    setTimeout(() => { // allow UI to update, then process
      const cam = cameraRef.current;
      if (!cam) { setRemoving(false); return; }
      const targetMeshes = meshRefs.current[meshKey];
      const prevGeometries = targetMeshes.map(mesh => mesh.geometry.clone());
      setUndoStack(stack => [...stack, prevGeometries]);
      // Compute STL bounds BEFORE geometry clipping so the STL→DICOM transform is correct
      const preRemovalBounds = computeSTLBounds(targetMeshes);
      const removedWorldVertices: THREE.Vector3[] = [];
      targetMeshes.forEach((mesh, idx) => {
        if (!mesh.visible) return;
        const geometry = mesh.geometry as THREE.BufferGeometry;
        const position = geometry.getAttribute('position');
        const indexAttr = geometry.getIndex();
        const vertexCount = position.count;
        const worldMatrix = mesh.matrixWorld;
        const projected2D: { x: number, y: number }[] = [];
        for (let i = 0; i < vertexCount; i++) {
          const v3 = new THREE.Vector3(
            position.getX(i), position.getY(i), position.getZ(i)
          ).applyMatrix4(worldMatrix);
          const projected = v3.project(cam);
          projected2D.push({ x: projected.x, y: projected.y });
        }
        const inside = projected2D.map(pt => isPointInPolygon(pt, outline));
        const oldIndices = indexAttr
          ? Array.from({ length: indexAttr.count }, (_, i) => indexAttr.getX(i))
          : Array.from({ length: vertexCount }, (_, i) => i);
        const newIndices: number[] = [];
        for (let i = 0; i < oldIndices.length; i += 3) {
          const a = oldIndices[i], b = oldIndices[i + 1], c = oldIndices[i + 2];
          if (!(inside[a] || inside[b] || inside[c])) {
            newIndices.push(a, b, c);
          }
        }
        if (newIndices.length < oldIndices.length) {
          const newGeometry = geometry.clone();
          newGeometry.setIndex(newIndices);
          mesh.geometry = newGeometry;
          if (!localOnly && meshKey === 'left' && meshRefs.current.right[idx]) {
            meshRefs.current.right[idx].geometry = newGeometry.clone();
          }
          // Collect world positions of removed (inside) vertices
          mesh.updateMatrixWorld(true);
          for (let i = 0; i < vertexCount; i++) {
            if (inside[i]) {
              const v3 = new THREE.Vector3(
                position.getX(i), position.getY(i), position.getZ(i)
              ).applyMatrix4(mesh.matrixWorld);
              removedWorldVertices.push(v3);
            }
          }
        }
      });
      onRemovalComplete?.(removedWorldVertices, preRemovalBounds);
      setRemoving(false);
    }, 10);
  };

  // ---- Polyline Drawing for Bone Removal ----
  useEffect(() => {
    if (!removalMode) return;
    const renderer = leftRendererRef.current;
    if (!renderer) return;
    const canvas = renderer.domElement;
    let drawing = false;

    function getPos(e: MouseEvent) {
      const rect = canvas.getBoundingClientRect();
      return {
        x: ((e.clientX - rect.left) / rect.width) * 2 - 1,
        y: -((e.clientY - rect.top) / rect.height) * 2 + 1,
      };
    }

    const down = (e: MouseEvent) => {
      if (e.button !== 2) return;
      e.preventDefault();
      removalOutlinePoints.current = [];
      drawing = true;
      const p = getPos(e);
      removalOutlinePoints.current.push(p);
      setRemovalOutline([p]);
      leftControlsRef.current!.enabled = false;
    };

    const move = (e: MouseEvent) => {
      if (!drawing) return;
      e.preventDefault();
      const p = getPos(e);
      removalOutlinePoints.current.push(p);
      setRemovalOutline([...removalOutlinePoints.current]);
    };

    const up = (e: MouseEvent) => {
      if (!drawing) return;
      drawing = false;
      leftControlsRef.current!.enabled = true;
      setRemovalOutline([]);
      handleRemoveSelection(removalOutlinePoints.current);
    };

    canvas.addEventListener("mousedown", down);
    canvas.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
    const preventCtx = (e: MouseEvent) => e.preventDefault();
    canvas.addEventListener("contextmenu", preventCtx);
    return () => {
      canvas.removeEventListener("mousedown", down);
      canvas.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
      canvas.removeEventListener("contextmenu", preventCtx);
      setRemovalOutline([]);
      if (leftControlsRef.current) leftControlsRef.current.enabled = true;
    };
  }, [removalMode]);

  useEffect(() => {
    if (!removalMode || !removalCanvasRef.current) return;
    const canvas = removalCanvasRef.current;
    const rendererCanvas = leftRendererRef.current?.domElement;
    if (rendererCanvas) {
      if (canvas.width !== rendererCanvas.clientWidth || canvas.height !== rendererCanvas.clientHeight) {
        canvas.width = rendererCanvas.clientWidth;
        canvas.height = rendererCanvas.clientHeight;
      }
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (removalOutline.length < 2) return;
    ctx.strokeStyle = "#00FF00";
    ctx.lineWidth = 2;
    ctx.beginPath();
    removalOutline.forEach((pt, i) => {
      const x = ((pt.x + 1) / 2) * canvas.width;
      const y = ((-pt.y + 1) / 2) * canvas.height;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.closePath();
    ctx.stroke();
  }, [removalOutline, removalMode]);

  return {
    removalOutlinePoints
  };
};
