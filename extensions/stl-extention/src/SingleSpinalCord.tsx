import React, { useEffect, useLayoutEffect, useRef, useState, useContext, useCallback } from 'react';
import * as THREE from 'three';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter';
import "./styles/style.css";

// Context
import { StlInstanceContext } from './../../../platform/app/src/context/StlInstanceContext';
import { SERVER_URL } from '../../../config/server';

// Hooks
import { useSTLLoader } from './hooks/useSTLLoader';
import { useBoneRemoval } from './hooks/useBoneRemoval';
import { useImplantViewer } from './hooks/useImplantViewer';
import { useVersionHistory } from './hooks/useVersionHistory';
import { useBrightness } from './hooks/useBrightness';


// Types
import { MeshRefs, RemovalUndoItem } from './types/three.types';

// Utils
import { handleScreenshot as handleScreenshotUtil } from './utils/fileHandlers';
// coordinateSystem import removed - STLs are already in LPS
// import cornerstoneTools from 'platform/core/src/__mocks__/cornerstone-tools';
import cornerstoneTools from '../../../platform/core/src/__mocks__/cornerstone-tools';
import { SingleViewerContainer } from './components/SingleViewerContainer';
import { useMeasurementContext } from './context/MeasurementContext';
import { useThreeDToolsBridge, ToolDef } from './context/ThreeDToolsBridgeContext';
import { useBrightnessContext } from './context/BrightnessContext';
import { useBoneRemovalContext } from './context/BoneRemovalContext';
import { useClickRemoveContext } from './context/ClickRemoveContext';
import { useStlVisibilityContext } from './context/StlVisibilityContext';
import { useLabelingViewContext } from './context/LabelingViewContext';
import { useSTLToDICOMLinking } from './hooks/useSTLToDICOMLinking';
import { STLToDICOMConfig } from './types/three.types';
import { useVersionHistoryContext } from './context/VersionHistoryContext'
import { useCenterLine } from './hooks/useCenterLine';
import { useCrosshairSync } from './hooks/useCrosshairSync';
import { useImplantHighlight } from './hooks/useImplantHighlight';
import { CenterLineProvider } from './context/CenterLineContext';
import { servicesManager, commandsManager } from '../../../platform/app/src/App';
import { useViewportGrid } from '@ohif/ui-next';
import { useViewportRendering } from '../../cornerstone/src/hooks/useViewportRendering';
import FileLoaderService from 'platform/app/src/routes/Local/fileLoaderService';
import { useAngleMeasurementContext } from './context/AngleMeasurementContext';
import { useImplantContext } from './context/ImplantContext';
import { useActivePanelContext } from './context/ActivePanelContext';

import { SpineLabelingProvider, useSpineLabelingContext } from './context/SpineLabelingContext';
import { SpineLabelingPopup } from './components/SpineLabelingPopup';
import { useSpineLabeling } from './hooks/useSpineLabeling';
import { LPS_UP } from './utils/coordinateSystem';
import { showContourOverlay, hideContourOverlay } from './utils/vertebraContourOverlayManager';
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
  resetCachedSTLBounds,
} from './utils/voxelMaskingManager';

/** Lightweight 3D preview for selected upload files */
const UploadPreviewScene: React.FC<{ files: File[] }> = ({ files }) => {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = mountRef.current;
    if (!container || files.length === 0) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0e17);

    const camera = new THREE.PerspectiveCamera(50, container.clientWidth / container.clientHeight, 0.1, 10000);
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    container.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;

    // Lighting
    scene.add(new THREE.AmbientLight(0xffffff, 0.6));
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(1, 1, 1);
    scene.add(dirLight);

    const group = new THREE.Group();
    scene.add(group);

    const loader = new STLLoader();
    let loaded = 0;
    files.forEach((file) => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const buffer = ev.target?.result as ArrayBuffer;
        if (!buffer) return;
        const geometry = loader.parse(buffer);
        geometry.computeVertexNormals();
        const material = new THREE.MeshPhongMaterial({
          color: 0xffffff,
          specular: 0x111111,
          shininess: 50,
          flatShading: false,
        });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.userData.fileName = file.name;
        group.add(mesh);

        loaded++;
        if (loaded === files.length) {
          // Center camera on all meshes
          const box = new THREE.Box3().setFromObject(group);
          const center = box.getCenter(new THREE.Vector3());
          const size = box.getSize(new THREE.Vector3()).length();
          camera.position.copy(center).add(new THREE.Vector3(0, 0, size * 1.2));
          controls.target.copy(center);
          controls.update();
        }
      };
      reader.readAsArrayBuffer(file);
    });

    let animId: number;
    const animate = () => {
      animId = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    const onResize = () => {
      if (!container) return;
      camera.aspect = container.clientWidth / container.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(container.clientWidth, container.clientHeight);
    };
    window.addEventListener('resize', onResize);

    return () => {
      window.removeEventListener('resize', onResize);
      cancelAnimationFrame(animId);
      controls.dispose();
      renderer.dispose();
      // Clean up geometries and materials
      group.traverse((child) => {
        if ((child as THREE.Mesh).geometry) (child as THREE.Mesh).geometry.dispose();
        if ((child as THREE.Mesh).material) {
          const mat = (child as THREE.Mesh).material;
          if (Array.isArray(mat)) mat.forEach(m => m.dispose());
          else mat.dispose();
        }
      });
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [files]);

  return <div ref={mountRef} style={{ width: '100%', height: '100%' }} />;
};

interface SingleSpinalCordProps {
  servicesManager?: any;
  // commandsManager?: any;
  extensionManager?: any;
  props?: any;
  localOnly?: boolean;
  compareMode?: boolean;
}


