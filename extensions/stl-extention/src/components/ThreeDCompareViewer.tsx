import React, { useContext, useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader';
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter';
import { useDrop } from 'react-dnd';
import { StlInstanceContext } from '../../../../platform/app/src/context/StlInstanceContext';
import { StlInstanceListDataContext } from '../../../../platform/app/src/context/StlInstanceListDataContext';
import { SERVER_URL, fetchFile } from '../../../../config/server';
import { LPS_UP } from '../utils/coordinateSystem';
import { useStlVisibilityContext } from '../context/StlVisibilityContext';
import { useBoneRemovalContext } from '../context/BoneRemovalContext';
import { useClickRemoveContext } from '../context/ClickRemoveContext';
import { useBoneRemoval } from '../hooks/useBoneRemoval';
import { useBrightness } from '../hooks/useBrightness';
import { MeshRefs } from '../types/three.types';
import { useThreeDToolsBridge, ToolDef } from '../context/ThreeDToolsBridgeContext';
import { useBrightnessContext } from '../context/BrightnessContext';
import { useMeasurementContext } from '../context/MeasurementContext';
import { useAngleMeasurementContext } from '../context/AngleMeasurementContext';
import { handleScreenshot as handleScreenshotUtil, downloadEditedSTLs } from '../utils/fileHandlers';
import { useLabelingViewContext } from '../context/LabelingViewContext';
import { useSpineLabelingContext } from '../context/SpineLabelingContext';
import { useVersionHistoryContext } from '../context/VersionHistoryContext';
import { useImplantContext } from '../context/ImplantContext';
import { useVersionHistory } from '../hooks/useVersionHistory';
import { useActivePanelContext } from '../context/ActivePanelContext';
import SmoothDialog from './SmoothDialog';
import { laplacianSmooth } from '../utils/smoothGeometry';

interface ThreeDCompareViewerProps {
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

// ─── Vertebra identification: exactly matches useSTLLoader.getVertebraInfo ───
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

// ─── Material: exactly matches useSTLLoader.createMeshMaterial for left (latest) view ───
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
  // Vertebrae + unknown → white
  return new THREE.MeshPhongMaterial({ color: 0xffffff, specular: 0x111111, shininess: 10, side: THREE.DoubleSide });
}

// ─── Load STLs into a group with proper vertebra materials (useSTLLoader pipeline) ───
async function loadSTLsWithMaterials(
  stlUrls: string[],
  group: THREE.Group,
  cancelled: { current: boolean },
  onProgress?: (percent: number) => void
) {
  const loader = new STLLoader();
  group.clear();

  let completedCount = 0;
  onProgress?.(0);

  const loadedObjects = await Promise.all(
    stlUrls.map(async (url) => {
      if (cancelled.current) return null;
      try {
        const res = await fetchFile(url);
        if (!res.ok) {
          completedCount++;
          onProgress?.(Math.round((completedCount / stlUrls.length) * 100));
          return null;
        }
        const arrayBuffer = await res.arrayBuffer();
        const geometry = loader.parse(arrayBuffer);
        geometry.computeBoundingBox();
        const fileName = url.substring(url.lastIndexOf('/') + 1);

        completedCount++;
        onProgress?.(Math.round((completedCount / stlUrls.length) * 100));

        return { geometry, ...getVertebraInfo(fileName, url) };
      } catch (err) {
        completedCount++;
        onProgress?.(Math.round((completedCount / stlUrls.length) * 100));
        console.error('Failed to load STL:', url, err);
        return null;
      }
    })
  );

  if (cancelled.current) return;

  const valid = loadedObjects.filter(Boolean) as any[];
  const vertebrae = valid.filter(v => ['C', 'T', 'L', 'S'].includes(v.type));
  const organs = valid.filter(v => ['A', 'H'].includes(v.type));
  const implants = valid.filter(v => v.type === 'I');
  const unknown = valid.filter(v => v.type === 'X');

  const potentialOrgans = [...organs];
  unknown.forEach(unk => {
    const name = unk.fileName.toLowerCase();
    if (name.length < 8 && !name.match(/(c|t|l|s)\d/)) potentialOrgans.push(unk);
  });

  // Sort vertebrae anatomically
  const order = ['C', 'T', 'L', 'S'];
  vertebrae.sort((a: any, b: any) => {
    const diff = order.indexOf(a.type) - order.indexOf(b.type);
    return diff !== 0 ? diff : a.number - b.number;
  });

  // Add vertebrae
  vertebrae.forEach((v: any) => {
    const mesh = new THREE.Mesh(v.geometry, createLeftMaterial(v.type));
    mesh.userData = v;
    group.add(mesh);
  });

  // Add implants (centered)
  implants.forEach((imp: any) => {
    imp.geometry.center();
    imp.geometry.computeBoundingBox();
    const mesh = new THREE.Mesh(imp.geometry.clone(), createLeftMaterial('I'));
    if (group.children.length > 0) {
      const vBbox = new THREE.Box3().setFromObject(group);
      const vCenter = new THREE.Vector3();
      vBbox.getCenter(vCenter);
      mesh.position.set(0, 0, vCenter.z);
    }
    mesh.userData = imp;
    group.add(mesh);
  });

  // Add organs
  potentialOrgans.forEach((organ: any) => {
    const mesh = new THREE.Mesh(organ.geometry, createLeftMaterial(organ.type));
    mesh.userData = organ;
    group.add(mesh);
  });

  // Remaining unknown
  unknown.forEach(unk => {
    const name = unk.fileName.toLowerCase();
    if (name.length >= 8 || name.match(/(c|t|l|s)\d/)) {
      const mesh = new THREE.Mesh(unk.geometry, createLeftMaterial('X'));
      mesh.userData = unk;
      group.add(mesh);
    }
  });
}

// ─── Position camera: coronal view, Z-up, FOV-based — exactly matches useSTLLoader ───
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

  // Set controls target FIRST, then position camera, then update (same order as useSTLLoader)
  controls.target.copy(center);
  camera.position.set(center.x, center.y - camDist, center.z);
  camera.up.copy(LPS_UP);
  camera.lookAt(center);
  camera.updateProjectionMatrix();
  controls.update();
}

