import React, { useEffect, useRef, useState, useContext, useCallback } from 'react';
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
// import cornerstoneTools from 'platform/core/src/__mocks__/cornerstone-tools';
import cornerstoneTools from '../../../platform/core/src/__mocks__/cornerstone-tools';
import { SingleViewerContainer } from './components/SingleViewerContainer';
import { SingleToolbar } from './components/SingleToolBar';
import { useMeasurementContext } from './context/MeasurementContext';
import { useBrightnessContext } from './context/BrightnessContext';
import { useBoneRemovalContext } from './context/BoneRemovalContext';
import { useClickRemoveContext } from './context/ClickRemoveContext';
import { useStlVisibilityContext } from './context/StlVisibilityContext';
import { useSTLToDICOMLinking } from './hooks/useSTLToDICOMLinking';
import { STLToDICOMConfig } from './types/three.types';
import { useVersionHistoryContext } from './context/VersionHistoryContext'
import { useCenterLine } from './hooks/useCenterLine';
import { useImplantHighlight } from './hooks/useImplantHighlight';
import { CenterLineProvider } from './context/CenterLineContext';
import { servicesManager, commandsManager } from '../../../platform/app/src/App';
import { useViewportGrid } from '@ohif/ui-next';
import { useViewportRendering } from '../../cornerstone/src/hooks/useViewportRendering';
import FileLoaderService from 'platform/app/src/routes/Local/fileLoaderService';
import { useAngleMeasurementContext } from './context/AngleMeasurementContext';
import { useImplantContext } from './context/ImplantContext';

import { SpineLabelingProvider, useSpineLabelingContext } from './context/SpineLabelingContext';
import { SpineLabelingPopup } from './components/SpineLabelingPopup';
import { useSpineLabeling } from './hooks/useSpineLabeling';

interface SingleSpinalCordProps {
  servicesManager?: any;
  // commandsManager?: any;
  extensionManager?: any;
  props?: any;
}


