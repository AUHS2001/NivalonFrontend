import React, { useEffect, useRef, useState, useContext, useCallback } from 'react';
import * as THREE from 'three';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter';
import "./styles/style.css";

// Context
import { StlInstanceContext } from './../../../platform/app/src/context/StlInstanceContext';
import { StlInstanceListDataContext } from './../../../platform/app/src/context/StlInstanceListDataContext';
import { ParentStudyIdContext } from './../../../platform/app/src/context/parentStudyIdContext';
import { SERVER_URL, fetchFile } from '../../../config/server';
import { LPS_UP } from './utils/coordinateSystem';

// Hooks
import { useSTLLoader } from './hooks/useSTLLoader';
import { useBoneRemoval } from './hooks/useBoneRemoval';
import { useImplantViewer } from './hooks/useImplantViewer';
import { useVersionHistory } from './hooks/useVersionHistory';
import { useBrightness } from './hooks/useBrightness';

// Components
import { Toolbar } from './components/Toolbar';
import { ControlPanel } from './components/ControlPanel';
import { ViewerContainer } from './components/ViewerContainer';
import { VersionHistory } from './components/VersionHistory';
import { ImplantViewer } from './components/ImplantViewer';

// Types
import { MeshRefs, RemovalUndoItem } from './types/three.types';

// Utils
import { handleScreenshot as handleScreenshotUtil } from './utils/fileHandlers';
// import cornerstoneTools from 'platform/core/src/__mocks__/cornerstone-tools';
import cornerstoneTools from '../../../platform/core/src/__mocks__/cornerstone-tools';
import { useVersionHistoryContext } from './context/VersionHistoryContext';
import { useImplantContext } from './context/ImplantContext';
import { useAngleMeasurementContext } from './context/AngleMeasurementContext';
import { AngleMeasurementPanel } from './components/AngleMeasurementPanel';
import {
  maskVoxelsForRemovedVertices,
  restoreVoxels,
  forceRerenderMPRViewports,
  extractRemovedVerticesFromClick,
  computeSTLBounds,
  VoxelUndoSnapshot,
  markRemovedVoxelsRed,
  clearRemovedVoxelsRed,
  clearAllBoneRemovalOverlay,
} from './utils/voxelMaskingManager';


interface SpinalCordViewerProps {
  servicesManager?: any;
  commandsManager?: any;
  extensionManager?: any;
}


