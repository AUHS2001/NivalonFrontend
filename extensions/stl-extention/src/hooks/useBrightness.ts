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
  // Store original material properties (including shininess)
  const originalPropertiesRef = useRef<{
    left: Map<THREE.Mesh, { color: THREE.Color; emissive: THREE.Color; emissiveIntensity: number; shininess: number }>;
    right: Map<THREE.Mesh, { color: THREE.Color; emissive: THREE.Color; emissiveIntensity: number; shininess: number }>;
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
          emissiveIntensity: material.emissiveIntensity,
          shininess: material.shininess
        });
      }
    });

    meshRefs.current.right.forEach(mesh => {
      if (mesh.material && !originalPropertiesRef.current.right.has(mesh)) {
        const material = mesh.material as THREE.MeshPhongMaterial;
        originalPropertiesRef.current.right.set(mesh, {
          color: material.color.clone(),
          emissive: material.emissive.clone(),
          emissiveIntensity: material.emissiveIntensity,
          shininess: material.shininess
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
          material.shininess = original.shininess;
        }
        material.needsUpdate = true;
      }
    });
  };

  const applyBrightnessSide = (side: 'left' | 'right') => {
    // Normalize brightness: 0→-1, 100→0, 200→+1
    const normalized = (brightness - 100) / 100;

    meshRefs.current[side].forEach(mesh => {
      if (mesh.material) {
        const material = mesh.material as THREE.MeshPhongMaterial;
        const original = originalPropertiesRef.current[side].get(mesh);
        if (original) {
          if (normalized >= 0) {
            // Brightening (100–200): gentle boost up to 1.4x, clamped per channel
            const colorScale = 1 + normalized * 0.4;
            material.color.setRGB(
              Math.min(original.color.r * colorScale, 1.0),
              Math.min(original.color.g * colorScale, 1.0),
              Math.min(original.color.b * colorScale, 1.0)
            );

            // Emissive glow: self-illumination derived from original color (up to 0.35 strength)
            const emissiveStrength = normalized * 0.35;
            material.emissive.setRGB(
              original.color.r * emissiveStrength,
              original.color.g * emissiveStrength,
              original.color.b * emissiveStrength
            );
            material.emissiveIntensity = 1.0;

            // Shininess: increase up to +40 for specular highlights
            material.shininess = original.shininess + normalized * 40;
          } else {
            // Darkening (0–100): scale down to 0.15x minimum
            // normalized is -1..0, so darkFactor goes from 0.15 to 1.0
            const darkFactor = 0.15 + (1 + normalized) * 0.85;
            material.color.setRGB(
              original.color.r * darkFactor,
              original.color.g * darkFactor,
              original.color.b * darkFactor
            );

            // No emissive glow when darkening
            material.emissive.setRGB(0, 0, 0);
            material.emissiveIntensity = 0;

            // Reduce shininess for matte dark look
            material.shininess = original.shininess * (0.3 + (1 + normalized) * 0.7);
          }
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
        applyBrightnessSide(activePanel);
      } else {
        // Both panels mode
        applyBrightnessSide('left');
        applyBrightnessSide('right');
      }
    } else {
      restoreSide('left');
      restoreSide('right');
    }
  }, [brightnessEnabled, brightness, meshRefs, activePanel]);
};
