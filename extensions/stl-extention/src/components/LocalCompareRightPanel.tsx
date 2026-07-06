import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader';
import { LPS_UP } from '../utils/coordinateSystem';
import { useStlVisibilityContext } from '../context/StlVisibilityContext';

function setupLighting(scene: THREE.Scene) {
  scene.add(new THREE.AmbientLight(0xffffff, 0.4));
  const keyLight = new THREE.DirectionalLight(0xffffff, 0.5);
  keyLight.position.set(1, 1, 1).normalize();
  keyLight.castShadow = false;
  scene.add(keyLight);
  const fillLight = new THREE.DirectionalLight(0xffffff, 0.25);
  fillLight.position.set(-1, 0.5, -0.5).normalize();
  scene.add(fillLight);
  const backLight = new THREE.DirectionalLight(0xffffff, 0.15);
  backLight.position.set(0, 0, -1).normalize();
  scene.add(backLight);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 0.2));
}

function getVertebraInfo(fileName: string, url: string) {
  const isImplant = url.startsWith('blob:') || fileName.includes('blob:') || fileName === 'implant.stl';
  if (isImplant) return { type: 'I', number: 0, fullName: 'IMPLANT', fileName: 'implant.stl' };
  const nameNoExt = fileName.replace('.stl', '').toLowerCase();
  const match = fileName.match(/(C|T|L|S)(\d+)/i);
  if (match) return { type: match[1].toUpperCase(), number: parseInt(match[2]), fullName: match[0].toUpperCase(), fileName };
  if (nameNoExt.includes('aorta') || nameNoExt.includes('aortic') || nameNoExt === 'a')
    return { type: 'A', number: 0, fullName: 'AORTA', fileName };
  if (nameNoExt.includes('heart') || nameNoExt.includes('cardiac') || nameNoExt === 'h')
    return { type: 'H', number: 0, fullName: 'HEART', fileName };
  return { type: 'X', number: 0, fullName: fileName.replace('.stl', '').toUpperCase(), fileName };
}

function createMaterial(organType: string) {
  if (organType === 'I') {
    return new THREE.MeshPhongMaterial({
      color: 0x85CFF9, specular: 0x444444, shininess: 60, side: THREE.DoubleSide,
      transparent: true, opacity: 0.95,
      emissive: new THREE.Color(0x85CFF9), emissiveIntensity: 0.08,
    });
  }
  if (organType === 'A')
    return new THREE.MeshPhongMaterial({ color: 0x3498db, specular: 0x111111, shininess: 10, side: THREE.DoubleSide });
  if (organType === 'H')
    return new THREE.MeshPhongMaterial({ color: 0xe74c3c, specular: 0x111111, shininess: 10, side: THREE.DoubleSide });
  return new THREE.MeshPhongMaterial({ color: 0xffffff, specular: 0x111111, shininess: 10, side: THREE.DoubleSide });
}

function positionCameraForGroup(camera: THREE.PerspectiveCamera, controls: OrbitControls, group: THREE.Group) {
  if (group.children.length === 0) return;
  const bbox = new THREE.Box3().setFromObject(group);
  const center = bbox.getCenter(new THREE.Vector3());
  const size = bbox.getSize(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z);
  const fov = camera.fov * (Math.PI / 180);
  const fitDist = maxDim / (2 * Math.tan(fov / 2));
  controls.target.copy(center);
  camera.position.set(center.x, center.y - fitDist, center.z);
  camera.up.copy(LPS_UP);
  camera.lookAt(center);
  camera.updateProjectionMatrix();
  controls.update();
}

