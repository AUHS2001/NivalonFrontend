import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader';
import { useDrop } from 'react-dnd';
import { LPS_UP } from '../utils/coordinateSystem';
import { useStlVisibilityContext } from '../context/StlVisibilityContext';
import { useThreeDToolsBridge, ToolDef } from '../context/ThreeDToolsBridgeContext';
import { handleScreenshot as handleScreenshotUtil } from '../utils/fileHandlers';

interface LocalThreeDCompareViewerProps {
  servicesManager: any;
  commandsManager: any;
}

// ─── Lighting: exactly matches SingleSpinalCord.setupLighting ───
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

// ─── Vertebra identification ───
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
  if (nameNoExt === 'ao' || nameNoExt === 'arc' || nameNoExt.includes('vessel'))
    return { type: 'A', number: 0, fullName: 'AORTA', fileName };
  if (nameNoExt === 'ht' || nameNoExt === 'cor' || nameNoExt.includes('cardio'))
    return { type: 'H', number: 0, fullName: 'HEART', fileName };

  return { type: 'X', number: 0, fullName: fileName.replace('.stl', '').toUpperCase(), fileName };
}

// ─── Material ───
function createLeftMaterial(organType: string) {
  if (organType === 'I') {
    return new THREE.MeshPhongMaterial({
      color: 0x85CFF9, specular: 0x444444, shininess: 60, side: THREE.DoubleSide,
      transparent: true, opacity: 0.95,
      emissive: new THREE.Color(0x85CFF9), emissiveIntensity: 0.08,
    });
  }
  if (organType === 'A') {
    return new THREE.MeshPhongMaterial({ color: 0x3498db, specular: 0x111111, shininess: 10, side: THREE.DoubleSide });
  }
  if (organType === 'H') {
    return new THREE.MeshPhongMaterial({ color: 0xe74c3c, specular: 0x111111, shininess: 10, side: THREE.DoubleSide });
  }
  return new THREE.MeshPhongMaterial({ color: 0xffffff, specular: 0x111111, shininess: 10, side: THREE.DoubleSide });
}

// ─── Position camera ───
function positionCameraForGroup(
  camera: THREE.PerspectiveCamera,
  controls: OrbitControls,
  group: THREE.Group
) {
  if (group.children.length === 0) return;

  const bbox = new THREE.Box3().setFromObject(group);
  const center = bbox.getCenter(new THREE.Vector3());
  const size = bbox.getSize(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z);

  const fov = camera.fov * (Math.PI / 180);
  const fitDist = maxDim / (2 * Math.tan(fov / 2));
  const camDist = fitDist * 1.0;

  controls.target.copy(center);
  camera.position.set(center.x, center.y - camDist, center.z);
  camera.up.copy(LPS_UP);
  camera.lookAt(center);
  camera.updateProjectionMatrix();
  controls.update();
}

