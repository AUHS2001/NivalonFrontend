import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { MeshRefs } from '../types/three.types';

interface UseBrightnessProps {
  brightnessEnabled: boolean;
  brightness: number;
  meshRefs: React.MutableRefObject<MeshRefs>;
}

export const useBrightness = ({
  brightnessEnabled,
  brightness,
  meshRefs
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
    // Store original properties for left view meshes
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

    // Store original properties for right view meshes
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

  useEffect(() => {
    if (brightnessEnabled) {
      // Apply brightness effect - increase base color while preserving original hues

      // Left view (white meshes)
      meshRefs.current.left.forEach(mesh => {
        if (mesh.material) {
          const material = mesh.material as THREE.MeshPhongMaterial;
          const original = originalPropertiesRef.current.left.get(mesh);

          if (original) {
            // For white meshes: brighten by increasing color intensity
            const brightenedColor = original.color.clone().multiplyScalar(1 + (brightness * 0.8));
            material.color = brightenedColor;
            // Keep original emissive properties
            material.emissive.copy(original.emissive);
            material.emissiveIntensity = original.emissiveIntensity;
          }
          material.needsUpdate = true;
        }
      });

      // Right view (colored meshes - preserves heart/aorta colors)
      meshRefs.current.right.forEach(mesh => {
        if (mesh.material) {
          const material = mesh.material as THREE.MeshPhongMaterial;
          const original = originalPropertiesRef.current.right.get(mesh);

          if (original) {
            // For colored meshes: brighten while preserving original color hues
            const brightenedColor = original.color.clone().multiplyScalar(1 + (brightness * 0.6));
            material.color = brightenedColor;
            // Keep original emissive properties
            material.emissive.copy(original.emissive);
            material.emissiveIntensity = original.emissiveIntensity;
          }
          material.needsUpdate = true;
        }
      });

    } else {
      // Disable brightness - restore ALL original properties exactly

      // Left view - restore original properties
      meshRefs.current.left.forEach(mesh => {
        if (mesh.material) {
          const material = mesh.material as THREE.MeshPhongMaterial;
          const original = originalPropertiesRef.current.left.get(mesh);

          if (original) {
            material.color.copy(original.color);
            material.emissive.copy(original.emissive);
            material.emissiveIntensity = original.emissiveIntensity;
          }
          material.needsUpdate = true;
        }
      });

      // Right view - restore original properties (heart/aorta colors preserved)
      meshRefs.current.right.forEach(mesh => {
        if (mesh.material) {
          const material = mesh.material as THREE.MeshPhongMaterial;
          const original = originalPropertiesRef.current.right.get(mesh);

          if (original) {
            material.color.copy(original.color);
            material.emissive.copy(original.emissive);
            material.emissiveIntensity = original.emissiveIntensity;
          }
          material.needsUpdate = true;
        }
      });
    }
  }, [brightnessEnabled, brightness, meshRefs]);
};