const LocalCompareRightPanel: React.FC = () => {
  const { compareRightFiles, setCompareRightFiles } = useStlVisibilityContext();

  const mountRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene>(new THREE.Scene());
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const groupRef = useRef<THREE.Group>(new THREE.Group());
  const animationIdRef = useRef<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [hasModel, setHasModel] = useState(false);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const scene = sceneRef.current;
    scene.background = new THREE.Color(0x000000);

    const camera = new THREE.PerspectiveCamera(45, mount.clientWidth / mount.clientHeight, 0.1, 10000);
    camera.up.copy(LPS_UP);
    camera.position.set(0, -500, 100);
    camera.lookAt(0, 0, 0);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(mount.clientWidth, mount.clientHeight, false);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    renderer.domElement.style.display = 'block';
    mount.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.25;
    controls.maxDistance = 5000;
    controls.enableRotate = true;
    controls.rotateSpeed = 1.0;
    controls.enableZoom = true;
    controls.zoomSpeed = 1.2;
    controls.enablePan = true;
    controls.panSpeed = 0.8;
    controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
    controlsRef.current = controls;

    setupLighting(scene);
    scene.add(groupRef.current);

    const animate = () => {
      animationIdRef.current = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    const handleResize = () => {
      const w = mount.clientWidth;
      const h = mount.clientHeight;
      if (w > 0 && h > 0) {
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h, false);
      }
    };
    window.addEventListener('resize', handleResize);
    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(mount);

    return () => {
      if (animationIdRef.current) cancelAnimationFrame(animationIdRef.current);
      window.removeEventListener('resize', handleResize);
      resizeObserver.disconnect();
      if (mount.contains(renderer.domElement)) mount.removeChild(renderer.domElement);
      renderer.dispose();
      controls.dispose();
      setCompareRightFiles([]);
    };
  }, []);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setLoading(true);
    setProgress(0);

    const loader = new STLLoader();
    const group = groupRef.current;
    group.clear();

    let filesLoaded = 0;
    const totalFiles = files.length;
    const loadedFileNames: string[] = [];

    Array.from(files).forEach((file) => {
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const geometry = loader.parse(reader.result as ArrayBuffer);
          geometry.computeBoundingBox();
          const info = getVertebraInfo(file.name, file.name);
          const material = createMaterial(info.type);
          const mesh = new THREE.Mesh(geometry, material);
          mesh.userData = info;
          group.add(mesh);
          loadedFileNames.push(file.name);
        } catch (err) {
          console.error('Error loading local STL:', file.name, err);
        }

        filesLoaded++;
        setProgress(Math.round((filesLoaded / totalFiles) * 100));
        if (filesLoaded === totalFiles) {
          if (cameraRef.current && controlsRef.current && group.children.length > 0) {
            positionCameraForGroup(cameraRef.current, controlsRef.current, group);
          }
          setHasModel(true);
          setLoading(false);
          setCompareRightFiles(loadedFileNames.map(fn => ({
            id: `cmp-${fn}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            fileName: fn,
            isVisible: true,
            originalUrl: '',
          })));
        }
      };
      reader.readAsArrayBuffer(file);
    });

    e.target.value = '';
  }, [setCompareRightFiles]);

  // Sync visibility
  useEffect(() => {
    if (compareRightFiles.length === 0) return;
    const visibilityMap = new Map<string, boolean>();
    compareRightFiles.forEach(file => visibilityMap.set(file.fileName, file.isVisible));
    groupRef.current.children.forEach(child => {
      if (child instanceof THREE.Mesh) {
        const fileName = child.userData?.fileName;
        if (fileName && visibilityMap.has(fileName)) {
          child.visible = visibilityMap.get(fileName)!;
        }
      }
    });
  }, [compareRightFiles]);

  return (
    <div style={{ flex: 1, position: 'relative', height: '100%' }}>
      <div style={{
        position: 'absolute', top: 0, left: 10, color: '#ffffff', zIndex: 100,
        backgroundColor: '#0a0e17', padding: '4px 8px', borderRadius: '4px',
        fontSize: '12px', marginTop: '12px',
      }}>
        Compare Panel
      </div>

      {loading && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 30,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          backgroundColor: 'rgba(0, 0, 0, 0.88)',
        }}>
          <div style={{
            width: '56px', height: '56px',
            border: '4px solid rgba(255,255,255,0.1)',
            borderTop: '4px solid #4FC3F7',
            borderRadius: '50%',
            animation: 'stl-spin 0.8s linear infinite',
          }} />
          <div style={{ color: '#fff', marginTop: '20px', fontSize: '16px', fontWeight: 600 }}>Loading 3D Model</div>
          <div style={{ color: '#4FC3F7', marginTop: '8px', fontSize: '28px', fontWeight: 700 }}>{progress}%</div>
          <div style={{
            width: '220px', height: '6px',
            backgroundColor: 'rgba(255,255,255,0.1)',
            borderRadius: '3px', marginTop: '12px', overflow: 'hidden',
          }}>
            <div style={{
              width: `${progress}%`, height: '100%',
              backgroundColor: '#4FC3F7', borderRadius: '3px',
              transition: 'width 0.3s ease',
            }} />
          </div>
          <div style={{ color: '#888', marginTop: '10px', fontSize: '12px' }}>Please wait while the model loads</div>
          <style>{`@keyframes stl-spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      )}

      {!hasModel && !loading && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 50,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          pointerEvents: 'none',
        }}>
          <div style={{
            color: '#667', fontSize: '16px', textAlign: 'center',
            padding: '20px', pointerEvents: 'auto',
          }}>
            <div style={{ marginBottom: '16px', fontSize: '36px', opacity: 0.4 }}>+</div>
            <div style={{ marginBottom: '12px' }}>Drop files or browse</div>
            <div style={{ marginBottom: '16px', fontSize: '12px', opacity: 0.6 }}>or</div>
            <button
              onClick={() => fileInputRef.current?.click()}
              style={{
                padding: '8px 20px', borderRadius: '6px', border: '1px solid #334',
                backgroundColor: '#1a1f2e', color: '#aab', cursor: 'pointer',
                fontSize: '13px', fontWeight: 500,
              }}
            >
              Browse STL Files
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".stl"
              multiple
              onChange={handleFileSelect}
              style={{ display: 'none' }}
            />
          </div>
        </div>
      )}

      {hasModel && (
        <>
          <button
            onClick={() => fileInputRef.current?.click()}
            style={{
              position: 'absolute', top: 10, right: 10, zIndex: 100,
              padding: '6px 14px', borderRadius: '4px', border: '1px solid #334',
              backgroundColor: '#1a1f2e', color: '#aab', cursor: 'pointer',
              fontSize: '11px', fontWeight: 500,
            }}
          >
            Browse STL
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".stl"
            multiple
            onChange={handleFileSelect}
            style={{ display: 'none' }}
          />
        </>
      )}

      <div ref={mountRef} style={{ width: '100%', height: '100%', overflow: 'hidden' }} />
    </div>
  );
};

export default LocalCompareRightPanel;