const SingleSpinalCord: React.FC<SingleSpinalCordProps> = ({
  servicesManager: propServicesManager,
  // commandsManager,
  extensionManager,
  props,
  localOnly = false,
  compareMode = false,
}) => {
  // Whether the right compare panel should be shown
  const showComparePanel = localOnly || compareMode;

  // State
  const [files, setFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadProgress, setLoadProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [undoStack, setUndoStack] = useState<THREE.BufferGeometry[][]>([]);
  const [removalOutline, setRemovalOutline] = useState<{ x: number, y: number }[]>([]);
  const [rightRemovalOutline, setRightRemovalOutline] = useState<{ x: number, y: number }[]>([]);
  const [removing, setRemoving] = useState(false);
  const [leftHasModel, setLeftHasModel] = useState(false);
  const [rightHasModel, setRightHasModel] = useState(false);
  const [rightLoading, setRightLoading] = useState(false);
  const [tetsStls, setTestStls] = useState<string[]>([]);
  const [clickRemovalUndoStack, setClickRemovalUndoStack] = useState<RemovalUndoItem[]>([]);
  const undoOrderRef = useRef<('bone' | 'click')[]>([]);
  const voxelUndoStackRef = useRef<VoxelUndoSnapshot[]>([]);
  const [downloadedBytes, setDownloadedBytes] = useState(0);
  const [downloadTotalBytes, setDownloadTotalBytes] = useState(0);
  const [showRightView, setShowRightView] = useState(false);
  const [approveUploadedBytes, setApproveUploadedBytes] = useState(0);
  const [approveTotalBytes, setApproveTotalBytes] = useState(0);
  const [approveSuccess, setApproveSuccess] = useState<string | null>(null);
  const [approveFailed, setApproveFailed] = useState<string | null>(null);
  const [uploadFiles, setUploadFiles] = useState<File[]>([]);
  const [showUploadPreview, setShowUploadPreview] = useState(false);
  const [showMerge, setShowMergeView] = useState(false);

  // Camera sync
  const [syncCameras, setSyncCameras] = useState(false);
  const isSyncingRef = useRef(false);

  // Refs
  const removalOutlinePoints = useRef<{ x: number, y: number }[]>([]);
  const removalCanvasRef = useRef<HTMLCanvasElement>(null);
  const rightRemovalCanvasRef = useRef<HTMLCanvasElement>(null);
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
  const rightCameraRef = useRef<THREE.PerspectiveCamera>();
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
  const { stlInstanceId, updateStlInstanceId, seriesList } = context;

  const userRole = localStorage.getItem('userRole');
  const userToken = localStorage.getItem('token') || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIzIiwicm9sZSI6ImFuYWx5c3QiLCJleHAiOjE3OTYyMDMxNDF9.cLkGlpxslfYOe_ZKuseyCiuP7jsr3m8XXZyyrUU5B1Y';

  const [isCreatingSegmentation, setIsCreatingSegmentation] = useState(false);
  const [segmentationCreated, setSegmentationCreated] = useState(false);
  const [ohifServices, setOhifServices] = useState<any>(null);
  const [hasSegmentationService, setHasSegmentationService] = useState(false);
  const { removalMode, setRemovalMode } = useBoneRemovalContext();
  const { clickRemovalMode, onToggleClickRemoval } = useClickRemoveContext();
  const { activePanel, isPanelActive } = useActivePanelContext();
  const { addStlFiles, clearStlFiles, compareRightFiles, setCompareRightFiles, compareLeftFiles, setCompareLeftFiles } = useStlVisibilityContext();
  const { showRightView: labelViewEnabled, onToggleRightView } = useLabelingViewContext();
  const {
    isLinkingActive,
    toggleLinking,
    ohifStatus
  } = useSTLToDICOMLinking({
    leftRendererRef,
    leftSceneRef,
    cameraRef,
    meshRefs,
    servicesManager: propServicesManager,
    commandsManager
  } as STLToDICOMConfig);

  const [viewportGrid, viewportGridService] = useViewportGrid();
  const { layout, activeViewportId, viewports, isHangingProtocolLayout } = viewportGrid;
  // const viewport1Rendering = useViewportRendering(activeViewportId || "");
  const { versionHistoryEnabled, versions, setVersions, toggleVersionHistory, isApproving, setIsApproving, approveProgress, setApproveProgress, isDownloading, setIsDownloading, downloadProgress, setDownloadProgress, isUploading, setIsUploading, uploadProgress, setUploadProgress } = useVersionHistoryContext();

  const [rotationMode, setRotationMode] = useState(false);
  const [rotationMode1, setRotationMode1] = useState(false);
  const [rotationMode2, setRotationMode2] = useState(false);
  const [rotationMode3, setRotationMode3] = useState(false);
  const [implantMoveMode, setImplantMoveMode] = useState(false);
  const [inertialRotationMode, setInertialRotationMode] = useState(false);
  const [pivotPoint, setPivotPoint] = useState<THREE.Vector3 | null>(null);
  const [pivotBoneIndex, setPivotBoneIndex] = useState<number | null>(null);
  const [currentRotationAngle, setCurrentRotationAngle] = useState<number>(0);
  const resetBoneRef = useRef<(() => void) | null>(null);

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

  const isRotatingRef = useRef(false);
  const initialMousePos = useRef({ x: 0, y: 0 });
  const selectedMeshIndex = useRef<number | null>(null);
  // const initialRotationsRef = useRef<number[]>([]);
  const relativeDistancesRef = useRef<Array<{
    distance: number;
    direction: THREE.Vector3;
  }>>([]);
  const initialRotationRef = useRef<THREE.Euler>(new THREE.Euler());
  const selectedBoneCenterRef = useRef<THREE.Vector3 | null>(null);
  const { implantFile, showImplantView, toggleImplantView } = useImplantContext();
  const implantUrlRef = useRef<string | null>(null);

  const {
    measurementEnabled,
    toggleMeasurement,
    clearMeasurements,
    setupMeasurementMode,
    cleanupMeasurementMode,
    updateMeasurementsOnBoneMove
  } = useMeasurementContext();

  const {
    spineLabelingMode,
    toggleSpineLabelingMode,
    isLabelingPopupOpen,
    closeLabelingPopup
  } = useSpineLabelingContext();

  // Color mode state
  const [colorModeEnabled, setColorModeEnabled] = useState(false);
  const colorModeRef = useRef(false);
  const originalColorsRef = useRef<Map<THREE.Mesh, { color: number; emissive: number; emissiveIntensity: number }>>(new Map());

  // Vertebra color palette
  const VERTEBRA_COLORS = useRef<{ [key: string]: number }>({
    C1: 0x4169E1, C2: 0x4682B4, C3: 0x5F9EA0, C4: 0x6495ED, C5: 0x00CED1, C6: 0x20B2AA, C7: 0x48D1CC,
    T1: 0xCD5C5C, T2: 0xDC143C, T3: 0xB22222, T4: 0xC71585, T5: 0xDB7093, T6: 0xFF69B4,
    T7: 0xFFB6C1, T8: 0xFFA07A, T9: 0xFA8072, T10: 0xE9967A, T11: 0xF08080, T12: 0xCD5C5C,
    L1: 0xADFF2F, L2: 0xBDB76B, L3: 0xFF00FF, L4: 0x9932CC, L5: 0x32CD32,
    S1: 0x00FFFF, S2: 0xFF00FF, S3: 0xDA70D6, S4: 0xBA55D3, S5: 0x9400D3,
  }).current;
  const DEFAULT_COLORS = useRef([0xCD5C5C, 0xADFF2F, 0xBDB76B, 0xFF00FF, 0x9932CC, 0x32CD32, 0x00FFFF, 0xDA70D6, 0xFFD700, 0xFF6347]).current;

  // Label colors by vertebra type (C=blue, T=green, L=red, S=yellow) - defined before toggleColorMode
  const LABEL_COLORS = useRef<{ [key: string]: number }>({
    C: 0x3498db,    // Cervical - Blue
    T: 0x2ecc71,    // Thoracic - Green
    L: 0xe74c3c,    // Lumbar - Red
    S: 0xf1c40f,    // Sacral - Yellow
  }).current;

  const toggleColorMode = useCallback(() => {
    const newState = !colorModeRef.current;
    colorModeRef.current = newState;
    setColorModeEnabled(newState);

    console.log('🎨 Color mode toggled:', newState);
    console.log('🎨 Left meshes count:', meshRefs.current.left.length);
    console.log('🎨 Right meshes count:', meshRefs.current.right.length);

    const applyColorToMesh = (mesh: THREE.Mesh, index: number) => {
      const material = mesh.material as THREE.MeshPhongMaterial;

      if (!material) {
        console.log('🎨 No material for mesh', index);
        return;
      }

      // Store original color
      if (!originalColorsRef.current.has(mesh)) {
        const origColor = material.color ? material.color.getHex() : 0xffffff;
        const origEmissive = material.emissive ? material.emissive.getHex() : 0x000000;
        originalColorsRef.current.set(mesh, {
          color: origColor,
          emissive: origEmissive,
          emissiveIntensity: material.emissiveIntensity || 0.2
        });
      }

      if (newState) {
        // Apply color
        const userData = mesh.userData;
        let color = DEFAULT_COLORS[index % DEFAULT_COLORS.length];

        if (userData?.fullName && VERTEBRA_COLORS[userData.fullName]) {
          color = VERTEBRA_COLORS[userData.fullName];
        } else if (userData?.type && userData?.number) {
          const key = `${userData.type}${userData.number}`;
          if (VERTEBRA_COLORS[key]) color = VERTEBRA_COLORS[key];
        }

        console.log('🎨 Applying color to mesh', index, ':', color.toString(16), 'userData:', userData);

        if (material.color) material.color.setHex(color);
        // Don't set emissive to avoid white shadow/glow effect
        material.needsUpdate = true;
      } else {
        // When disabling color mode, check if label view is enabled
        // If so, apply label colors instead of restoring original white
        const userData = mesh.userData;
        const vertebraType = userData?.type;

        if (labelViewEnabled && LABEL_COLORS[vertebraType]) {
          // Apply label color since label view is still enabled
          const labelColor = LABEL_COLORS[vertebraType];
          console.log('🎨 Restoring to label color:', vertebraType, '-> Color:', labelColor.toString(16));
          if (material.color) material.color.setHex(labelColor);
          material.needsUpdate = true;
        } else {
          // Restore original white color
          const original = originalColorsRef.current.get(mesh);
          if (original) {
            if (material.color) material.color.setHex(original.color);
            material.needsUpdate = true;
          }
        }
      }
    };

    // Apply to active panel meshes
    if (isPanelActive('left')) {
      meshRefs.current.left.forEach((mesh, i) => applyColorToMesh(mesh, i));
    }
    if (isPanelActive('right')) {
      meshRefs.current.right.forEach((mesh, i) => applyColorToMesh(mesh, i));
    }

    // Toggle contour overlay on DICOM viewports
    if (newState) {
      showContourOverlay(servicesManager);
    } else {
      hideContourOverlay();
    }
  }, [labelViewEnabled, LABEL_COLORS, isPanelActive]);

  // Effect to apply/remove label colors when label view is toggled
  // Auto-dismiss approve success/failure toasts after 4 seconds
  useEffect(() => {
    if (!approveSuccess) return;
    const t = setTimeout(() => setApproveSuccess(null), 4000);
    return () => clearTimeout(t);
  }, [approveSuccess]);

  useEffect(() => {
    if (!approveFailed) return;
    const t = setTimeout(() => setApproveFailed(null), 6000);
    return () => clearTimeout(t);
  }, [approveFailed]);

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
        const origColor = material.color.getHex();
        const origEmissive = material.emissive ? material.emissive.getHex() : 0x000000;
        originalColorsRef.current.set(mesh, {
          color: origColor,
          emissive: origEmissive,
          emissiveIntensity: material.emissiveIntensity || 0.2
        });
      }

      if (labelViewEnabled) {
        // Apply label color based on vertebra type
        const color = LABEL_COLORS[vertebraType] || 0x9b59b6; // Purple as default
        console.log('🏷️ Applying label color to mesh:', vertebraType, '-> Color:', color.toString(16));
        material.color.setHex(color);
        material.needsUpdate = true;
      } else {
        // Restore original white color
        const original = originalColorsRef.current.get(mesh);
        if (original) {
          material.color.setHex(original.color);
          material.needsUpdate = true;
        }
      }
    };

    // Apply to left meshes (visible view)
    meshRefs.current.left.forEach((mesh) => applyLabelColorToMesh(mesh));
    // Also apply to right meshes for consistency
    meshRefs.current.right.forEach((mesh) => applyLabelColorToMesh(mesh));

  }, [labelViewEnabled, LABEL_COLORS]);

  // Initialize spine labeling hook
  const spineLabeling = useSpineLabeling({
    leftSceneRef,
    rightSceneRef,
    cameraRef,
    meshRefs,
    leftRendererRef
  });
  
  // Add DICOM viewport labeling handler (if needed)
  // useEffect(() => {
  //   if (!spineLabelingMode || !propServicesManager || !labelingConfig) return;
    
  //   // This would handle DICOM viewport labeling
  //   // You would need to integrate with OHIF's cornerstoneTools
  //   const handleDICOMClick = (event: any) => {
  //     // Implementation depends on OHIF's API
  //     // This is a placeholder
  //     console.log('DICOM viewport clicked for labeling');
      
  //     // You would get the 2D position and convert it
  //     // const dicomPosition = new THREE.Vector3(x, y, 0);
  //     // addLabel(dicomPosition, 'dicom');
  //   };
    
  //   // Add event listener to OHIF viewports
  //   // This part depends on your OHIF setup
  // }, [spineLabelingMode, propServicesManager, labelingConfig]);

  const {
    angleMeasurementEnabled,
    toggleAngleMeasurement,
    setupAngleMeasurementMode,
    cleanupAngleMeasurementMode,
    clearAngleMeasurements
  } = useAngleMeasurementContext();

  useEffect(() => {
    const useRight = showComparePanel && activePanel === 'right';
    const mount = useRight ? rightMountRef.current : leftMountRef.current;
    const camRefH = useRight ? rightCameraRef : cameraRef;
    const ctrlRefH = useRight ? rightControlsRef : leftControlsRef;
    const primaryKey: 'left' | 'right' = useRight ? 'right' : 'left';
    const moveBoth = !showComparePanel || activePanel === 'both';
    if (!mount || !rotationMode) return;

    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    const onMouseDown = (event: MouseEvent) => {
      if (!rotationMode) return;
      const rect = mount.getBoundingClientRect();
      mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(mouse, camRefH.current!);
      const nonImplantMeshes = meshRefs.current[primaryKey].filter(m => !m.userData?.isImplant && m.userData?.type !== 'I');
      const intersects = raycaster.intersectObjects(nonImplantMeshes);
      if (intersects.length > 0) {
        ctrlRefH.current!.enabled = false;
        isRotatingRef.current = true;
        initialMousePos.current = { x: event.clientX, y: event.clientY };
        selectedMeshIndex.current = meshRefs.current[primaryKey].indexOf(intersects[0].object as THREE.Mesh);
      }
    };

    const onMouseMove = (event: MouseEvent) => {
      if (!isRotatingRef.current || selectedMeshIndex.current === null) return;
      const deltaX = event.clientX - initialMousePos.current.x;
      initialMousePos.current = { x: event.clientX, y: event.clientY };
      const horizontalAmount = -deltaX * 0.5;
      for (let i = selectedMeshIndex.current; i >= 0; i--) {
        const mesh = meshRefs.current[primaryKey][i];
        if (mesh?.userData?.isImplant || mesh?.userData?.type === 'I') continue;
        if (mesh) mesh.position.x += horizontalAmount;
        if (moveBoth) {
          const other = meshRefs.current[primaryKey === 'left' ? 'right' : 'left'][i];
          if (other && !other.userData?.isImplant && other.userData?.type !== 'I') other.position.x += horizontalAmount;
        }
      }
      updateMeasurementsOnBoneMove();
    };

    const onMouseUp = () => {
      isRotatingRef.current = false;
      selectedMeshIndex.current = null;
      ctrlRefH.current!.enabled = true;
    };

    mount.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      mount.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [rotationMode, updateMeasurementsOnBoneMove, activePanel, showComparePanel]);

  // VERTICAL - UP/DOWN (Motion)
  useEffect(() => {
    const useRight = showComparePanel && activePanel === 'right';
    const mount = useRight ? rightMountRef.current : leftMountRef.current;
    const camRefV = useRight ? rightCameraRef : cameraRef;
    const ctrlRefV = useRight ? rightControlsRef : leftControlsRef;
    const primaryKey: 'left' | 'right' = useRight ? 'right' : 'left';
    const moveBoth = !showComparePanel || activePanel === 'both';
    if (!mount || !rotationMode1) return;

    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    const onMouseDown = (event: MouseEvent) => {
      if (!rotationMode1) return;
      const rect = mount.getBoundingClientRect();
      mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(mouse, camRefV.current!);
      const nonImplantMeshes = meshRefs.current[primaryKey].filter(m => !m.userData?.isImplant && m.userData?.type !== 'I');
      const intersects = raycaster.intersectObjects(nonImplantMeshes);
      if (intersects.length > 0) {
        ctrlRefV.current!.enabled = false;
        isRotatingRef.current = true;
        initialMousePos.current = { x: event.clientX, y: event.clientY };
        selectedMeshIndex.current = meshRefs.current[primaryKey].indexOf(intersects[0].object as THREE.Mesh);
      }
    };

    const onMouseMove = (event: MouseEvent) => {
      if (!isRotatingRef.current || selectedMeshIndex.current === null) return;
      const deltaY = event.clientY - initialMousePos.current.y;
      initialMousePos.current = { x: event.clientX, y: event.clientY };
      const verticalAmount = -deltaY * 0.5;
      for (let i = selectedMeshIndex.current; i >= 0; i--) {
        const mesh = meshRefs.current[primaryKey][i];
        if (mesh?.userData?.isImplant || mesh?.userData?.type === 'I') continue;
        if (mesh) mesh.position.z += verticalAmount;
        if (moveBoth) {
          const other = meshRefs.current[primaryKey === 'left' ? 'right' : 'left'][i];
          if (other && !other.userData?.isImplant && other.userData?.type !== 'I') other.position.z += verticalAmount;
        }
      }
      updateMeasurementsOnBoneMove();
    };

    const onMouseUp = () => {
      isRotatingRef.current = false;
      selectedMeshIndex.current = null;
      ctrlRefV.current!.enabled = true;
    };

    mount.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      mount.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [rotationMode1, updateMeasurementsOnBoneMove, activePanel, showComparePanel]);


  useEffect(() => {
    const useRight = showComparePanel && activePanel === 'right';
    const mount = useRight ? rightMountRef.current : leftMountRef.current;
    const camRefR = useRight ? rightCameraRef : cameraRef;
    const ctrlRefR = useRight ? rightControlsRef : leftControlsRef;
    const primaryKey: 'left' | 'right' = useRight ? 'right' : 'left';
    const moveBoth = !showComparePanel || activePanel === 'both';
    if (!mount || !rotationMode2) return;

    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    const onMouseDown = (event: MouseEvent) => {
      if (!rotationMode2) return;
      const rect = mount.getBoundingClientRect();
      mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(mouse, camRefR.current!);
      const nonImplantMeshes = meshRefs.current[primaryKey].filter(m => !m.userData?.isImplant && m.userData?.type !== 'I');
      const intersects = raycaster.intersectObjects(nonImplantMeshes);
      if (intersects.length > 0) {
        event.preventDefault();
        ctrlRefR.current!.enabled = false;
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
        if (moveBoth) {
          const other = meshRefs.current[primaryKey === 'left' ? 'right' : 'left'][i];
          if (other && !other.userData?.isImplant && other.userData?.type !== 'I') other.rotation.x += deltaY * rotationSpeed;
        }
      }
      updateMeasurementsOnBoneMove();
    };

    const onMouseUp = () => {
      isRotatingRef.current = false;
      selectedMeshIndex.current = null;
      ctrlRefR.current!.enabled = true;
    };

    mount.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      mount.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
}, [rotationMode2, updateMeasurementsOnBoneMove, activePanel, showComparePanel]);

// FORWARD - BACKWARD (Motion)
useEffect(() => {
  const useRight = showComparePanel && activePanel === 'right';
  const mount = useRight ? rightMountRef.current : leftMountRef.current;
  const camRefFB = useRight ? rightCameraRef : cameraRef;
  const ctrlRefFB = useRight ? rightControlsRef : leftControlsRef;
  const primaryKey: 'left' | 'right' = useRight ? 'right' : 'left';
  const moveBoth = !showComparePanel || activePanel === 'both';
  if (!mount || !rotationMode3) return;

  const raycaster = new THREE.Raycaster();
  const mouse = new THREE.Vector2();

  const onMouseDown = (event: MouseEvent) => {
    if (!rotationMode3) return;
    const rect = mount.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(mouse, camRefFB.current!);
    const nonImplantMeshes = meshRefs.current[primaryKey].filter(m => !m.userData?.isImplant && m.userData?.type !== 'I');
    const intersects = raycaster.intersectObjects(nonImplantMeshes);
    if (intersects.length > 0) {
      ctrlRefFB.current!.enabled = false;
      isRotatingRef.current = true;
      initialMousePos.current = { x: event.clientX, y: event.clientY };
      selectedMeshIndex.current = meshRefs.current[primaryKey].indexOf(intersects[0].object as THREE.Mesh);
    }
  };

  const onMouseMove = (event: MouseEvent) => {
    if (!isRotatingRef.current || selectedMeshIndex.current === null) return;
    const deltaY = event.clientY - initialMousePos.current.y;
    initialMousePos.current = { x: event.clientX, y: event.clientY };
    const depthAmount = deltaY * 0.5;
    for (let i = selectedMeshIndex.current; i >= 0; i--) {
      const mesh = meshRefs.current[primaryKey][i];
      if (mesh?.userData?.isImplant || mesh?.userData?.type === 'I') continue;
      if (mesh) mesh.position.y += depthAmount;
      if (moveBoth) {
        const other = meshRefs.current[primaryKey === 'left' ? 'right' : 'left'][i];
        if (other && !other.userData?.isImplant && other.userData?.type !== 'I') other.position.y += depthAmount;
      }
    }
    updateMeasurementsOnBoneMove();
  };

  const onMouseUp = () => {
    isRotatingRef.current = false;
    selectedMeshIndex.current = null;
    ctrlRefFB.current!.enabled = true;
  };

  mount.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mouseup', onMouseUp);
  return () => {
    mount.removeEventListener('mousedown', onMouseDown);
    window.removeEventListener('mousemove', onMouseMove);
    window.removeEventListener('mouseup', onMouseUp);
  };
}, [rotationMode3, updateMeasurementsOnBoneMove, activePanel, showComparePanel]);

// IMPLANT MOVE MODE - When active, clicking on implant moves only the implant
useEffect(() => {
  const useRight = showComparePanel && activePanel === 'right';
  const mount = useRight ? rightMountRef.current : leftMountRef.current;
  const camRefIM = useRight ? rightCameraRef : cameraRef;
  const ctrlRefIM = useRight ? rightControlsRef : leftControlsRef;
  const primaryKey: 'left' | 'right' = useRight ? 'right' : 'left';
  const moveBoth = !showComparePanel || activePanel === 'both';
  if (!mount || !implantMoveMode) return;

  let isDragging = false;
  let lastX = 0;
  let lastY = 0;

  const raycaster = new THREE.Raycaster();
  const mouse = new THREE.Vector2();

  const getImplantMeshes = () => {
    const primaryImplant = meshRefs.current[primaryKey].find(m => m.userData?.isImplant || m.userData?.type === 'I');
    const otherKey = primaryKey === 'left' ? 'right' : 'left';
    const otherImplant = meshRefs.current[otherKey].find(m => m.userData?.isImplant || m.userData?.type === 'I');
    return { primaryImplant, otherImplant };
  };

  const onMouseDown = (event: MouseEvent) => {
    if (!implantMoveMode) return;
    const rect = mount.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(mouse, camRefIM.current!);
    const { primaryImplant } = getImplantMeshes();
    if (!primaryImplant) return;
    const intersects = raycaster.intersectObject(primaryImplant);
    if (intersects.length > 0) {
      isDragging = true;
      lastX = event.clientX;
      lastY = event.clientY;
      if (ctrlRefIM.current) ctrlRefIM.current.enabled = false;
      event.preventDefault();
      event.stopPropagation();
    }
  };

  const onMouseMove = (event: MouseEvent) => {
    if (!isDragging || !implantMoveMode) return;
    const deltaX = event.clientX - lastX;
    const deltaY = event.clientY - lastY;
    lastX = event.clientX;
    lastY = event.clientY;
    const { primaryImplant, otherImplant } = getImplantMeshes();
    if (event.shiftKey) {
      const rotateSpeed = 0.03;
      if (primaryImplant) { primaryImplant.rotateZ(deltaX * rotateSpeed); primaryImplant.rotateX(-deltaY * rotateSpeed); }
      if (moveBoth && otherImplant) { otherImplant.rotateZ(deltaX * rotateSpeed); otherImplant.rotateX(-deltaY * rotateSpeed); }
    } else {
      const moveSpeed = 0.5;
      if (primaryImplant) { primaryImplant.position.x += deltaX * moveSpeed; primaryImplant.position.y -= deltaY * moveSpeed; }
      if (moveBoth && otherImplant) { otherImplant.position.x += deltaX * moveSpeed; otherImplant.position.y -= deltaY * moveSpeed; }
    }
  };

  const onMouseUp = () => {
    isDragging = false;
    if (ctrlRefIM.current) ctrlRefIM.current.enabled = true;
  };

  mount.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mouseup', onMouseUp);
  return () => {
    mount.removeEventListener('mousedown', onMouseDown);
    window.removeEventListener('mousemove', onMouseMove);
    window.removeEventListener('mouseup', onMouseUp);
  };
}, [implantMoveMode, activePanel, showComparePanel]);

// INTERACTIVE ROTATION MODE - 3-matic style: Direct, precise rotation with axis handles
// No momentum/inertia - rotation stops immediately when mouse is released
useEffect(() => {
  const useRight = showComparePanel && activePanel === 'right';
  const primaryKey: 'left' | 'right' = useRight ? 'right' : 'left';
  const moveBoth = !showComparePanel || activePanel === 'both';

  const mount = useRight ? rightMountRef.current : leftMountRef.current;
  const scene = useRight ? rightSceneRef.current : leftSceneRef.current;
  const camera = useRight ? rightCameraRef.current : cameraRef.current;
  const ctrlRef = useRight ? rightControlsRef : leftControlsRef;

  if (!mount || !inertialRotationMode || !scene || !camera) {
    return;
  }

  // State variables
  let isRotating = false;
  let isDraggingPivot = false;
  let activeAxis: 'x' | 'y' | 'z' | null = null;
  let currentPivot: THREE.Vector3 | null = null;
  let currentBoneIndex: number | null = null;
  let accumulatedRotation = 0;
  let gizmoCreated = false;

  const raycaster = new THREE.Raycaster();
  const mouse = new THREE.Vector2();

  // Store ALL bones' original quaternions when mode starts
  const allOriginalQuaternions: { left: THREE.Quaternion[], right: THREE.Quaternion[] } = {
    left: [],
    right: []
  };

  // Save all bones' initial state
  meshRefs.current[primaryKey].forEach((mesh, idx) => {
    if (mesh && !mesh.userData?.isImplant) {
      allOriginalQuaternions[primaryKey][idx] = mesh.quaternion.clone();
    }
  });
  if (moveBoth) {
    const otherKey = primaryKey === 'left' ? 'right' : 'left';
    meshRefs.current[otherKey].forEach((mesh, idx) => {
      if (mesh && !mesh.userData?.isImplant) {
        allOriginalQuaternions[otherKey][idx] = mesh.quaternion.clone();
      }
    });
  }

  // Reset ALL bones to their initial positions
  const resetAllBones = () => {
    meshRefs.current[primaryKey].forEach((mesh, idx) => {
      if (mesh && !mesh.userData?.isImplant && allOriginalQuaternions[primaryKey][idx]) {
        mesh.quaternion.copy(allOriginalQuaternions[primaryKey][idx]);
      }
    });
    if (moveBoth) {
      const otherKey = primaryKey === 'left' ? 'right' : 'left';
      meshRefs.current[otherKey].forEach((mesh, idx) => {
        if (mesh && !mesh.userData?.isImplant && allOriginalQuaternions[otherKey][idx]) {
          mesh.quaternion.copy(allOriginalQuaternions[otherKey][idx]);
        }
      });
    }
    setCurrentRotationAngle(0);
    updateMeasurementsOnBoneMove();
  };

  // Expose reset all bones function via ref
  resetBoneRef.current = resetAllBones;

  // Gizmo visual elements
  let gizmoGroup: THREE.Group | null = null;
  let rotationArc: THREE.Mesh | null = null;

  const GIZMO_SIZE = 15;

  // Create ring geometry
  const createRing = (radius: number, color: number, thickness: number = 0.5) => {
    const geometry = new THREE.TorusGeometry(radius, thickness, 8, 64);
    const material = new THREE.MeshBasicMaterial({
      color: color,
      transparent: true,
      opacity: 0.8,
      depthTest: false
    });
    const ring = new THREE.Mesh(geometry, material);
    ring.renderOrder = 999;
    return ring;
  };

  // Create the 3-matic style rotation gizmo
  const createGizmo = (position: THREE.Vector3) => {
    if (gizmoGroup) {
      scene.remove(gizmoGroup);
      gizmoGroup.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.geometry.dispose();
          (child.material as THREE.Material).dispose();
        }
      });
    }

    gizmoGroup = new THREE.Group();
    gizmoGroup.position.copy(position);

    // X-axis ring (Red) - rotation around X axis, in YZ plane
    const xRing = createRing(GIZMO_SIZE * 0.7, 0xff0000);
    xRing.rotation.y = Math.PI / 2;
    xRing.userData = { axis: 'x' };
    gizmoGroup.add(xRing);

    // Y-axis ring (Blue) - rotation around Y axis, in XZ plane
    const yRing = createRing(GIZMO_SIZE * 0.85, 0x0066ff);
    yRing.rotation.x = Math.PI / 2;
    yRing.userData = { axis: 'y' };
    gizmoGroup.add(yRing);

    // Z-axis ring (Green) - rotation around Z axis, in XY plane
    const zRing = createRing(GIZMO_SIZE, 0x00ff00);
    zRing.userData = { axis: 'z' };
    gizmoGroup.add(zRing);

    // Center pivot point (Yellow sphere) - draggable
    const centerGeom = new THREE.SphereGeometry(1.5, 16, 16);
    const centerMat = new THREE.MeshBasicMaterial({
      color: 0xffff00,
      depthTest: false
    });
    const centerDot = new THREE.Mesh(centerGeom, centerMat);
    centerDot.renderOrder = 1000;
    centerDot.userData = { isPivot: true };
    gizmoGroup.add(centerDot);

    scene.add(gizmoGroup);
    gizmoCreated = true;
  };

  // Show rotation arc (cyan wedge showing rotation amount)
  const showRotationArc = (angle: number, axis: 'x' | 'y' | 'z') => {
    if (!gizmoGroup) return;

    // Remove old arc
    if (rotationArc) {
      gizmoGroup.remove(rotationArc);
      rotationArc.geometry.dispose();
      (rotationArc.material as THREE.Material).dispose();
      rotationArc = null;
    }

    if (Math.abs(angle) < 0.01) return;

    const radius = axis === 'z' ? GIZMO_SIZE : (axis === 'y' ? GIZMO_SIZE * 0.85 : GIZMO_SIZE * 0.7);
    const startA = angle > 0 ? 0 : angle;
    const endA = angle > 0 ? angle : 0;

    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    shape.absarc(0, 0, radius, startA, endA, false);
    shape.lineTo(0, 0);

    const geometry = new THREE.ShapeGeometry(shape);
    rotationArc = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({
      color: 0x00ffff,
      transparent: true,
      opacity: 0.5,
      side: THREE.DoubleSide,
      depthTest: false
    }));

    if (axis === 'x') rotationArc.rotation.y = Math.PI / 2;
    else if (axis === 'y') rotationArc.rotation.x = Math.PI / 2;

    rotationArc.renderOrder = 998;
    gizmoGroup.add(rotationArc);
  };

  // Store the world-space center point for rotation
  let rotationCenter: THREE.Vector3 | null = null;
  let geometryCentered = false;

  // Center the geometry so rotation happens around its true center
  const centerGeometry = (mesh: THREE.Mesh) => {
    if (!mesh.geometry.boundingBox) {
      mesh.geometry.computeBoundingBox();
    }

    const center = new THREE.Vector3();
    mesh.geometry.boundingBox!.getCenter(center);

    // Translate geometry so center is at local origin
    mesh.geometry.translate(-center.x, -center.y, -center.z);

    // Move mesh position to compensate (keep visual position same)
    center.applyQuaternion(mesh.quaternion);
    mesh.position.add(center);

    mesh.geometry.computeBoundingBox();
  };

  // Apply rotation - 3-matic style exact rotation around geometry center
  const rotateBone = (deltaAngle: number, axis: 'x' | 'y' | 'z') => {
    if (currentBoneIndex === null) return;

    const rotAxis = new THREE.Vector3(
      axis === 'x' ? 1 : 0,
      axis === 'y' ? 1 : 0,
      axis === 'z' ? 1 : 0
    );

    const deltaQuat = new THREE.Quaternion().setFromAxisAngle(rotAxis, deltaAngle);

    const primaryMesh = meshRefs.current[primaryKey][currentBoneIndex];
    if (primaryMesh && !primaryMesh.userData?.isImplant) {
      primaryMesh.quaternion.premultiply(deltaQuat);
    }

    if (moveBoth) {
      const otherKey = primaryKey === 'left' ? 'right' : 'left';
      const otherMesh = meshRefs.current[otherKey][currentBoneIndex];
      if (otherMesh && !otherMesh.userData?.isImplant) {
        otherMesh.quaternion.premultiply(deltaQuat);
      }
    }

    updateMeasurementsOnBoneMove();
  };

  // Store original state for reset
  let originalPrimaryQuaternion: THREE.Quaternion | null = null;
  let originalOtherQuaternion: THREE.Quaternion | null = null;
  let originalPrimaryPosition: THREE.Vector3 | null = null;
  let originalOtherPosition: THREE.Vector3 | null = null;

  // Reset single bone to original rotation (for double-click)
  const resetBone = () => {
    if (currentBoneIndex === null) return;

    const primaryMesh = meshRefs.current[primaryKey][currentBoneIndex];
    if (primaryMesh && originalPrimaryQuaternion) {
      primaryMesh.quaternion.copy(originalPrimaryQuaternion);
    }

    if (moveBoth) {
      const otherKey = primaryKey === 'left' ? 'right' : 'left';
      const otherMesh = meshRefs.current[otherKey][currentBoneIndex];
      if (otherMesh && originalOtherQuaternion) {
        otherMesh.quaternion.copy(originalOtherQuaternion);
      }
    }

    accumulatedRotation = 0;
    setCurrentRotationAngle(0);
    updateMeasurementsOnBoneMove();
  };

  // Track last mouse angle for rotation calculation
  let lastMouseAngle = 0;

  // Calculate rotation based on angular movement around gizmo center
  // This ensures ring, cursor and bone all move in same direction
  const getRotationDelta = (e: MouseEvent, axis: 'x' | 'y' | 'z'): number => {
    if (!gizmoGroup || !camera) return 0;

    const rect = mount.getBoundingClientRect();
    const projected = gizmoGroup.position.clone().project(camera);
    const cx = (projected.x + 1) / 2 * rect.width;
    const cy = (-projected.y + 1) / 2 * rect.height;

    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    // Calculate angle of mouse relative to gizmo center
    const currentAngle = Math.atan2(my - cy, mx - cx);

    // Calculate angle change
    let angleDelta = currentAngle - lastMouseAngle;

    // Handle wrap-around at +/- PI
    if (angleDelta > Math.PI) angleDelta -= 2 * Math.PI;
    if (angleDelta < -Math.PI) angleDelta += 2 * Math.PI;

    // Update last angle
    lastMouseAngle = currentAngle;

    // Get camera position relative to gizmo
    const camPos = camera.position.clone().sub(gizmoGroup.position);

    // Determine direction based on which side of the plane camera is on
    let direction = 1;

    if (axis === 'x') {
      // X rotation: check camera X position
      direction = camPos.x > 0 ? 1 : -1;
    } else if (axis === 'y') {
      // Y rotation: check camera Y position
      direction = camPos.y > 0 ? -1 : 1;
    } else {
      // Z rotation: check camera Z position
      direction = camPos.z > 0 ? 1 : -1;
    }

    return angleDelta * direction;
  };

  // Mouse down handler
  const handleMouseDown = (e: MouseEvent) => {
    const rect = mount.getBoundingClientRect();
    mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);

    // If gizmo exists, check for interaction with it
    if (gizmoGroup && gizmoCreated) {
      const projected = gizmoGroup.position.clone().project(camera);
      const cx = (projected.x + 1) / 2 * rect.width;
      const cy = (-projected.y + 1) / 2 * rect.height;

      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const dist = Math.sqrt((mx - cx) ** 2 + (my - cy) ** 2);

      const screenSize = GIZMO_SIZE * 3;

      // Check if clicking on center pivot (to drag or double-click to reset)
      if (dist < screenSize * 0.15) {
        isDraggingPivot = true;
        ctrlRef.current && (ctrlRef.current.enabled = false);
        e.preventDefault();
        return;
      }

      // Check if clicking on a ring
      if (dist > screenSize * 0.4 && dist < screenSize * 1.2) {
        const ratio = dist / screenSize;

        if (ratio > 0.9) activeAxis = 'z';
        else if (ratio > 0.7) activeAxis = 'y';
        else activeAxis = 'x';

        isRotating = true;
        // Initialize angle for rotation tracking
        lastMouseAngle = Math.atan2(my - cy, mx - cx);
        accumulatedRotation = 0;

        ctrlRef.current && (ctrlRef.current.enabled = false);
        e.preventDefault();
        return;
      }

      // Clicked outside gizmo - do nothing
      return;
    }

    // No gizmo yet - place one on clicked bone
    const bones = meshRefs.current[primaryKey].filter(
      m => m.visible && !m.userData?.isImplant && m.userData?.type !== 'I'
    );

    const hits = raycaster.intersectObjects(bones, false);

    if (hits.length > 0) {
      const hitPoint = hits[0].point.clone();
      const hitMesh = hits[0].object as THREE.Mesh;
      const boneIdx = meshRefs.current[primaryKey].indexOf(hitMesh);

      currentPivot = hitPoint;
      currentBoneIndex = boneIdx;

      // Store original state BEFORE centering
      originalPrimaryQuaternion = hitMesh.quaternion.clone();
      originalPrimaryPosition = hitMesh.position.clone();

      if (moveBoth) {
        const otherKey = primaryKey === 'left' ? 'right' : 'left';
        const otherMesh = meshRefs.current[otherKey][boneIdx];
        if (otherMesh) {
          originalOtherQuaternion = otherMesh.quaternion.clone();
          originalOtherPosition = otherMesh.position.clone();
        }

        // Center the other geometry too
        if (otherMesh && !otherMesh.userData.geometryCentered) {
          centerGeometry(otherMesh);
          otherMesh.userData.geometryCentered = true;
        }
      }

      // Center the geometry so rotation happens around true center
      if (!hitMesh.userData.geometryCentered) {
        centerGeometry(hitMesh);
        hitMesh.userData.geometryCentered = true;
      }

      // Place gizmo at the CLICK POINT (where user clicked)
      setPivotPoint(hitPoint);
      setPivotBoneIndex(boneIdx);

      createGizmo(hitPoint);
      e.preventDefault();
    }
  };

  // Double-click handler - reset bone to original position
  const handleDoubleClick = (e: MouseEvent) => {
    if (!gizmoGroup || !gizmoCreated) return;

    const rect = mount.getBoundingClientRect();
    const projected = gizmoGroup.position.clone().project(camera);
    const cx = (projected.x + 1) / 2 * rect.width;
    const cy = (-projected.y + 1) / 2 * rect.height;

    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const dist = Math.sqrt((mx - cx) ** 2 + (my - cy) ** 2);

    const screenSize = GIZMO_SIZE * 3;

    // Double-click on center pivot resets bone
    if (dist < screenSize * 0.2) {
      resetBone();
      e.preventDefault();
    }
  };

  // Mouse move handler
  const handleMouseMove = (e: MouseEvent) => {
    // Dragging pivot to reposition
    if (isDraggingPivot && gizmoGroup) {
      const rect = mount.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(mouse, camera);

      const bones = meshRefs.current[primaryKey].filter(
        m => m.visible && !m.userData?.isImplant && m.userData?.type !== 'I'
      );

      const hits = raycaster.intersectObjects(bones, false);

      if (hits.length > 0) {
        const newPos = hits[0].point.clone();
        const hitMesh = hits[0].object as THREE.Mesh;
        const boneIdx = meshRefs.current[primaryKey].indexOf(hitMesh);

        currentBoneIndex = boneIdx;

        // Store original state
        originalPrimaryQuaternion = hitMesh.quaternion.clone();
        originalPrimaryPosition = hitMesh.position.clone();

        if (moveBoth) {
          const otherKey = primaryKey === 'left' ? 'right' : 'left';
          const otherMesh = meshRefs.current[otherKey][boneIdx];
          if (otherMesh) {
            originalOtherQuaternion = otherMesh.quaternion.clone();
            originalOtherPosition = otherMesh.position.clone();
          }

          if (otherMesh && !otherMesh.userData.geometryCentered) {
            centerGeometry(otherMesh);
            otherMesh.userData.geometryCentered = true;
          }
        }

        // Center geometry if not already
        if (!hitMesh.userData.geometryCentered) {
          centerGeometry(hitMesh);
          hitMesh.userData.geometryCentered = true;
        }

        // Move gizmo to where user is dragging (click point)
        gizmoGroup.position.copy(newPos);
        currentPivot = newPos;

        setPivotPoint(newPos);
        setPivotBoneIndex(boneIdx);
      }
      return;
    }

    // Rotating bone
    if (isRotating && activeAxis) {
      // Get rotation amount based on angular movement
      const delta = getRotationDelta(e, activeAxis);

      // Apply rotation directly - no smoothing, no momentum
      rotateBone(delta, activeAxis);

      // Update accumulated rotation for display
      accumulatedRotation += delta;
      setCurrentRotationAngle(accumulatedRotation * (180 / Math.PI));

      // Show rotation arc
      showRotationArc(accumulatedRotation, activeAxis);
    }
  };

  // Mouse up handler - IMMEDIATE STOP, no momentum
  const handleMouseUp = () => {
    if (isRotating && rotationArc && gizmoGroup) {
      gizmoGroup.remove(rotationArc);
      rotationArc.geometry.dispose();
      (rotationArc.material as THREE.Material).dispose();
      rotationArc = null;
    }

    // Reset state - rotation stops immediately
    isRotating = false;
    isDraggingPivot = false;
    activeAxis = null;
    setCurrentRotationAngle(0);

    ctrlRef.current && (ctrlRef.current.enabled = true);
  };

  // Set cursor
  mount.style.cursor = 'crosshair';

  // Add event listeners
  mount.addEventListener('mousedown', handleMouseDown);
  mount.addEventListener('dblclick', handleDoubleClick);
  window.addEventListener('mousemove', handleMouseMove);
  window.addEventListener('mouseup', handleMouseUp);

  // Cleanup
  return () => {
    mount.removeEventListener('mousedown', handleMouseDown);
    mount.removeEventListener('dblclick', handleDoubleClick);
    window.removeEventListener('mousemove', handleMouseMove);
    window.removeEventListener('mouseup', handleMouseUp);
    mount.style.cursor = 'default';

    if (gizmoGroup) {
      scene.remove(gizmoGroup);
      gizmoGroup.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.geometry.dispose();
          (child.material as THREE.Material).dispose();
        }
      });
    }
  };
}, [inertialRotationMode, updateMeasurementsOnBoneMove, activePanel, showComparePanel]);

  const applyBoneAndRainbowToAllViewports = () => {
    console.log('🎨 Applying bone preset with OHIF services...');
    console.log('Viewports:', viewports);
    console.log('Active Viewport ID:', activeViewportId);
    setShowMergeView(true)

    viewports.forEach((viewport, viewportId) => {
      // ✅ Skip the first viewport
      if (viewport.viewportId === 'stlViewport') {
        console.log('Skipping STL viewport (viewport 0)');
        return;
      }

      try {
        const displaySetInstanceUID = viewport.displaySetInstanceUIDs?.[0];

        if (!displaySetInstanceUID) {
          console.warn(`No display set found for viewport ${viewportId}`);
          return;
        }

        console.log(`Applying to viewport ${viewportId}, displaySet: ${displaySetInstanceUID}`);

        commandsManager.runCommand('setViewportWindowLevel', {
          viewportId,
          windowWidth: 2500,
          windowCenter: 480,
          displaySetInstanceUID,
        });

        commandsManager.runCommand('setViewportColormap', {
          viewportId,
          displaySetInstanceUID,
          colormap: {
            name: 's_pet'
          },
        });
      } catch (err) {
        console.error(`Error applying preset to viewport ${viewportId}`, err);
      }
    });

  };

  const removeBoneAndRainbowFromAllViewports = () => {
    console.log('🔄 Removing bone preset and colormap from all viewports...');
    console.log('Viewports:', viewports);
    console.log('Active Viewport ID:', activeViewportId);
    setShowMergeView(false)

    viewports.forEach((viewport, viewportId) => {
      // ✅ Skip the first viewport
      if (viewport.viewportId === 'stlViewport') {
        console.log('Skipping STL viewport (viewport 0)');
        return;
      }

      try {
        const displaySetInstanceUID = viewport.displaySetInstanceUIDs?.[0];

        if (!displaySetInstanceUID) {
          console.warn(`No display set found for viewport ${viewportId}`);
          return;
        }

        console.log(`Removing from viewport ${viewportId}, displaySet: ${displaySetInstanceUID}`);

        // Reset window level to default (you may need to adjust these values)
        commandsManager.runCommand('setViewportWindowLevel', {
          viewportId,
          windowWidth: 3000, // Default window width
          windowCenter: 400, // Default window center
          displaySetInstanceUID,
        });

        // Remove colormap by setting it to null or empty
        commandsManager.runCommand('setViewportColormap', {
          viewportId,
          displaySetInstanceUID,
          colormap: { name: 'Grayscale' }, // or { name: 'default' } depending on OHIF implementation
        });

      } catch (err) {
        console.error(`Error removing preset from viewport ${viewportId}`, err);
      }
    });
  };


  // Use propServicesManager if available, fallback to imported servicesManager
  const effectiveServicesManager = propServicesManager || servicesManager;

  const {
    showCenterLine,
    removeCenterLine,
    toggleCenterLine,
    toggleTransparency,
    hasCenterLine,
    centerLineEnabled,
    transparencyEnabled
  } = useCenterLine({
    meshRefs,
    leftSceneRef,
    rightSceneRef,
    servicesManager: effectiveServicesManager
  });

  useCrosshairSync({
    leftSceneRef,
    cameraRef,
    meshRefs,
    leftRendererRef,
    leftControlsRef,
    servicesManager: effectiveServicesManager,
  });

  // Implant highlight - draws yellow block when merge is active
  const {
    showHighlights: showImplantHighlights,
    removeHighlights: removeImplantHighlights,
    detectImplantPosition
  } = useImplantHighlight({
    meshRefs,
    servicesManager: effectiveServicesManager,
    showMerge
  });

  // Add debug effect
  useEffect(() => {
    console.log('🔗 STL-DICOM Linking Status:', {
      isLinkingActive,
      ohifStatus,
      hasServicesManager: !!propServicesManager,
      hasImportedServicesManager: !!servicesManager,
      hasEffectiveServicesManager: !!effectiveServicesManager,
      hasCornerstoneViewportService: !!effectiveServicesManager?.services?.cornerstoneViewportService
    });
  }, [isLinkingActive, ohifStatus, propServicesManager, effectiveServicesManager]);

  const {
    brightnessEnabled,
    brightness,
    toggleBrightness
  } = useBrightnessContext();

  const { registerTools } = useThreeDToolsBridge();

  useEffect(() => {
    const useRightPanel = showComparePanel && activePanel === 'right';
    const rendererRef = useRightPanel ? rightRendererRef as React.MutableRefObject<THREE.WebGLRenderer | undefined> : leftRendererRef;
    const sceneRef = useRightPanel ? rightSceneRef : leftSceneRef;
    const camRef = useRightPanel ? rightCameraRef : cameraRef;

    // Setup distance measurement mode (existing)
    setupMeasurementMode({
      leftRendererRef: rendererRef,
      leftSceneRef: sceneRef,
      cameraRef: camRef,
      meshRefs
    });

    // Setup angle measurement mode (new)
    setupAngleMeasurementMode({
      leftRendererRef: rendererRef,
      leftSceneRef: sceneRef,
      cameraRef: camRef,
      meshRefs
    });

    return () => {
      cleanupMeasurementMode();
      cleanupAngleMeasurementMode();
    };
  }, [setupMeasurementMode, cleanupMeasurementMode, setupAngleMeasurementMode, cleanupAngleMeasurementMode, activePanel, showComparePanel]);



  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      // Remove the vertebra filter to allow organ files
      const newFiles = Array.from(e.target.files).filter((f: File) =>
        /\.stl$/i.test(f.name)
      );

      if (newFiles.length === 0) {
        setError('No valid STL files found. Files must have .stl extension.');
        return;
      }

      // Add STL visibility context clearing
      if (localOnly) {
        setCompareLeftFiles([]);
      } else {
        clearStlFiles();
      }

      setFiles(newFiles);
      setLoading(true);
      setError(null);

      try {
        const loader = new STLLoader();

        // Clear existing meshes from left view
        meshRefs.current.left.forEach(mesh => {
          leftGroupRef.current.remove(mesh);
          mesh.geometry.dispose();
          if (Array.isArray(mesh.material)) {
            mesh.material.forEach(m => m.dispose());
          } else {
            mesh.material.dispose();
          }
        });
        meshRefs.current.left = [];

        // Clear right view only in non-compare modes (compare modes have independent right panel)
        if (!showComparePanel) {
          meshRefs.current.right.forEach(mesh => {
            rightGroupRef.current.remove(mesh);
            mesh.geometry.dispose();
            if (Array.isArray(mesh.material)) {
              mesh.material.forEach(m => m.dispose());
            } else {
              mesh.material.dispose();
            }
          });
          meshRefs.current.right = [];
        }

        // ─── localOnly mode: simple direct loading, no classification ───
        if (localOnly) {
          const allNewStlFiles: { fileName: string; originalUrl: string; meshIndex: number }[] = [];

          for (const file of newFiles) {
            try {
              const arrayBuffer = await file.arrayBuffer();
              const geometry = loader.parse(arrayBuffer);
              geometry.computeBoundingBox();

              const mat = new THREE.MeshPhongMaterial({
                color: 0xffffff, specular: 0x111111, shininess: 10, side: THREE.DoubleSide
              });
              const mesh = new THREE.Mesh(geometry, mat);
              mesh.userData = {
                type: 'X', number: 0,
                fullName: file.name.replace('.stl', '').toUpperCase(),
                fileName: file.name,
              };
              leftGroupRef.current.add(mesh);
              meshRefs.current.left.push(mesh);
              allNewStlFiles.push({
                fileName: file.name,
                originalUrl: URL.createObjectURL(file),
                meshIndex: meshRefs.current.left.length - 1,
              });
            } catch (err) {
              console.error('Error loading local STL:', file.name, err);
            }
          }

          // Position camera to fit all loaded meshes
          if (leftGroupRef.current.children.length > 0 && cameraRef.current && leftControlsRef.current) {
            const bbox = new THREE.Box3().setFromObject(leftGroupRef.current);
            const center = bbox.getCenter(new THREE.Vector3());
            const size = bbox.getSize(new THREE.Vector3());
            const maxDim = Math.max(size.x, size.y, size.z);
            const fov = cameraRef.current.fov * (Math.PI / 180);
            const fitDist = maxDim / (2 * Math.tan(fov / 2));
            leftControlsRef.current.target.copy(center);
            cameraRef.current.position.set(center.x, center.y - fitDist, center.z);
            cameraRef.current.up.set(0, 0, 1);
            cameraRef.current.lookAt(center);
            cameraRef.current.updateProjectionMatrix();
            leftControlsRef.current.update();
          }

          if (allNewStlFiles.length > 0) {
            setCompareLeftFiles(allNewStlFiles.map(f => ({
              id: `cmp-left-${f.fileName}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
              fileName: f.fileName,
              isVisible: true,
              originalUrl: f.originalUrl,
              meshIndex: f.meshIndex,
            })));
          }

          setLoading(false);
          setLeftHasModel(meshRefs.current.left.length > 0);
          return;
        }

        // ─── Normal mode: vertebrae/organ classification ───
        // Load each file
        const loadPromises = newFiles.map(async (file) => {
          try {
            const arrayBuffer = await file.arrayBuffer();
            const geometry = loader.parse(arrayBuffer);
            // STLs are already in LPS - no transformation needed
            geometry.computeBoundingBox();

            const fileName = file.name;
            const vertebraInfo = getVertebraInfo(fileName);

            return {
              geometry,
              fileName,
              ...vertebraInfo,
              originalUrl: URL.createObjectURL(file),
              isUploaded: true,
              originalFile: file
            };
          } catch {
            return null;
          }
        });

        const loadedObjects = await Promise.all(loadPromises);
        const valid = loadedObjects.filter(Boolean);

        if (valid.length === 0) {
          throw new Error('No valid STL files could be loaded');
        }

        // Separate vertebrae from organs
        const vertebrae = valid.filter(v => ['C', 'T', 'L', 'S'].includes(v!.type));
        const organs = valid.filter(v => ['A', 'H'].includes(v!.type));
        const unknown = valid.filter(v => v!.type === 'X');

        // If we have unknown files, they might be our organs
        const potentialOrgans = [...organs];
        unknown.forEach(unk => {
          const name = unk!.fileName.toLowerCase();
          if (name.length < 8 && !name.match(/(c|t|l|s)\d/)) {
            potentialOrgans.push(unk!);
          }
        });

        // Sort vertebrae in anatomical order
        const anatomicalOrder = ['C', 'T', 'L', 'S'];
        vertebrae.sort((a, b) => {
          const diff = anatomicalOrder.indexOf(a!.type) - anatomicalOrder.indexOf(b!.type);
          return diff !== 0 ? diff : a!.number - b!.number;
        });

        let currentY = 0, compression = 0, gap = 0;

        const colorMap: { [key: string]: number } = {
          C: 0x3498db,
          T: 0x2ecc71,
          L: 0xe74c3c,
          S: 0xf1c40f,
          A: 0x3498db, // Aorta - Blue
          H: 0xe74c3c, // Heart - Red
        };

        const allNewStlFiles: {
          fileName: string;
          originalUrl: string;
          meshIndex: number;
        }[] = [];

        // Create vertebrae meshes for left and right views
        vertebrae.forEach((v, i) => {
          if (!v) return;

          const bbox = v.geometry.boundingBox!;
          const size = new THREE.Vector3();
          bbox.getSize(size);
          const center = new THREE.Vector3();
          bbox.getCenter(center);

          const color = new THREE.Color(colorMap[v.type] || 0x9b59b6);

          // Left mesh = Latest View (White) - no emissive glow
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

          // Right mesh = Labelling View (Colored)
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

          // Add to STL visibility context
          allNewStlFiles.push({
            fileName: v.fileName,
            originalUrl: v.originalUrl,
            meshIndex: meshRefs.current.left.length - 1
          });

          currentY -= size.y * compression + gap;
        });

        // Create organ meshes for left and right views
        potentialOrgans.forEach((organ, index) => {
          if (!organ) return;

          // Determine organ type based on file name
          let organType = organ.type;
          const fileName = organ.fileName.toLowerCase();
          if (organType === 'X') {
            if (fileName.includes('aorta') || fileName.includes('ao') || fileName === 'a.stl') {
              organType = 'A';
            } else if (fileName.includes('heart') || fileName.includes('ht') || fileName === 'h.stl') {
              organType = 'H';
            }
          }

          // Calculate organ position based on anatomical location
          let organY = 0;
          let organX = 0;
          let organZ = 0;

          if (organType === 'H' || organ.fileName.toLowerCase().includes('heart')) {
            // Heart position
            organY = -2.5;
            organX = -1.5;
            organZ = 1.5;
          } else if (organType === 'A' || organ.fileName.toLowerCase().includes('aorta')) {
            // Aorta position
            organY = -1.5;
            organX = -1.0;
            organZ = 1.0;
          } else {
            // Unknown organ - position it visibly
            organY = -5;
            organX = 3;
            organZ = 0;
          }

          const color = new THREE.Color(colorMap[organType] || 0x9b59b6);

          // Left mesh = Latest View (Blue for aorta, Red for heart) - no emissive
          const matLeft = new THREE.MeshPhongMaterial({
            color: organType === 'A' ? 0x3498db : 0xe74c3c, // Blue for aorta, Red for heart
            specular: 0x111111,
            shininess: 10,
            side: THREE.DoubleSide
          });
          const mesh = new THREE.Mesh(organ.geometry, matLeft);
          mesh.position.set(organX, organY, organZ);
          // LPS coordinate system - no rotation needed
          mesh.userData = { ...organ, organType };
          leftGroupRef.current.add(mesh);
          meshRefs.current.left.push(mesh);

          // Right mesh = Labelling View
          const matRight = new THREE.MeshPhongMaterial({
            color: organType === 'A' ? 0xe91e63 : 0x9c27b0,
            specular: 0x111111,
            shininess: 10,
            side: THREE.DoubleSide
          });
          const meshClone = new THREE.Mesh(organ.geometry, matRight);
          meshClone.position.copy(mesh.position);
          rightGroupRef.current.add(meshClone);
          meshRefs.current.right.push(meshClone);

          // Add to STL visibility context
          allNewStlFiles.push({
            fileName: organ.fileName,
            originalUrl: organ.originalUrl,
            meshIndex: meshRefs.current.left.length - 1
          });
        });

        // Add all files to STL visibility context
        if (allNewStlFiles.length > 0) {
          addStlFiles(allNewStlFiles);
        }

        // Note: STLs are already in LPS - no transformation needed

        // Center camera on main view
        const bbox = new THREE.Box3().setFromObject(leftGroupRef.current);
        const center = bbox.getCenter(new THREE.Vector3());
        const size = bbox.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z);

        if (cameraRef.current) {
          // Coronal view: camera in front (negative Y), looking toward center, Z up
          cameraRef.current.position.set(center.x, center.y - maxDim * 2.5, center.z);
          cameraRef.current.up.set(0, 0, 1);
          cameraRef.current.lookAt(center);
        }

        if (leftControlsRef.current) {
          leftControlsRef.current.target.copy(center);
          leftControlsRef.current.update();
        }

        if (rightControlsRef.current) {
          rightControlsRef.current.target.copy(center);
          rightControlsRef.current.update();
        }

      } catch (err: any) {
        setError(`Error loading STL files: ${err.message}`);
      } finally {
        setLoading(false);
        if (meshRefs.current.left.length > 0) {
          setLeftHasModel(true);
        }
      }
    }
  };

  // ─── Right panel file handler for localOnly compare mode ───
  const handleRightFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;

    const newFiles = Array.from(e.target.files).filter((f: File) => /\.stl$/i.test(f.name));
    if (newFiles.length === 0) return;

    setRightLoading(true);

    // Clear existing right meshes only
    meshRefs.current.right.forEach(mesh => {
      rightGroupRef.current.remove(mesh);
      mesh.geometry.dispose();
      if (Array.isArray(mesh.material)) mesh.material.forEach(m => m.dispose());
      else mesh.material.dispose();
    });
    meshRefs.current.right = [];

    const loader = new STLLoader();
    const loadedFileNames: string[] = [];

    for (const file of newFiles) {
      try {
        const arrayBuffer = await file.arrayBuffer();
        const geometry = loader.parse(arrayBuffer);
        geometry.computeBoundingBox();

        const mat = new THREE.MeshPhongMaterial({
          color: 0xffffff, specular: 0x111111, shininess: 10, side: THREE.DoubleSide
        });
        const mesh = new THREE.Mesh(geometry, mat);
        mesh.userData = {
          type: 'X', number: 0,
          fullName: file.name.replace('.stl', '').toUpperCase(),
          fileName: file.name,
        };
        rightGroupRef.current.add(mesh);
        meshRefs.current.right.push(mesh);
        loadedFileNames.push(file.name);
      } catch (err) {
        console.error('Error loading right STL:', file.name, err);
      }
    }

    if (rightGroupRef.current.children.length > 0 && rightCameraRef.current && rightControlsRef.current) {
      const bbox = new THREE.Box3().setFromObject(rightGroupRef.current);
      const center = bbox.getCenter(new THREE.Vector3());
      const size = bbox.getSize(new THREE.Vector3());
      const maxDim = Math.max(size.x, size.y, size.z);
      const fov = rightCameraRef.current.fov * (Math.PI / 180);
      const fitDist = maxDim / (2 * Math.tan(fov / 2));
      rightControlsRef.current.target.copy(center);
      rightCameraRef.current.position.set(center.x, center.y - fitDist, center.z);
      rightCameraRef.current.up.set(0, 0, 1);
      rightCameraRef.current.lookAt(center);
      rightCameraRef.current.updateProjectionMatrix();
      rightControlsRef.current.update();
    }

    setRightLoading(false);
    setRightHasModel(true);
    setCompareRightFiles(loadedFileNames.map(fn => ({
      id: `cmp-${fn}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      fileName: fn,
      isVisible: true,
      originalUrl: '',
    })));

    e.target.value = '';
  };

  // Sync visibility for right panel compareRightFiles
  useEffect(() => {
    if (compareRightFiles.length === 0) return;
    const visibilityMap = new Map<string, boolean>();
    compareRightFiles.forEach(file => visibilityMap.set(file.fileName, file.isVisible));
    meshRefs.current.right.forEach(mesh => {
      const fileName = mesh.userData?.fileName;
      if (fileName && visibilityMap.has(fileName)) {
        mesh.visible = visibilityMap.get(fileName)!;
      }
    });
  }, [compareRightFiles]);

  // Sync visibility for left panel compareLeftFiles (localOnly mode)
  useEffect(() => {
    if (!localOnly || compareLeftFiles.length === 0) return;
    const visibilityMap = new Map<string, boolean>();
    compareLeftFiles.forEach(file => visibilityMap.set(file.fileName, file.isVisible));
    meshRefs.current.left.forEach(mesh => {
      const fileName = mesh.userData?.fileName;
      if (fileName && visibilityMap.has(fileName)) {
        mesh.visible = visibilityMap.get(fileName)!;
      }
    });
  }, [compareLeftFiles, localOnly]);

  const getVertebraInfo = (fileName: string) => {
    // First try to match vertebrae (C, T, L, S)
    const vertebraMatch = fileName.match(/(C|T|L|S)(\d+)/i);
    if (vertebraMatch) {
      return {
        type: vertebraMatch[1].toUpperCase(),
        number: parseInt(vertebraMatch[2]),
        fullName: vertebraMatch[0].toUpperCase(),
        fileName: fileName,
      };
    }

    // Aorta matching
    const nameWithoutExt = fileName.replace('.stl', '').toLowerCase();
    if (nameWithoutExt.includes('aorta') || nameWithoutExt === 'aorta' || nameWithoutExt === 'a') {
      return {
        type: 'A',
        number: 0,
        fullName: 'AORTA',
        fileName: fileName,
      };
    }

    // Heart matching
    if (nameWithoutExt.includes('heart') || nameWithoutExt === 'heart' || nameWithoutExt === 'h') {
      return {
        type: 'H',
        number: 0,
        fullName: 'HEART',
        fileName: fileName,
      };
    }

    // Default for unrecognized
    return {
      type: 'X',
      number: 0,
      fullName: fileName.replace('.stl', '').toUpperCase(),
      fileName: fileName,
    };
  };

  useEffect(() => {
    const checkServices = () => {
      console.log('🔍 Checking for OHIF services...');

      // Method 1: Check if we have ANY services manager
      if (propServicesManager) {
        console.log('✅ ServicesManager available, enabling STL-DICOM linking');
        setHasSegmentationService(true);
        setOhifServices(propServicesManager.services || propServicesManager);
        return true;
      }

      // Method 2: Check window OHIF
      if ((window as any).OHIF?.services) {
        console.log('✅ Window OHIF services available, enabling STL-DICOM linking');
        setHasSegmentationService(true);
        setOhifServices((window as any).OHIF.services);
        return true;
      }

      // Method 3: Check if we're in OHIF environment (based on the error, we are)
      if ((window as any).cornerstone || (window as any).cornerstoneTools) {
        console.log('⚠️ OHIF environment detected (cornerstone found), enabling basic linking');
        setHasSegmentationService(true);
        return true;
      }

      console.log('❌ No OHIF environment detected');
      return false;
    };

    // Initial check
    const hasServices = checkServices();

    if (!hasServices) {
      // OHIF might still be initializing, retry
      const timeoutId = setTimeout(() => {
        console.log('🔄 Retrying service detection...');
        checkServices();
      }, 1000);

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

// Add all these functions to your SingleSpinalCord component
const createAutomaticSegmentation = async () => {
  try {
    console.log('🎯 Creating automatic circle at DICOM center...');
    const svcManager = propServicesManager || servicesManager;
    if (!svcManager?.services) throw new Error('No services manager available');
    const { viewportGridService, cornerstoneViewportService, measurementService } = svcManager.services;

    // Get viewport info
    const activeViewportId = viewportGridService.getActiveViewportId();
    if (!activeViewportId) throw new Error('No active viewport found');

    const viewport = cornerstoneViewportService.getCornerstoneViewport(activeViewportId);
    const imageData = viewport.getImageData();
    if (!imageData) throw new Error('No image data available');

    // Calculate center and size
    const dimensions = imageData.dimensions;
    const centerX = Math.floor(dimensions[0] / 2);
    const centerY = Math.floor(dimensions[1] / 2);
    const radius = Math.floor(Math.min(dimensions[0], dimensions[1]) * 0.1); // 10% size

    console.log(`📍 Center: (${centerX}, ${centerY}), Radius: ${radius}`);

    // Method 1: Try CircleROI first
    try {
      const circleAnnotation = cornerstoneTools.CircleROITool.hydrate(
        activeViewportId,
        {
          handles: {
            points: [
              [centerX, centerY, 0], // center
              [centerX + radius, centerY, 0] // edge point for radius
            ]
          },
          cachedStats: {}
        }
      );

      measurementService.add(circleAnnotation);
      console.log("✅ Circle created with CircleROI!");

    } catch (circleError) {
      console.log('CircleROI failed, trying EllipticalROI...');

      // Method 2: Fallback to EllipticalROI
      const ellipseAnnotation = cornerstoneTools.EllipticalROITool.hydrate(
        activeViewportId,
        {
          handles: {
            points: [
              [centerX - radius, centerY - radius, 0], // top-left
              [centerX + radius, centerY + radius, 0]  // bottom-right
            ]
          },
          cachedStats: {}
        }
      );

      measurementService.add(ellipseAnnotation);
      console.log("✅ Circle created with EllipticalROI!");
    }

    // Refresh the viewport to show the annotation
    viewport.render();

  } catch (error) {
    console.error('❌ All methods failed:', error);

    // Final fallback: just activate the tool
    await commandsManager.runCommand('setToolActive', {
      toolName: 'CircleROI',
      toolGroupId: 'default'
    });
    console.log("🔄 CircleROI tool activated as final fallback");
  }
};

// Helper function to get active display sets


  const setUndoStackTracked: typeof setUndoStack = (action) => {
    setUndoStack(prev => {
      const next = typeof action === 'function' ? action(prev) : action;
      if (next.length > prev.length) undoOrderRef.current.push('bone');
      return next;
    });
  };

  const performVoxelMasking = useCallback((removedVertices: THREE.Vector3[], preComputedBounds?: { min: THREE.Vector3; max: THREE.Vector3 }) => {
    if (removedVertices.length === 0) return;
    const stlBounds = preComputedBounds || computeSTLBounds(meshRefs.current.left);
    const snapshot = maskVoxelsForRemovedVertices(removedVertices, stlBounds, servicesManager);
    if (snapshot) {
      voxelUndoStackRef.current.push(snapshot);
      forceRerenderMPRViewports(servicesManager);
      markRemovedVoxelsRed(snapshot, servicesManager);
    }
  }, [servicesManager]);

  const { removalOutlinePoints: boneRemovalPoints } = useBoneRemoval({
    removalMode: removalMode && isPanelActive('left'),
    leftRendererRef,
    leftControlsRef,
    cameraRef,
    meshRefs,
    removalCanvasRef,
    setRemoving,
    setUndoStack: setUndoStackTracked,
    setRemovalOutline,
    removalOutline,
    onRemovalComplete: (removedVertices, preRemovalBounds) => {
      performVoxelMasking(removedVertices, preRemovalBounds);
    },
    localOnly: showComparePanel,
    meshKey: 'left',
  });

  // Right panel bone removal — active in localOnly or compareMode
  useBoneRemoval({
    removalMode: removalMode && showComparePanel && isPanelActive('right'),
    leftRendererRef: rightRendererRef as React.MutableRefObject<THREE.WebGLRenderer | undefined>,
    leftControlsRef: rightControlsRef,
    cameraRef: rightCameraRef,
    meshRefs,
    removalCanvasRef: rightRemovalCanvasRef,
    setRemoving,
    setUndoStack: setUndoStackTracked,
    setRemovalOutline: setRightRemovalOutline,
    removalOutline: rightRemovalOutline,
    localOnly: true,
    meshKey: 'right',
  });

  const {
    implantMesh,
    implantMountRef: implantMountRefFromHook,
    handleImplantFileChange,
    loadImplant,
    centerImplant
  } = useImplantViewer({
    brightnessEnabled,
    brightness,
  });

  // FIXED: Use the hook and destructure properly
  const versionHistory = useVersionHistory({
    setLoading,
    setError,
    setApproveSuccess,
    setStlUrls: setTestStls
  });


  useBrightness({
    brightnessEnabled,
    brightness,
    meshRefs,
    activePanel: showComparePanel && activePanel !== 'both' ? activePanel as 'left' | 'right' : undefined,
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


  // Clear file lists on mount for compare modes
  useLayoutEffect(() => {
    if (localOnly) {
      setCompareLeftFiles([]);
    }
    if (showComparePanel) {
      setCompareRightFiles([]);
    }
  }, []);

  // Data fetching — extracted so it can be called after upload too
  const fetchStlData = async () => {
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

      if (!response.ok) {
        throw new Error('Failed to fetch data');
      }

      const data = await response.json();
      const versions = data?.data?.versions || [];
      setVersions(versions);

      if (versions.length > 0) {
        const latestVersion = versions.reduce((a, b) => (a.version > b.version ? a : b));
        console.log('Using latest version:', latestVersion.version, latestVersion.urls);
        setTestStls(latestVersion.urls || []);
      } else {
        console.log('No versions, using processed URLs:', data?.data?.processed?.urls);
        setTestStls(data?.data?.processed?.urls || []);
      }
    } catch (err: any) {
      setError(err.message);
    }
  };

  useEffect(() => {
    if (stlInstanceId && !localOnly) {
      fetchStlData();
    }
  }, [stlInstanceId, userToken, localOnly]);

  // Three.js Viewer and Controls Setup
  useEffect(() => {
    const leftScene = leftSceneRef.current;
    const rightScene = rightSceneRef.current;
    const leftMount = leftMountRef.current!;
    const rightMount = rightMountRef.current!;

    leftScene.background = new THREE.Color(0x000000);
    rightScene.background = new THREE.Color(0x000000);

    // Create SEPARATE cameras for left and right views
    // LPS coordinate system: Z is Superior (up)
    const leftCamera = new THREE.PerspectiveCamera(
      45, leftMount.clientWidth / leftMount.clientHeight, 0.1, 10000
    );
    leftCamera.up.copy(LPS_UP); // Set Z as up for LPS
    leftCamera.position.set(0, -500, 100); // Anterior view (looking from front)
    leftCamera.lookAt(0, 0, 0);

    const rightCamera = new THREE.PerspectiveCamera(
      45, rightMount.clientWidth / rightMount.clientHeight, 0.1, 10000
    );
    rightCamera.up.copy(LPS_UP); // Set Z as up for LPS
    rightCamera.position.set(0, -500, 100); // Anterior view (looking from front)
    rightCamera.lookAt(0, 0, 0);

    cameraRef.current = leftCamera; // Keep ref for backward compatibility
    rightCameraRef.current = rightCamera;

    const leftRenderer = new THREE.WebGLRenderer({ antialias: true });
    leftRenderer.setSize(leftMount.clientWidth, leftMount.clientHeight, false);
    leftRenderer.setPixelRatio(window.devicePixelRatio);
    leftRenderer.domElement.style.width = '100%';
    leftRenderer.domElement.style.height = '100%';
    leftRenderer.domElement.style.display = 'block';
    leftRendererRef.current = leftRenderer;
    leftMount.appendChild(leftRenderer.domElement);

    const rightRenderer = new THREE.WebGLRenderer({ antialias: true });
    rightRenderer.setSize(rightMount.clientWidth, rightMount.clientHeight, false);
    rightRenderer.setPixelRatio(window.devicePixelRatio);
    rightRenderer.domElement.style.width = '100%';
    rightRenderer.domElement.style.height = '100%';
    rightRenderer.domElement.style.display = 'block';
    rightRendererRef.current = rightRenderer;
    rightMount.appendChild(rightRenderer.domElement);

    // Create separate controls with their own cameras
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

      // Configure mouse buttons explicitly
      ctrl.mouseButtons = {
        LEFT: THREE.MOUSE.ROTATE,
        MIDDLE: THREE.MOUSE.DOLLY,
        RIGHT: THREE.MOUSE.PAN
      };
    });

    leftControlsRef.current = leftControls;
    rightControlsRef.current = rightControls;

    function setupLighting(scene: THREE.Scene) {
      // Ambient light for base illumination
      scene.add(new THREE.AmbientLight(0xffffff, 0.4));

      // Key light (main directional light)
      const keyLight = new THREE.DirectionalLight(0xffffff, 0.5);
      keyLight.position.set(1, 1, 1).normalize();
      keyLight.castShadow = false;
      scene.add(keyLight);

      // Fill light (from opposite direction)
      const fillLight = new THREE.DirectionalLight(0xffffff, 0.25);
      fillLight.position.set(-1, 0.5, -0.5).normalize();
      scene.add(fillLight);

      // Back light (to illuminate from behind)
      const backLight = new THREE.DirectionalLight(0xffffff, 0.15);
      backLight.position.set(0, 0, -1).normalize();
      scene.add(backLight);

      // Hemisphere light for even lighting
      const hemisphereLight = new THREE.HemisphereLight(0xffffff, 0x444444, 0.2);
      scene.add(hemisphereLight);
    }

    setupLighting(leftScene);
    setupLighting(rightScene);

    leftScene.add(leftGroupRef.current);
    rightScene.add(rightGroupRef.current);

    const animate = () => {
      animationIdRef.current = requestAnimationFrame(animate);
      leftControls.update();
      leftRenderer.render(leftScene, leftCamera);
      if (rightMount.offsetParent !== null) {
        rightControls.update();
        rightRenderer.render(rightScene, rightCamera);
      }
    };
    animate();

    const handleResize = () => {
      // Resize left view
      const leftWidth = leftMount.clientWidth;
      const leftHeight = leftMount.clientHeight;
      if (leftWidth > 0 && leftHeight > 0) {
        leftCamera.aspect = leftWidth / leftHeight;
        leftCamera.updateProjectionMatrix();
        leftRenderer.setSize(leftWidth, leftHeight, false);
      }

      // Resize right view
      const rightWidth = rightMount.clientWidth;
      const rightHeight = rightMount.clientHeight;
      if (rightWidth > 0 && rightHeight > 0) {
        rightCamera.aspect = rightWidth / rightHeight;
        rightCamera.updateProjectionMatrix();
        rightRenderer.setSize(rightWidth, rightHeight, false);
      }

      if (removalCanvasRef.current) {
        removalCanvasRef.current.width = leftWidth;
        removalCanvasRef.current.height = leftHeight;
      }
    };

    window.addEventListener('resize', handleResize);

    const resizeObserver = new ResizeObserver(() => {
      handleResize();
    });
    resizeObserver.observe(leftMount);

    return () => {
      if (animationIdRef.current) {
        cancelAnimationFrame(animationIdRef.current);
      }
      window.removeEventListener('resize', handleResize);
      resizeObserver.disconnect();

      if (leftMount.contains(leftRenderer.domElement)) {
        leftMount.removeChild(leftRenderer.domElement);
      }
      if (rightMount.contains(rightRenderer.domElement)) {
        rightMount.removeChild(rightRenderer.domElement);
      }

      leftRenderer.dispose();
      rightRenderer.dispose();
      leftControls.dispose();
      rightControls.dispose();
      setCompareRightFiles([]);
      setCompareLeftFiles([]);
    };
  }, []);

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
    if (!clickRemovalMode || !isPanelActive('left')) return;

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

          // Compute bounds BEFORE removing mesh so STL→DICOM transform is correct
          const preRemovalBounds = computeSTLBounds(meshRefs.current.left);

          // Remove from scene
          leftGroupRef.current.remove(leftMesh);
          meshRefs.current.left.splice(idx, 1);

          // In normal mode (no compare), also remove paired right mesh
          if (!showComparePanel) {
            const rightMesh = meshRefs.current.right[idx];
            if (rightMesh) {
              rightGroupRef.current.remove(rightMesh);
              meshRefs.current.right.splice(idx, 1);
            }

            // Push into undo stack (with paired mesh)
            setClickRemovalUndoStack(stack => [
              ...stack,
              { leftMesh, rightMesh, index: idx }
            ]);
          } else {
            // compare mode: undo stack with left mesh only
            setClickRemovalUndoStack(stack => [
              ...stack,
              { leftMesh, rightMesh: null as any, index: idx }
            ]);
          }
          undoOrderRef.current.push('click');

          // Mask corresponding DICOM voxels
          const removedVertices = extractRemovedVerticesFromClick(leftMesh);
          performVoxelMasking(removedVertices, preRemovalBounds);

          // Update file list context
          const fileName = leftMesh.userData?.fileName;
          if (localOnly && fileName) {
            if (meshRefs.current.left.length > 0) {
              setCompareLeftFiles(meshRefs.current.left.map((m, i) => ({
                id: `cmp-left-${m.userData?.fileName || i}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                fileName: m.userData?.fileName || `mesh-${i}`,
                isVisible: true,
                originalUrl: '',
                meshIndex: i,
              })));
            } else {
              setCompareLeftFiles([]);
              setLeftHasModel(false);
            }
          }
        }
      }
    };

    canvas.style.cursor = 'pointer';
    canvas.addEventListener('click', onClick);

    return () => {
      canvas.style.cursor = 'auto';
      canvas.removeEventListener('click', onClick);
    };
  }, [clickRemovalMode, activePanel]);

  // Click removal for right panel (Compare Panel) — localOnly or compareMode
  // Bone removal (outline) is handled by the second useBoneRemoval hook above
  useEffect(() => {
    if (!clickRemovalMode || !showComparePanel || !isPanelActive('right')) return;

    const rightRenderer = rightRendererRef.current;
    const rightCanvas = rightRenderer?.domElement;
    if (!rightCanvas) return;

    // Disable OrbitControls on right panel so click events reach our handler
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

          // Remove from scene
          rightGroupRef.current.remove(rightMesh);

          // Remove from refs
          meshRefs.current.right.splice(idx, 1);

          // Update compare right files in context
          const fileName = rightMesh.userData?.fileName;
          if (fileName) {
            setCompareRightFiles(prev => prev.filter(f => f.fileName !== fileName));
          }

          // Dispose geometry and material
          rightMesh.geometry.dispose();
          if (Array.isArray(rightMesh.material)) rightMesh.material.forEach(m => m.dispose());
          else (rightMesh.material as THREE.Material).dispose();

          // Update rightHasModel state
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
      // Re-enable OrbitControls when leaving removal mode
      if (rightControls) {
        rightControls.enabled = true;
      }
    };
  }, [clickRemovalMode, showComparePanel, activePanel]);

  useEffect(() => {
    // Helper to remove existing implant meshes from the scene
    const removeExistingImplants = () => {
      // Remove from left
      for (let i = meshRefs.current.left.length - 1; i >= 0; i--) {
        const mesh = meshRefs.current.left[i];
        if (mesh.userData?.isImplant || mesh.userData?.type === 'I') {
          leftGroupRef.current.remove(mesh);
          mesh.geometry.dispose();
          if (Array.isArray(mesh.material)) mesh.material.forEach(m => m.dispose());
          else (mesh.material as THREE.Material).dispose();
          meshRefs.current.left.splice(i, 1);
        }
      }
      // Remove from right
      for (let i = meshRefs.current.right.length - 1; i >= 0; i--) {
        const mesh = meshRefs.current.right[i];
        if (mesh.userData?.isImplant || mesh.userData?.type === 'I') {
          rightGroupRef.current.remove(mesh);
          mesh.geometry.dispose();
          if (Array.isArray(mesh.material)) mesh.material.forEach(m => m.dispose());
          else (mesh.material as THREE.Material).dispose();
          meshRefs.current.right.splice(i, 1);
        }
      }
    };

    if (!implantFile) {
      removeExistingImplants();
      return;
    }

    // Load implant directly into the existing scene without triggering useSTLLoader
    const loadImplantIntoScene = async () => {
      try {
        removeExistingImplants();

        const arrayBuffer = await implantFile.arrayBuffer();
        const loader = new STLLoader();
        const geometry = loader.parse(arrayBuffer);
        geometry.center();
        geometry.computeBoundingBox();

        // Calculate vertebrae center for positioning
        let vertebraeCenterZ = 0;
        const nonImplantMeshes = meshRefs.current.left.filter(
          m => !m.userData?.isImplant && m.userData?.type !== 'I'
        );
        if (nonImplantMeshes.length > 0) {
          const bbox = new THREE.Box3();
          nonImplantMeshes.forEach(mesh => bbox.expandByObject(mesh));
          const center = new THREE.Vector3();
          bbox.getCenter(center);
          vertebraeCenterZ = center.z;
        }

        const createImplantMaterial = () => new THREE.MeshPhongMaterial({
          color: 0x00ff00,
          specular: 0x111111,
          shininess: 30,
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0.9,
          emissive: new THREE.Color(0x00ff00),
          emissiveIntensity: 0.3,
        });

        const implantUserData = {
          type: 'I',
          number: 0,
          fullName: 'IMPLANT',
          fileName: implantFile.name,
          isImplant: true,
        };

        // Left mesh
        const leftMesh = new THREE.Mesh(geometry.clone(), createImplantMaterial());
        leftMesh.position.set(0, 0, vertebraeCenterZ);
        leftMesh.userData = { ...implantUserData };
        leftGroupRef.current.add(leftMesh);
        meshRefs.current.left.push(leftMesh);

        // Right mesh
        const rightMesh = new THREE.Mesh(geometry.clone(), createImplantMaterial());
        rightMesh.position.set(0, 0, vertebraeCenterZ);
        rightMesh.userData = { ...implantUserData };
        rightGroupRef.current.add(rightMesh);
        meshRefs.current.right.push(rightMesh);

        console.log('✅ Implant loaded directly into scene:', implantFile.name);
      } catch (error) {
        console.error('❌ Failed to load implant:', error);
        setError('Failed to load implant STL file');
      }
    };

    loadImplantIntoScene();
  }, [implantFile]);


  // Update your refresh function
  const handleRefresh = () => {
    // Clear meshes from groups first
    leftGroupRef.current.clear();
    rightGroupRef.current.clear();

    // Then dispose of the meshes
    meshRefs.current.left.forEach(mesh => {
      mesh.geometry.dispose();
      if (Array.isArray(mesh.material)) {
        mesh.material.forEach(m => m.dispose());
      } else {
        mesh.material.dispose();
      }
    });

    meshRefs.current.right.forEach(mesh => {
      mesh.geometry.dispose();
      if (Array.isArray(mesh.material)) {
        mesh.material.forEach(m => m.dispose());
      } else {
        mesh.material.dispose();
      }
    });

    // Reset mesh references
    meshRefs.current.left = [];
    meshRefs.current.right = [];

    // Reset files and UI state
    setFiles([]);
    setError(null);
    setRemovalOutline([]);
    setUndoStack([]);
    setClickRemovalUndoStack([]);
    undoOrderRef.current = [];
    while (voxelUndoStackRef.current.length > 0) {
      const snapshot = voxelUndoStackRef.current.pop()!;
      restoreVoxels(snapshot, servicesManager);
    }
    clearAllBoneRemovalOverlay(servicesManager);
    resetCachedSTLBounds();
    setRemovalMode(false);
    setRemoving(false);
    toggleBrightness();
    // Clear measurements
    clearMeasurements();
    clearAngleMeasurements();

    // Reset camera to coronal view
    if (cameraRef.current) {
      cameraRef.current.position.set(0, -500, 100);
      cameraRef.current.up.set(0, 0, 1);
      cameraRef.current.lookAt(0, 0, 0);

      if (leftControlsRef.current) {
        leftControlsRef.current.reset();
        leftControlsRef.current.update();
      }
      if (rightControlsRef.current) {
        rightControlsRef.current.reset();
        rightControlsRef.current.update();
      }
    }

    // Clear the file input so you can select the same files again
    const fileInput = document.getElementById('stl-file-input') as HTMLInputElement;
    if (fileInput) {
      fileInput.value = '';
    }
  };

  const handleScreenshot = () => {
    const useRightPanel = showComparePanel && activePanel === 'right';
    const renderer = useRightPanel ? rightRendererRef.current : leftRendererRef.current;
    const scene = useRightPanel ? rightSceneRef.current : leftSceneRef.current;
    const cam = useRightPanel ? rightCameraRef.current : cameraRef.current;
    handleScreenshotUtil(renderer, scene, cam);
  };

  const downloadGenerated3D = async () => {
    try {
      setIsDownloading(true);
      setDownloadProgress(0);
      setDownloadedBytes(0);
      setDownloadTotalBytes(0);

      // Open the right 3D panel so the user can see the progress bar
      try {
        const svcManager = propServicesManager || servicesManager;
        const panelService = svcManager?.services?.panelService;
        if (panelService) {
          panelService.activatePanel('stl-extention.panelModule.stl', true);
        }
      } catch (e) {
        // Panel activation is best-effort
      }

      // Simulated progress: ramps from 0→90% over ~15s while waiting
      let simulated = 0;
      const simInterval = setInterval(() => {
        simulated += (90 - simulated) * 0.04; // ease-out curve
        setDownloadProgress(Math.round(simulated));
      }, 200);

      const response = await fetch(
        `${SERVER_URL}/analyst/meshes/processed/download?series_instance_uid=${stlInstanceId}`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${userToken}`,
            "Content-Type": "application/json"
          },
          credentials: 'include',
        }
      );

      if (!response.ok) {
        clearInterval(simInterval);
        throw new Error(`Download failed: ${response.status} ${response.statusText}`);
      }

      const contentLength = response.headers.get('Content-Length');
      const total = contentLength ? parseInt(contentLength, 10) : 0;
      setDownloadTotalBytes(total);

      const contentType = response.headers.get('Content-Type') || 'application/zip';

      const contentDisposition = response.headers.get('Content-Disposition');
      let fileName = 'downloaded_3d_file.zip';
      if (contentDisposition) {
        const fileNameMatch = contentDisposition.match(/filename="?(.+)"?/);
        if (fileNameMatch && fileNameMatch[1]) {
          fileName = fileNameMatch[1];
        }
      }

      const reader = response.body!.getReader();
      const chunks: Uint8Array[] = [];
      let received = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        received += value.length;
        setDownloadedBytes(received);
        if (total > 0) {
          // Use real progress when Content-Length is known
          const realPct = Math.round((received / total) * 100);
          simulated = Math.max(simulated, realPct);
          setDownloadProgress(simulated);
        }
      }

      // Stop simulation, jump to 100%
      clearInterval(simInterval);
      setDownloadProgress(100);
      setDownloadedBytes(received);

      // Hold at 100% briefly so user sees completion
      await new Promise(r => setTimeout(r, 600));

      const blob = new Blob(chunks, { type: contentType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      URL.revokeObjectURL(url);
      document.body.removeChild(a);

    } catch (error: any) {
      alert(`Error downloading generated STL: ${error.message || error.toString()}`);
    } finally {
      setIsDownloading(false);
    }
  };

  const approveEditedFiles = () => {
    setIsApproving(true);
    setApproveProgress(0);
    setApproveSuccess(null);
    setApproveFailed(null);

    // Open the right 3D panel so the user can see the progress bar
    try {
      const svcManager = propServicesManager || servicesManager;
      const panelService = svcManager?.services?.panelService;
      if (panelService) {
        panelService.activatePanel('stl-extention.panelModule.stl', true);
      }
    } catch (e) {
      // Panel activation is best-effort
    }

    const exporter = new STLExporter();
    const formData = new FormData();
    formData.append('series_instance_uid', stlInstanceId);

    let fileCount = 0;
    let totalSize = 0;

    for (const mesh of meshRefs.current.left) {
      if (!mesh.visible) continue;
      const fileName = mesh.userData?.fileName;
      if (!fileName) {
        console.warn('Skipping mesh without original fileName');
        continue;
      }
      const stlData = exporter.parse(mesh, { binary: true });
      const blob = new Blob([stlData], { type: 'application/octet-stream' });
      formData.append('files', blob, fileName);
      fileCount++;
      totalSize += blob.size;
    }

    console.log(`[Approve 3D] Uploading ${fileCount} files, total size: ${(totalSize / (1024 * 1024)).toFixed(2)} MB`);
    console.log(`[Approve 3D] URL: ${SERVER_URL}/analyst/meshes/approved`);

    // Slow simulated progress: ramps gradually from 0→85%
    let simulated = 0;
    const simInterval = setInterval(() => {
      simulated += (85 - simulated) * 0.015;
      setApproveProgress(Math.round(simulated));
    }, 200);

    const xhr = new XMLHttpRequest();
    xhr.timeout = 5 * 60 * 1000; // 5 minute timeout for large uploads
    xhr.open('POST', `${SERVER_URL}/analyst/meshes/approved`);
    xhr.setRequestHeader('Authorization', `Bearer ${userToken}`);
    xhr.withCredentials = true;

    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable) {
        // Upload = 0-90%, server processing = 90-100%
        const uploadPct = Math.round((e.loaded / e.total) * 90);
        if (uploadPct > simulated) {
          simulated = uploadPct;
          setApproveProgress(uploadPct);
        }
        console.log(`[Approve 3D] Upload: ${(e.loaded / (1024 * 1024)).toFixed(1)}/${(e.total / (1024 * 1024)).toFixed(1)} MB (${uploadPct}%)`);
      }
    });

    xhr.onload = () => {
      clearInterval(simInterval);
      console.log(`[Approve 3D] Response status: ${xhr.status}`);
      console.log(`[Approve 3D] Response body: ${xhr.responseText}`);
      if (xhr.status >= 200 && xhr.status < 300) {
        setApproveProgress(100);
        setTimeout(() => {
          setApproveSuccess('3D files approved successfully!');
          setIsApproving(false);
          // Auto-refresh version history list so new version appears immediately
          versionHistory.refreshVersionHistory();
        }, 600);
      } else {
        setApproveFailed(`Approval failed: ${xhr.status} ${xhr.statusText}`);
        setIsApproving(false);
      }
    };

    xhr.onerror = () => {
      clearInterval(simInterval);
      console.error(`[Approve 3D] onerror — status: ${xhr.status}, readyState: ${xhr.readyState}`);
      console.error(`[Approve 3D] Response headers:`, xhr.getAllResponseHeaders());
      console.error(`[Approve 3D] Response text:`, xhr.responseText);
      setApproveFailed('Network error — could not reach the server. Check browser console.');
      setIsApproving(false);
    };

    xhr.ontimeout = () => {
      clearInterval(simInterval);
      console.error('[Approve 3D] Request timed out after 5 minutes');
      setApproveFailed('Request timed out');
      setIsApproving(false);
    };

    xhr.send(formData);
  };

  const handleUploadFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files;
    if (!selected || selected.length === 0) return;
    const stlFiles = Array.from(selected).filter(f => f.name.toLowerCase().endsWith('.stl'));
    if (stlFiles.length === 0) return;
    setUploadFiles(stlFiles);
    setShowUploadPreview(true);
    // Reset file input so the same files can be re-selected
    e.target.value = '';
  };

  const handleUploadSave = () => {
    if (uploadFiles.length === 0) return;

    setIsUploading(true);
    setUploadProgress(0);

    const formData = new FormData();
    formData.append('series_instance_uid', stlInstanceId);

    let totalSize = 0;
    for (const file of uploadFiles) {
      formData.append('files', file, file.name);
      totalSize += file.size;
    }

    console.log(`[Upload 3D] Uploading ${uploadFiles.length} files, total size: ${(totalSize / (1024 * 1024)).toFixed(2)} MB`);

    // Slow simulated progress: ramps gradually from 0→85%
    let simulated = 0;
    const simInterval = setInterval(() => {
      simulated += (85 - simulated) * 0.015;
      setUploadProgress(Math.round(simulated));
    }, 200);

    const xhr = new XMLHttpRequest();
    xhr.timeout = 5 * 60 * 1000;
    xhr.open('POST', `${SERVER_URL}/analyst/meshes/approved`);
    xhr.setRequestHeader('Authorization', `Bearer ${userToken}`);
    xhr.withCredentials = true;

    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable) {
        const uploadPct = Math.round((e.loaded / e.total) * 90);
        if (uploadPct > simulated) {
          simulated = uploadPct;
          setUploadProgress(uploadPct);
        }
      }
    });

    xhr.onload = () => {
      clearInterval(simInterval);
      if (xhr.status >= 200 && xhr.status < 300) {
        setUploadProgress(100);
        setTimeout(() => {
          setApproveSuccess('3D files uploaded successfully!');
          setIsUploading(false);
          setShowUploadPreview(false);
          setUploadFiles([]);
          versionHistory.refreshVersionHistory();
          fetchStlData();
        }, 600);
      } else {
        setApproveFailed(`Upload failed: ${xhr.status} ${xhr.statusText}`);
        setIsUploading(false);
      }
    };

    xhr.onerror = () => {
      clearInterval(simInterval);
      setApproveFailed('Network error — could not reach the server.');
      setIsUploading(false);
    };

    xhr.ontimeout = () => {
      clearInterval(simInterval);
      setApproveFailed('Upload request timed out');
      setIsUploading(false);
    };

    xhr.send(formData);
  };

  const undoClickRemoval = () => {
    setClickRemovalUndoStack(stack => {
      if (stack.length === 0) return stack;

      const lastRemoved = stack[stack.length - 1];

      // Insert back at the original index
      meshRefs.current.left.splice(lastRemoved.index, 0, lastRemoved.leftMesh);
      meshRefs.current.right.splice(lastRemoved.index, 0, lastRemoved.rightMesh);

      leftGroupRef.current.add(lastRemoved.leftMesh);
      rightGroupRef.current.add(lastRemoved.rightMesh);

      return stack.slice(0, -1);
    });
    const voxelSnapshot = voxelUndoStackRef.current.pop();
    if (voxelSnapshot) {
      restoreVoxels(voxelSnapshot, servicesManager);
      clearRemovedVoxelsRed(voxelSnapshot, servicesManager);
    }
  };

  const handleUndo = () => {
    if (undoStack.length === 0) return;
    const prevGeometries = undoStack[undoStack.length - 1];
    meshRefs.current.left.forEach((mesh, idx) => {
      mesh.geometry = prevGeometries[idx].clone();
      mesh.visible = true;
    });
    meshRefs.current.right.forEach((mesh, idx) => {
      mesh.geometry = prevGeometries[idx].clone();
      mesh.visible = true;
    });
    setUndoStack(stack => stack.slice(0, -1));
    const voxelSnapshot = voxelUndoStackRef.current.pop();
    if (voxelSnapshot) {
      restoreVoxels(voxelSnapshot, servicesManager);
      clearRemovedVoxelsRed(voxelSnapshot, servicesManager);
    }
  };

  const handleUnifiedUndo = () => {
    const order = undoOrderRef.current;
    if (order.length === 0) return;
    const lastType = order[order.length - 1];
    order.pop();
    if (lastType === 'bone') {
      handleUndo();
    } else {
      undoClickRemoval();
    }
  };

  // Extracted toggle handlers for 3D tool bridge registration
  const handleToggleRotation = useCallback(() => {
    setRotationMode(prev => !prev);
    setRotationMode1(false);
    setRotationMode2(false);
    setRotationMode3(false);
    setImplantMoveMode(false);
    setInertialRotationMode(false);
  }, []);

  const handleToggleRotation1 = useCallback(() => {
    setRotationMode1(prev => !prev);
    setRotationMode(false);
    setRotationMode2(false);
    setRotationMode3(false);
    setImplantMoveMode(false);
    setInertialRotationMode(false);
  }, []);

  const handleToggleRotation2 = useCallback(() => {
    setRotationMode2(prev => !prev);
    setRotationMode(false);
    setRotationMode1(false);
    setRotationMode3(false);
    setImplantMoveMode(false);
    setInertialRotationMode(false);
  }, []);

  const handleToggleRotation3 = useCallback(() => {
    setRotationMode3(prev => !prev);
    setRotationMode(false);
    setRotationMode1(false);
    setRotationMode2(false);
    setImplantMoveMode(false);
    setInertialRotationMode(false);
  }, []);

  const handleToggleImplantMove = useCallback(() => {
    setImplantMoveMode(prev => !prev);
    setRotationMode(false);
    setRotationMode1(false);
    setRotationMode2(false);
    setRotationMode3(false);
    setInertialRotationMode(false);
  }, []);

  const handleToggleInertialRotation = useCallback(() => {
    setInertialRotationMode(prev => !prev);
    setRotationMode(false);
    setRotationMode1(false);
    setRotationMode2(false);
    setRotationMode3(false);
    setImplantMoveMode(false);
    setPivotPoint(null);
    setPivotBoneIndex(null);
    setCurrentRotationAngle(0);
  }, []);

  // Store latest callbacks in refs so the tool defs always call current versions
  const toolCallbacksRef = useRef<Record<string, () => void>>({});
  toolCallbacksRef.current = {
    fileSelect: () => document.getElementById('stl-file-input')?.click(),
    boneRemoval: () => setRemovalMode(!removalMode),
    undo: handleUnifiedUndo,
    linking: toggleLinking,
    alignment: toggleCenterLine,
    download: downloadGenerated3D,
    brightness: toggleBrightness,
    measurement: toggleMeasurement,
    angle: toggleAngleMeasurement,
    horizontal: handleToggleRotation,
    vertical: handleToggleRotation1,
    longitudinal: handleToggleRotation3,
    rotation: handleToggleRotation2,
    implantMove: handleToggleImplantMove,
    interactiveRotation: handleToggleInertialRotation,
    screenshot: handleScreenshot,
    merge: showMerge ? removeBoneAndRainbowFromAllViewports : applyBoneAndRainbowToAllViewports,
    clickRemoval: () => onToggleClickRemoval(!clickRemovalMode),
    labelView: () => onToggleRightView(!labelViewEnabled),
    spineLabeling: toggleSpineLabelingMode,
    colorMode: toggleColorMode,
    approve: approveEditedFiles,
    upload: () => document.getElementById('stl-upload-input')?.click(),
    versionHistory: () => { toggleVersionHistory(); versionHistory.getVersionHistory(); },
    implant: () => { if (showImplantView) { toggleImplantView(); } else { document.getElementById('implant-file-input')?.click(); } },
  };

  const makeOnClick = useCallback((id: string) => () => toolCallbacksRef.current[id]?.(), []);

  // Register tools into bridge context for top bar dropdown
  // Only state values that affect rendering (active/disabled) are in the dep array
  useEffect(() => {
    const toolDefs: ToolDef[] = [
      { id: 'fileSelect', label: 'File Select', icon: 'fa-folder-open', active: false, disabled: loading, onClick: makeOnClick('fileSelect'), hidden: showComparePanel },
      { id: 'boneRemoval', label: 'Bone Removal', icon: 'fa-cut', active: removalMode, danger: true, onClick: makeOnClick('boneRemoval') },
      { id: 'linking', label: 'Linking', icon: 'fa-link', active: isLinkingActive, onClick: makeOnClick('linking'), hidden: showComparePanel },
      { id: 'alignment', label: 'Alignment', icon: 'fa-route', active: centerLineEnabled, onClick: makeOnClick('alignment') },
      { id: 'download', label: 'Download', icon: 'fa-download', active: false, disabled: isDownloading, onClick: makeOnClick('download') },
      { id: 'brightness', label: 'Brightness', icon: 'fa-sun', active: brightnessEnabled, onClick: makeOnClick('brightness') },
      { id: 'measurement', label: 'Measurement', icon: 'fa-ruler', active: measurementEnabled, onClick: makeOnClick('measurement') },
      { id: 'angle', label: 'Angle', icon: 'fa-angle-double-right', active: angleMeasurementEnabled, onClick: makeOnClick('angle') },
      { id: 'horizontal', label: 'Horizontal', icon: 'fa-arrows-alt-h', active: rotationMode, onClick: makeOnClick('horizontal') },
      { id: 'vertical', label: 'Vertical', icon: 'fa-arrows-alt-v', active: rotationMode1, onClick: makeOnClick('vertical') },
      { id: 'longitudinal', label: 'Longitudinal', icon: 'fa-expand-arrows-alt', active: rotationMode3, onClick: makeOnClick('longitudinal') },
      { id: 'rotation', label: 'Rotation', icon: 'fa-sync-alt', active: rotationMode2, onClick: makeOnClick('rotation') },
      { id: 'implantMove', label: 'Implant Move', icon: 'fa-hand-rock', active: implantMoveMode, onClick: makeOnClick('implantMove') },
      { id: 'interactiveRotation', label: 'Interactive Rotation', icon: 'fa-cube', active: inertialRotationMode, onClick: makeOnClick('interactiveRotation') },
      { id: 'screenshot', label: 'Screenshot', icon: 'fa-camera', active: false, onClick: makeOnClick('screenshot') },
      { id: 'merge', label: 'Merge', icon: showMerge ? 'fa-times' : 'fa-object-group', active: showMerge, onClick: makeOnClick('merge'), hidden: showComparePanel },
      { id: 'clickRemoval', label: 'Click Removal', icon: 'fa-trash', active: clickRemovalMode, danger: true, onClick: makeOnClick('clickRemoval') },
      { id: 'labelView', label: 'Label View', icon: 'fa-columns', active: labelViewEnabled, onClick: makeOnClick('labelView') },
      { id: 'spineLabeling', label: 'Spine Labeling', icon: 'fa-tag', active: spineLabelingMode, onClick: makeOnClick('spineLabeling') },
      { id: 'colorMode', label: 'Color Mode', icon: 'fa-palette', active: colorModeEnabled, onClick: makeOnClick('colorMode') },
      ...(JSON.parse(localStorage.getItem('userPermissions') || '[]').includes('case:approve')
        ? [
            { id: 'approve', label: 'Approve', icon: 'fa-check', active: false, disabled: isApproving, onClick: makeOnClick('approve') },
            { id: 'upload', label: 'Upload', icon: 'fa-upload', active: false, disabled: isUploading, onClick: makeOnClick('upload') },
          ]
        : []),
      { id: 'versionHistory', label: 'Version History', icon: 'fa-history', active: versionHistoryEnabled, onClick: makeOnClick('versionHistory') },
      { id: 'implant', label: 'Implant', icon: 'fa-plus-square', active: showImplantView, onClick: makeOnClick('implant') },
      { id: 'undo', label: 'Undo', icon: 'fa-undo-alt', active: false, disabled: undoStack.length === 0 && clickRemovalUndoStack.length === 0, onClick: makeOnClick('undo'), hidden: true },
    ];
    registerTools(toolDefs);
  }, [
    loading, removalMode, undoStack.length, isLinkingActive, centerLineEnabled, isDownloading,
    brightnessEnabled, measurementEnabled, angleMeasurementEnabled,
    rotationMode, rotationMode1, rotationMode2, rotationMode3,
    implantMoveMode, inertialRotationMode, showMerge, clickRemovalMode,
    clickRemovalUndoStack.length, labelViewEnabled, spineLabelingMode, colorModeEnabled,
    isApproving, isUploading, versionHistoryEnabled, showImplantView,
    registerTools, makeOnClick,
  ]);

  // Clear tools on unmount only
  useEffect(() => {
    return () => registerTools([]);
  }, [registerTools]);

  // ─── Camera sync between left and right panels ───
  useEffect(() => {
    if (!syncCameras) return;
    const leftCtrl = leftControlsRef.current;
    const rightCtrl = rightControlsRef.current;
    const leftCam = cameraRef.current;
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

  return (
    <CenterLineProvider
      toggleCenterLine={toggleCenterLine}
      centerLineEnabled={centerLineEnabled}
      >
      <div style={{
        width: '100%', height: '100%', display: 'flex', flexDirection: 'row',
        backgroundColor: '#000', color: 'white', position: 'relative',
        border: 'none'
      }}>

        {/* Loading overlay — only for non-local mode (local mode shows it inside left panel) */}
        {loading && !localOnly && (
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
          id="stl-upload-input"
          type="file"
          accept=".stl"
          onChange={handleUploadFileSelect}
          multiple
          style={{ display: "none" }}
        />

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

        {approveSuccess && (
          <div style={{
            position: "fixed", top: 20, right: 20, zIndex: 2000,
            background: "#2ecc71", color: "#fff", padding: "14px 24px", borderRadius: "8px",
            fontSize: "15px", fontWeight: "bold", boxShadow: "0 4px 12px #0004",
            display: "flex", alignItems: "center", gap: 10, cursor: "pointer"
          }} onClick={() => setApproveSuccess(null)}>
            <i className="fas fa-check-circle" /> {approveSuccess}
          </div>
        )}

        {approveFailed && (
          <div style={{
            position: "fixed", top: 20, right: 20, zIndex: 2000,
            background: "#e74c3c", color: "#fff", padding: "14px 24px", borderRadius: "8px",
            fontSize: "15px", fontWeight: "bold", boxShadow: "0 4px 12px #0004",
            display: "flex", alignItems: "center", gap: 10, cursor: "pointer"
          }} onClick={() => setApproveFailed(null)}>
            <i className="fas fa-times-circle" /> Approval failed: {approveFailed}
          </div>
        )}

        {/* Upload Preview Overlay */}
        {showUploadPreview && (
          <div style={{
            position: 'fixed', inset: 0, zIndex: 2500,
            background: 'rgba(0,0,0,0.85)',
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
          }}>
            <div style={{
              width: '80%', maxWidth: '1000px',
              background: '#1a1e2e', borderRadius: '12px',
              border: '1px solid #333', overflow: 'hidden',
              display: 'flex', flexDirection: 'column',
              maxHeight: '80vh',
            }}>
              {/* Header */}
              <div style={{
                padding: '16px 20px',
                borderBottom: '1px solid #333',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              }}>
                <span style={{ color: '#fff', fontSize: '16px', fontWeight: 600 }}>
                  <i className="fas fa-upload" style={{ marginRight: 8, color: '#4FC3F7' }} />
                  Upload STL Files
                </span>
                <button
                  onClick={() => { setShowUploadPreview(false); setUploadFiles([]); }}
                  disabled={isUploading}
                  style={{
                    background: 'none', border: 'none', color: '#888',
                    fontSize: '18px', cursor: isUploading ? 'not-allowed' : 'pointer',
                  }}
                >
                  <i className="fas fa-times" />
                </button>
              </div>

              {/* Body */}
              <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
                {/* 3D Preview */}
                <div style={{ flex: 2, position: 'relative', minHeight: '400px' }}>
                  <UploadPreviewScene files={uploadFiles} />
                </div>

                {/* File list */}
                <div style={{
                  flex: 1, borderLeft: '1px solid #333',
                  padding: '16px', overflowY: 'auto',
                  display: 'flex', flexDirection: 'column',
                }}>
                  <div style={{ color: '#87dbfc', fontSize: '13px', fontWeight: 600, marginBottom: 12 }}>
                    {uploadFiles.length} file{uploadFiles.length !== 1 ? 's' : ''} selected
                  </div>
                  {uploadFiles.map((f, i) => (
                    <div key={i} style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      padding: '8px 10px', marginBottom: 4,
                      background: '#0a0e17', borderRadius: '6px',
                      fontSize: '12px', color: '#ccc',
                    }}>
                      <i className="fas fa-cube" style={{ color: '#4FC3F7' }} />
                      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {f.name}
                      </span>
                      <span style={{ color: '#666', fontSize: '11px' }}>
                        {(f.size / 1024).toFixed(0)} KB
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Upload progress bar */}
              {isUploading && (
                <div style={{ padding: '12px 20px', borderTop: '1px solid #333' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <span style={{ color: '#87dbfc', fontSize: '13px', fontWeight: 600 }}>
                      Uploading 3D Files...
                    </span>
                    <span style={{ color: '#4FC3F7', fontSize: '13px', fontWeight: 700 }}>
                      {uploadProgress}%
                    </span>
                  </div>
                  <div style={{
                    width: '100%', height: '6px', backgroundColor: '#333', borderRadius: '3px', overflow: 'hidden'
                  }}>
                    <div style={{
                      width: `${uploadProgress}%`,
                      height: '100%',
                      background: 'linear-gradient(90deg, #4FC3F7, #2196F3)',
                      borderRadius: '3px',
                      transition: 'width 0.3s ease-out',
                    }} />
                  </div>
                </div>
              )}

              {/* Footer */}
              <div style={{
                padding: '14px 20px',
                borderTop: '1px solid #333',
                display: 'flex', justifyContent: 'flex-end', gap: 10,
              }}>
                <button
                  onClick={() => { setShowUploadPreview(false); setUploadFiles([]); }}
                  disabled={isUploading}
                  style={{
                    padding: '8px 20px', borderRadius: '6px',
                    border: '1px solid #555', background: 'transparent',
                    color: '#ccc', fontSize: '13px', fontWeight: 600,
                    cursor: isUploading ? 'not-allowed' : 'pointer',
                    opacity: isUploading ? 0.5 : 1,
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleUploadSave}
                  disabled={isUploading}
                  style={{
                    padding: '8px 20px', borderRadius: '6px',
                    border: 'none', background: '#2196F3',
                    color: '#fff', fontSize: '13px', fontWeight: 600,
                    cursor: isUploading ? 'not-allowed' : 'pointer',
                    opacity: isUploading ? 0.7 : 1,
                  }}
                >
                  {isUploading ? 'Uploading...' : 'Save'}
                </button>
              </div>
            </div>
          </div>
        )}

        {isLabelingPopupOpen && (
          <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.7)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <SpineLabelingPopup onClose={closeLabelingPopup} />
          </div>
        )}

        {/* Hidden file input for right panel in compare modes */}
        {showComparePanel && (
          <input
            id="stl-right-file-input"
            type="file"
            accept=".stl"
            onChange={handleRightFileChange}
            multiple
            style={{ display: 'none' }}
          />
        )}

        <SingleViewerContainer
          startMountRef={startMountRef}
          leftMountRef={leftMountRef}
          rightMountRef={rightMountRef}
          removalCanvasRef={removalCanvasRef}
          rightRemovalCanvasRef={showComparePanel ? rightRemovalCanvasRef : undefined}
          inertialRotationMode={inertialRotationMode}
          pivotBoneIndex={pivotBoneIndex}
          currentRotationAngle={currentRotationAngle}
          onResetBone={() => resetBoneRef.current?.()}
          localOnly={localOnly}
          compareMode={compareMode}
          onBrowseLeft={() => document.getElementById('stl-file-input')?.click()}
          leftHasModel={leftHasModel}
          leftLoading={loading}
          onBrowseRight={() => document.getElementById('stl-right-file-input')?.click()}
          rightHasModel={rightHasModel}
          rightLoading={rightLoading}
          syncCameras={syncCameras}
          onToggleSync={showComparePanel ? () => setSyncCameras(prev => !prev) : undefined}
        >
          {/* Transparency Toggle Button - Only shows when centerline is enabled */}
          {centerLineEnabled && (
            <button
              onClick={toggleTransparency}
              style={{
                position: 'absolute',
                top: '50px',
                left: '10px',
                zIndex: 200,
                backgroundColor: transparencyEnabled ? '#2196F3' : '#4CAF50',
                color: '#fff',
                border: 'none',
                borderRadius: '4px',
                padding: '8px 12px',
                fontSize: '12px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                boxShadow: '0 2px 4px rgba(0,0,0,0.3)',
                transition: 'background-color 0.2s'
              }}
              title={transparencyEnabled ? 'Click to show solid bones' : 'Click to show transparent bones'}
            >
              <i className={`fas ${transparencyEnabled ? 'fa-cube' : 'fa-eye'}`} />
              {transparencyEnabled ? 'Solid' : 'Transparent'}
            </button>
          )}
        </SingleViewerContainer>
      </div>
    </CenterLineProvider>
  );
};

export default SingleSpinalCord;