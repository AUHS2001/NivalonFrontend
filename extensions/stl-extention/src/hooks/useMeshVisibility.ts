import { useEffect } from 'react';
import { useStlVisibilityContext } from '../context/StlVisibilityContext';
import { MeshRefs } from '../types/three.types';
import * as THREE from 'three';

interface UseMeshVisibilityProps {
  meshRefs: React.MutableRefObject<MeshRefs>;
  startMeshRefs: React.MutableRefObject<THREE.Mesh[]>;
}

export const useMeshVisibility = ({
  meshRefs,
  startMeshRefs
}: UseMeshVisibilityProps) => {
  const { stlFiles } = useStlVisibilityContext();

  useEffect(() => {
    console.log('🔄 Updating mesh visibility for', stlFiles.length, 'files');

    stlFiles.forEach((file, index) => {
      console.log(`👁️ File ${file.fileName}: visible = ${file.isVisible}, meshIndex = ${file.meshIndex}`);

      // Use meshIndex if available, otherwise fall back to array index
      const meshIndex = file.meshIndex !== undefined ? file.meshIndex : index;

      // Update left view meshes
      if (meshRefs.current.left[meshIndex]) {
        meshRefs.current.left[meshIndex].visible = file.isVisible;
        console.log(`✅ Updated left mesh ${meshIndex} visibility to: ${file.isVisible}`);
      }

      // Update right view meshes
      if (meshRefs.current.right[meshIndex]) {
        meshRefs.current.right[meshIndex].visible = file.isVisible;
        console.log(`✅ Updated right mesh ${meshIndex} visibility to: ${file.isVisible}`);
      }

      // Update start view meshes
      if (startMeshRefs.current[meshIndex]) {
        startMeshRefs.current[meshIndex].visible = file.isVisible;
        console.log(`✅ Updated start mesh ${meshIndex} visibility to: ${file.isVisible}`);
      }
    });

    // Force re-render of all scenes
    if (meshRefs.current.left.length > 0) {
      console.log('🔄 Visibility update complete');
    }
  }, [stlFiles, meshRefs, startMeshRefs]);
};
