import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import * as THREE from 'three';

interface ColorModeContextType {
  colorModeEnabled: boolean;
  toggleColorMode: () => void;
  applyColorMode: (meshRefs: React.MutableRefObject<{ left: THREE.Mesh[]; right: THREE.Mesh[] }>) => void;
  removeColorMode: (meshRefs: React.MutableRefObject<{ left: THREE.Mesh[]; right: THREE.Mesh[] }>) => void;
}

const ColorModeContext = createContext<ColorModeContextType | undefined>(undefined);

// Vertebra color palette matching the reference image
const VERTEBRA_COLORS: { [key: string]: number } = {
  // Cervical - shades of blue/cyan
  C1: 0x4169E1,
  C2: 0x4682B4,
  C3: 0x5F9EA0,
  C4: 0x6495ED,
  C5: 0x00CED1,
  C6: 0x20B2AA,
  C7: 0x48D1CC,

  // Thoracic - warm colors
  T1: 0xCD5C5C,
  T2: 0xDC143C,
  T3: 0xB22222,
  T4: 0xC71585,
  T5: 0xDB7093,
  T6: 0xFF69B4,
  T7: 0xFFB6C1,
  T8: 0xFFA07A,
  T9: 0xFA8072,
  T10: 0xE9967A,
  T11: 0xF08080,
  T12: 0xCD5C5C, // Red/brown - top vertebra in image

  // Lumbar - matching the reference image colors
  L1: 0xADFF2F, // Lime green
  L2: 0xBDB76B, // Olive/khaki
  L3: 0xFF00FF, // Magenta
  L4: 0x9932CC, // Purple
  L5: 0x32CD32, // Green

  // Sacral - cyan and magenta
  S1: 0x00FFFF, // Cyan
  S2: 0xFF00FF, // Magenta
  S3: 0xDA70D6,
  S4: 0xBA55D3,
  S5: 0x9400D3,
};

// Default color sequence for unknown vertebrae
const DEFAULT_COLORS = [
  0xCD5C5C, // Red/brown
  0xADFF2F, // Lime green
  0xBDB76B, // Olive
  0xFF00FF, // Magenta
  0x9932CC, // Purple
  0x32CD32, // Green
  0x00FFFF, // Cyan
  0xDA70D6, // Orchid
  0xFFD700, // Gold
  0xFF6347, // Tomato
];

export const ColorModeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [colorModeEnabled, setColorModeEnabled] = useState(false);
  const originalMaterialsRef = useRef<Map<THREE.Mesh, THREE.Material | THREE.Material[]>>(new Map());

  const getColorForVertebra = useCallback((userData: any, index: number): number => {
    if (userData?.fullName && VERTEBRA_COLORS[userData.fullName]) {
      return VERTEBRA_COLORS[userData.fullName];
    }
    if (userData?.type && userData?.number) {
      const key = `${userData.type}${userData.number}`;
      if (VERTEBRA_COLORS[key]) {
        return VERTEBRA_COLORS[key];
      }
    }
    // Use default color based on index
    return DEFAULT_COLORS[index % DEFAULT_COLORS.length];
  }, []);

  const applyColorMode = useCallback((meshRefs: React.MutableRefObject<{ left: THREE.Mesh[]; right: THREE.Mesh[] }>) => {
    const leftMeshes = meshRefs.current.left;

    leftMeshes.forEach((mesh, index) => {
      // Store original material if not already stored
      if (!originalMaterialsRef.current.has(mesh)) {
        originalMaterialsRef.current.set(mesh, mesh.material);
      }

      const color = getColorForVertebra(mesh.userData, index);

      // Create new colored material - no emissive
      const coloredMaterial = new THREE.MeshPhongMaterial({
        color: color,
        specular: 0x111111,
        shininess: 10,
        side: THREE.DoubleSide
      });

      mesh.material = coloredMaterial;
    });

    // Also apply to right meshes if they exist
    const rightMeshes = meshRefs.current.right;
    rightMeshes.forEach((mesh, index) => {
      if (!originalMaterialsRef.current.has(mesh)) {
        originalMaterialsRef.current.set(mesh, mesh.material);
      }

      const color = getColorForVertebra(mesh.userData, index);

      const coloredMaterial = new THREE.MeshPhongMaterial({
        color: color,
        specular: 0x111111,
        shininess: 10,
        side: THREE.DoubleSide
      });

      mesh.material = coloredMaterial;
    });
  }, [getColorForVertebra]);

  const removeColorMode = useCallback((meshRefs: React.MutableRefObject<{ left: THREE.Mesh[]; right: THREE.Mesh[] }>) => {
    const allMeshes = [...meshRefs.current.left, ...meshRefs.current.right];

    allMeshes.forEach((mesh) => {
      const originalMaterial = originalMaterialsRef.current.get(mesh);
      if (originalMaterial) {
        // Dispose the colored material
        if (Array.isArray(mesh.material)) {
          mesh.material.forEach(m => m.dispose());
        } else {
          mesh.material.dispose();
        }
        mesh.material = originalMaterial;
      }
    });
  }, []);

  const toggleColorMode = useCallback(() => {
    setColorModeEnabled(prev => !prev);
  }, []);

  return (
    <ColorModeContext.Provider value={{
      colorModeEnabled,
      toggleColorMode,
      applyColorMode,
      removeColorMode
    }}>
      {children}
    </ColorModeContext.Provider>
  );
};

export const useColorModeContext = () => {
  const context = useContext(ColorModeContext);
  if (!context) {
    throw new Error('useColorModeContext must be used within a ColorModeProvider');
  }
  return context;
};