// ─── Main component ───
const ThreeDCompareViewer: React.FC<ThreeDCompareViewerProps> = ({
  servicesManager,
  commandsManager,
}) => {
  const stlContext = useContext(StlInstanceContext);
  const stlInstanceId = stlContext?.stlInstanceId ?? null;
  const seriesName = stlContext?.seriesName ?? null;
  const listContext = useContext(StlInstanceListDataContext);
  const stlInstanceListData = listContext?.stlInstanceListData ?? [];

  const userToken = localStorage.getItem('token') || '';
  const { stlFiles, compareRightFiles, setCompareRightFiles } = useStlVisibilityContext();

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
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Camera sync
  const [syncCameras, setSyncCameras] = useState(false);
  const isSyncingRef = useRef(false);

  // 3D Tool contexts
  const { removalMode, setRemovalMode } = useBoneRemovalContext();
  const { clickRemovalMode, onToggleClickRemoval } = useClickRemoveContext();
  const { activePanel, togglePanel, isPanelActive } = useActivePanelContext();
  const { registerTools } = useThreeDToolsBridge();
  const { brightnessEnabled, brightness, toggleBrightness } = useBrightnessContext();
  const {
    measurementEnabled,
    toggleMeasurement,
    setupMeasurementMode,
    cleanupMeasurementMode,
  } = useMeasurementContext();
  const {
    angleMeasurementEnabled,
    toggleAngleMeasurement,
    setupAngleMeasurementMode,
    cleanupAngleMeasurementMode,
  } = useAngleMeasurementContext();
  const { showRightView: labelViewEnabled, onToggleRightView } = useLabelingViewContext();
  const { spineLabelingMode, toggleSpineLabelingMode } = useSpineLabelingContext();
  const { versionHistoryEnabled, toggleVersionHistory, isApproving, setIsApproving } = useVersionHistoryContext();
  const { implantFile, showImplantView, toggleImplantView } = useImplantContext();

  // Mesh refs for bone removal hook
  const meshRefs = useRef<MeshRefs>({ left: [], right: [] });

  // Bone removal state
  const [removalOutline, setRemovalOutline] = useState<{ x: number, y: number }[]>([]);
  const [rightRemovalOutline, setRightRemovalOutline] = useState<{ x: number, y: number }[]>([]);
  const [removing, setRemoving] = useState(false);
  const [undoStack, setUndoStack] = useState<THREE.BufferGeometry[][]>([]);
  const removalCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const rightRemovalCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);

  // Rotation/movement mode state
  const [rotationMode, setRotationMode] = useState(false);   // Horizontal
  const [rotationMode1, setRotationMode1] = useState(false);  // Vertical
  const [rotationMode2, setRotationMode2] = useState(false);  // Rotation (tilt)
  const [rotationMode3, setRotationMode3] = useState(false);  // Longitudinal (forward/backward)
  const [implantMoveMode, setImplantMoveMode] = useState(false);
  const [inertialRotationMode, setInertialRotationMode] = useState(false);
  const [colorModeEnabled, setColorModeEnabled] = useState(false);
  const [showSmoothDialog, setShowSmoothDialog] = useState(false);
  const colorModeRef = useRef(false);
  const originalColorsRef = useRef<Map<THREE.Mesh, { color: number; emissive: number; emissiveIntensity: number }>>(new Map());
  const [showMerge, setShowMerge] = useState(false);
  const isRotatingRef = useRef(false);
  const initialMousePos = useRef({ x: 0, y: 0 });
  const selectedMeshIndex = useRef<number | null>(null);
  const implantFileInputRef = useRef<HTMLInputElement>(null);

  // Reset all active tools when panel toggle changes
  const prevActivePanelRef = useRef(activePanel);
  useEffect(() => {
    if (prevActivePanelRef.current === activePanel) return;
    prevActivePanelRef.current = activePanel;

    setRotationMode(false);
    setRotationMode1(false);
    setRotationMode2(false);
    setRotationMode3(false);
    setImplantMoveMode(false);
    setInertialRotationMode(false);
    setRemovalMode(false);
    if (clickRemovalMode) onToggleClickRemoval(false);
    if (brightnessEnabled) toggleBrightness();
    if (measurementEnabled) toggleMeasurement();
    if (angleMeasurementEnabled) toggleAngleMeasurement();
    if (colorModeRef.current) {
      colorModeRef.current = false;
      setColorModeEnabled(false);
    }
  }, [activePanel]);

  // State
  const [leftLoading, setLeftLoading] = useState(true);
  const [leftProgress, setLeftProgress] = useState(0);
  const [leftError, setLeftError] = useState<string | null>(null);
  const [leftLabel, setLeftLabel] = useState('');
  const [rightLoading, setRightLoading] = useState(false);
  const [rightProgress, setRightProgress] = useState(0);
  const [rightLabel, setRightLabel] = useState('');
  const [rightHasModel, setRightHasModel] = useState(false);

  // ─── Three.js setup: exactly matches SingleSpinalCord useEffect ───
  useEffect(() => {
    const leftMount = leftMountRef.current;
    const rightMount = rightMountRef.current;
    if (!leftMount || !rightMount) return;

    const leftScene = leftSceneRef.current;
    const rightScene = rightSceneRef.current;

    leftScene.background = new THREE.Color(0x000000);
    rightScene.background = new THREE.Color(0x000000);

    // Cameras — LPS: Z is Superior (up), anterior view (looking from -Y)
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

    // Renderers — same style props as SingleSpinalCord
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

    // Controls — same config as SingleSpinalCord
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

    // Lighting — same as SingleSpinalCord.setupLighting
    setupLighting(leftScene);
    setupLighting(rightScene);

    // Add groups to scenes
    leftScene.add(leftGroupRef.current);
    rightScene.add(rightGroupRef.current);

    // Animation loop
    const animate = () => {
      animationIdRef.current = requestAnimationFrame(animate);
      leftControls.update();
      leftRenderer.render(leftScene, leftCamera);
      rightControls.update();
      rightRenderer.render(rightScene, rightCamera);
    };
    animate();

    // Resize — same pattern as SingleSpinalCord
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
      setCompareRightFiles([]);
    };
  }, []);

  // ─── LEFT PANEL: fetch URLs then load STLs (same as SingleSpinalCord data fetching + useSTLLoader) ───
  useEffect(() => {
    if (!stlInstanceId) {
      setLeftLoading(false);
      setLeftError('No series selected');
      return;
    }

    const cancelled = { current: false };
    setLeftLoading(true);
    setLeftProgress(0);
    setLeftError(null);
    setLeftLabel(seriesName || '');

    const load = async () => {
      try {
        // Fetch mesh URLs — same as SingleSpinalCord fetchData
        const response = await fetch(
          `${SERVER_URL}/analyst/meshes?series_instance_uid=${stlInstanceId}`,
          {
            headers: {
              Authorization: `Bearer ${userToken}`,
              'Content-Type': 'application/json',
            },
            credentials: 'include',
          }
        );
        if (!response.ok) throw new Error('Failed to fetch data');
        const data = await response.json();
        const versions = data?.data?.versions || [];
        const stlUrls: string[] = versions.length > 0
          ? (versions.reduce((a, b) => (a.version > b.version ? a : b)).urls || [])
          : (data?.data?.processed?.urls || []);
        if (stlUrls.length === 0) throw new Error('No STL files found for this series');

        // Load STLs with proper materials — same as useSTLLoader
        await loadSTLsWithMaterials(stlUrls, leftGroupRef.current, cancelled, setLeftProgress);
        if (cancelled.current) return;

        // Sync meshRefs with loaded meshes
        meshRefs.current.left = leftGroupRef.current.children.filter(
          c => c instanceof THREE.Mesh
        ) as THREE.Mesh[];

        // Position camera — same as useSTLLoader camera centering
        if (leftCameraRef.current && leftControlsRef.current) {
          positionCameraForGroup(leftCameraRef.current, leftControlsRef.current, leftGroupRef.current);
        }
        setLeftLoading(false);
      } catch (err: any) {
        if (!cancelled.current) {
          console.error('Left panel load error:', err);
          setLeftError(err.message || 'Failed to load model');
          setLeftLoading(false);
        }
      }
    };
    load();

    return () => { cancelled.current = true; };
  }, [stlInstanceId, seriesName]);

  // ─── RIGHT PANEL: load from local files (multiple, appends to existing) ───
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
          // Sync meshRefs with loaded meshes
          meshRefs.current.right = group.children.filter(
            c => c instanceof THREE.Mesh
          ) as THREE.Mesh[];

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

  // ─── RIGHT PANEL: add STLs from URL list (appends to existing, parallel fetch) ───
  const addRightFromUrls = useCallback(async (urls: string[], label: string) => {
    setRightLoading(true);
    setRightProgress(0);
    setRightLabel(label);

    const loader = new STLLoader();
    const group = rightGroupRef.current;
    group.clear();
    let completedCount = 0;

    const results = await Promise.all(
      urls.map(async (url) => {
        try {
          const res = await fetchFile(url);
          if (!res.ok) {
            completedCount++;
            setRightProgress(Math.round((completedCount / urls.length) * 100));
            return null;
          }
          const arrayBuffer = await res.arrayBuffer();
          const geometry = loader.parse(arrayBuffer);
          geometry.computeBoundingBox();
          const fileName = url.substring(url.lastIndexOf('/') + 1);

          completedCount++;
          setRightProgress(Math.round((completedCount / urls.length) * 100));

          return { geometry, ...getVertebraInfo(fileName, url) };
        } catch (err) {
          completedCount++;
          setRightProgress(Math.round((completedCount / urls.length) * 100));
          console.error('Failed to load STL:', url, err);
          return null;
        }
      })
    );

    const validResults = results.filter(Boolean) as any[];
    validResults.forEach((obj: any) => {
      const mesh = new THREE.Mesh(obj.geometry, createLeftMaterial(obj.type));
      mesh.userData = obj;
      group.add(mesh);
    });

    // Sync meshRefs with loaded meshes
    meshRefs.current.right = group.children.filter(
      c => c instanceof THREE.Mesh
    ) as THREE.Mesh[];

    if (group.children.length > 0 && rightCameraRef.current && rightControlsRef.current) {
      positionCameraForGroup(rightCameraRef.current, rightControlsRef.current, group);
    }
    setRightHasModel(true);
    setRightLoading(false);

    setCompareRightFiles(validResults.map((obj: any) => ({
      id: `cmp-${obj.fileName}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      fileName: obj.fileName,
      isVisible: true,
      originalUrl: '',
    })));
  }, [setCompareRightFiles]);

  // ─── Sync visibility from context to left compare view meshes ───
  useEffect(() => {
    if (stlFiles.length === 0) return;

    const visibilityMap = new Map<string, boolean>();
    stlFiles.forEach(file => {
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
  }, [stlFiles]);

  // ─── Sync visibility from context to right compare view meshes ───
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

  // ─── Bone removal (outline) for LEFT panel ───
  useBoneRemoval({
    removalMode: removalMode && isPanelActive('left'),
    leftRendererRef: leftRendererRef as React.MutableRefObject<THREE.WebGLRenderer | undefined>,
    leftControlsRef,
    cameraRef: leftCameraRef as React.MutableRefObject<THREE.PerspectiveCamera | undefined>,
    meshRefs,
    removalCanvasRef,
    setRemoving,
    setUndoStack,
    setRemovalOutline,
    removalOutline,
    localOnly: true,
    meshKey: 'left',
  });

  // ─── Bone removal (outline) for RIGHT panel ───
  useBoneRemoval({
    removalMode: removalMode && isPanelActive('right'),
    leftRendererRef: rightRendererRef as React.MutableRefObject<THREE.WebGLRenderer | undefined>,
    leftControlsRef: rightControlsRef,
    cameraRef: rightCameraRef as React.MutableRefObject<THREE.PerspectiveCamera | undefined>,
    meshRefs,
    removalCanvasRef: rightRemovalCanvasRef,
    setRemoving,
    setUndoStack,
    setRemovalOutline: setRightRemovalOutline,
    removalOutline: rightRemovalOutline,
    localOnly: true,
    meshKey: 'right',
  });

  // ─── Brightness hook ───
  useBrightness({
    brightnessEnabled,
    brightness,
    meshRefs,
    activePanel: activePanel === 'both' ? undefined : activePanel,
  });

  // ─── Measurement mode setup ───
  useEffect(() => {
    const rendererRef = activePanel === 'right'
      ? rightRendererRef as React.MutableRefObject<THREE.WebGLRenderer | undefined>
      : leftRendererRef as React.MutableRefObject<THREE.WebGLRenderer | undefined>;
    const sceneRef = activePanel === 'right' ? rightSceneRef : leftSceneRef;
    const camRef = activePanel === 'right'
      ? rightCameraRef as React.MutableRefObject<THREE.PerspectiveCamera | undefined>
      : leftCameraRef as React.MutableRefObject<THREE.PerspectiveCamera | undefined>;

    setupMeasurementMode({
      leftRendererRef: rendererRef,
      leftSceneRef: sceneRef,
      cameraRef: camRef,
      meshRefs,
    });

    setupAngleMeasurementMode({
      leftRendererRef: rendererRef,
      leftSceneRef: sceneRef,
      cameraRef: camRef,
      meshRefs,
    });

    return () => {
      cleanupMeasurementMode();
      cleanupAngleMeasurementMode();
    };
  }, [setupMeasurementMode, cleanupMeasurementMode, setupAngleMeasurementMode, cleanupAngleMeasurementMode, activePanel]);

  // ─── Screenshot handler ───
  const handleScreenshot = useCallback(() => {
    const renderer = activePanel === 'right' ? rightRendererRef.current : leftRendererRef.current;
    const scene = activePanel === 'right' ? rightSceneRef.current : leftSceneRef.current;
    const camera = activePanel === 'right' ? rightCameraRef.current : leftCameraRef.current;
    handleScreenshotUtil(renderer, scene, camera);
  }, [activePanel]);

  // ─── Download handler ───
  const handleDownload = useCallback(() => {
    downloadEditedSTLs(meshRefs, setIsDownloading);
  }, []);

  // ─── Version history hook ───
  const versionHistory = useVersionHistory({
    setLoading: setLeftLoading,
    setError: setLeftError,
    setApproveSuccess: () => {},
    setStlUrls: () => {},
  });

  // ─── Color mode constants (same as SingleSpinalCord) ───
  const VERTEBRA_COLORS = useRef<{ [key: string]: number }>({
    C1: 0x4169E1, C2: 0x4682B4, C3: 0x5F9EA0, C4: 0x6495ED, C5: 0x00CED1, C6: 0x20B2AA, C7: 0x48D1CC,
    T1: 0xCD5C5C, T2: 0xDC143C, T3: 0xB22222, T4: 0xC71585, T5: 0xDB7093, T6: 0xFF69B4,
    T7: 0xFFB6C1, T8: 0xFFA07A, T9: 0xFA8072, T10: 0xE9967A, T11: 0xF08080, T12: 0xCD5C5C,
    L1: 0xADFF2F, L2: 0xBDB76B, L3: 0xFF00FF, L4: 0x9932CC, L5: 0x32CD32,
    S1: 0x00FFFF, S2: 0xFF00FF, S3: 0xDA70D6, S4: 0xBA55D3, S5: 0x9400D3,
  }).current;
  const DEFAULT_COLORS = useRef([0xCD5C5C, 0xADFF2F, 0xBDB76B, 0xFF00FF, 0x9932CC, 0x32CD32, 0x00FFFF, 0xDA70D6, 0xFFD700, 0xFF6347]).current;

  // Label colors by vertebra type (C=blue, T=green, L=red, S=yellow)
  const LABEL_COLORS = useRef<{ [key: string]: number }>({
    C: 0x3498db,
    T: 0x2ecc71,
    L: 0xe74c3c,
    S: 0xf1c40f,
  }).current;

  // ─── Color mode toggle (same as SingleSpinalCord) ───
  const toggleColorMode = useCallback(() => {
    const newState = !colorModeRef.current;
    colorModeRef.current = newState;
    setColorModeEnabled(newState);

    const applyColorToMesh = (mesh: THREE.Mesh, index: number) => {
      const material = mesh.material as THREE.MeshPhongMaterial;
      if (!material) return;

      if (!originalColorsRef.current.has(mesh)) {
        originalColorsRef.current.set(mesh, {
          color: material.color ? material.color.getHex() : 0xffffff,
          emissive: material.emissive ? material.emissive.getHex() : 0x000000,
          emissiveIntensity: material.emissiveIntensity || 0.2,
        });
      }

      if (newState) {
        const userData = mesh.userData;
        let color = DEFAULT_COLORS[index % DEFAULT_COLORS.length];
        if (userData?.fullName && VERTEBRA_COLORS[userData.fullName]) {
          color = VERTEBRA_COLORS[userData.fullName];
        } else if (userData?.type && userData?.number) {
          const key = `${userData.type}${userData.number}`;
          if (VERTEBRA_COLORS[key]) color = VERTEBRA_COLORS[key];
        }
        if (material.color) material.color.setHex(color);
        material.needsUpdate = true;
      } else {
        const userData = mesh.userData;
        const vertebraType = userData?.type;

        if (labelViewEnabled && LABEL_COLORS[vertebraType]) {
          const labelColor = LABEL_COLORS[vertebraType];
          if (material.color) material.color.setHex(labelColor);
          material.needsUpdate = true;
        } else {
          const original = originalColorsRef.current.get(mesh);
          if (original) {
            if (material.color) material.color.setHex(original.color);
            material.needsUpdate = true;
          }
        }
      }
    };

    if (isPanelActive('left')) meshRefs.current.left.forEach((mesh, i) => applyColorToMesh(mesh, i));
    if (isPanelActive('right')) meshRefs.current.right.forEach((mesh, i) => applyColorToMesh(mesh, i));
  }, [labelViewEnabled, LABEL_COLORS, isPanelActive]);

  // Effect to apply/remove label colors when label view is toggled
  useEffect(() => {
    // Skip if color mode is enabled (color mode takes priority)
    if (colorModeRef.current) return;

    const applyLabelColorToMesh = (mesh: THREE.Mesh) => {
      const material = mesh.material as THREE.MeshPhongMaterial;
      if (!material || !material.color) return;

      const userData = mesh.userData;
      const vertebraType = userData?.type;

      // Store original color if not already stored
      if (!originalColorsRef.current.has(mesh)) {
        originalColorsRef.current.set(mesh, {
          color: material.color.getHex(),
          emissive: material.emissive ? material.emissive.getHex() : 0x000000,
          emissiveIntensity: material.emissiveIntensity || 0.2,
        });
      }

      if (labelViewEnabled) {
        const color = LABEL_COLORS[vertebraType] || 0x9b59b6;
        material.color.setHex(color);
        material.needsUpdate = true;
      } else {
        const original = originalColorsRef.current.get(mesh);
        if (original) {
          material.color.setHex(original.color);
          material.needsUpdate = true;
        }
      }
    };

    if (isPanelActive('left')) {
      meshRefs.current.left.forEach((mesh) => applyLabelColorToMesh(mesh));
    }
    if (isPanelActive('right')) {
      meshRefs.current.right.forEach((mesh) => applyLabelColorToMesh(mesh));
    }
  }, [labelViewEnabled, LABEL_COLORS, isPanelActive]);

  // ─── Approve handler ───
  const approveEditedFiles = useCallback(() => {
    if (!stlContext?.stlInstanceId) return;
    setIsApproving(true);

    const exporter = new STLExporter();
    const formData = new FormData();
    formData.append('series_instance_uid', stlContext.stlInstanceId);

    for (const mesh of meshRefs.current.left) {
      if (!mesh.visible) continue;
      const fileName = mesh.userData?.fileName;
      if (!fileName) continue;
      const stlData = exporter.parse(mesh, { binary: true });
      const blob = new Blob([stlData], { type: 'application/octet-stream' });
      formData.append('files', blob, fileName);
    }

    const xhr = new XMLHttpRequest();
    xhr.timeout = 5 * 60 * 1000;
    xhr.open('POST', `${SERVER_URL}/analyst/meshes/approved`);
    xhr.setRequestHeader('Authorization', `Bearer ${userToken}`);
    xhr.withCredentials = true;

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        versionHistory.refreshVersionHistory();
      }
      setIsApproving(false);
    };
    xhr.onerror = () => setIsApproving(false);
    xhr.ontimeout = () => setIsApproving(false);
    xhr.send(formData);
  }, [userToken, stlContext]);

  // ─── Implant move toggle ───
  const handleToggleImplantMove = useCallback(() => {
    setImplantMoveMode(prev => !prev);
    setRotationMode(false); setRotationMode1(false); setRotationMode2(false); setRotationMode3(false);
    setInertialRotationMode(false);
  }, []);

  // ─── Interactive rotation toggle ───
  const handleToggleInertialRotation = useCallback(() => {
    setInertialRotationMode(prev => !prev);
    setRotationMode(false); setRotationMode1(false); setRotationMode2(false); setRotationMode3(false);
    setImplantMoveMode(false);
  }, []);

  // ─── Rotation toggle helpers ───
  const clearAllRotationModes = useCallback(() => {
    setRotationMode(false);
    setRotationMode1(false);
    setRotationMode2(false);
    setRotationMode3(false);
  }, []);

  const handleToggleRotation = useCallback(() => {
    setRotationMode(prev => !prev);
    setRotationMode1(false); setRotationMode2(false); setRotationMode3(false);
    setImplantMoveMode(false); setInertialRotationMode(false);
  }, []);
  const handleToggleRotation1 = useCallback(() => {
    setRotationMode1(prev => !prev);
    setRotationMode(false); setRotationMode2(false); setRotationMode3(false);
    setImplantMoveMode(false); setInertialRotationMode(false);
  }, []);
  const handleToggleRotation2 = useCallback(() => {
    setRotationMode2(prev => !prev);
    setRotationMode(false); setRotationMode1(false); setRotationMode3(false);
    setImplantMoveMode(false); setInertialRotationMode(false);
  }, []);
  const handleToggleRotation3 = useCallback(() => {
    setRotationMode3(prev => !prev);
    setRotationMode(false); setRotationMode1(false); setRotationMode2(false);
    setImplantMoveMode(false); setInertialRotationMode(false);
  }, []);

  // ─── HORIZONTAL bone movement ───
  useEffect(() => {
    const mount = activePanel === 'right' ? rightMountRef.current : leftMountRef.current;
    const camRef = activePanel === 'right' ? rightCameraRef : leftCameraRef;
    const ctrlRef = activePanel === 'right' ? rightControlsRef : leftControlsRef;
    const primaryKey: 'left' | 'right' = activePanel === 'right' ? 'right' : 'left';
    if (!mount || !rotationMode) return;

    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    const onMouseDown = (event: MouseEvent) => {
      if (!rotationMode) return;
      const rect = mount.getBoundingClientRect();
      mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(mouse, camRef.current!);
      const meshes = meshRefs.current[primaryKey].filter(m => !m.userData?.isImplant && m.userData?.type !== 'I');
      const intersects = raycaster.intersectObjects(meshes);
      if (intersects.length > 0) {
        ctrlRef.current!.enabled = false;
        isRotatingRef.current = true;
        initialMousePos.current = { x: event.clientX, y: event.clientY };
        selectedMeshIndex.current = meshRefs.current[primaryKey].indexOf(intersects[0].object as THREE.Mesh);
      }
    };
    const onMouseMove = (event: MouseEvent) => {
      if (!isRotatingRef.current || selectedMeshIndex.current === null) return;
      const deltaX = event.clientX - initialMousePos.current.x;
      initialMousePos.current = { x: event.clientX, y: event.clientY };
      const amount = -deltaX * 0.5;
      for (let i = selectedMeshIndex.current; i >= 0; i--) {
        const mesh = meshRefs.current[primaryKey][i];
        if (mesh?.userData?.isImplant || mesh?.userData?.type === 'I') continue;
        if (mesh) mesh.position.x += amount;
        if (activePanel === 'both') {
          const other = meshRefs.current[primaryKey === 'left' ? 'right' : 'left'][i];
          if (other && !other.userData?.isImplant && other.userData?.type !== 'I') other.position.x += amount;
        }
      }
    };
    const onMouseUp = () => {
      isRotatingRef.current = false;
      selectedMeshIndex.current = null;
      if (ctrlRef.current) ctrlRef.current.enabled = true;
    };
    mount.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      mount.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [rotationMode, activePanel]);

  // ─── VERTICAL bone movement ───
  useEffect(() => {
    const mount = activePanel === 'right' ? rightMountRef.current : leftMountRef.current;
    const camRef = activePanel === 'right' ? rightCameraRef : leftCameraRef;
    const ctrlRef = activePanel === 'right' ? rightControlsRef : leftControlsRef;
    const primaryKey: 'left' | 'right' = activePanel === 'right' ? 'right' : 'left';
    if (!mount || !rotationMode1) return;

    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    const onMouseDown = (event: MouseEvent) => {
      if (!rotationMode1) return;
      const rect = mount.getBoundingClientRect();
      mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(mouse, camRef.current!);
      const meshes = meshRefs.current[primaryKey].filter(m => !m.userData?.isImplant && m.userData?.type !== 'I');
      const intersects = raycaster.intersectObjects(meshes);
      if (intersects.length > 0) {
        ctrlRef.current!.enabled = false;
        isRotatingRef.current = true;
        initialMousePos.current = { x: event.clientX, y: event.clientY };
        selectedMeshIndex.current = meshRefs.current[primaryKey].indexOf(intersects[0].object as THREE.Mesh);
      }
    };
    const onMouseMove = (event: MouseEvent) => {
      if (!isRotatingRef.current || selectedMeshIndex.current === null) return;
      const deltaY = event.clientY - initialMousePos.current.y;
      initialMousePos.current = { x: event.clientX, y: event.clientY };
      const amount = -deltaY * 0.5;
      for (let i = selectedMeshIndex.current; i >= 0; i--) {
        const mesh = meshRefs.current[primaryKey][i];
        if (mesh?.userData?.isImplant || mesh?.userData?.type === 'I') continue;
        if (mesh) mesh.position.z += amount;
        if (activePanel === 'both') {
          const other = meshRefs.current[primaryKey === 'left' ? 'right' : 'left'][i];
          if (other && !other.userData?.isImplant && other.userData?.type !== 'I') other.position.z += amount;
        }
      }
    };
    const onMouseUp = () => {
      isRotatingRef.current = false;
      selectedMeshIndex.current = null;
      if (ctrlRef.current) ctrlRef.current.enabled = true;
    };
    mount.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      mount.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [rotationMode1, activePanel]);

  // ─── ROTATION (tilt around X-axis) ───
  useEffect(() => {
    const mount = activePanel === 'right' ? rightMountRef.current : leftMountRef.current;
    const camRef = activePanel === 'right' ? rightCameraRef : leftCameraRef;
    const ctrlRef = activePanel === 'right' ? rightControlsRef : leftControlsRef;
    const primaryKey: 'left' | 'right' = activePanel === 'right' ? 'right' : 'left';
    if (!mount || !rotationMode2) return;

    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    const onMouseDown = (event: MouseEvent) => {
      if (!rotationMode2) return;
      const rect = mount.getBoundingClientRect();
      mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(mouse, camRef.current!);
      const meshes = meshRefs.current[primaryKey].filter(m => !m.userData?.isImplant && m.userData?.type !== 'I');
      const intersects = raycaster.intersectObjects(meshes);
      if (intersects.length > 0) {
        event.preventDefault();
        ctrlRef.current!.enabled = false;
        isRotatingRef.current = true;
        initialMousePos.current = { x: event.clientX, y: event.clientY };
        selectedMeshIndex.current = meshRefs.current[primaryKey].indexOf(intersects[0].object as THREE.Mesh);
      }
    };
    const onMouseMove = (event: MouseEvent) => {
      if (!isRotatingRef.current || selectedMeshIndex.current === null) return;
      const deltaY = event.clientY - initialMousePos.current.y;
      initialMousePos.current = { x: event.clientX, y: event.clientY };
      const rotationSpeed = 0.005;
      for (let i = selectedMeshIndex.current; i >= 0; i--) {
        const mesh = meshRefs.current[primaryKey][i];
        if (!mesh || mesh.userData?.isImplant || mesh.userData?.type === 'I') continue;
        mesh.rotation.x += deltaY * rotationSpeed;
        if (activePanel === 'both') {
          const other = meshRefs.current[primaryKey === 'left' ? 'right' : 'left'][i];
          if (other && !other.userData?.isImplant && other.userData?.type !== 'I') other.rotation.x += deltaY * rotationSpeed;
        }
      }
    };
    const onMouseUp = () => {
      isRotatingRef.current = false;
      selectedMeshIndex.current = null;
      if (ctrlRef.current) ctrlRef.current.enabled = true;
    };
    mount.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      mount.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [rotationMode2, activePanel]);

  // ─── LONGITUDINAL (forward/backward) ───
  useEffect(() => {
    const mount = activePanel === 'right' ? rightMountRef.current : leftMountRef.current;
    const camRef = activePanel === 'right' ? rightCameraRef : leftCameraRef;
    const ctrlRef = activePanel === 'right' ? rightControlsRef : leftControlsRef;
    const primaryKey: 'left' | 'right' = activePanel === 'right' ? 'right' : 'left';
    if (!mount || !rotationMode3) return;

    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    const onMouseDown = (event: MouseEvent) => {
      if (!rotationMode3) return;
      const rect = mount.getBoundingClientRect();
      mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(mouse, camRef.current!);
      const meshes = meshRefs.current[primaryKey].filter(m => !m.userData?.isImplant && m.userData?.type !== 'I');
      const intersects = raycaster.intersectObjects(meshes);
      if (intersects.length > 0) {
        ctrlRef.current!.enabled = false;
        isRotatingRef.current = true;
        initialMousePos.current = { x: event.clientX, y: event.clientY };
        selectedMeshIndex.current = meshRefs.current[primaryKey].indexOf(intersects[0].object as THREE.Mesh);
      }
    };
    const onMouseMove = (event: MouseEvent) => {
      if (!isRotatingRef.current || selectedMeshIndex.current === null) return;
      const deltaY = event.clientY - initialMousePos.current.y;
      initialMousePos.current = { x: event.clientX, y: event.clientY };
      const amount = deltaY * 0.5;
      for (let i = selectedMeshIndex.current; i >= 0; i--) {
        const mesh = meshRefs.current[primaryKey][i];
        if (mesh?.userData?.isImplant || mesh?.userData?.type === 'I') continue;
        if (mesh) mesh.position.y += amount;
        if (activePanel === 'both') {
          const other = meshRefs.current[primaryKey === 'left' ? 'right' : 'left'][i];
          if (other && !other.userData?.isImplant && other.userData?.type !== 'I') other.position.y += amount;
        }
      }
    };
    const onMouseUp = () => {
      isRotatingRef.current = false;
      selectedMeshIndex.current = null;
      if (ctrlRef.current) ctrlRef.current.enabled = true;
    };
    mount.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      mount.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [rotationMode3, activePanel]);

  // ─── Click removal for LEFT panel ───
  useEffect(() => {
    if (!clickRemovalMode || !isPanelActive('left')) return;

    const leftRenderer = leftRendererRef.current;
    const canvas = leftRenderer?.domElement;
    if (!canvas) return;

    const leftControls = leftControlsRef.current;
    if (leftControls) {
      leftControls.enabled = false;
    }

    const onClick = (event: MouseEvent) => {
      if (event.button !== 0) return;

      const rect = canvas.getBoundingClientRect();
      const mouse = new THREE.Vector2(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1,
      );

      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(mouse, leftCameraRef.current!);

      const meshes = meshRefs.current.left.filter(mesh => mesh.visible);
      const intersects = raycaster.intersectObjects(meshes, true);

      if (intersects.length > 0) {
        const selectedMesh = intersects[0].object as THREE.Mesh;
        const idx = meshRefs.current.left.findIndex(m => m === selectedMesh);
        if (idx !== -1) {
          const leftMesh = meshRefs.current.left[idx];

          leftGroupRef.current.remove(leftMesh);
          meshRefs.current.left.splice(idx, 1);

          leftMesh.geometry.dispose();
          if (Array.isArray(leftMesh.material)) leftMesh.material.forEach(m => m.dispose());
          else (leftMesh.material as THREE.Material).dispose();
        }
      }
    };

    canvas.style.cursor = 'pointer';
    canvas.addEventListener('click', onClick);

    return () => {
      canvas.style.cursor = 'auto';
      canvas.removeEventListener('click', onClick);
      if (leftControls) {
        leftControls.enabled = true;
      }
    };
  }, [clickRemovalMode, activePanel]);

  // ─── Click removal for RIGHT panel ───
  useEffect(() => {
    if (!clickRemovalMode || !isPanelActive('right')) return;

    const rightRenderer = rightRendererRef.current;
    const rightCanvas = rightRenderer?.domElement;
    if (!rightCanvas) return;

    const rightControls = rightControlsRef.current;
    if (rightControls) {
      rightControls.enabled = false;
    }

    const onRightClick = (event: MouseEvent) => {
      if (event.button !== 0) return;

      const rect = rightCanvas.getBoundingClientRect();
      const mouse = new THREE.Vector2(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1,
      );

      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(mouse, rightCameraRef.current!);

      const meshes = meshRefs.current.right.filter(mesh => mesh.visible);
      const intersects = raycaster.intersectObjects(meshes, true);

      if (intersects.length > 0) {
        const selectedMesh = intersects[0].object as THREE.Mesh;
        const idx = meshRefs.current.right.findIndex(m => m === selectedMesh);
        if (idx !== -1) {
          const rightMesh = meshRefs.current.right[idx];

          rightGroupRef.current.remove(rightMesh);
          meshRefs.current.right.splice(idx, 1);

          const fileName = rightMesh.userData?.fileName;
          if (fileName) {
            setCompareRightFiles(prev => prev.filter(f => f.fileName !== fileName));
          }

          rightMesh.geometry.dispose();
          if (Array.isArray(rightMesh.material)) rightMesh.material.forEach(m => m.dispose());
          else (rightMesh.material as THREE.Material).dispose();

          if (meshRefs.current.right.length === 0) {
            setRightHasModel(false);
          }
        }
      }
    };

    rightCanvas.style.cursor = 'pointer';
    rightCanvas.addEventListener('click', onRightClick);

    return () => {
      rightCanvas.style.cursor = 'auto';
      rightCanvas.removeEventListener('click', onRightClick);
      if (rightControls) {
        rightControls.enabled = true;
      }
    };
  }, [clickRemovalMode, activePanel]);

  // ─── RIGHT PANEL: drag-and-drop from sidebar ───
  const [{ isOver }, dropRef] = useDrop({
    accept: 'displayset',
    drop: (item: any) => {
      console.log('[3D Compare Drop] item:', item);
      if (!item) return { handled3dCompare: true };

      // Use myIndex + studyID — same lookup as Thumbnail.tsx end() handler
      let seriesUid: string | null = null;
      let seriesDesc = '';

      if (item.studyID != null && item.myIndex != null && stlInstanceListData) {
        for (const study of stlInstanceListData as any[]) {
          if (study.study_instance_uid === item.studyID && study.series?.[item.myIndex]) {
            seriesUid = study.series[item.myIndex].series_instance_uid;
            seriesDesc = study.series[item.myIndex].description || '';
            console.log('[3D Compare Drop] Resolved via myIndex:', seriesUid, seriesDesc);
            break;
          }
        }
      }

      if (!seriesUid) {
        console.warn('[3D Compare Drop] Could not resolve series UID from drag item:', item);
        return { handled3dCompare: true };
      }

      const url = `${SERVER_URL}/analyst/meshes?series_instance_uid=${seriesUid}`;
      fetch(url, {
        headers: { Authorization: `Bearer ${userToken}`, 'Content-Type': 'application/json' },
        credentials: 'include',
      })
        .then(res => res.json())
        .then(data => {
          const versions = data?.data?.versions || [];
          const urls: string[] = versions.length > 0
            ? (versions.reduce((a, b) => (a.version > b.version ? a : b)).urls || [])
            : (data?.data?.processed?.urls || []);
          if (urls.length > 0) {
            addRightFromUrls(urls, seriesDesc ? `Series: ${seriesDesc}` : 'Series');
          }
        })
        .catch(err => console.error('[3D Compare Drop] Fetch error:', err));

      return { handled3dCompare: true };
    },
    collect: monitor => ({ isOver: monitor.isOver() }),
  });

  // ─── Register 3D tools into the toolbar bridge ───
  const toolCallbacksRef = useRef<Record<string, () => void>>({});
  toolCallbacksRef.current = {
    fileSelect: () => fileInputRef.current?.click(),
    boneRemoval: () => setRemovalMode(!removalMode),
    download: handleDownload,
    brightness: toggleBrightness,
    measurement: toggleMeasurement,
    angle: toggleAngleMeasurement,
    horizontal: handleToggleRotation,
    vertical: handleToggleRotation1,
    longitudinal: handleToggleRotation3,
    rotation: handleToggleRotation2,
    implantMove: handleToggleImplantMove,
    interactiveRotation: handleToggleInertialRotation,
    smooth: () => setShowSmoothDialog(true),
    wrap: () => {},  // Disabled in compare mode
    screenshot: handleScreenshot,
    linking: () => {},
    alignment: () => {},
    merge: () => {},
    clickRemoval: () => onToggleClickRemoval(!clickRemovalMode),
    labelView: () => onToggleRightView(!labelViewEnabled),
    spineLabeling: toggleSpineLabelingMode,
    colorMode: toggleColorMode,
    approve: approveEditedFiles,
    versionHistory: () => { toggleVersionHistory(); versionHistory.getVersionHistory(); },
    implant: () => { if (showImplantView) { toggleImplantView(); } else { implantFileInputRef.current?.click(); } },
    undo: () => {},
  };

  const makeOnClick = useCallback((id: string) => () => toolCallbacksRef.current[id]?.(), []);

  useEffect(() => {
    const toolDefs: ToolDef[] = [
      { id: 'fileSelect', label: 'File Select', icon: 'fa-folder-open', active: false, onClick: makeOnClick('fileSelect'), hidden: true },
      { id: 'file', label: 'File', icon: 'fa-folder', active: showImplantView || versionHistoryEnabled, onClick: () => {}, children: [
        { id: 'upload', label: 'Upload', icon: 'fa-upload', active: false, disabled: false, onClick: makeOnClick('upload'), hidden: true },
        { id: 'approve', label: 'Approve', icon: 'fa-check', active: false, disabled: isApproving, onClick: makeOnClick('approve'), hidden: true },
        { id: 'implant', label: 'Implant', icon: 'fa-plus-square', active: showImplantView, onClick: makeOnClick('implant') },
        { id: 'download', label: 'Download', icon: 'fa-download', active: false, disabled: isDownloading, onClick: makeOnClick('download'), hidden: true },
        { id: 'screenshot', label: 'Screenshot', icon: 'fa-camera', active: false, onClick: makeOnClick('screenshot') },
        { id: 'versionHistory', label: 'Version History', icon: 'fa-history', active: versionHistoryEnabled, onClick: makeOnClick('versionHistory') },
      ]},
      { id: 'removing', label: 'Removing', icon: 'fa-eraser', active: removalMode || clickRemovalMode, danger: removalMode || clickRemovalMode, onClick: () => {}, children: [
        { id: 'boneRemoval', label: 'Bone Removal', icon: 'fa-cut', active: removalMode, danger: true, onClick: makeOnClick('boneRemoval') },
        { id: 'clickRemoval', label: 'Click Removal', icon: 'fa-trash', active: clickRemovalMode, danger: true, onClick: makeOnClick('clickRemoval') },
      ]},
      { id: 'movements', label: 'Movements', icon: 'fa-arrows-alt', active: rotationMode || rotationMode1 || rotationMode3 || inertialRotationMode || implantMoveMode, onClick: () => {}, children: [
        { id: 'horizontal', label: 'Horizontal', icon: 'fa-arrows-alt-h', active: rotationMode, onClick: makeOnClick('horizontal') },
        { id: 'vertical', label: 'Vertical', icon: 'fa-arrows-alt-v', active: rotationMode1, onClick: makeOnClick('vertical') },
        { id: 'longitudinal', label: 'Longitudinal', icon: 'fa-expand-arrows-alt', active: rotationMode3, onClick: makeOnClick('longitudinal') },
        { id: 'interactiveRotation', label: 'Interactive Rotation', icon: 'fa-cube', active: inertialRotationMode, onClick: makeOnClick('interactiveRotation') },
        { id: 'implantMove', label: 'Implant Move', icon: 'fa-hand-rock', active: implantMoveMode, onClick: makeOnClick('implantMove') },
      ]},
      { id: 'calculations', label: 'Calculations', icon: 'fa-calculator', active: measurementEnabled || angleMeasurementEnabled, onClick: () => {}, children: [
        { id: 'measurement', label: 'Measurement', icon: 'fa-ruler', active: measurementEnabled, onClick: makeOnClick('measurement') },
        { id: 'angle', label: 'Angle', icon: 'fa-angle-double-right', active: angleMeasurementEnabled, onClick: makeOnClick('angle') },
      ]},
      { id: 'smoothing', label: 'Smoothing', icon: 'fa-wave-square', active: showSmoothDialog, onClick: () => {}, children: [
        { id: 'smooth', label: 'Smooth', icon: 'fa-bezier-curve', active: showSmoothDialog, onClick: makeOnClick('smooth') },
        { id: 'wrap', label: 'Wrap', icon: 'fa-border-all', active: false, disabled: true, onClick: makeOnClick('wrap') },
      ]},
      { id: 'labeling', label: 'Labeling', icon: 'fa-tags', active: labelViewEnabled || spineLabelingMode || colorModeEnabled || brightnessEnabled, onClick: () => {}, children: [
        { id: 'labelView', label: 'Label View', icon: 'fa-columns', active: labelViewEnabled, onClick: makeOnClick('labelView') },
        { id: 'spineLabeling', label: 'Spine Labeling', icon: 'fa-tag', active: spineLabelingMode, onClick: makeOnClick('spineLabeling') },
        { id: 'colorMode', label: 'Color Mode', icon: 'fa-palette', active: colorModeEnabled, onClick: makeOnClick('colorMode') },
        { id: 'brightness', label: 'Brightness', icon: 'fa-sun', active: brightnessEnabled, onClick: makeOnClick('brightness') },
      ]},
      { id: 'connections', label: 'Connections', icon: 'fa-project-diagram', active: false, onClick: () => {}, hidden: true, children: [
        { id: 'linking', label: 'Linking', icon: 'fa-link', active: false, onClick: makeOnClick('linking') },
        { id: 'alignment', label: 'Alignment', icon: 'fa-route', active: false, onClick: makeOnClick('alignment') },
        { id: 'merge', label: 'Merge', icon: 'fa-object-group', active: false, onClick: makeOnClick('merge') },
      ]},
      { id: 'rotation', label: 'Rotation', icon: 'fa-sync-alt', active: rotationMode2, onClick: makeOnClick('rotation'), hidden: true },
      { id: 'undo', label: 'Undo', icon: 'fa-undo-alt', active: false, disabled: true, onClick: makeOnClick('undo'), hidden: true },
    ];
    registerTools(toolDefs);
  }, [
    removalMode, clickRemovalMode, brightnessEnabled, measurementEnabled,
    angleMeasurementEnabled, isDownloading,
    rotationMode, rotationMode1, rotationMode2, rotationMode3,
    implantMoveMode, inertialRotationMode, showSmoothDialog, colorModeEnabled,
    labelViewEnabled, spineLabelingMode, isApproving, versionHistoryEnabled, showImplantView,
    registerTools, makeOnClick,
  ]);

  // Clear tools on unmount
  useEffect(() => {
    return () => registerTools([]);
  }, [registerTools]);

  // ─── Camera sync between left and right panels ───
  useEffect(() => {
    if (!syncCameras) return;
    const leftCtrl = leftControlsRef.current;
    const rightCtrl = rightControlsRef.current;
    const leftCam = leftCameraRef.current;
    const rightCam = rightCameraRef.current;
    if (!leftCtrl || !rightCtrl || !leftCam || !rightCam) return;

    // Snapshot each panel's state at the moment sync is enabled so we only
    // apply deltas (rotation change + zoom ratio), preserving each model's
    // original apparent size and center.
    const leftInitTarget = leftCtrl.target.clone();
    const rightInitTarget = rightCtrl.target.clone();

    const toSpherical = (cam: THREE.PerspectiveCamera, ctrl: { target: THREE.Vector3 }) => {
      const offset = new THREE.Vector3().subVectors(cam.position, ctrl.target);
      const s = new THREE.Spherical().setFromVector3(offset);
      return s;
    };

    const leftInitSph = toSpherical(leftCam, leftCtrl);
    const rightInitSph = toSpherical(rightCam, rightCtrl);

    const syncCamera = (
      src: THREE.PerspectiveCamera, srcCtrl: typeof leftCtrl,
      srcInitSph: THREE.Spherical, srcInitTarget: THREE.Vector3,
      dst: THREE.PerspectiveCamera, dstCtrl: typeof rightCtrl,
      dstInitSph: THREE.Spherical, dstInitTarget: THREE.Vector3,
    ) => {
      const srcSph = toSpherical(src, srcCtrl);

      // Apply rotation deltas + zoom ratio relative to each camera's own starting state
      const dstSph = new THREE.Spherical(
        dstInitSph.radius * (srcSph.radius / srcInitSph.radius),
        dstInitSph.phi + (srcSph.phi - srcInitSph.phi),
        dstInitSph.theta + (srcSph.theta - srcInitSph.theta),
      );

      const offset = new THREE.Vector3().setFromSpherical(dstSph);

      // Sync pan: apply source's pan delta to destination's own center
      const panDelta = new THREE.Vector3().subVectors(srcCtrl.target, srcInitTarget);
      dstCtrl.target.copy(dstInitTarget).add(panDelta);

      dst.position.copy(dstCtrl.target).add(offset);
      dst.up.copy(src.up);
      dst.lookAt(dstCtrl.target);
      dst.zoom = src.zoom;
      dst.updateProjectionMatrix();
    };

    const onLeftChange = () => {
      if (isSyncingRef.current) return;
      isSyncingRef.current = true;
      syncCamera(leftCam, leftCtrl, leftInitSph, leftInitTarget, rightCam, rightCtrl, rightInitSph, rightInitTarget);
      isSyncingRef.current = false;
    };

    const onRightChange = () => {
      if (isSyncingRef.current) return;
      isSyncingRef.current = true;
      syncCamera(rightCam, rightCtrl, rightInitSph, rightInitTarget, leftCam, leftCtrl, leftInitSph, leftInitTarget);
      isSyncingRef.current = false;
    };

    leftCtrl.addEventListener('change', onLeftChange);
    rightCtrl.addEventListener('change', onRightChange);

    return () => {
      leftCtrl.removeEventListener('change', onLeftChange);
      rightCtrl.removeEventListener('change', onRightChange);
    };
  }, [syncCameras]);

  // ─── Smooth dialog helpers ───
  const smoothMeshNames = React.useMemo(() => {
    return meshRefs.current.left.map((mesh, i) => ({
      index: i,
      name: mesh.userData.fullName || mesh.userData.fileName || `STL ${i + 1}`,
    }));
  }, [meshRefs.current.left.length]);

  const handleApplySmooth = useCallback(
    async ({ iterations, lambda, selectedIndices, onProgress }: { iterations: number; lambda: number; selectedIndices: number[]; onProgress: (p: number) => void }) => {
      const totalMeshes = selectedIndices.length;
      let completed = 0;
      for (const idx of selectedIndices) {
        const leftMesh = meshRefs.current.left[idx];
        const rightMesh = meshRefs.current.right[idx];
        const perMeshProgress = (p: number) => {
          const base = (completed / totalMeshes) * 100;
          const portion = (p / 100) * (1 / totalMeshes) * 100;
          onProgress(Math.round(base + portion));
        };
        if (leftMesh) {
          await laplacianSmooth(leftMesh.geometry, iterations, lambda, perMeshProgress);
        }
        if (rightMesh) {
          await laplacianSmooth(rightMesh.geometry, iterations, lambda);
        }
        completed++;
        onProgress(Math.round((completed / totalMeshes) * 100));
      }
    },
    []
  );

  return (
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'row',
      width: '100%', height: '100%',
      backgroundColor: '#0a0e17', position: 'relative',
    }}>
      {/* ─── Left Panel ─── */}
      <div style={{ flex: 1, position: 'relative', borderRight: '2px solid #ffffff' }}>
        <div style={{
          position: 'absolute', top: 0, left: 10, color: '#fff', zIndex: 10,
          display: 'flex', alignItems: 'center', gap: '8px',
          marginTop: '12px',
        }}>
          <div style={{
            backgroundColor: '#0a0e17', padding: '4px 8px', borderRadius: '4px',
            fontSize: '12px',
          }}>
            {leftLabel ? `Current Series: ${leftLabel}` : '3D View'}
          </div>
          <div
            onClick={() => togglePanel('left')}
            style={{
              width: '14px', height: '14px', borderRadius: '50%', cursor: 'pointer',
              border: `2px solid ${isPanelActive('left') ? '#00ffff' : '#555'}`,
              backgroundColor: isPanelActive('left') ? '#00ffff' : 'transparent',
              transition: 'all 0.15s ease',
            }}
            title={isPanelActive('left') ? 'Tools active on this panel' : 'Tools inactive on this panel'}
          />
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

        {leftError && !leftLoading && (
          <div style={{
            position: 'absolute', top: '50px', left: '50%', transform: 'translateX(-50%)',
            zIndex: 10, background: 'rgba(255,0,0,0.8)', color: '#fff',
            padding: '10px 20px', borderRadius: '6px', fontSize: '14px',
          }}>
            {leftError}
          </div>
        )}

        <div ref={leftMountRef} style={{ width: '100%', height: '100%', overflow: 'hidden' }} />
        <canvas
          ref={removalCanvasRef}
          style={{
            position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
            pointerEvents: 'none', zIndex: 150, userSelect: 'none',
          }}
        />
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
          position: 'absolute', top: 0, left: 10, color: '#ffffff', zIndex: 10,
          display: 'flex', alignItems: 'center', gap: '8px',
          marginTop: '12px',
        }}>
          <div style={{
            backgroundColor: '#0a0e17', padding: '4px 8px', borderRadius: '4px',
            fontSize: '12px',
          }}>
            {rightLabel || 'Compare Panel'}
          </div>
          <div
            onClick={() => togglePanel('right')}
            style={{
              width: '14px', height: '14px', borderRadius: '50%', cursor: 'pointer',
              border: `2px solid ${isPanelActive('right') ? '#00ffff' : '#555'}`,
              backgroundColor: isPanelActive('right') ? '#00ffff' : 'transparent',
              transition: 'all 0.15s ease',
            }}
            title={isPanelActive('right') ? 'Tools active on this panel' : 'Tools inactive on this panel'}
          />
          <button
            onClick={() => setSyncCameras(prev => !prev)}
            style={{
              padding: '4px 10px', borderRadius: '4px', fontSize: '11px',
              border: syncCameras ? '1px solid #4FC3F7' : '1px solid #334',
              backgroundColor: syncCameras ? 'rgba(79,195,247,0.2)' : '#1a1f2e',
              color: syncCameras ? '#4FC3F7' : '#aab',
              cursor: 'pointer', fontWeight: 500,
              display: 'flex', alignItems: 'center', gap: '4px',
            }}
          >
            <i className="fas fa-sync-alt" style={{ fontSize: '10px' }} />
            Sync
          </button>
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
              <div style={{ marginBottom: '12px' }}>Drop a series here</div>
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
                position: 'absolute', top: 10, right: 10, zIndex: 10,
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
        <canvas
          ref={rightRemovalCanvasRef}
          style={{
            position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
            pointerEvents: 'none', zIndex: 150, userSelect: 'none',
          }}
        />
      </div>
      {/* ─── Bone removal loading overlay ─── */}
      {removing && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 2000, background: "rgba(0,0,0,0.5)",
          display: "flex", alignItems: "center", justifyContent: "center"
        }}>
          <style>{`
            @keyframes stl-bar-fill {
              0%   { transform: scaleX(0); }
              15%  { transform: scaleX(0.2); }
              40%  { transform: scaleX(0.5); }
              70%  { transform: scaleX(0.75); }
              90%  { transform: scaleX(0.88); }
              100% { transform: scaleX(0.95); }
            }
            @keyframes stl-pct-show { to { opacity: 1; } }
            @keyframes stl-pct-hide { to { opacity: 0; } }
          `}</style>
          <div style={{
            background: "#222", color: "#fff", padding: "24px 32px", borderRadius: "12px",
            fontSize: "22px", fontWeight: "bold", boxShadow: "0 4px 24px #0008",
            display: "flex", flexDirection: "column", alignItems: "center", minWidth: "300px"
          }}>
            <div style={{ display: "flex", alignItems: "center", marginBottom: 16 }}>
              <span className="spinner-border spinner-border-lg" style={{marginRight: 16}}/>
              Removing ...
            </div>
            <div style={{
              width: "100%", height: "8px", background: "#444", borderRadius: "4px", overflow: "hidden"
            }}>
              <div style={{
                width: "100%", height: "100%",
                background: "linear-gradient(90deg, #4FC3F7, #2196F3)",
                borderRadius: "4px",
                transformOrigin: "left",
                transform: "scaleX(0)",
                animation: "stl-bar-fill 6s ease-out forwards",
              }} />
            </div>
            <div style={{ position: "relative", height: 22, width: 50, marginTop: 10 }}>
              {[
                { pct: 0,  show: 0,   hide: 0.8 },
                { pct: 15, show: 0.8, hide: 1.6 },
                { pct: 30, show: 1.6, hide: 2.4 },
                { pct: 50, show: 2.4, hide: 3.2 },
                { pct: 65, show: 3.2, hide: 4.0 },
                { pct: 80, show: 4.0, hide: 4.8 },
                { pct: 90, show: 4.8, hide: 5.5 },
                { pct: 95, show: 5.5, hide: -1  },
              ].map(({ pct, show, hide }) => (
                <span key={pct} style={{
                  position: "absolute", left: 0, right: 0, textAlign: "center",
                  fontSize: "16px", fontWeight: 600, color: "#4FC3F7",
                  opacity: pct === 0 ? 1 : 0,
                  animation: pct === 0
                    ? `stl-pct-hide 0.1s ${hide}s forwards`
                    : hide > 0
                      ? `stl-pct-show 0.1s ${show}s forwards, stl-pct-hide 0.1s ${hide}s forwards`
                      : `stl-pct-show 0.1s ${show}s forwards`,
                }}>{pct}%</span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Hidden implant file input */}
      <input
        ref={implantFileInputRef}
        type="file"
        accept=".stl"
        style={{ display: 'none' }}
        onChange={(e) => {
          // Basic implant loading — add to left group
          if (!e.target.files?.length) return;
          const file = e.target.files[0];
          const loader = new STLLoader();
          const reader = new FileReader();
          reader.onload = (ev) => {
            const geometry = loader.parse(ev.target!.result as ArrayBuffer);
            geometry.computeVertexNormals();
            const material = new THREE.MeshPhongMaterial({ color: 0x00ff88, shininess: 80, transparent: true, opacity: 0.85 });
            const mesh = new THREE.Mesh(geometry, material);
            mesh.userData = { fileName: file.name, isImplant: true, type: 'I' };
            leftGroupRef.current.add(mesh);
            meshRefs.current.left.push(mesh);
          };
          reader.readAsArrayBuffer(file);
          e.target.value = '';
        }}
      />

      <SmoothDialog
        isOpen={showSmoothDialog}
        onClose={() => setShowSmoothDialog(false)}
        meshNames={smoothMeshNames}
        onApply={handleApplySmooth}
      />
    </div>
  );
};

export default ThreeDCompareViewer;