const SingleSpinalCord: React.FC<SingleSpinalCordProps> = ({
  servicesManager: propServicesManager,
  // commandsManager,
  extensionManager,
  props
}) => {
  // State
  const [files, setFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [undoStack, setUndoStack] = useState<THREE.BufferGeometry[][]>([]);
  const [removalOutline, setRemovalOutline] = useState<{ x: number, y: number }[]>([]);
  const [removing, setRemoving] = useState(false);
  const [tetsStls, setTestStls] = useState<string[]>([]);
  const [clickRemovalUndoStack, setClickRemovalUndoStack] = useState<RemovalUndoItem[]>([]);
  const [isDownloading, setIsDownloading] = useState(false);
  const [showRightView, setShowRightView] = useState(false);
  const [isApproving, setIsApproving] = useState(false);
  const [approveSuccess, setApproveSuccess] = useState<string | null>(null);
  const [showMerge, setShowMergeView] = useState(false);

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
  const { stlInstanceId, updateStlInstanceId, seriesList } = context;

  const userRole = localStorage.getItem('userRole');
  const userToken = localStorage.getItem('token');

  const [isCreatingSegmentation, setIsCreatingSegmentation] = useState(false);
  const [segmentationCreated, setSegmentationCreated] = useState(false);
  const [ohifServices, setOhifServices] = useState<any>(null);
  const [hasSegmentationService, setHasSegmentationService] = useState(false);
  const { removalMode, setRemovalMode } = useBoneRemovalContext();
  const { clickRemovalMode, onToggleClickRemoval } = useClickRemoveContext();
  const { addStlFiles, clearStlFiles } = useStlVisibilityContext();
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
  const { versionHistoryEnabled, versions, setVersions } = useVersionHistoryContext();

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
  const { implantFile } = useImplantContext();
  const implantUrlRef = useRef<string | null>(null);

  const {
    clearMeasurements,
    setupMeasurementMode,
    cleanupMeasurementMode,
    updateMeasurementsOnBoneMove
  } = useMeasurementContext();

  const {
    spineLabelingMode,
    isLabelingPopupOpen,
    closeLabelingPopup
  } = useSpineLabelingContext();
  
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
    const leftMount = leftMountRef.current;
    if (!leftMount || !rotationMode) return;
  
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
  
    const onMouseDown = (event: MouseEvent) => {
      if (!rotationMode) return;

      const rect = leftMount.getBoundingClientRect();
      mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(mouse, cameraRef.current!);
      // Filter out implants from raycasting
      const nonImplantMeshes = meshRefs.current.left.filter(m => !m.userData?.isImplant && m.userData?.type !== 'I');
      const intersects = raycaster.intersectObjects(nonImplantMeshes);

      if (intersects.length > 0) {
        leftControlsRef.current!.enabled = false;
        isRotatingRef.current = true;
        initialMousePos.current = { x: event.clientX, y: event.clientY };

        const clickedMesh = intersects[0].object as THREE.Mesh;
        selectedMeshIndex.current = meshRefs.current.left.indexOf(clickedMesh);
      }
    };

    const onMouseMove = (event: MouseEvent) => {
      if (!isRotatingRef.current || selectedMeshIndex.current === null) return;

      const deltaX = event.clientX - initialMousePos.current.x;
      initialMousePos.current = { x: event.clientX, y: event.clientY };

      const horizontalAmount = deltaX * 0.5; // Controls left/right movement speed

      const clickedIndex = selectedMeshIndex.current;

      // For each bone from clicked down to bottom (skip implants)
      for (let i = clickedIndex; i >= 0; i--) {
        const leftMesh = meshRefs.current.left[i];
        const rightMesh = meshRefs.current.right[i];

        // Skip implants
        if (leftMesh?.userData?.isImplant || leftMesh?.userData?.type === 'I') continue;

        if (leftMesh) {
          // Move left bone left/right on X-axis based on mouse X movement
          leftMesh.position.x += horizontalAmount;
        }

        if (rightMesh && !rightMesh.userData?.isImplant && rightMesh.userData?.type !== 'I') {
          // Move right bone in opposite direction for symmetry
          rightMesh.position.x -= horizontalAmount;
        }
      }

      // Update measurements when bones move
      updateMeasurementsOnBoneMove();
    };

    const onMouseUp = () => {
      isRotatingRef.current = false;
      selectedMeshIndex.current = null;
      leftControlsRef.current!.enabled = true;
    };

    leftMount.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);

    return () => {
      leftMount.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [rotationMode, updateMeasurementsOnBoneMove]);

  // UP - DOWN (Motion)
  useEffect(() => {
    const leftMount = leftMountRef.current;
    if (!leftMount || !rotationMode1) return;
  
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
  
    const onMouseDown = (event: MouseEvent) => {
      if (!rotationMode1) return;

      const rect = leftMount.getBoundingClientRect();
      mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(mouse, cameraRef.current!);
      // Filter out implants from raycasting
      const nonImplantMeshes = meshRefs.current.left.filter(m => !m.userData?.isImplant && m.userData?.type !== 'I');
      const intersects = raycaster.intersectObjects(nonImplantMeshes);

      if (intersects.length > 0) {
        leftControlsRef.current!.enabled = false;
        isRotatingRef.current = true;
        initialMousePos.current = { x: event.clientX, y: event.clientY };

        const clickedMesh = intersects[0].object as THREE.Mesh;
        selectedMeshIndex.current = meshRefs.current.left.indexOf(clickedMesh);
      }
    };

    const onMouseMove = (event: MouseEvent) => {
      if (!isRotatingRef.current || selectedMeshIndex.current === null) return;

      const deltaY = event.clientY - initialMousePos.current.y;
      initialMousePos.current = { x: event.clientX, y: event.clientY };

      const verticalAmount = deltaY * 0.5; // Controls up/down movement speed
      const rotationAmount = deltaY * 0.01; // Controls rotation speed

      const clickedIndex = selectedMeshIndex.current;

      // For each bone from clicked down to bottom (skip implants)
      for (let i = clickedIndex; i >= 0; i--) {
        const leftMesh = meshRefs.current.left[i];
        const rightMesh = meshRefs.current.right[i];

        // Skip implants
        if (leftMesh?.userData?.isImplant || leftMesh?.userData?.type === 'I') continue;

        if (leftMesh) {
          leftMesh.position.y += verticalAmount; // Negative because Three.js Y-axis is up
        }

        if (rightMesh && !rightMesh.userData?.isImplant && rightMesh.userData?.type !== 'I') {
          rightMesh.rotation.x += rotationAmount;
          rightMesh.position.y -= verticalAmount;
        }
      }

      // Update measurements when bones move
      updateMeasurementsOnBoneMove();
    };

    const onMouseUp = () => {
      isRotatingRef.current = false;
      selectedMeshIndex.current = null;
      leftControlsRef.current!.enabled = true;
    };

    leftMount.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);

    return () => {
      leftMount.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [rotationMode1, updateMeasurementsOnBoneMove]);


  useEffect(() => {
    const leftMount = leftMountRef.current;
    if (!leftMount || !rotationMode2) return;

    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    const onMouseDown = (event: MouseEvent) => {
      if (!rotationMode2) return;

      const rect = leftMount.getBoundingClientRect();
      mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(mouse, cameraRef.current!);
      // Filter out implants from raycasting
      const nonImplantMeshes = meshRefs.current.left.filter(m => !m.userData?.isImplant && m.userData?.type !== 'I');
      const intersects = raycaster.intersectObjects(nonImplantMeshes);

      if (intersects.length > 0) {
        event.preventDefault();
        leftControlsRef.current!.enabled = false;
        isRotatingRef.current = true;
        initialMousePos.current = { x: event.clientX, y: event.clientY };

        const clickedMesh = intersects[0].object as THREE.Mesh;
        selectedMeshIndex.current = meshRefs.current.left.indexOf(clickedMesh);
      }
    };

    const onMouseMove = (event: MouseEvent) => {
      if (!isRotatingRef.current || selectedMeshIndex.current === null) return;

      const deltaX = event.clientX - initialMousePos.current.x;
      initialMousePos.current.x = event.clientX;

      const spinSensitivity = 0.001;
      const angle = deltaX * spinSensitivity;

      const clickedIndex = selectedMeshIndex.current;

      for (let i = clickedIndex; i >= 0; i--) {
        const leftMesh = meshRefs.current.left[i];
        const rightMesh = meshRefs.current.right[i];

        if (!leftMesh || !rightMesh) continue;
        // Skip implants
        if (leftMesh.userData?.isImplant || leftMesh.userData?.type === 'I') continue;

        // Top-down rotation (Y-axis) - LEFT bone clockwise
        leftMesh.rotation.x -= -angle;
      }

      // Update measurements when bones move
      updateMeasurementsOnBoneMove();
    };

    const onMouseUp = () => {
      isRotatingRef.current = false;
      selectedMeshIndex.current = null;
      leftControlsRef.current!.enabled = true;
    };

    leftMount.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);

    return () => {
      leftMount.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
}, [rotationMode2, updateMeasurementsOnBoneMove]);

// FORWARD - BACKWARD (Motion)
useEffect(() => {
  const leftMount = leftMountRef.current;
  if (!leftMount || !rotationMode3) return; // Use rotationMode3 for forward/backward movement

  const raycaster = new THREE.Raycaster();
  const mouse = new THREE.Vector2();

  const onMouseDown = (event: MouseEvent) => {
    if (!rotationMode3) return;

    const rect = leftMount.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(mouse, cameraRef.current!);
    // Filter out implants from raycasting
    const nonImplantMeshes = meshRefs.current.left.filter(m => !m.userData?.isImplant && m.userData?.type !== 'I');
    const intersects = raycaster.intersectObjects(nonImplantMeshes);

    if (intersects.length > 0) {
      leftControlsRef.current!.enabled = false;
      isRotatingRef.current = true;
      initialMousePos.current = { x: event.clientX, y: event.clientY };

      const clickedMesh = intersects[0].object as THREE.Mesh;
      selectedMeshIndex.current = meshRefs.current.left.indexOf(clickedMesh);
    }
  };

  const onMouseMove = (event: MouseEvent) => {
    if (!isRotatingRef.current || selectedMeshIndex.current === null) return;

    const deltaY = event.clientY - initialMousePos.current.y;
    initialMousePos.current = { x: event.clientX, y: event.clientY };

    const depthAmount = deltaY * 0.5; // Controls forward/backward movement speed

    const clickedIndex = selectedMeshIndex.current;

    // For each bone from clicked down to bottom (skip implants)
    for (let i = clickedIndex; i >= 0; i--) {
      const leftMesh = meshRefs.current.left[i];
      const rightMesh = meshRefs.current.right[i];

      // Skip implants
      if (leftMesh?.userData?.isImplant || leftMesh?.userData?.type === 'I') continue;

      if (leftMesh) {
        leftMesh.position.z += depthAmount; // Forward/backward on Z-axis
      }

      if (rightMesh && !rightMesh.userData?.isImplant && rightMesh.userData?.type !== 'I') {
        rightMesh.position.z += depthAmount; // Both move together
      }
    }

    // Update measurements when bones move
    updateMeasurementsOnBoneMove();
  };

  const onMouseUp = () => {
    isRotatingRef.current = false;
    selectedMeshIndex.current = null;
    leftControlsRef.current!.enabled = true;
  };

  leftMount.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mouseup', onMouseUp);

  return () => {
    leftMount.removeEventListener('mousedown', onMouseDown);
    window.removeEventListener('mousemove', onMouseMove);
    window.removeEventListener('mouseup', onMouseUp);
  };
}, [rotationMode3, updateMeasurementsOnBoneMove]);

// IMPLANT MOVE MODE - When active, clicking on implant moves only the implant
useEffect(() => {
  const leftMount = leftMountRef.current;
  if (!leftMount || !implantMoveMode) return;

  let isDragging = false;
  let lastX = 0;
  let lastY = 0;

  const raycaster = new THREE.Raycaster();
  const mouse = new THREE.Vector2();

  // Find the implant mesh
  const getImplantMeshes = () => {
    const leftImplant = meshRefs.current.left.find(
      m => m.userData?.isImplant || m.userData?.type === 'I'
    );
    const rightImplant = meshRefs.current.right.find(
      m => m.userData?.isImplant || m.userData?.type === 'I'
    );
    return { leftImplant, rightImplant };
  };

  const onMouseDown = (event: MouseEvent) => {
    if (!implantMoveMode) return;

    const rect = leftMount.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(mouse, cameraRef.current!);

    // Only raycast against implant meshes
    const { leftImplant } = getImplantMeshes();
    if (!leftImplant) return;

    const intersects = raycaster.intersectObject(leftImplant);

    // Only start dragging if we clicked on the implant
    if (intersects.length > 0) {
      isDragging = true;
      lastX = event.clientX;
      lastY = event.clientY;

      // Disable orbit controls
      if (leftControlsRef.current) {
        leftControlsRef.current.enabled = false;
      }

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

    const { leftImplant, rightImplant } = getImplantMeshes();

    // Move implant only (shift for rotation)
    if (event.shiftKey) {
      // Rotate around the implant's own center
      // Since geometry is centered at load time, simple rotation works
      const rotateSpeed = 0.03;

      if (leftImplant) {
        // Mouse left/right = spin around vertical axis (Y in world, but Z in local due to rotation.x = PI/2)
        leftImplant.rotateZ(deltaX * rotateSpeed);
        // Mouse up/down = tilt forward/back
        leftImplant.rotateX(-deltaY * rotateSpeed);
      }

      if (rightImplant) {
        rightImplant.rotateZ(deltaX * rotateSpeed);
        rightImplant.rotateX(-deltaY * rotateSpeed);
      }
    } else {
      // Move - increased speed for better responsiveness
      const moveSpeed = 1.5;
      if (leftImplant) {
        leftImplant.position.x += deltaX * moveSpeed;  // Right = right
        leftImplant.position.y += deltaY * moveSpeed;  // Up = up (adjusted for scale.y=-1)
      }
      if (rightImplant) {
        rightImplant.position.x += deltaX * moveSpeed;
        rightImplant.position.y += deltaY * moveSpeed;
      }
    }
  };

  const onMouseUp = () => {
    isDragging = false;
    // Re-enable orbit controls
    if (leftControlsRef.current) {
      leftControlsRef.current.enabled = true;
    }
  };

  leftMount.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mouseup', onMouseUp);

  return () => {
    leftMount.removeEventListener('mousedown', onMouseDown);
    window.removeEventListener('mousemove', onMouseMove);
    window.removeEventListener('mouseup', onMouseUp);
  };
}, [implantMoveMode]);

// INTERACTIVE ROTATION MODE - 3-matic style: Direct, precise rotation with axis handles
// No momentum/inertia - rotation stops immediately when mouse is released
useEffect(() => {
  const leftMount = leftMountRef.current;
  const scene = leftSceneRef.current;
  const camera = cameraRef.current;

  if (!leftMount || !inertialRotationMode || !scene || !camera) {
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
  meshRefs.current.left.forEach((mesh, idx) => {
    if (mesh && !mesh.userData?.isImplant) {
      allOriginalQuaternions.left[idx] = mesh.quaternion.clone();
    }
  });
  meshRefs.current.right.forEach((mesh, idx) => {
    if (mesh && !mesh.userData?.isImplant) {
      allOriginalQuaternions.right[idx] = mesh.quaternion.clone();
    }
  });

  // Reset ALL bones to their initial positions
  const resetAllBones = () => {
    meshRefs.current.left.forEach((mesh, idx) => {
      if (mesh && !mesh.userData?.isImplant && allOriginalQuaternions.left[idx]) {
        mesh.quaternion.copy(allOriginalQuaternions.left[idx]);
      }
    });
    meshRefs.current.right.forEach((mesh, idx) => {
      if (mesh && !mesh.userData?.isImplant && allOriginalQuaternions.right[idx]) {
        mesh.quaternion.copy(allOriginalQuaternions.right[idx]);
      }
    });
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

    const leftMesh = meshRefs.current.left[currentBoneIndex];
    if (leftMesh && !leftMesh.userData?.isImplant) {
      // Pure quaternion rotation - geometry is already centered
      leftMesh.quaternion.premultiply(deltaQuat);
    }

    const rightMesh = meshRefs.current.right[currentBoneIndex];
    if (rightMesh && !rightMesh.userData?.isImplant) {
      rightMesh.quaternion.premultiply(deltaQuat);
    }

    updateMeasurementsOnBoneMove();
  };

  // Store original state for reset
  let originalLeftQuaternion: THREE.Quaternion | null = null;
  let originalRightQuaternion: THREE.Quaternion | null = null;
  let originalLeftPosition: THREE.Vector3 | null = null;
  let originalRightPosition: THREE.Vector3 | null = null;

  // Reset single bone to original rotation (for double-click)
  const resetBone = () => {
    if (currentBoneIndex === null) return;

    const leftMesh = meshRefs.current.left[currentBoneIndex];
    const rightMesh = meshRefs.current.right[currentBoneIndex];

    if (leftMesh && originalLeftQuaternion) {
      leftMesh.quaternion.copy(originalLeftQuaternion);
    }

    if (rightMesh && originalRightQuaternion) {
      rightMesh.quaternion.copy(originalRightQuaternion);
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

    const rect = leftMount.getBoundingClientRect();
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
    const rect = leftMount.getBoundingClientRect();
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
        leftControlsRef.current && (leftControlsRef.current.enabled = false);
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

        leftControlsRef.current && (leftControlsRef.current.enabled = false);
        e.preventDefault();
        return;
      }

      // Clicked outside gizmo - do nothing
      return;
    }

    // No gizmo yet - place one on clicked bone
    const bones = meshRefs.current.left.filter(
      m => m.visible && !m.userData?.isImplant && m.userData?.type !== 'I'
    );

    const hits = raycaster.intersectObjects(bones, false);

    if (hits.length > 0) {
      const hitPoint = hits[0].point.clone();
      const hitMesh = hits[0].object as THREE.Mesh;
      const boneIdx = meshRefs.current.left.indexOf(hitMesh);

      currentPivot = hitPoint;
      currentBoneIndex = boneIdx;

      // Store original state BEFORE centering
      originalLeftQuaternion = hitMesh.quaternion.clone();
      originalLeftPosition = hitMesh.position.clone();

      const rightMesh = meshRefs.current.right[boneIdx];
      if (rightMesh) {
        originalRightQuaternion = rightMesh.quaternion.clone();
        originalRightPosition = rightMesh.position.clone();
      }

      // Center the geometry so rotation happens around true center
      if (!hitMesh.userData.geometryCentered) {
        centerGeometry(hitMesh);
        hitMesh.userData.geometryCentered = true;
      }
      if (rightMesh && !rightMesh.userData.geometryCentered) {
        centerGeometry(rightMesh);
        rightMesh.userData.geometryCentered = true;
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

    const rect = leftMount.getBoundingClientRect();
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
      const rect = leftMount.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(mouse, camera);

      const bones = meshRefs.current.left.filter(
        m => m.visible && !m.userData?.isImplant && m.userData?.type !== 'I'
      );

      const hits = raycaster.intersectObjects(bones, false);

      if (hits.length > 0) {
        const newPos = hits[0].point.clone();
        const hitMesh = hits[0].object as THREE.Mesh;
        const boneIdx = meshRefs.current.left.indexOf(hitMesh);

        currentBoneIndex = boneIdx;

        // Store original state
        originalLeftQuaternion = hitMesh.quaternion.clone();
        originalLeftPosition = hitMesh.position.clone();

        const rightMesh = meshRefs.current.right[boneIdx];
        if (rightMesh) {
          originalRightQuaternion = rightMesh.quaternion.clone();
          originalRightPosition = rightMesh.position.clone();
        }

        // Center geometry if not already
        if (!hitMesh.userData.geometryCentered) {
          centerGeometry(hitMesh);
          hitMesh.userData.geometryCentered = true;
        }
        if (rightMesh && !rightMesh.userData.geometryCentered) {
          centerGeometry(rightMesh);
          rightMesh.userData.geometryCentered = true;
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

    leftControlsRef.current && (leftControlsRef.current.enabled = true);
  };

  // Set cursor
  leftMount.style.cursor = 'crosshair';

  // Add event listeners
  leftMount.addEventListener('mousedown', handleMouseDown);
  leftMount.addEventListener('dblclick', handleDoubleClick);
  window.addEventListener('mousemove', handleMouseMove);
  window.addEventListener('mouseup', handleMouseUp);

  // Cleanup
  return () => {
    leftMount.removeEventListener('mousedown', handleMouseDown);
    leftMount.removeEventListener('dblclick', handleDoubleClick);
    window.removeEventListener('mousemove', handleMouseMove);
    window.removeEventListener('mouseup', handleMouseUp);
    leftMount.style.cursor = 'default';

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
}, [inertialRotationMode, updateMeasurementsOnBoneMove]);

  const applyBoneAndRainbowToAllViewports = () => {
    console.log('🎨 Applying bone preset with OHIF services...');
    console.log('Viewports:', viewports);
    console.log('Active Viewport ID:', activeViewportId);
    setShowMergeView(true)

    viewports.forEach((viewport, viewportId) => {
      // ✅ Skip the first viewport
      if (viewport.viewportId === 'karachiViewport') {
        console.log('Skipping Karachi viewport (viewport 0)');
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
      if (viewport.viewportId === 'karachiViewport') {
        console.log('Skipping Karachi viewport (viewport 0)');
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


  useEffect(() => {
    setupMeasurementMode({
      leftRendererRef,
      leftSceneRef,
      cameraRef,
      meshRefs
    });

    return () => {
      cleanupMeasurementMode();
    };
  }, [setupMeasurementMode, cleanupMeasurementMode]);

  useEffect(() => {
    // Setup distance measurement mode (existing)
    setupMeasurementMode({
      leftRendererRef,
      leftSceneRef,
      cameraRef,
      meshRefs
    });
    
    // Setup angle measurement mode (new)
    setupAngleMeasurementMode({
      leftRendererRef,
      leftSceneRef,
      cameraRef,
      meshRefs
    });

    return () => {
      cleanupMeasurementMode();
      cleanupAngleMeasurementMode();
    };
  }, [setupMeasurementMode, cleanupMeasurementMode, setupAngleMeasurementMode, cleanupAngleMeasurementMode]);



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
      clearStlFiles();

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

          // Left mesh = Latest View (White)
          const matLeft = new THREE.MeshPhongMaterial({
            color: 0xffffff, // White for left view
            specular: 0xffffff,
            shininess: 0,
            side: THREE.DoubleSide,
            emissive: new THREE.Color(0xffffff),
            emissiveIntensity: 0.2
          });
          const mesh = new THREE.Mesh(v.geometry, matLeft);
          mesh.position.y = currentY - center.y * compression;
          mesh.rotation.x = Math.PI / 2;
          mesh.userData = v;
          leftGroupRef.current.add(mesh);
          meshRefs.current.left.push(mesh);

          // Right mesh = Labelling View (Colored)
          const matRight = new THREE.MeshPhongMaterial({
            color: color.getHex(),
            specular: 0x00000000,
            shininess: 0,
            side: THREE.DoubleSide,
            emissive: new THREE.Color(0x000000),
            emissiveIntensity: 0
          });
          const meshClone = new THREE.Mesh(v.geometry, matRight);
          meshClone.position.copy(mesh.position);
          meshClone.rotation.copy(mesh.rotation);
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

          // Left mesh = Latest View (Blue for aorta, Red for heart)
          const matLeft = new THREE.MeshPhongMaterial({
            color: organType === 'A' ? 0x3498db : 0xe74c3c, // Blue for aorta, Red for heart
            specular: 0xffffff,
            shininess: 0,
            side: THREE.DoubleSide,
            emissive: new THREE.Color(0x000000),
            emissiveIntensity: 0
          });
          const mesh = new THREE.Mesh(organ.geometry, matLeft);
          mesh.position.set(organX, organY, organZ);
          mesh.rotation.x = Math.PI / 2;
          mesh.userData = { ...organ, organType };
          leftGroupRef.current.add(mesh);
          meshRefs.current.left.push(mesh);

          // Right mesh = Labelling View (Pink for aorta, Purple for heart)
          const matRight = new THREE.MeshPhongMaterial({
            color: organType === 'A' ? 0xe91e63 : 0x9c27b0, // Pink for aorta, Purple for heart
            specular: 0x00000000,
            shininess: 0,
            side: THREE.DoubleSide,
            emissive: new THREE.Color(0x000000),
            emissiveIntensity: 0
          });
          const meshClone = new THREE.Mesh(organ.geometry, matRight);
          meshClone.position.copy(mesh.position);
          meshClone.rotation.copy(mesh.rotation);
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

        // Apply transformations to left and right views only
        leftGroupRef.current.scale.y = -1;
        rightGroupRef.current.scale.y = -1;

        // Center camera on main view
        const bbox = new THREE.Box3().setFromObject(leftGroupRef.current);
        const center = bbox.getCenter(new THREE.Vector3());
        const size = bbox.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z);

        if (cameraRef.current) {
          cameraRef.current.position.set(center.x, center.y, maxDim * 2.5);
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
      }
    }
  };

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
    const { viewportGridService, cornerstoneViewportService, measurementService } = propServicesManager.services;

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
    removalOutline
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
    setApproveSuccess
  });


  useBrightness({
    brightnessEnabled,
    brightness,
    meshRefs,
    startMeshRefs
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
    setError
  });


  // Data fetching
  useEffect(() => {
    const fetchData = async () => {
      setError(null);
      try {
        const response = await fetch(
          `${SERVER_URL}/analyst/get-3d?series_instance_uid=${stlInstanceId}`,
          {
            headers: {
              Authorization: `Bearer ${userToken}`,
              "Content-Type": "application/json"
            }
          }
        );

        if (!response.ok) {
          throw new Error('Failed to fetch data');
        }

        const data = await response.json();
        console.log('Fetched segmentation URLs:', data?.data?.generated?.urls);
        setTestStls(data?.data?.generated?.urls || []);
        setVersions(data?.data?.versions || []);
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

    // Create SEPARATE cameras for left and right views
    const leftCamera = new THREE.PerspectiveCamera(
      45, leftMount.clientWidth / leftMount.clientHeight, 0.1, 10000
    );
    // leftCamera.position.set(0, 0, 350);
    leftCamera.position.set(300, 200, 350);
    leftCamera.lookAt(300, 300, 250);

    const rightCamera = new THREE.PerspectiveCamera(
      45, rightMount.clientWidth / rightMount.clientHeight, 0.1, 10000
    );
    // rightCamera.position.set(0, 0, 350);
    rightCamera.position.set(300, 200, 350);
    rightCamera.lookAt(300, 300, 250);

    cameraRef.current = leftCamera; // Keep ref for backward compatibility

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
      // Ambient light for overall illumination
      scene.add(new THREE.AmbientLight(0x404040, 0.8));
      
      // Key light (main directional light)
      const keyLight = new THREE.DirectionalLight(0xffffff, 0.9);
      keyLight.position.set(1, 1, 1).normalize();
      keyLight.castShadow = false;
      scene.add(keyLight);
      
      // Fill light (from opposite direction)
      const fillLight = new THREE.DirectionalLight(0xffffff, 0.4);
      fillLight.position.set(-1, 0.5, -0.5).normalize();
      scene.add(fillLight);
      
      // Back light (to illuminate from behind)
      const backLight = new THREE.DirectionalLight(0xffffff, 0.3);
      backLight.position.set(0, 0, -1).normalize();
      scene.add(backLight);
      
      // Optional: Hemisphere light for more natural lighting
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
      rightControls.update();
      leftRenderer.render(leftScene, leftCamera);
      rightRenderer.render(rightScene, rightCamera);
    };
    animate();

    const handleResize = () => {
      // Resize left view
      const leftWidth = leftMount.clientWidth;
      const leftHeight = leftMount.clientHeight;
      leftCamera.aspect = leftWidth / leftHeight;
      leftCamera.updateProjectionMatrix();
      leftRenderer.setSize(leftWidth, leftHeight);

      // Resize right view
      const rightWidth = rightMount.clientWidth;
      const rightHeight = rightMount.clientHeight;
      rightCamera.aspect = rightWidth / rightHeight;
      rightCamera.updateProjectionMatrix();
      rightRenderer.setSize(rightWidth, rightHeight);

      if (removalCanvasRef.current) {
        removalCanvasRef.current.width = leftWidth;
        removalCanvasRef.current.height = leftHeight;
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
      leftControls.dispose();
      rightControls.dispose();
    };
  }, []);

  // Start View Setup - Always visible
  useEffect(() => {
    if (!startMountRef.current) return;

    const startScene = startSceneRef.current;
    const startMount = startMountRef.current;
    startScene.background = new THREE.Color(0x000000);

    // Set up lighting
    startScene.add(new THREE.AmbientLight(0x404040, 0.5));
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(0, 1, 1).normalize();
    startScene.add(dirLight);

    // Add the start group to the scene
    startScene.add(startGroupRef.current);

    // Create renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(startMount.clientWidth, startMount.clientHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    startRendererRef.current = renderer;
    startMount.appendChild(renderer.domElement);

    // Create independent camera for start view
    const camera = new THREE.PerspectiveCamera(
      45,
      startMount.clientWidth / startMount.clientHeight,
      0.1,
      10000
    );
    // camera.position.set(0, 0, 350);
    camera.position.set(300, 200, 350);
    camera.lookAt(300, 300, 250);

    // Set up independent controls
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
    startControlsRef.current = controls;

    // Independent animation loop for start view
    const animateStartView = () => {
      requestAnimationFrame(animateStartView);
      controls.update();
      renderer.render(startScene, camera);
    };
    animateStartView();

    // Handle resize for start view
    const handleResize = () => {
      if (startMountRef.current) {
        const width = startMountRef.current.clientWidth;
        const height = startMountRef.current.clientHeight;
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        renderer.setSize(width, height);
        renderer.render(startScene, camera);
      }
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      if (startMount.contains(renderer.domElement)) {
        startMount.removeChild(renderer.domElement);
      }
      renderer.dispose();
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


  useEffect(() => {
  if (implantFile) {
    const implantUrl = URL.createObjectURL(implantFile);
    
    // Add implant directly to existing STLs
    setTestStls(prevStls => {
      return [...prevStls, implantUrl]; // Just add the URL directly
    });
    
    // Cleanup function
    return () => {
      URL.revokeObjectURL(implantUrl);
    };
  } else {
    // Remove all object URLs (assuming they're all implants)
    // Or if you need to clear implants, you'll need another approach
    setTestStls(prevStls => prevStls.filter(url => !url.startsWith('blob:')));
  }
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
    setRemovalMode(false);
    setRemoving(false);
    toggleBrightness();
    // Clear measurements
    clearMeasurements();
    clearAngleMeasurements();

    // Reset camera exactly like your useEffect
    if (cameraRef.current) {
      cameraRef.current.position.set(0, 0, 350);
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
    handleScreenshotUtil(leftRendererRef.current, leftSceneRef.current, cameraRef.current);
  };

  const downloadGenerated3D = async () => {
    try {
      setIsDownloading(true);
      const response = await fetch(
        `${SERVER_URL}/analyst/download-generated-3d?series_instance_uid=${stlInstanceId}`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${userToken}`,
            "Content-Type": "application/json"
          }
        }
      );

      if (!response.ok) {
        throw new Error(`Download failed: ${response.status} ${response.statusText}`);
      }

      const blob = await response.blob();
      const contentDisposition = response.headers.get('Content-Disposition');
      let fileName = 'downloaded_3d_file';

      if (contentDisposition) {
        const fileNameMatch = contentDisposition.match(/filename="?(.+)"?/);
        if (fileNameMatch && fileNameMatch[1]) {
          fileName = fileNameMatch[1];
        }
      }

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

  const approveEditedFiles = async () => {
    try {
      setIsApproving(true);
      setApproveSuccess(null);

      const exporter = new STLExporter();
      const formData = new FormData();

      formData.append('series_instance_uid', stlInstanceId);

      // Export each visible mesh as a Blob file
      for (const mesh of meshRefs.current.left) {
        if (!mesh.visible) continue;

        const geom = mesh.geometry.clone();
        const stlData = exporter.parse(new THREE.Mesh(geom, mesh.material), { binary: true });
        const blob = new Blob([stlData], { type: 'application/octet-stream' });

        const fileName = mesh.userData?.fileName;
        if (!fileName) {
          console.warn('Skipping mesh without original fileName');
          continue;
        }

        formData.append('files', blob, fileName);
      }

      const response = await fetch('${SERVER_URL}/analyst/approve-final-3d', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${userToken}`,
          // Don't set Content-Type for FormData - browser sets it automatically with correct boundary
        },
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`Approval failed: ${response.status} ${response.statusText}`);
      }

      setApproveSuccess('Approval successful!');
    } catch (error: any) {
      setApproveSuccess(`Approval failed: ${error.message || error.toString()}`);
    } finally {
      setIsApproving(false);
    }
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
  };

  console.log('🔍 Debug - STL-DICOM Linking Status:', {
    hasSegmentationService,
    isLinkingActive,
    toggleLinking: typeof toggleLinking,
    hasServicesManager: !!propServicesManager,
    hasOHIFServices: hasSegmentationService
  });


  return (
    <CenterLineProvider
      toggleCenterLine={toggleCenterLine}
      centerLineEnabled={centerLineEnabled}
      >
      <div style={{
        width: '100%', display: 'flex', flexDirection: 'row',
        backgroundColor: '#000', color: 'white', minHeight: '130vh', position: 'relative',
        border: 'none'
      }}>

        <input
          id="stl-file-input"
          type="file"
          accept=".stl"
          onChange={handleFileChange}
          multiple
          style={{ display: "none" }}
          disabled={loading}
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
            <div style={{
              background: "#222", color: "#fff", padding: "24px 32px", borderRadius: "12px",
              fontSize: "22px", fontWeight: "bold", boxShadow: "0 4px 24px #0008", display: "flex", alignItems: "center"
            }}>
              <span className="spinner-border spinner-border-lg" style={{marginRight: 16}}/>
              Removing ...
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

        <SingleViewerContainer
          startMountRef={startMountRef}
          leftMountRef={leftMountRef}
          rightMountRef={rightMountRef}
          removalCanvasRef={removalCanvasRef}
          inertialRotationMode={inertialRotationMode}
          pivotBoneIndex={pivotBoneIndex}
          currentRotationAngle={currentRotationAngle}
          onResetBone={() => resetBoneRef.current?.()}
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
        <SingleToolbar
                userRole={userRole || ''}
                loading={loading}
                isApproving={isApproving}
                clickRemovalUndoStack={clickRemovalUndoStack}
                undoStack={undoStack}
                isDownloading={isDownloading}
                isLinkingActive={isLinkingActive}
                segmentationCreated={segmentationCreated} // NEW
                hasSTLFiles={tetsStls.length > 0} // NEW
                showMerge={showMerge}
                rotationMode={rotationMode}
                rotationMode1={rotationMode1}
                rotationMode2={rotationMode2}
                rotationMode3={rotationMode3}
                implantMoveMode={implantMoveMode}
                inertialRotationMode={inertialRotationMode}
                onToggleRotation={() => {
                  setRotationMode(!rotationMode);
                  setRotationMode1(false);
                  setRotationMode2(false);
                  setRotationMode3(false);
                  setImplantMoveMode(false);
                  setInertialRotationMode(false);
                }}
                onToggleRotation1={() => {
                  setRotationMode1(!rotationMode1);
                  setRotationMode(false);
                  setRotationMode2(false);
                  setRotationMode3(false);
                  setImplantMoveMode(false);
                  setInertialRotationMode(false);
                }}
                onToggleRotation2={() => {
                  setRotationMode2(!rotationMode2);
                  setRotationMode(false);
                  setRotationMode1(false);
                  setRotationMode3(false);
                  setImplantMoveMode(false);
                  setInertialRotationMode(false);
                }}
                onToggleRotation3={() => {
                  setRotationMode3(!rotationMode3);
                  setRotationMode(false);
                  setRotationMode1(false);
                  setRotationMode2(false);
                  setImplantMoveMode(false);
                  setInertialRotationMode(false);
                }}
                onToggleImplantMove={() => {
                  setImplantMoveMode(!implantMoveMode);
                  setRotationMode(false);
                  setRotationMode1(false);
                  setRotationMode2(false);
                  setRotationMode3(false);
                  setInertialRotationMode(false);
                }}
                onToggleInertialRotation={() => {
                  setInertialRotationMode(!inertialRotationMode);
                  setRotationMode(false);
                  setRotationMode1(false);
                  setRotationMode2(false);
                  setRotationMode3(false);
                  setImplantMoveMode(false);
                  setPivotPoint(null);
                  setPivotBoneIndex(null);
                  setCurrentRotationAngle(0);
                }}
                onFileSelect={() => document.getElementById('stl-file-input')?.click()}
                onRefresh={handleRefresh}
                onUndo={handleUndo}
                onDownload={downloadGenerated3D}
                onScreenshot={handleScreenshot}
                onUndoClickRemoval={undoClickRemoval}
                onApprove={approveEditedFiles}
                onCreateSegmentation={createAutomaticSegmentation}
                onToggleLinking={toggleLinking}
                onMergeWithDicom={applyBoneAndRainbowToAllViewports}
                onUnMergeWithDicom={removeBoneAndRainbowFromAllViewports}
              />
      </div>
    </CenterLineProvider>
  );
};

export default SingleSpinalCord;