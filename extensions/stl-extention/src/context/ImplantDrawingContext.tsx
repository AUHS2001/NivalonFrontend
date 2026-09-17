import React, { createContext, useContext, useState, useCallback, useRef, ReactNode } from 'react';
import * as THREE from 'three';

export interface DrawnImplant {
  id: string;
  label: string;
  color: string;
  worldPoints: Array<[number, number, number]>;
  originalWorldPoints: Array<[number, number, number]>; // at scale = 1
  normal: [number, number, number];
  thickness: number;
  scale: number;
  viewportId: string;
  canvasPoints: Array<{ x: number; y: number }>;
  mesh: THREE.Mesh | null;
}

interface ImplantDrawingContextType {
  drawImplantEnabled: boolean;
  implants: DrawnImplant[];
  implantColor: string;
  implantThickness: number;
  toggleDrawImplant: () => void;
  addImplant: (implant: Omit<DrawnImplant, 'scale' | 'originalWorldPoints'>) => void;
  removeImplant: (id: string) => void;
  clearImplants: () => void;
  updateImplantScale: (id: string, scale: number) => void;
  setImplantWorldPoints: (
    id: string,
    worldPoints: Array<[number, number, number]>,
    originalWorldPoints: Array<[number, number, number]>
  ) => void;
  setImplantColor: (c: string) => void;
  setImplantThickness: (t: number) => void;
  registerMeshCallbacks: (
    onAdd: (mesh: THREE.Mesh) => void,
    onRemove: (id: string) => void,
    onScale: (
      id: string,
      scale: number,
      scaledWorldPoints: Array<[number, number, number]>,
      normal: [number, number, number],
      thickness: number,
      color: string
    ) => void
  ) => void;
}

const ImplantDrawingContext = createContext<ImplantDrawingContextType | undefined>(undefined);

export const ImplantDrawingProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [drawImplantEnabled, setDrawImplantEnabled] = useState(false);
  const [implants, setImplants] = useState<DrawnImplant[]>([]);
  const [implantColor, setImplantColor] = useState('#00bcd4');
  const [implantThickness, setImplantThickness] = useState(10);

  const onAddRef = useRef<((mesh: THREE.Mesh) => void) | null>(null);
  const onRemoveRef = useRef<((id: string) => void) | null>(null);
  const onScaleRef = useRef<((
    id: string,
    scale: number,
    scaledWorldPoints: Array<[number, number, number]>,
    normal: [number, number, number],
    thickness: number,
    color: string
  ) => void) | null>(null);

  const registerMeshCallbacks = useCallback(
    (
      onAdd: (mesh: THREE.Mesh) => void,
      onRemove: (id: string) => void,
      onScale: (
        id: string,
        scale: number,
        scaledWorldPoints: Array<[number, number, number]>,
        normal: [number, number, number],
        thickness: number,
        color: string
      ) => void
    ) => {
      onAddRef.current = onAdd;
      onRemoveRef.current = onRemove;
      onScaleRef.current = onScale;
    },
    []
  );

  const toggleDrawImplant = useCallback(() => {
    setDrawImplantEnabled(prev => !prev);
  }, []);

  const addImplant = useCallback((implant: Omit<DrawnImplant, 'scale' | 'originalWorldPoints'>) => {
    const full: DrawnImplant = {
      ...implant,
      scale: 1,
      originalWorldPoints: [...implant.worldPoints],
    };
    setImplants(prev => [...prev, full]);
    if (full.mesh && onAddRef.current) {
      onAddRef.current(full.mesh);
    }
  }, []);

  const removeImplant = useCallback((id: string) => {
    setImplants(prev => {
      const found = prev.find(i => i.id === id);
      if (found && onRemoveRef.current) {
        onRemoveRef.current(id);
      }
      return prev.filter(i => i.id !== id);
    });
  }, []);

  const setImplantWorldPoints = useCallback((
    id: string,
    worldPoints: Array<[number, number, number]>,
    originalWorldPoints: Array<[number, number, number]>
  ) => {
    setImplants(prev => prev.map(implant =>
      implant.id === id ? { ...implant, worldPoints, originalWorldPoints } : implant
    ));
  }, []);

  const clearImplants = useCallback(() => {
    setImplants(prev => {
      prev.forEach(i => {
        if (onRemoveRef.current) onRemoveRef.current(i.id);
      });
      return [];
    });
  }, []);

  const updateImplantScale = useCallback((id: string, scale: number) => {
    setImplants(prev => prev.map(implant => {
      if (implant.id !== id) return implant;

      // Compute centroid of original world points
      const c: [number, number, number] = [0, 0, 0];
      implant.originalWorldPoints.forEach(([x, y, z]) => { c[0] += x; c[1] += y; c[2] += z; });
      c[0] /= implant.originalWorldPoints.length;
      c[1] /= implant.originalWorldPoints.length;
      c[2] /= implant.originalWorldPoints.length;

      // Scale each vertex around the centroid
      const scaledWorldPoints: Array<[number, number, number]> = implant.originalWorldPoints.map(
        ([x, y, z]) => [
          c[0] + (x - c[0]) * scale,
          c[1] + (y - c[1]) * scale,
          c[2] + (z - c[2]) * scale,
        ]
      );

      if (onScaleRef.current) {
        onScaleRef.current(id, scale, scaledWorldPoints, implant.normal, implant.thickness, implant.color);
      }

      return { ...implant, scale, worldPoints: scaledWorldPoints };
    }));
  }, []);

  return (
    <ImplantDrawingContext.Provider value={{
      drawImplantEnabled,
      implants,
      implantColor,
      implantThickness,
      toggleDrawImplant,
      addImplant,
      removeImplant,
      clearImplants,
      updateImplantScale,
      setImplantWorldPoints,
      setImplantColor,
      setImplantThickness,
      registerMeshCallbacks,
    }}>
      {children}
    </ImplantDrawingContext.Provider>
  );
};

export const useImplantDrawingContext = () => {
  const ctx = useContext(ImplantDrawingContext);
  if (!ctx) throw new Error('useImplantDrawingContext must be used within ImplantDrawingProvider');
  return ctx;
};