const SpinalCordViewer: React.FC<SpinalCordViewerProps> = ({
  servicesManager: propServicesManager,
  commandsManager,
  extensionManager
}) => {
  // State
  const [files, setFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadProgress, setLoadProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [brightnessEnabled, setBrightnessEnabled] = useState(false);
  const [measurementEnabled, setMeasurementEnabled] = useState(false);
  const [brightness, setBrightness] = useState(1.0);
  const [undoStack, setUndoStack] = useState<THREE.BufferGeometry[][]>([]);
  const [removalMode, setRemovalMode] = useState(false);
  const [removalOutline, setRemovalOutline] = useState<{ x: number, y: number }[]>([]);
  const [removing, setRemoving] = useState(false);
  const [tetsStls, setTestStls] = useState<string[]>([]);
  const [clickRemovalMode, setClickRemovalMode] = useState(false);
  const [clickRemovalUndoStack, setClickRemovalUndoStack] = useState<RemovalUndoItem[]>([]);
  const voxelUndoStackRef = useRef<VoxelUndoSnapshot[]>([]);
  const [isDownloading, setIsDownloading] = useState(false);
  const [showRightView, setShowRightView] = useState(false);
  const [isApproving, setIsApproving] = useState(false);
  const [approveSuccess, setApproveSuccess] = useState<string | null>(null);

  // Refs
  const removalOutlinePoints = useRef<{ x: number, y: number }[]>([]);
  const removalCanvasRef = useRef<HTMLCanvasElement>(null);
  const leftMountRef = useRef<HTMLDivElement>(null);
  const rightMountRef = useRef<HTMLDivElement>(null);
  const startMountRef = useRef<HTMLDivElement>(null);
  const implantMountRef = useRef<HTMLDivElement>(null);

  const leftSceneRef = useRef<THREE.Scene>(new THREE.Scene());
  const rightSceneRef = useRef<THREE.Scene>(new THREE.Scene());
  const startSceneRef = useRef<THREE.Scene>(new THREE.Scene());
  const implantSceneRef = useRef<THREE.Scene>(new THREE.Scene());

  const leftRendererRef = useRef<THREE.WebGLRenderer>();
  const rightRendererRef = useRef<THREE.WebGLRenderer>();
  const startRendererRef = useRef<THREE.WebGLRenderer>();
  const implantRendererRef = useRef<THREE.WebGLRenderer>();

  const cameraRef = useRef<THREE.PerspectiveCamera>();
  const implantCameraRef = useRef<THREE.PerspectiveCamera>();

  const leftControlsRef = useRef<OrbitControls>();
  const rightControlsRef = useRef<OrbitControls>();
  const startControlsRef = useRef<OrbitControls>();
  const implantControlsRef = useRef<OrbitControls>();

  const leftGroupRef = useRef<THREE.Group>(new THREE.Group());
  const rightGroupRef = useRef<THREE.Group>(new THREE.Group());
  const startGroupRef = useRef<THREE.Group>(new THREE.Group());
  const implantGroupRef = useRef<THREE.Group>(new THREE.Group());

  const meshRefs = useRef<MeshRefs>({ left: [], right: [] });
  const startMeshRefs = useRef<THREE.Mesh[]>([]);
  const animationIdRef = useRef<number>();
  const clickListenersRef = useRef<(() => void)[]>([]);

  // Context
  const context = useContext(StlInstanceContext);
  const context1 = useContext(StlInstanceListDataContext);
  const context3 = useContext(ParentStudyIdContext);

  const { stlInstanceId, updateStlInstanceId, seriesList } = context;
  const { stlInstanceListData, updateStlInstanceListData } = context1;
  const { parentStudyId, updateParentStudyId } = context3;

  const userRole = localStorage.getItem('userRole');
  const userToken = localStorage.getItem('token') || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIzIiwicm9sZSI6ImFuYWx5c3QiLCJleHAiOjE3OTYyMDMxNDF9.cLkGlpxslfYOe_ZKuseyCiuP7jsr3m8XXZyyrUU5B1Y';

  const [isCreatingSegmentation, setIsCreatingSegmentation] = useState(false);
  const [segmentationCreated, setSegmentationCreated] = useState(false);
  const [ohifServices, setOhifServices] = useState<any>(null);
  const [hasSegmentationService, setHasSegmentationService] = useState(false);
  const { versionHistoryEnabled, versions, setVersions, restoredUrls, setRestoredUrls, setPreviousViewLoading } = useVersionHistoryContext();
  const { showImplantView } = useImplantContext();

  const {
    angleMeasurementEnabled,
    toggleAngleMeasurement,
    setupAngleMeasurementMode,
    cleanupAngleMeasurementMode
  } = useAngleMeasurementContext();

  const versionHistory = useVersionHistory({
    setLoading,
    setError,
    setApproveSuccess,
    setStlUrls: setTestStls
  });


  useEffect(() => {
    const checkServices = () => {
      console.log('🔍 Checking for OHIF services...');

      // Check services manager from props first
      if (propServicesManager) {
        console.log('✅ ServicesManager from props:', propServicesManager);

        // Get the actual services from the services manager
        const services = propServicesManager.services || propServicesManager;

        // Check if segmentation service exists
        const segmentationService = services.segmentationService ||
                                  services.segmentation ||
                                  services._services?.segmentationService;

        if (segmentationService) {
          console.log('✅ Segmentation service found:', segmentationService);
          setOhifServices(services);
          setHasSegmentationService(true);
          return true;
        } else {
          console.log('❌ No segmentation service found in services manager');
          console.log('Available services:', Object.keys(services));

          // Check nested services
          if (services._services) {
            console.log('Nested services:', Object.keys(services._services));
          }
        }
      }

      // Fallback to window services
      const windowServices = (window as any).OHIF?.services;
      if (windowServices?.segmentationService) {
        console.log('✅ Using window OHIF services');
        setOhifServices(windowServices);
        setHasSegmentationService(true);
        return true;
      }

      console.log('❌ No valid services found');
      return false;
    };

    if (!checkServices()) {
      // If services not found immediately, wait a bit and try again
      // OHIF services might still be initializing
      const timeoutId = setTimeout(() => {
        console.log('🔄 Retrying service detection...');
        checkServices();
      }, 2000);

      return () => clearTimeout(timeoutId);
    }
  }, [propServicesManager]);

  // Debug effect to log service availability
  useEffect(() => {
    console.log('📊 Service Status:', {
      hasServicesManager: !!propServicesManager,
      hasOhifServices: !!ohifServices,
      hasSegmentationService,
      services: ohifServices ? Object.keys(ohifServices) : 'none'
    });
  }, [ohifServices, hasSegmentationService, propServicesManager]);

  const performVoxelMasking = useCallback((removedVertices: THREE.Vector3[], preComputedBounds?: { min: THREE.Vector3; max: THREE.Vector3 }) => {
    if (removedVertices.length === 0) return;
    const stlBounds = preComputedBounds || computeSTLBounds(meshRefs.current.left);
    const snapshot = maskVoxelsForRemovedVertices(removedVertices, stlBounds, propServicesManager);
    if (snapshot) {
      voxelUndoStackRef.current.push(snapshot);
      forceRerenderMPRViewports(propServicesManager);
      markRemovedVoxelsRed(snapshot, propServicesManager);
    }
  }, [propServicesManager]);

  const { removalOutlinePoints: boneRemovalPoints } = useBoneRemoval({
    removalMode,
    leftRendererRef,
    leftControlsRef,
    cameraRef,
    meshRefs,
    removalCanvasRef,
    setRemoving,
    setUndoStack,
    setRemovalOutline,
    removalOutline,
    onRemovalComplete: (removedVertices, preRemovalBounds) => {
      performVoxelMasking(removedVertices, preRemovalBounds);
    },
  });

  const {
    implantFile,
    implantMesh,
    implantMountRef: implantMountRefFromHook,
    handleImplantFileChange,
    loadImplant,
    centerImplant
  } = useImplantViewer({
    brightnessEnabled,
    brightness
  });

  // Watch for version restore — load ONLY into the Previous View (start group)
  useEffect(() => {
    if (!restoredUrls || restoredUrls.length === 0) return;

    console.log('[SpinalCordViewer] Loading restored version into Previous View only:', restoredUrls);
    const urls = [...restoredUrls];
    setRestoredUrls(null); // Clear immediately so future restores trigger again
    setPreviousViewLoading(true);

    const loader = new STLLoader();
    const startGroup = startGroupRef.current;

    // Clear previous meshes from start group
    startGroup.clear();
    startMeshRefs.current = [];

    const loadPromises = urls.map(async (url) => {
      try {
        const response = await fetchFile(url);
        if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
        const arrayBuffer = await response.arrayBuffer();
        const geometry = loader.parse(arrayBuffer);
        geometry.computeBoundingBox();
        const fileName = url.substring(url.lastIndexOf('/') + 1);
        return { geometry, fileName, url };
      } catch (error) {
        console.error(`Failed to load ${url}:`, error);
        return null;
      }
    });

    Promise.all(loadPromises).then((results) => {
      const valid = results.filter(Boolean);
      valid.forEach((v) => {
        if (!v) return;
        const material = new THREE.MeshPhongMaterial({
          color: 0xffffff,
          specular: 0x111111,
          shininess: 10,
          side: THREE.DoubleSide,
        });
        const mesh = new THREE.Mesh(v.geometry, material);
        mesh.userData = { fileName: v.fileName };
        startGroup.add(mesh);
        startMeshRefs.current.push(mesh);
      });

      // Center start camera on loaded meshes
      if (startGroup.children.length > 0 && startControlsRef.current) {
        const bbox = new THREE.Box3().setFromObject(startGroup);
        const center = bbox.getCenter(new THREE.Vector3());
        const size = bbox.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z);
        const startCamera = startControlsRef.current.object as THREE.PerspectiveCamera;
        const fov = startCamera.fov * (Math.PI / 180);
        const fitDist = maxDim / (2 * Math.tan(fov / 2));
        startCamera.position.set(center.x, center.y - fitDist * 2, center.z);
        startCamera.up.set(0, 0, 1);
        startCamera.lookAt(center);
        startControlsRef.current.target.copy(center);
        startControlsRef.current.update();
      }
    }).finally(() => {
      setPreviousViewLoading(false);
    });
  }, [restoredUrls]);

  useBrightness({
    brightnessEnabled,
    brightness,
    meshRefs
  });

  useSTLLoader({
    stlUrls: tetsStls,
    leftGroupRef,
    rightGroupRef,
    startGroupRef,
    meshRefs,
    startMeshRefs,
    cameraRef,
    leftControlsRef,
    rightControlsRef,
    startControlsRef,
    startRendererRef,
    startSceneRef,
    setLoading,
    setError,
    setLoadProgress
  });


  // Data fetching
  useEffect(() => {
    const fetchData = async () => {
      setError(null);
      try {
        const response = await fetch(
          `${SERVER_URL}/analyst/meshes?series_instance_uid=${stlInstanceId}`,
          {
            headers: {
              Authorization: `Bearer ${userToken}`,
              "Content-Type": "application/json"
            },
            credentials: 'include',
          }
        );

        console.log(`[STL Fetch] GET ${SERVER_URL}/analyst/meshes?series_instance_uid=${stlInstanceId} → Status: ${response.status}`);
        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          console.error('[STL Fetch] Error response:', errData);
          throw new Error(errData.message || errData.detail || 'Failed to fetch data');
        }

        const data = await response.json();
        const versions = data?.data?.versions || [];
        setVersions(versions);

        if (versions.length > 0) {
          const latestVersion = versions.reduce((a, b) => (a.version > b.version ? a : b));
          console.log('[STL Fetch] Using latest version:', latestVersion.version, latestVersion.urls);
          setTestStls(latestVersion.urls || []);
        } else {
          console.log('[STL Fetch] No versions, using processed URLs:', data?.data?.processed?.urls);
          setTestStls(data?.data?.processed?.urls || []);
        }
        versionHistory.getVersionHistory();
      } catch (err: any) {
        setError(err.message);
      }
    };

    if (stlInstanceId) {
      fetchData();
    }
  }, [stlInstanceId, userToken]);

  // Three.js Viewer and Controls Setup
  useEffect(() => {
    const leftScene = leftSceneRef.current;
    const rightScene = rightSceneRef.current;
    const leftMount = leftMountRef.current!;
    const rightMount = rightMountRef.current!;

    leftScene.background = new THREE.Color(0x000000);
    rightScene.background = new THREE.Color(0x000000);

    // LPS coordinate system: Z is Superior (up)
    const camera = new THREE.PerspectiveCamera(
      45, leftMount.clientWidth / leftMount.clientHeight, 0.1, 10000
    );
    camera.up.copy(LPS_UP); // Set Z as up for LPS
    camera.position.set(0, -250, 50); // Anterior view (looking from front)
    camera.lookAt(0, 0, 0);
    cameraRef.current = camera;

    const leftRenderer = new THREE.WebGLRenderer({ antialias: true });
    leftRenderer.setSize(leftMount.clientWidth, leftMount.clientHeight);
    leftRenderer.setPixelRatio(window.devicePixelRatio);
    leftRendererRef.current = leftRenderer;
    leftMount.appendChild(leftRenderer.domElement);

    const rightRenderer = new THREE.WebGLRenderer({ antialias: true });
    rightRenderer.setSize(rightMount.clientWidth, rightMount.clientHeight);
    rightRenderer.setPixelRatio(window.devicePixelRatio);
    rightRendererRef.current = rightRenderer;
    rightMount.appendChild(rightRenderer.domElement);

    const leftControls = new OrbitControls(camera, leftRenderer.domElement);
    const rightControls = new OrbitControls(camera, rightRenderer.domElement);

    [leftControls, rightControls].forEach(ctrl => {
      ctrl.enableDamping = true;
      ctrl.dampingFactor = 0.25;
      ctrl.maxDistance = 5000;
    });

    leftControlsRef.current = leftControls;
    rightControlsRef.current = rightControls;

    function setupLighting(scene: THREE.Scene) {
      // Ambient light
      scene.add(new THREE.AmbientLight(0xffffff, 0.6));

      // Key light (main light)
      const keyLight = new THREE.DirectionalLight(0xffffff, 0.7);
      keyLight.position.set(1, 1, 1).normalize();
      scene.add(keyLight);

      // Fill light (softer, from opposite side)
      const fillLight = new THREE.DirectionalLight(0xffffff, 0.4);
      fillLight.position.set(-1, 0.5, -0.5).normalize();
      scene.add(fillLight);

      // Back light
      const backLight = new THREE.DirectionalLight(0xffffff, 0.25);
      backLight.position.set(0, 0, -1).normalize();
      scene.add(backLight);

      // Hemisphere light for even illumination
      const hemisphereLight = new THREE.HemisphereLight(0xffffff, 0x444444, 0.3);
      scene.add(hemisphereLight);
    }

    setupLighting(leftScene);
    setupLighting(rightScene);

    leftScene.add(leftGroupRef.current);
    rightScene.add(rightGroupRef.current);

    const animate = () => {
      animationIdRef.current = requestAnimationFrame(animate);
      leftControls.update();
      leftRenderer.render(leftScene, camera);
      if (rightMount.offsetParent !== null) {
        rightControls.update();
        rightRenderer.render(rightScene, camera);
      }
    };
    animate();

    const handleResize = () => {
      const width = leftMount.clientWidth;
      const height = leftMount.clientHeight;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      leftRenderer.setSize(width, height);
      rightRenderer.setSize(width, height);

      if (removalCanvasRef.current) {
        removalCanvasRef.current.width = width;
        removalCanvasRef.current.height = height;
      }
    };

    window.addEventListener('resize', handleResize);

    return () => {
      if (animationIdRef.current) {
        cancelAnimationFrame(animationIdRef.current);
      }
      window.removeEventListener('resize', handleResize);

      if (leftMount.contains(leftRenderer.domElement)) {
        leftMount.removeChild(leftRenderer.domElement);
      }
      if (rightMount.contains(rightRenderer.domElement)) {
        rightMount.removeChild(rightRenderer.domElement);
      }

      leftRenderer.dispose();
      rightRenderer.dispose();
    };
  }, []);

  // Start view (Previous View) setup — runs when version history is toggled on
  useEffect(() => {
    if (!versionHistoryEnabled) return;

    // Wait a tick for the DOM to mount the startMountRef div
    const timer = setTimeout(() => {
      const startMount = startMountRef.current;
      if (!startMount || startRendererRef.current) return; // already set up or no mount

      const startScene = startSceneRef.current;
      startScene.background = new THREE.Color(0x000000);

      // Only add lights and group if not already in the scene
      if (!startScene.children.some(c => c instanceof THREE.AmbientLight)) {
        startScene.add(new THREE.AmbientLight(0xffffff, 0.6));
        const keyLight = new THREE.DirectionalLight(0xffffff, 0.7);
        keyLight.position.set(1, 1, 1).normalize();
        startScene.add(keyLight);
        const fillLight = new THREE.DirectionalLight(0xffffff, 0.4);
        fillLight.position.set(-1, 0.5, -0.5).normalize();
        startScene.add(fillLight);
        const backLight = new THREE.DirectionalLight(0xffffff, 0.25);
        backLight.position.set(0, 0, -1).normalize();
        startScene.add(backLight);
        startScene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 0.3));
      }

      // Add the start group to the scene if not already there
      if (!startScene.children.includes(startGroupRef.current)) {
        startScene.add(startGroupRef.current);
      }

      const width = startMount.clientWidth || 400;
      const height = startMount.clientHeight || 400;

      // Create start camera (separate from left/right camera)
      const startCamera = new THREE.PerspectiveCamera(45, width / height, 0.1, 10000);
      startCamera.up.copy(LPS_UP);
      startCamera.position.set(0, -250, 50);
      startCamera.lookAt(0, 0, 0);

      // Create start renderer
      const startRenderer = new THREE.WebGLRenderer({ antialias: true });
      startRenderer.setSize(width, height);
      startRenderer.setPixelRatio(window.devicePixelRatio);
      startRendererRef.current = startRenderer;
      startMount.appendChild(startRenderer.domElement);

      // Create start controls
      const startControls = new OrbitControls(startCamera, startRenderer.domElement);
      startControls.enableDamping = true;
      startControls.dampingFactor = 0.25;
      startControls.maxDistance = 5000;
      startControlsRef.current = startControls;

      // Center camera on existing start group content
      if (startGroupRef.current.children.length > 0) {
        const bbox = new THREE.Box3().setFromObject(startGroupRef.current);
        const center = bbox.getCenter(new THREE.Vector3());
        const size = bbox.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z);
        const fov = startCamera.fov * (Math.PI / 180);
        const fitDist = maxDim / (2 * Math.tan(fov / 2));
        startCamera.position.set(center.x, center.y - fitDist * 2, center.z);
        startCamera.lookAt(center);
        startControls.target.copy(center);
        startControls.update();
      }

      // Animation loop for start view
      let startAnimId: number;
      const animateStart = () => {
        startAnimId = requestAnimationFrame(animateStart);
        if (startMount.offsetParent !== null) {
          startControls.update();
          startRenderer.render(startScene, startCamera);
        }
      };
      animateStart();

      // Resize handler
      const handleStartResize = () => {
        const w = startMount.clientWidth;
        const h = startMount.clientHeight;
        if (w > 0 && h > 0) {
          startCamera.aspect = w / h;
          startCamera.updateProjectionMatrix();
          startRenderer.setSize(w, h);
        }
      };
      window.addEventListener('resize', handleStartResize);

      // Store cleanup in a ref so it can be called on unmount
      (startMountRef as any)._cleanup = () => {
        cancelAnimationFrame(startAnimId);
        window.removeEventListener('resize', handleStartResize);
        if (startMount.contains(startRenderer.domElement)) {
          startMount.removeChild(startRenderer.domElement);
        }
        startRenderer.dispose();
        startRendererRef.current = undefined;
        startControlsRef.current = undefined;
      };
    }, 50);

    return () => {
      clearTimeout(timer);
      if ((startMountRef as any)._cleanup) {
        (startMountRef as any)._cleanup();
        (startMountRef as any)._cleanup = null;
      }
    };
  }, [versionHistoryEnabled]);

  // Right view resize handler
  useEffect(() => {
    if (showRightView && rightRendererRef.current && rightMountRef.current && cameraRef.current && rightSceneRef.current) {
      const width = rightMountRef.current.clientWidth;
      const height = rightMountRef.current.clientHeight;

      rightRendererRef.current.setSize(width, height);
      rightRendererRef.current.render(rightSceneRef.current, cameraRef.current);
    }
  }, [showRightView]);

  // Click removal mode
  useEffect(() => {
    if (!clickRemovalMode) return;

    const leftRenderer = leftRendererRef.current;
    const canvas = leftRenderer?.domElement;
    if (!canvas) return;

    const onClick = (event: MouseEvent) => {
      if (event.button !== 0) return; // Only left-click

      const rect = canvas.getBoundingClientRect();
      const mouse = new THREE.Vector2(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1,
      );

      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(mouse, cameraRef.current!);

      // Only consider visible meshes on the left side
      const meshes = meshRefs.current.left.filter(mesh => mesh.visible);
      const intersects = raycaster.intersectObjects(meshes, true);

      if (intersects.length > 0) {
        const selectedMesh = intersects[0].object as THREE.Mesh;

        // Remove the mesh from scene and refs
        const idx = meshRefs.current.left.findIndex(m => m === selectedMesh);
        if (idx !== -1) {
          const leftMesh = meshRefs.current.left[idx];
          const rightMesh = meshRefs.current.right[idx];

          // Compute bounds BEFORE removing mesh so STL→DICOM transform is correct
          const preRemovalBounds = computeSTLBounds(meshRefs.current.left);

          // Remove from scene
          leftGroupRef.current.remove(leftMesh);
          rightGroupRef.current.remove(rightMesh);

          // Remove from refs
          meshRefs.current.left.splice(idx, 1);
          meshRefs.current.right.splice(idx, 1);

          // Push into undo stack
          setClickRemovalUndoStack(stack => [
            ...stack,
            { leftMesh, rightMesh, index: idx }
          ]);

          // Mask corresponding DICOM voxels
          const removedVertices = extractRemovedVerticesFromClick(leftMesh);
          performVoxelMasking(removedVertices, preRemovalBounds);
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

  // Brightness effect
  useEffect(() => {
    meshRefs.current.left.forEach(mesh => {
      if (mesh.material) {
        mesh.material.emissive = brightnessEnabled ? mesh.material.color : new THREE.Color(0x000000);
        mesh.material.emissiveIntensity = brightnessEnabled ? brightness * 0.5 : 0;
        mesh.material.needsUpdate = true;
      }
    });
    meshRefs.current.right.forEach(mesh => {
      if (mesh.material) {
        mesh.material.emissive = brightnessEnabled ? mesh.material.color : new THREE.Color(0x000000);
        mesh.material.emissiveIntensity = brightnessEnabled ? brightness * 0.5 : 0;
        mesh.material.needsUpdate = true;
      }
    });
  }, [brightnessEnabled, brightness]);


  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const newFiles = Array.from(e.target.files).filter((f: File) =>
        /\.stl$/i.test(f.name) && /(C|T|L|S)\d+/i.test(f.name)
      );

      if (newFiles.length === 0) {
        setError('No valid STL files found. Files must have .stl extension and contain bone names (C, T, L, or S followed by numbers).');
        return;
      }

      setFiles(newFiles);
      setLoading(true);
      setError(null);

      try {
        const loader = new STLLoader();

        // Clear existing meshes from left and right views only
        meshRefs.current.left.forEach(mesh => {
          leftGroupRef.current.remove(mesh);
          mesh.geometry.dispose();
          if (Array.isArray(mesh.material)) {
            mesh.material.forEach(m => m.dispose());
          } else {
            mesh.material.dispose();
          }
        });

        meshRefs.current.right.forEach(mesh => {
          rightGroupRef.current.remove(mesh);
          mesh.geometry.dispose();
          if (Array.isArray(mesh.material)) {
            mesh.material.forEach(m => m.dispose());
          } else {
            mesh.material.dispose();
          }
        });

        meshRefs.current.left = [];
        meshRefs.current.right = [];

        // Load each file
        const loadPromises = newFiles.map(async (file) => {
          try {
            const arrayBuffer = await file.arrayBuffer();
            const geometry = loader.parse(arrayBuffer);
            // STLs are already in LPS - no transformation needed
            geometry.computeBoundingBox();

            const fileName = file.name;
            return {
              geometry,
              fileName,
              ...getVertebraInfo(fileName === 'L.stl' ? 'L1.stl' : fileName),
            };
          } catch {
            return null;
          }
        });

        const vertebrae = await Promise.all(loadPromises);
        const valid = vertebrae.filter(Boolean);

        if (valid.length === 0) {
          throw new Error('No valid STL files could be loaded');
        }

        // Sort in anatomical order
        const anatomicalOrder = ['C', 'T', 'L', 'S'];
        valid.sort((a, b) => {
          const diff = anatomicalOrder.indexOf(a!.type) - anatomicalOrder.indexOf(b!.type);
          return diff !== 0 ? diff : a!.number - b!.number;
        });

        let currentY = 0, compression = 0, gap = 0;

        const colorMap: { [key: string]: number } = {
          C: 0x3498db,
          T: 0x2ecc71,
          L: 0xe74c3c,
          S: 0xf1c40f,
        };

        // Create meshes only for left and right views
        valid.forEach((v, i) => {
          if (!v) return;

          const bbox = v.geometry.boundingBox!;
          const size = new THREE.Vector3();
          bbox.getSize(size);
          const center = new THREE.Vector3();
          bbox.getCenter(center);

          const color = new THREE.Color(colorMap[v.type] || 0x9b59b6);

          // Left mesh = Latest View (White) - no emissive
          const matLeft = new THREE.MeshPhongMaterial({
            color: 0xffffff, // White for left view
            specular: 0x111111,
            shininess: 10,
            side: THREE.DoubleSide
          });
          const mesh = new THREE.Mesh(v.geometry, matLeft);
          mesh.position.z = currentY - center.z * compression; // LPS: Z is vertical
          // LPS coordinate system - no rotation needed
          mesh.userData = v;
          leftGroupRef.current.add(mesh);
          meshRefs.current.left.push(mesh);

          // Right mesh = Labelling View (Colored) - no emissive
          const matRight = new THREE.MeshPhongMaterial({
            color: color.getHex(),
            specular: 0x111111,
            shininess: 10,
            side: THREE.DoubleSide
          });
          const meshClone = new THREE.Mesh(v.geometry, matRight);
          meshClone.position.copy(mesh.position);
          rightGroupRef.current.add(meshClone);
          meshRefs.current.right.push(meshClone);

          currentY -= size.z * compression + gap; // LPS: Z is vertical
        });

        // Note: STLs are already in LPS - no transformation needed

        // Center camera on main view
        const bbox = new THREE.Box3().setFromObject(leftGroupRef.current);
        const center = bbox.getCenter(new THREE.Vector3());
        const size = bbox.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z);

        if (cameraRef.current) {
          const fov = cameraRef.current.fov * (Math.PI / 180);
          const fitDist = maxDim / (2 * Math.tan(fov / 2));
          const camDist = fitDist * 1.0;
          console.log('[handleFileChange] Camera fit:', { maxDim, fitDist, camDist });

          if (leftControlsRef.current) {
            leftControlsRef.current.target.copy(center);
          }
          if (rightControlsRef.current) {
            rightControlsRef.current.target.copy(center);
          }

          cameraRef.current.position.set(center.x, center.y - camDist, center.z);
          cameraRef.current.up.set(0, 0, 1);
          cameraRef.current.lookAt(center);
          cameraRef.current.updateProjectionMatrix();

          if (leftControlsRef.current) {
            leftControlsRef.current.update();
          }
          if (rightControlsRef.current) {
            rightControlsRef.current.update();
          }
        }

      } catch (err: any) {
        setError(`Error loading STL files: ${err.message}`);
      } finally {
        setLoading(false);
      }
    }
  };

  // Add the getVertebraInfo function
  const getVertebraInfo = (fileName: string) => {
    const match = fileName.match(/(C|T|L|S)(\d+)/i);
    if (!match) {
      console.warn(`Invalid vertebra filename format: ${fileName}`);
      return null;
    }

    return {
      type: match[1].toUpperCase(),
      number: parseInt(match[2]),
      fullName: match[0].toUpperCase(),
      fileName: fileName,
    };
  };

  useEffect(() => {
    setupAngleMeasurementMode({
      leftRendererRef,
      leftSceneRef,
      cameraRef,
      meshRefs
    });

    return () => {
      cleanupAngleMeasurementMode();
    };
  }, []);

  return (
    <div style={{
      width: '100%',
      display: 'flex',
      flexDirection: 'column',
      backgroundColor: '#000',
      color: 'white',
      height: '100%', // Use 100%
      position: 'relative',
      minHeight: 0 // Fallback
    }}>

      {loading && (
        <div style={{
          position: 'absolute',
          inset: 0,
          zIndex: 30,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: 'rgba(0, 0, 0, 0.88)',
        }}>
          <div style={{
            width: '56px',
            height: '56px',
            border: '4px solid rgba(255,255,255,0.1)',
            borderTop: '4px solid #4FC3F7',
            borderRadius: '50%',
            animation: 'stl-spin 0.8s linear infinite',
          }} />
          <div style={{ color: '#fff', marginTop: '20px', fontSize: '16px', fontWeight: 600 }}>
            Loading 3D Model
          </div>
          <div style={{ color: '#4FC3F7', marginTop: '8px', fontSize: '28px', fontWeight: 700 }}>
            {loadProgress}%
          </div>
          <div style={{
            width: '220px',
            height: '6px',
            backgroundColor: 'rgba(255,255,255,0.1)',
            borderRadius: '3px',
            marginTop: '12px',
            overflow: 'hidden',
          }}>
            <div style={{
              width: `${loadProgress}%`,
              height: '100%',
              backgroundColor: '#4FC3F7',
              borderRadius: '3px',
              transition: 'width 0.3s ease',
            }} />
          </div>
          <div style={{ color: '#888', marginTop: '10px', fontSize: '12px' }}>
            Please wait while the model loads
          </div>
          <style>{`@keyframes stl-spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      )}

      {
        angleMeasurementEnabled === true ?
        <AngleMeasurementPanel /> :
        <></>
      }

      {isCreatingSegmentation && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 2000, background: "rgba(0,0,0,0.5)",
          display: "flex", alignItems: "center", justifyContent: "center"
        }}>
          <div style={{
            background: "#222", color: "#fff", padding: "24px 32px", borderRadius: "12px",
            fontSize: "22px", fontWeight: "bold", boxShadow: "0 4px 24px #0008", display: "flex", alignItems: "center"
          }}>
            <span className="spinner-border spinner-border-lg" style={{marginRight: 16}}/>
            Creating automatic segmentations...
          </div>
        </div>
      )}

      {/* Success message */}
      {segmentationCreated && (
        <div style={{
          position: "fixed", top: 20, right: 20, zIndex: 2000,
          background: "#2ecc71", color: "#fff", padding: "12px 20px", borderRadius: "8px",
          fontSize: "14px", fontWeight: "bold", boxShadow: "0 4px 12px #0004"
        }}>
          ✅ Segmentations created successfully! Check OHIF segmentation panel.
        </div>
      )}

     {!ohifServices?.segmentationService && (
        <div style={{
          position: "fixed", bottom: 20, left: 20, zIndex: 1000,
          background: "#f39c12", color: "#fff", padding: "8px 16px", borderRadius: "6px",
          fontSize: "12px", fontWeight: "bold", boxShadow: "0 2px 8px #0004"
        }}>
          ⚠️ Waiting for OHIF services...
        </div>
      )}


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

     { angleMeasurementEnabled === true ? <></> : (
       versionHistoryEnabled ? (
         <>
           <ViewerContainer
             startMountRef={startMountRef}
             leftMountRef={leftMountRef}
             rightMountRef={rightMountRef}
             removalCanvasRef={removalCanvasRef}
             showRightView={showRightView}
             show={versionHistoryEnabled}
           >
             <VersionHistory
               versions={versions}
               selectedVersion={versionHistory.selectedVersion}
               loadingVersions={versionHistory.loadingVersions}
               versionHistoryEnabled={versionHistory.versionHistoryEnabled}
               onSelectVersion={versionHistory.setSelectedVersion}
               onRestoreVersion={versionHistory.restoreVersion}
             />
           </ViewerContainer>
         </>
       ) : (
         <ViewerContainer
           startMountRef={startMountRef}
           leftMountRef={leftMountRef}
           rightMountRef={rightMountRef}
           removalCanvasRef={removalCanvasRef}
           showRightView={showRightView}
           show={versionHistoryEnabled}
         >
           <ControlPanel
             loading={loading}
             error={error}
             approveSuccess={approveSuccess}
           >
             <ImplantViewer
               implantMountRef={implantMountRefFromHook}
               showImplantView={showImplantView}
               onClose={() => {}}
             />
             <VersionHistory
               versions={versions}
               selectedVersion={versionHistory.selectedVersion}
               loadingVersions={versionHistory.loadingVersions}
               versionHistoryEnabled={versionHistory.versionHistoryEnabled}
               onSelectVersion={versionHistory.setSelectedVersion}
               onRestoreVersion={versionHistory.restoreVersion}
             />
           </ControlPanel>
         </ViewerContainer>
       )
     )}


      {/* Hidden file inputs */}
      <input
        id="stl-file-input"
        type="file"
        accept=".stl"
        onChange={handleFileChange}
        multiple
        style={{ display: "none" }}
        disabled={loading}
      />
      <input
        id="implant-file-input"
        type="file"
        accept=".stl"
        onChange={handleImplantFileChange}
        style={{ display: "none" }}
      />
    </div>
  );
};

export default SpinalCordViewer;
