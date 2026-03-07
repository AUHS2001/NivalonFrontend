import React, { useEffect, useRef, useState, useContext, useCallback } from 'react';
import * as THREE from 'three';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter';
import "./styles/style.css";

// Context
import { StlInstanceContext } from './../../../platform/app/src/context/StlInstanceContext';
import { SERVER_URL } from '../../../config/server';
import { LPS_UP } from './utils/coordinateSystem';

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
import { useMeasurementContext } from './context/MeasurementContext';
import { useBrightnessContext } from './context/BrightnessContext';
import { useBoneRemovalContext } from './context/BoneRemovalContext';
import { useClickRemoveContext } from './context/ClickRemoveContext';
import { useStlVisibilityContext } from './context/StlVisibilityContext';
import { useSTLToDICOMLinking } from './hooks/useSTLToDICOMLinking';
import { STLToDICOMConfig } from './types/three.types';
import { useVersionHistoryContext } from './context/VersionHistoryContext'
import { useCenterLine } from './hooks/useCenterLine';
import { CenterLineProvider } from './context/CenterLineContext';
import { servicesManager, commandsManager } from '../../../platform/app/src/App';
import { useViewportGrid } from '@ohif/ui-next';
import { useViewportRendering } from '../../cornerstone/src/hooks/useViewportRendering';
import FileLoaderService from 'platform/app/src/routes/Local/fileLoaderService';
import { ComparisonViewerContainer } from './components/ComparisonViewerContainer';

interface StlComparisonProps {
  servicesManager?: any;
  commandsManager?: any;
  extensionManager?: any;
  seriesLabel?: any;
  props?: any;
}


const StlComparison: React.FC<StlComparisonProps> = ({
  servicesManager: propServicesManager,
  commandsManager,
  extensionManager,
  seriesLabel,
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

  const { stlInstanceId, updateStlInstanceId, seriesName } = context;

  const userRole = localStorage.getItem('userRole');
  const userToken = localStorage.getItem('token') || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIzIiwicm9sZSI6ImFuYWx5c3QiLCJleHAiOjE3OTYyMDMxNDF9.cLkGlpxslfYOe_ZKuseyCiuP7jsr3m8XXZyyrUU5B1Y';

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
  const viewport1Rendering = useViewportRendering(activeViewportId);
  const { versionHistoryEnabled, versions, setVersions } = useVersionHistoryContext();


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


  const {
    showCenterLine,
    removeCenterLine,
    toggleCenterLine,
    hasCenterLine,
    centerLineEnabled
  } = useCenterLine({
    meshRefs,
    leftSceneRef,
    rightSceneRef
  });

  // Add debug effect
  useEffect(() => {
    console.log('🔗 STL-DICOM Linking Status:', {
      isLinkingActive,
      ohifStatus,
      hasServicesManager: !!propServicesManager
    });
  }, [isLinkingActive, ohifStatus, propServicesManager]);

  const {
    clearMeasurements,
    setupMeasurementMode,
    cleanupMeasurementMode
  } = useMeasurementContext();

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

          // Right mesh = Labelling View (Pink for aorta, Purple for heart) - no emissive
          const matRight = new THREE.MeshPhongMaterial({
            color: organType === 'A' ? 0xe91e63 : 0x9c27b0, // Pink for aorta, Purple for heart
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
    implantFile,
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
      // Ambient light
      scene.add(new THREE.AmbientLight(0xffffff, 0.6));

      // Key light (main light)
      const keyLight = new THREE.DirectionalLight(0xffffff, 0.7);
      keyLight.position.set(1, 1, 1).normalize();
      scene.add(keyLight);

      // Fill light
      const fillLight = new THREE.DirectionalLight(0xffffff, 0.4);
      fillLight.position.set(-1, 0.5, -0.5).normalize();
      scene.add(fillLight);

      // Back light
      const backLight = new THREE.DirectionalLight(0xffffff, 0.25);
      backLight.position.set(0, 0, -1).normalize();
      scene.add(backLight);

      // Hemisphere light
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
    startScene.add(new THREE.AmbientLight(0xffffff, 0.6));
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.7);
    dirLight.position.set(0, 1, 1).normalize();
    startScene.add(dirLight);
    const fillLight = new THREE.DirectionalLight(0xffffff, 0.4);
    fillLight.position.set(-1, 0.5, -0.5).normalize();
    startScene.add(fillLight);

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
          "Content-Type": "application/json"
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

        <ComparisonViewerContainer
          startMountRef={startMountRef}
          leftMountRef={leftMountRef}
          rightMountRef={rightMountRef}
          removalCanvasRef={removalCanvasRef}
          seriesLabel={seriesLabel}
        >
        </ComparisonViewerContainer>
      </div>
    </CenterLineProvider>
  );
};

export default StlComparison;
