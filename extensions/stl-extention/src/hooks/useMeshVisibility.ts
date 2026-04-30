import { useEffect } from 'react';
import { useStlVisibilityContext } from '../context/StlVisibilityContext';
import { MeshRefs } from '../types/three.types';

interface UseMeshVisibilityProps {
  meshRefs: React.MutableRefObject<MeshRefs>;
}

export const useMeshVisibility = ({
  meshRefs
}: UseMeshVisibilityProps) => {
  const { stlFiles } = useStlVisibilityContext();

  useEffect(() => {
    stlFiles.forEach((file, index) => {
      // Use meshIndex if available, otherwise fall back to array index
      const meshIndex = file.meshIndex !== undefined ? file.meshIndex : index;

      // Update left view meshes
      if (meshRefs.current.left[meshIndex]) {
        meshRefs.current.left[meshIndex].visible = file.isVisible;
      }

      // Update right view meshes
      if (meshRefs.current.right[meshIndex]) {
        meshRefs.current.right[meshIndex].visible = file.isVisible;
      }
    });
  }, [stlFiles, meshRefs]);
};
