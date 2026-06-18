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
    if (stlFiles.length === 0) return;

    // Build a visibility map keyed by fileName for fast lookup
    const visibilityMap = new Map<string, boolean>();
    stlFiles.forEach(file => {
      visibilityMap.set(file.fileName, file.isVisible);
    });

    // Update left view meshes by matching fileName from userData
    meshRefs.current.left.forEach(mesh => {
      const fileName = mesh.userData?.fileName;
      if (fileName && visibilityMap.has(fileName)) {
        mesh.visible = visibilityMap.get(fileName)!;
      }
    });

    // Update right view meshes by matching fileName from userData
    meshRefs.current.right.forEach(mesh => {
      const fileName = mesh.userData?.fileName;
      if (fileName && visibilityMap.has(fileName)) {
        mesh.visible = visibilityMap.get(fileName)!;
      }
    });
  }, [stlFiles, meshRefs]);
};
