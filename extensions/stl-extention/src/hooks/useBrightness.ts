import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { MeshRefs } from '../types/three.types';

interface UseBrightnessProps {
  brightnessEnabled: boolean;
  brightness: number;
  meshRefs: React.MutableRefObject<MeshRefs>;
  activePanel?: 'left' | 'right';
}

export const useBrightness = ({
  brightnessEnabled,
  brightness,
  meshRefs,
  activePanel,
}: UseBrightnessProps) => {
  // Store original material properties
  const originalPropertiesRef = useRef<{
    left: Map<THREE.Mesh, { color: THREE.Color; emissive: THREE.Color; emissiveIntensity: number }>;
    right: Map<THREE.Mesh, { color: THREE.Color; emissive: THREE.Color; emissiveIntensity: number }>;
  }>({
    left: new Map(),
    right: new Map()
  });

  // Store original properties when meshes are loaded
  useEffect(() => {
    meshRefs.current.left.forEach(mesh => {
      if (mesh.material && !originalPropertiesRef.current.left.has(mesh)) {
        const material = mesh.material as THREE.MeshPhongMaterial;
        originalPropertiesRef.current.left.set(mesh, {
          color: material.color.clone(),
          emissive: material.emissive.clone(),
          emissiveIntensity: material.emissiveIntensity
        });
      }
    });

    meshRefs.current.right.forEach(mesh => {
      if (mesh.material && !originalPropertiesRef.current.right.has(mesh)) {
        const material = mesh.material as THREE.MeshPhongMaterial;
        originalPropertiesRef.current.right.set(mesh, {
          color: material.color.clone(),
          emissive: material.emissive.clone(),
          emissiveIntensity: material.emissiveIntensity
        });
      }
    });
  }, [meshRefs.current.left.length, meshRefs.current.right.length]);

  const restoreSide = (side: 'left' | 'right') => {
    meshRefs.current[side].forEach(mesh => {
      if (mesh.material) {
        const material = mesh.material as THREE.MeshPhongMaterial;
        const original = originalPropertiesRef.current[side].get(mesh);
        if (original) {
          material.color.copy(original.color);
          material.emissive.copy(original.emissive);
          material.emissiveIntensity = original.emissiveIntensity;
        }
        material.needsUpdate = true;
      }
    });
  };

  const applyBrightnessSide = (side: 'left' | 'right', factor: number) => {
    meshRefs.current[side].forEach(mesh => {
      if (mesh.material) {
        const material = mesh.material as THREE.MeshPhongMaterial;
        const original = originalPropertiesRef.current[side].get(mesh);
        if (original) {
          const brightenedColor = original.color.clone().multiplyScalar(1 + (brightness * factor));
          material.color = brightenedColor;
          material.emissive.copy(original.emissive);
          material.emissiveIntensity = original.emissiveIntensity;
        }
        material.needsUpdate = true;
      }
    });
  };

  useEffect(() => {
    if (brightnessEnabled) {
      if (activePanel !== undefined) {
        // Per-panel mode: restore inactive side, apply to active side only
        restoreSide('left');
        restoreSide('right');
        applyBrightnessSide(activePanel, activePanel === 'left' ? 0.8 : 0.6);
      } else {
        // Both panels mode
        applyBrightnessSide('left', 0.8);
        applyBrightnessSide('right', 0.6);
      }
    } else {
      restoreSide('left');
      restoreSide('right');
    }
  }, [brightnessEnabled, brightness, meshRefs, activePanel]);
};
