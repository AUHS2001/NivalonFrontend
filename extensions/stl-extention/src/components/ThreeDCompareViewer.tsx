import React, { useContext, useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader';
import { useDrop } from 'react-dnd';
import { StlInstanceContext } from '../../../../platform/app/src/context/StlInstanceContext';
import { StlInstanceListDataContext } from '../../../../platform/app/src/context/StlInstanceListDataContext';
import { SERVER_URL, fetchFile } from '../../../../config/server';
import { LPS_UP } from '../utils/coordinateSystem';
import { useStlVisibilityContext } from '../context/StlVisibilityContext';
import { useBoneRemovalContext } from '../context/BoneRemovalContext';
import { useClickRemoveContext } from '../context/ClickRemoveContext';
import { useBoneRemoval } from '../hooks/useBoneRemoval';
import { MeshRefs } from '../types/three.types';

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
      color: 0x00ff00, specular: 0x111111, shininess: 30, side: THREE.DoubleSide,
      transparent: true, opacity: 0.9,
      emissive: new THREE.Color(0x00ff00), emissiveIntensity: 0.3,
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

  // 3D Tool contexts
  const { removalMode } = useBoneRemovalContext();
  const { clickRemovalMode } = useClickRemoveContext();

  // Mesh refs for bone removal hook
  const meshRefs = useRef<MeshRefs>({ left: [], right: [] });

  // Bone removal state
  const [removalOutline, setRemovalOutline] = useState<{ x: number, y: number }[]>([]);
  const [rightRemovalOutline, setRightRemovalOutline] = useState<{ x: number, y: number }[]>([]);
  const [removing, setRemoving] = useState(false);
  const [undoStack, setUndoStack] = useState<THREE.BufferGeometry[][]>([]);
  const removalCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const rightRemovalCanvasRef = useRef<HTMLCanvasElement | null>(null);

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
        const stlUrls: string[] = data?.data?.processed?.urls || [];
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
    removalMode,
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
    removalMode,
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

  // ─── Click removal for LEFT panel ───
  useEffect(() => {
    if (!clickRemovalMode) return;

    const leftRenderer = leftRendererRef.current;
    const canvas = leftRenderer?.domElement;
    if (!canvas) return;

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
    };
  }, [clickRemovalMode]);

  // ─── Click removal for RIGHT panel ───
  useEffect(() => {
    if (!clickRemovalMode) return;

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
  }, [clickRemovalMode]);

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
          const urls: string[] = data?.data?.processed?.urls || [];
          if (urls.length > 0) {
            addRightFromUrls(urls, seriesDesc ? `Series: ${seriesDesc}` : 'Series');
          }
        })
        .catch(err => console.error('[3D Compare Drop] Fetch error:', err));

      return { handled3dCompare: true };
    },
    collect: monitor => ({ isOver: monitor.isOver() }),
  });

  return (
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'row',
      width: '100%', height: '100%',
      backgroundColor: '#0a0e17', position: 'relative',
    }}>
      {/* ─── Left Panel ─── */}
      <div style={{ flex: 1, position: 'relative', borderRight: '2px solid #ffffff' }}>
        <div style={{
          position: 'absolute', top: 0, left: 10, color: '#fff', zIndex: 100,
          backgroundColor: '#0a0e17', padding: '4px 8px', borderRadius: '4px',
          fontSize: '12px', marginTop: '12px',
        }}>
          {leftLabel ? `Current Series: ${leftLabel}` : '3D View'}
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
            zIndex: 100, background: 'rgba(255,0,0,0.8)', color: '#fff',
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
        <canvas
          ref={rightRemovalCanvasRef}
          style={{
            position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
            pointerEvents: 'none', zIndex: 150, userSelect: 'none',
          }}
        />
      </div>
    </div>
  );
};

export default ThreeDCompareViewer;