// ─── Main component ───
const LocalThreeDCompareViewer: React.FC<LocalThreeDCompareViewerProps> = ({
  servicesManager,
  commandsManager,
}) => {
  const {
    compareLeftFiles, setCompareLeftFiles,
    compareRightFiles, setCompareRightFiles,
  } = useStlVisibilityContext();
  const { registerTools } = useThreeDToolsBridge();

  // Mount refs
  const leftMountRef = useRef<HTMLDivElement>(null);
  const rightMountRef = useRef<HTMLDivElement>(null);

  // Three.js refs — left
  const leftRendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const leftSceneRef = useRef<THREE.Scene>(new THREE.Scene());
  const leftCameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const leftControlsRef = useRef<OrbitControls | null>(null);
  const leftGroupRef = useRef<THREE.Group>(new THREE.Group());

  // Three.js refs — right
  const rightRendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const rightSceneRef = useRef<THREE.Scene>(new THREE.Scene());
  const rightCameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rightControlsRef = useRef<OrbitControls | null>(null);
  const rightGroupRef = useRef<THREE.Group>(new THREE.Group());

  const animationIdRef = useRef<number | null>(null);
  const leftFileInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // State
  const [leftLoading, setLeftLoading] = useState(false);
  const [leftProgress, setLeftProgress] = useState(0);
  const [leftLabel, setLeftLabel] = useState('');
  const [leftHasModel, setLeftHasModel] = useState(false);
  const [rightLoading, setRightLoading] = useState(false);
  const [rightProgress, setRightProgress] = useState(0);
  const [rightLabel, setRightLabel] = useState('');
  const [rightHasModel, setRightHasModel] = useState(false);

  // ─── Three.js setup ───
  useEffect(() => {
    const leftMount = leftMountRef.current;
    const rightMount = rightMountRef.current;
    if (!leftMount || !rightMount) return;

    const leftScene = leftSceneRef.current;
    const rightScene = rightSceneRef.current;

    leftScene.background = new THREE.Color(0x000000);
    rightScene.background = new THREE.Color(0x000000);

    const leftCamera = new THREE.PerspectiveCamera(
      45, leftMount.clientWidth / leftMount.clientHeight, 0.1, 10000
    );
    leftCamera.up.copy(LPS_UP);
    leftCamera.position.set(0, -500, 100);
    leftCamera.lookAt(0, 0, 0);
    leftCameraRef.current = leftCamera;

    const rightCamera = new THREE.PerspectiveCamera(
      45, rightMount.clientWidth / rightMount.clientHeight, 0.1, 10000
    );
    rightCamera.up.copy(LPS_UP);
    rightCamera.position.set(0, -500, 100);
    rightCamera.lookAt(0, 0, 0);
    rightCameraRef.current = rightCamera;

    const leftRenderer = new THREE.WebGLRenderer({ antialias: true });
    leftRenderer.setSize(leftMount.clientWidth, leftMount.clientHeight, false);
    leftRenderer.setPixelRatio(window.devicePixelRatio);
    leftRenderer.domElement.style.width = '100%';
    leftRenderer.domElement.style.height = '100%';
    leftRenderer.domElement.style.display = 'block';
    leftMount.appendChild(leftRenderer.domElement);
    leftRendererRef.current = leftRenderer;

    const rightRenderer = new THREE.WebGLRenderer({ antialias: true });
    rightRenderer.setSize(rightMount.clientWidth, rightMount.clientHeight, false);
    rightRenderer.setPixelRatio(window.devicePixelRatio);
    rightRenderer.domElement.style.width = '100%';
    rightRenderer.domElement.style.height = '100%';
    rightRenderer.domElement.style.display = 'block';
    rightMount.appendChild(rightRenderer.domElement);
    rightRendererRef.current = rightRenderer;

    const leftControls = new OrbitControls(leftCamera, leftRenderer.domElement);
    const rightControls = new OrbitControls(rightCamera, rightRenderer.domElement);

    [leftControls, rightControls].forEach(ctrl => {
      ctrl.enableDamping = true;
      ctrl.dampingFactor = 0.25;
      ctrl.maxDistance = 5000;
      ctrl.enableRotate = true;
      ctrl.rotateSpeed = 1.0;
      ctrl.enableZoom = true;
      ctrl.zoomSpeed = 1.2;
      ctrl.enablePan = true;
      ctrl.panSpeed = 0.8;
      ctrl.mouseButtons = {
        LEFT: THREE.MOUSE.ROTATE,
        MIDDLE: THREE.MOUSE.DOLLY,
        RIGHT: THREE.MOUSE.PAN,
      };
    });

    leftControlsRef.current = leftControls;
    rightControlsRef.current = rightControls;

    setupLighting(leftScene);
    setupLighting(rightScene);

    leftScene.add(leftGroupRef.current);
    rightScene.add(rightGroupRef.current);

    const animate = () => {
      animationIdRef.current = requestAnimationFrame(animate);
      leftControls.update();
      leftRenderer.render(leftScene, leftCamera);
      rightControls.update();
      rightRenderer.render(rightScene, rightCamera);
    };
    animate();

    const handleResize = () => {
      const lw = leftMount.clientWidth;
      const lh = leftMount.clientHeight;
      if (lw > 0 && lh > 0) {
        leftCamera.aspect = lw / lh;
        leftCamera.updateProjectionMatrix();
        leftRenderer.setSize(lw, lh, false);
      }
      const rw = rightMount.clientWidth;
      const rh = rightMount.clientHeight;
      if (rw > 0 && rh > 0) {
        rightCamera.aspect = rw / rh;
        rightCamera.updateProjectionMatrix();
        rightRenderer.setSize(rw, rh, false);
      }
    };

    window.addEventListener('resize', handleResize);
    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(leftMount);
    resizeObserver.observe(rightMount);

    return () => {
      if (animationIdRef.current) cancelAnimationFrame(animationIdRef.current);
      window.removeEventListener('resize', handleResize);
      resizeObserver.disconnect();
      if (leftMount.contains(leftRenderer.domElement)) leftMount.removeChild(leftRenderer.domElement);
      if (rightMount.contains(rightRenderer.domElement)) rightMount.removeChild(rightRenderer.domElement);
      leftRenderer.dispose();
      rightRenderer.dispose();
      leftControls.dispose();
      rightControls.dispose();
      setCompareLeftFiles([]);
      setCompareRightFiles([]);
    };
  }, []);

  // ─── LEFT PANEL: load from local files ───
  const handleLeftFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setLeftLoading(true);
    setLeftProgress(0);
    setLeftLabel('Local STL');

    const loader = new STLLoader();
    const group = leftGroupRef.current;
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
          const material = createLeftMaterial(info.type);
          const mesh = new THREE.Mesh(geometry, material);
          mesh.userData = info;
          group.add(mesh);
          loadedFileNames.push(file.name);
        } catch (err) {
          console.error('Error loading local STL:', file.name, err);
        }

        filesLoaded++;
        setLeftProgress(Math.round((filesLoaded / totalFiles) * 100));
        if (filesLoaded === totalFiles) {
          if (leftCameraRef.current && leftControlsRef.current && group.children.length > 0) {
            positionCameraForGroup(leftCameraRef.current, leftControlsRef.current, group);
          }
          setLeftHasModel(true);
          setLeftLoading(false);
          setCompareLeftFiles(loadedFileNames.map(fn => ({
            id: `cmp-left-${fn}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            fileName: fn,
            isVisible: true,
            originalUrl: '',
          })));
        }
      };
      reader.readAsArrayBuffer(file);
    });

    e.target.value = '';
  }, [setCompareLeftFiles]);

  // ─── RIGHT PANEL: load from local files ───
  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setRightLoading(true);
    setRightProgress(0);
    setRightLabel('Local STL');

    const loader = new STLLoader();
    const group = rightGroupRef.current;
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
          const material = createLeftMaterial(info.type);
          const mesh = new THREE.Mesh(geometry, material);
          mesh.userData = info;
          group.add(mesh);
          loadedFileNames.push(file.name);
        } catch (err) {
          console.error('Error loading local STL:', file.name, err);
        }

        filesLoaded++;
        setRightProgress(Math.round((filesLoaded / totalFiles) * 100));
        if (filesLoaded === totalFiles) {
          if (rightCameraRef.current && rightControlsRef.current && group.children.length > 0) {
            positionCameraForGroup(rightCameraRef.current, rightControlsRef.current, group);
          }
          setRightHasModel(true);
          setRightLoading(false);
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

  // ─── Sync visibility from context to left panel meshes ───
  useEffect(() => {
    if (compareLeftFiles.length === 0) return;

    const visibilityMap = new Map<string, boolean>();
    compareLeftFiles.forEach(file => {
      visibilityMap.set(file.fileName, file.isVisible);
    });

    leftGroupRef.current.children.forEach(child => {
      if (child instanceof THREE.Mesh) {
        const fileName = child.userData?.fileName;
        if (fileName && visibilityMap.has(fileName)) {
          child.visible = visibilityMap.get(fileName)!;
        }
      }
    });
  }, [compareLeftFiles]);

  // ─── Sync visibility from context to right panel meshes ───
  useEffect(() => {
    if (compareRightFiles.length === 0) return;

    const visibilityMap = new Map<string, boolean>();
    compareRightFiles.forEach(file => {
      visibilityMap.set(file.fileName, file.isVisible);
    });

    rightGroupRef.current.children.forEach(child => {
      if (child instanceof THREE.Mesh) {
        const fileName = child.userData?.fileName;
        if (fileName && visibilityMap.has(fileName)) {
          child.visible = visibilityMap.get(fileName)!;
        }
      }
    });
  }, [compareRightFiles]);

  // ─── LEFT PANEL: drag-and-drop local files ───
  const [{ isOver: isOverLeft }, leftDropRef] = useDrop({
    accept: 'displayset',
    drop: () => ({ handled3dCompare: true }),
    collect: monitor => ({ isOver: monitor.isOver() }),
  });

  // ─── RIGHT PANEL: drag-and-drop local files ───
  const [{ isOver }, dropRef] = useDrop({
    accept: 'displayset',
    drop: () => ({ handled3dCompare: true }),
    collect: monitor => ({ isOver: monitor.isOver() }),
  });

  // ─── Tool callbacks ───
  const toolCallbacksRef = useRef<Record<string, () => void>>({});

  toolCallbacksRef.current = {
    fileSelect: () => leftFileInputRef.current?.click(),
    screenshot: () => handleScreenshotUtil(leftRendererRef.current, leftSceneRef.current, leftCameraRef.current),
    download: () => {},
    boneRemoval: () => {},
    linking: () => {},
    alignment: () => {},
    brightness: () => {},
    measurement: () => {},
    angle: () => {},
    horizontal: () => {},
    vertical: () => {},
    longitudinal: () => {},
    rotation: () => {},
    implantMove: () => {},
    interactiveRotation: () => {},
    smooth: () => {},
    wrap: () => {},
    merge: () => {},
    clickRemoval: () => {},
    labelView: () => {},
    spineLabeling: () => {},
    colorMode: () => {},
    approve: () => {},
    versionHistory: () => {},
    implant: () => {},
    undo: () => {},
  };

  const makeOnClick = useCallback((id: string) => () => toolCallbacksRef.current[id]?.(), []);

  // ─── Register tools into bridge context for top bar dropdown ───
  useEffect(() => {
    const noop = makeOnClick;
    const toolDefs: ToolDef[] = [
      { id: 'fileSelect', label: 'File Select', icon: 'fa-folder-open', active: false, onClick: noop('fileSelect'), hidden: true },
      { id: 'file', label: 'File', icon: 'fa-folder', active: false, onClick: () => {}, children: [
        { id: 'upload', label: 'Upload', icon: 'fa-upload', active: false, onClick: noop('upload'), hidden: !JSON.parse(localStorage.getItem('userPermissions') || '[]').includes('case:approve') },
        { id: 'approve', label: 'Approve', icon: 'fa-check', active: false, onClick: noop('approve'), hidden: !JSON.parse(localStorage.getItem('userPermissions') || '[]').includes('case:approve') },
        { id: 'implant', label: 'Implant', icon: 'fa-plus-square', active: false, onClick: noop('implant') },
        { id: 'download', label: 'Download', icon: 'fa-download', active: false, onClick: noop('download') },
        { id: 'screenshot', label: 'Screenshot', icon: 'fa-camera', active: false, onClick: noop('screenshot') },
        { id: 'versionHistory', label: 'Version History', icon: 'fa-history', active: false, onClick: noop('versionHistory') },
      ]},
      { id: 'removing', label: 'Removing', icon: 'fa-eraser', active: false, onClick: () => {}, children: [
        { id: 'boneRemoval', label: 'Bone Removal', icon: 'fa-cut', active: false, danger: true, onClick: noop('boneRemoval') },
        { id: 'clickRemoval', label: 'Click Removal', icon: 'fa-trash', active: false, danger: true, onClick: noop('clickRemoval') },
      ]},
      { id: 'movements', label: 'Movements', icon: 'fa-arrows-alt', active: false, onClick: () => {}, children: [
        { id: 'horizontal', label: 'Horizontal', icon: 'fa-arrows-alt-h', active: false, onClick: noop('horizontal') },
        { id: 'vertical', label: 'Vertical', icon: 'fa-arrows-alt-v', active: false, onClick: noop('vertical') },
        { id: 'longitudinal', label: 'Longitudinal', icon: 'fa-expand-arrows-alt', active: false, onClick: noop('longitudinal') },
        { id: 'interactiveRotation', label: 'Interactive Rotation', icon: 'fa-cube', active: false, onClick: noop('interactiveRotation') },
        { id: 'implantMove', label: 'Implant Move', icon: 'fa-hand-rock', active: false, onClick: noop('implantMove') },
      ]},
      { id: 'calculations', label: 'Calculations', icon: 'fa-calculator', active: false, onClick: () => {}, children: [
        { id: 'measurement', label: 'Measurement', icon: 'fa-ruler', active: false, onClick: noop('measurement') },
        { id: 'angle', label: 'Angle', icon: 'fa-angle-double-right', active: false, onClick: noop('angle') },
      ]},
      { id: 'smoothing', label: 'Smoothing', icon: 'fa-wave-square', active: false, onClick: () => {}, children: [
        { id: 'smooth', label: 'Smooth', icon: 'fa-bezier-curve', active: false, onClick: noop('smooth') },
        { id: 'wrap', label: 'Wrap', icon: 'fa-border-all', active: false, onClick: noop('wrap') },
      ]},
      { id: 'labeling', label: 'Labeling', icon: 'fa-tags', active: false, onClick: () => {}, children: [
        { id: 'labelView', label: 'Label View', icon: 'fa-columns', active: false, onClick: noop('labelView') },
        { id: 'spineLabeling', label: 'Spine Labeling', icon: 'fa-tag', active: false, onClick: noop('spineLabeling') },
        { id: 'colorMode', label: 'Color Mode', icon: 'fa-palette', active: false, onClick: noop('colorMode') },
        { id: 'brightness', label: 'Brightness', icon: 'fa-sun', active: false, onClick: noop('brightness') },
      ]},
      { id: 'connections', label: 'Connections', icon: 'fa-project-diagram', active: false, onClick: () => {}, children: [
        { id: 'linking', label: 'Linking', icon: 'fa-link', active: false, onClick: noop('linking') },
        { id: 'alignment', label: 'Alignment', icon: 'fa-route', active: false, onClick: noop('alignment') },
        { id: 'merge', label: 'Merge', icon: 'fa-object-group', active: false, onClick: noop('merge') },
      ]},
      { id: 'rotation', label: 'Rotation', icon: 'fa-sync-alt', active: false, onClick: noop('rotation'), hidden: true },
      { id: 'undo', label: 'Undo', icon: 'fa-undo-alt', active: false, disabled: true, onClick: noop('undo'), hidden: true },
    ];
    registerTools(toolDefs);
  }, [registerTools, makeOnClick]);

  // Clear tools on unmount
  useEffect(() => {
    return () => registerTools([]);
  }, [registerTools]);

  return (
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'row',
      width: '100%', height: '100%',
      backgroundColor: '#0a0e17', position: 'relative',
    }}>
      {/* ─── Left Panel ─── */}
      <div
        ref={leftDropRef}
        style={{
          flex: 1, position: 'relative', borderRight: '2px solid #ffffff',
          outline: isOverLeft ? '2px dashed #00ffff' : 'none',
        }}
      >
        <div style={{
          position: 'absolute', top: 0, left: 10, color: '#fff', zIndex: 100,
          backgroundColor: '#0a0e17', padding: '4px 8px', borderRadius: '4px',
          fontSize: '12px', marginTop: '12px',
        }}>
          {leftLabel ? `Left Panel: ${leftLabel}` : 'Left Panel'}
        </div>

        {leftLoading && (
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
            <div style={{ color: '#fff', marginTop: '20px', fontSize: '16px', fontWeight: 600 }}>
              Loading 3D Model
            </div>
            <div style={{ color: '#4FC3F7', marginTop: '8px', fontSize: '28px', fontWeight: 700 }}>
              {leftProgress}%
            </div>
            <div style={{
              width: '220px', height: '6px',
              backgroundColor: 'rgba(255,255,255,0.1)',
              borderRadius: '3px', marginTop: '12px', overflow: 'hidden',
            }}>
              <div style={{
                width: `${leftProgress}%`, height: '100%',
                backgroundColor: '#4FC3F7', borderRadius: '3px',
                transition: 'width 0.3s ease',
              }} />
            </div>
            <div style={{ color: '#888', marginTop: '10px', fontSize: '12px' }}>
              Please wait while the model loads
            </div>
            <style>{`@keyframes stl-spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        )}

        {!leftHasModel && !leftLoading && (
          <div style={{
            position: 'absolute', inset: 0, zIndex: 50,
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            background: isOverLeft ? 'rgba(0,255,255,0.05)' : 'transparent',
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
                onClick={() => leftFileInputRef.current?.click()}
                style={{
                  padding: '8px 20px', borderRadius: '6px', border: '1px solid #334',
                  backgroundColor: '#1a1f2e', color: '#aab', cursor: 'pointer',
                  fontSize: '13px', fontWeight: 500,
                }}
              >
                Browse STL Files
              </button>
              <input
                ref={leftFileInputRef}
                type="file"
                accept=".stl"
                multiple
                onChange={handleLeftFileSelect}
                style={{ display: 'none' }}
              />
            </div>
          </div>
        )}

        {leftHasModel && (
          <>
            <button
              onClick={() => leftFileInputRef.current?.click()}
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
              ref={leftFileInputRef}
              type="file"
              accept=".stl"
              multiple
              onChange={handleLeftFileSelect}
              style={{ display: 'none' }}
            />
          </>
        )}

        <div ref={leftMountRef} style={{ width: '100%', height: '100%', overflow: 'hidden' }} />
      </div>

      {/* ─── Right Panel ─── */}
      <div
        ref={dropRef}
        style={{
          flex: 1, position: 'relative',
          outline: isOver ? '2px dashed #00ffff' : 'none',
        }}
      >
        <div style={{
          position: 'absolute', top: 0, left: 10, color: '#ffffff', zIndex: 100,
          backgroundColor: '#0a0e17', padding: '4px 8px', borderRadius: '4px',
          fontSize: '12px', marginTop: '12px',
        }}>
          {rightLabel || 'Compare Panel'}
        </div>

        {rightLoading && (
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
            <div style={{ color: '#fff', marginTop: '20px', fontSize: '16px', fontWeight: 600 }}>
              Loading 3D Model
            </div>
            <div style={{ color: '#4FC3F7', marginTop: '8px', fontSize: '28px', fontWeight: 700 }}>
              {rightProgress}%
            </div>
            <div style={{
              width: '220px', height: '6px',
              backgroundColor: 'rgba(255,255,255,0.1)',
              borderRadius: '3px', marginTop: '12px', overflow: 'hidden',
            }}>
              <div style={{
                width: `${rightProgress}%`, height: '100%',
                backgroundColor: '#4FC3F7', borderRadius: '3px',
                transition: 'width 0.3s ease',
              }} />
            </div>
            <div style={{ color: '#888', marginTop: '10px', fontSize: '12px' }}>
              Please wait while the model loads
            </div>
          </div>
        )}

        {!rightHasModel && !rightLoading && (
          <div style={{
            position: 'absolute', inset: 0, zIndex: 50,
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            background: isOver ? 'rgba(0,255,255,0.05)' : 'transparent',
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

        {rightHasModel && (
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

        <div ref={rightMountRef} style={{ width: '100%', height: '100%', overflow: 'hidden' }} />
      </div>
    </div>
  );
};

export default LocalThreeDCompareViewer;
