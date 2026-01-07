import { STLExporter } from 'three/examples/jsm/exporters/STLExporter';
import * as THREE from 'three';

export const downloadEditedSTLs = async (
  meshRefs: React.MutableRefObject<{ left: THREE.Mesh[] }>,
  setIsDownloading: (downloading: boolean) => void
) => {
  try {
    // Check for File System Access API support
    if (!window.showDirectoryPicker) {
      throw new Error("File System Access API not supported in this browser");
    }

    const exporter = new STLExporter();
    setIsDownloading(true);

    // Let user select a directory
    const directoryHandle = await window.showDirectoryPicker({
      startIn: 'downloads',
      mode: 'readwrite'
    });

    // Process each mesh
    for (let [idx, mesh] of meshRefs.current.left.entries()) {
      if (!mesh.visible) continue;

      const geom = mesh.geometry.clone();
      const stlData = exporter.parse(
        new THREE.Mesh(geom, mesh.material),
        { binary: true }
      );

      const fileName = mesh.userData?.fileName || `segment_${idx}.stl`;
      console.log("Exporting mesh:", fileName);

      // Create file in the selected directory
      const fileHandle = await directoryHandle.getFileHandle(fileName, { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(stlData);
      await writable.close();
    }

    setIsDownloading(false);
    alert('All files saved successfully!');
  } catch (error) {
    console.error("Error saving files:", error);
    setIsDownloading(false);

    // Fallback to original method if API fails
    if ((error as Error).message.includes("not supported") || (error as Error).message.includes("aborted")) {
      alert("Folder selection not supported. Falling back to individual downloads.");
      fallbackDownload(meshRefs, setIsDownloading);
    }
  }
};

export const fallbackDownload = (
  meshRefs: React.MutableRefObject<{ left: THREE.Mesh[] }>,
  setIsDownloading: (downloading: boolean) => void
) => {
  const exporter = new STLExporter();
  setIsDownloading(true);

  meshRefs.current.left.forEach((mesh, idx) => {
    setTimeout(() => {
      if (!mesh.visible) return;

      const geom = mesh.geometry.clone();
      const stlData = exporter.parse(
        new THREE.Mesh(geom, mesh.material),
        { binary: true }
      );

      const fileName = mesh.userData?.fileName || `segment_${idx}.stl`;
      const blob = new Blob([stlData], { type: 'application/octet-stream' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      URL.revokeObjectURL(url);
      document.body.removeChild(a);
    }, idx * 300);
  });
  setTimeout(() => setIsDownloading(false), 1000);
};

export const handleScreenshot = (
  renderer: THREE.WebGLRenderer | undefined,
  scene: THREE.Scene | undefined,
  camera: THREE.Camera | undefined
) => {
  if (!renderer || !scene || !camera) return;

  try {
    renderer.render(scene, camera);

    const sourceCanvas = renderer.domElement;
    const width = sourceCanvas.width;
    const height = sourceCanvas.height;

    if (width === 0 || height === 0) {
      console.error("Renderer canvas has zero width or height");
      return;
    }

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(sourceCanvas, 0, 0, width, height);

    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'spinalcord_left_view.png';
      link.click();
      URL.revokeObjectURL(url);
    }, 'image/png');

  } catch (error) {
    console.error("Error capturing screenshot:", error);
  }
};
