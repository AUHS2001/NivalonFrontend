import { useEffect, useCallback } from 'react';
import * as THREE from 'three';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader';
import { VertebraInfo, MeshRefs } from '../types/three.types';
import { useLabelingViewContext } from '../context/LabelingViewContext';
import { useStlVisibilityContext } from '../context/StlVisibilityContext';
import { useMeshVisibility } from '../hooks/useMeshVisibility';
import { storeVertebraData } from '../utils/spineLabelOverlayManager';
import { storeMeshDataForContours } from '../utils/vertebraContourOverlayManager';
import { fetchFile } from '../../../../config/server';

interface UseSTLLoaderProps {
  stlUrls: string[];
  leftGroupRef: React.MutableRefObject<THREE.Group>;
  rightGroupRef: React.MutableRefObject<THREE.Group>;
  startGroupRef: React.MutableRefObject<THREE.Group>;
  meshRefs: React.MutableRefObject<MeshRefs>;
  startMeshRefs: React.MutableRefObject<THREE.Mesh[]>;
  cameraRef: React.MutableRefObject<THREE.PerspectiveCamera | undefined>;
  leftControlsRef: React.MutableRefObject<any>;
  rightControlsRef: React.MutableRefObject<any>;
  startControlsRef: React.MutableRefObject<any>;
  startRendererRef: React.MutableRefObject<THREE.WebGLRenderer | undefined>;
  startSceneRef: React.MutableRefObject<THREE.Scene>;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setLoadProgress?: (progress: number) => void;
}

export const useSTLLoader = ({
  stlUrls,
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
}: UseSTLLoaderProps) => {

  const { showRightView, onToggleRightView } = useLabelingViewContext();
  const { addStlFiles, stlFiles, clearStlFiles } = useStlVisibilityContext();

  useMeshVisibility({
    meshRefs
  });

  const getVertebraInfo = useCallback((fileName: string, url: string): VertebraInfo & { fileName: string } => {

    // Check if this is an implant file (blob URL)
    const isImplantFile = url.startsWith('blob:') || fileName.includes('blob:') || fileName === 'implant.stl';
    
    if (isImplantFile) {
      return {
        type: 'I', // I for Implant
        number: 0,
        fullName: 'IMPLANT',
        fileName: 'implant.stl',
      };
    }

    // Remove file extension and convert to lowercase for easier matching
    const nameWithoutExt = fileName.replace('.stl', '').toLowerCase();

    // First try to match vertebrae (C, T, L, S)
    const vertebraMatch = fileName.match(/(C|T|L|S)(\d+)/i);
    if (vertebraMatch) {
      const result = {
        type: vertebraMatch[1].toUpperCase(),
        number: parseInt(vertebraMatch[2]),
        fullName: vertebraMatch[0].toUpperCase(),
        fileName,
      };
      return result;
    }

    // Comprehensive aorta matching
    if (nameWithoutExt.includes('aorta') ||
        nameWithoutExt.includes('aortic') ||
        nameWithoutExt === 'aorta' ||
        nameWithoutExt === 'a') {
      const result = {
        type: 'A', // A for Aorta
        number: 0,
        fullName: 'AORTA',
        fileName,
      };
      return result;
    }

    // Comprehensive heart matching
    if (nameWithoutExt.includes('heart') ||
        nameWithoutExt.includes('cardiac') ||
        nameWithoutExt === 'heart' ||
        nameWithoutExt === 'h') {
      const result = {
        type: 'H', // H for Heart
        number: 0,
        fullName: 'HEART',
        fileName,
      };
      return result;
    }

    // Try to match by common patterns
    if (nameWithoutExt === 'ao' || nameWithoutExt === 'arc' || nameWithoutExt.includes('vessel')) {
      const result = {
        type: 'A', // A for Aorta
        number: 0,
        fullName: 'AORTA',
        fileName,
      };
      return result;
    }

    if (nameWithoutExt === 'ht' || nameWithoutExt === 'cor' || nameWithoutExt.includes('cardio')) {
      const result = {
        type: 'H', // H for Heart
        number: 0,
        fullName: 'HEART',
        fileName,
      };
      return result;
    }

    return {
      type: 'X',
      number: 0,
      fullName: fileName.replace('.stl', '').toUpperCase(),
      fileName
    };
  }, []);

  const createMeshMaterial = useCallback((color: number, isRightView: boolean = false, isStartView: boolean = false, organType?: string) => {
    
    // IMPLANT (Type 'I'): Light blue metallic look
    if (organType === 'I') {
      return new THREE.MeshPhongMaterial({
        color: 0x85CFF9,
        specular: 0x444444,
        shininess: 60,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.95,
        emissive: new THREE.Color(0x85CFF9),
        emissiveIntensity: 0.08
      });
    }

    // For organs in Labelling view (right view), use pink/purple
    if (isRightView && organType) {
      if (organType === 'A') {
        // Aorta - Pink for Labelling view
        return new THREE.MeshPhongMaterial({
          color: 0xe91e63, // Pink
          specular: 0x111111,
          shininess: 10,
          side: THREE.DoubleSide
        });
      } else if (organType === 'H') {
        // Heart - Purple for Labelling view
        return new THREE.MeshPhongMaterial({
          color: 0x9c27b0, // Purple
          specular: 0x111111,
          shininess: 10,
          side: THREE.DoubleSide
        });
      }
    }

    // For organs in Latest view (left view) and Start view, use blue/red
    if (organType && (isStartView || !isRightView)) {
      if (organType === 'A') {
        // Aorta - Blue for Latest and Start views
        return new THREE.MeshPhongMaterial({
          color: 0x3498db, // Blue
          specular: 0x111111,
          shininess: 10,
          side: THREE.DoubleSide
        });
      } else if (organType === 'H') {
        // Heart - Red for Latest and Start views
        return new THREE.MeshPhongMaterial({
          color: 0xe74c3c, // Red
          specular: 0x111111,
          shininess: 10,
          side: THREE.DoubleSide
        });
      }
    }

    if (isRightView) {
      // Right view (Labelling View): Colored materials for vertebrae
      return new THREE.MeshPhongMaterial({
        color: color,
        specular: 0x111111,
        shininess: 10,
        side: THREE.DoubleSide
      });
    } else {
      // Left view (Latest View): White materials for vertebrae (no emissive glow)
      return new THREE.MeshPhongMaterial({
        color: 0xffffff,
        specular: 0x111111,
        shininess: 10,
        side: THREE.DoubleSide
      });
    }
  }, []);

  useEffect(() => {
    if (!stlUrls || stlUrls.length === 0) {
      return;
    }

    setLoading(true);
    setError(null);
    setLoadProgress?.(0);
    let completedCount = 0;

    const loader = new STLLoader();
    const leftGroup = leftGroupRef.current;
    const rightGroup = rightGroupRef.current;
    const startGroup = startGroupRef.current;

    leftGroup.clear();
    rightGroup.clear();
    startGroup.clear();

    meshRefs.current = { left: [], right: [] };
    startMeshRefs.current = [];
    clearStlFiles();

    const userToken = localStorage.getItem('token') || '';

    const loadPromises = stlUrls.map(async (url, index) => {
      try {
        const response = await fetchFile(url);
        if (!response.ok) {
          throw new Error(`HTTP ${response.status} for ${url}`);
        }
        const arrayBuffer = await response.arrayBuffer();

        const geometry = loader.parse(arrayBuffer);
        // STLs are already in LPS - no transformation needed
        geometry.computeBoundingBox();

        const fileName = url.substring(url.lastIndexOf('/') + 1);
        const vertebraInfo = getVertebraInfo(fileName, url);

        completedCount++;
        setLoadProgress?.(Math.round((completedCount / stlUrls.length) * 100));

        return {
          geometry,
          fileName,
          ...vertebraInfo,
          originalUrl: url // Store original URL for approved version lookup
        };
      } catch (error) {
        completedCount++;
        setLoadProgress?.(Math.round((completedCount / stlUrls.length) * 100));
        console.error(`❌ Failed to load ${url}:`, error);
        return null;
      }
    });

    Promise.all(loadPromises)
      .then((loadedObjects) => {
        const valid = loadedObjects.filter(Boolean);

        // Separate objects by type
        const vertebrae = valid.filter(v => ['C', 'T', 'L', 'S'].includes(v!.type));
        const organs = valid.filter(v => ['A', 'H'].includes(v!.type));
        const implants = valid.filter(v => v!.type === 'I'); // NEW: Filter implants
        const unknown = valid.filter(v => v!.type === 'X');


        // If we have unknown files, they might be our organs - let's try to identify them
        const potentialOrgans = [...organs];
        unknown.forEach(unk => {
          const name = unk!.fileName.toLowerCase();
          // If file name is short and doesn't look like a vertebra, treat it as organ
          if (name.length < 8 && !name.match(/(c|t|l|s)\d/)) {
            potentialOrgans.push(unk!);
          }
        });


        // Sort vertebrae only (keep original order)
        const anatomicalOrder = ['C', 'T', 'L', 'S'];
        vertebrae.sort((a, b) => {
          const aOrder = anatomicalOrder.indexOf(a!.type);
          const bOrder = anatomicalOrder.indexOf(b!.type);
          const diff = aOrder - bOrder;
          return diff !== 0 ? diff : a!.number - b!.number;
        });

        let currentY = 0, compression = 0, gap = 0;

        const colorMap: { [key: string]: number } = {
          C: 0x3498db,    // Cervical - Blue
          T: 0x2ecc71,    // Thoracic - Green
          L: 0xe74c3c,    // Lumbar - Red
          S: 0xf1c40f,    // Sacral - Yellow
          A: 0x3498db,    // Aorta - Blue (for vertebrae coloring)
          H: 0xe74c3c,    // Heart - Red (for vertebrae coloring)
          I: 0x85CFF9,    // Implant - Light Blue
          X: 0x00ff00,    // Unknown - Green (so they stand out)
        };

        const allCreatedMeshes: { fileName: string; originalUrl: string; meshIndex: number }[] = [];

        // First, create all vertebrae in their original positions for LEFT and RIGHT views
        vertebrae.forEach((v, i) => {
          if (!v) return;

          const bbox = v.geometry.boundingBox!;
          const size = new THREE.Vector3();
          bbox.getSize(size);
          const center = new THREE.Vector3();
          bbox.getCenter(center);

          const color = new THREE.Color(colorMap[v.type] || 0x9b59b6);

          // Left mesh = Latest View (White for vertebrae) - Use generated
          const matLeft = createMeshMaterial(color.getHex(), showRightView, false, v.type);
          const mesh = new THREE.Mesh(v.geometry, matLeft);
          mesh.position.z = currentY - center.z * compression;
          // LPS coordinate system - no rotation needed
          mesh.userData = v;
          leftGroup.add(mesh);
          meshRefs.current.left.push(mesh);

          // Right mesh = Labelling View (Colored for vertebrae) - Use generated
          const matRight = createMeshMaterial(color.getHex(), true, false, v.type);
          const meshClone = new THREE.Mesh(v.geometry, matRight);
          meshClone.position.copy(mesh.position);
          meshClone.rotation.copy(mesh.rotation);
          meshClone.userData = { ...v };
          rightGroup.add(meshClone);
          meshRefs.current.right.push(meshClone);

          // Start view mesh - clone geometry instead of re-downloading
          const matStart = createMeshMaterial(color.getHex(), false, true, v.type);
          const startMesh = new THREE.Mesh(v.geometry.clone(), matStart);
          startMesh.position.copy(mesh.position);
          startMesh.rotation.copy(mesh.rotation);
          startMesh.userData = { ...v, isApproved: false };
          startGroup.add(startMesh);
          startMeshRefs.current.push(startMesh);

          currentY -= size.z * compression + gap;

          allCreatedMeshes.push({
            fileName: v.fileName,
            originalUrl: v.originalUrl,
            meshIndex: meshRefs.current.left.length - 1
          });
        });

        // Calculate center of all vertebrae for implant positioning (LPS: Z is vertical)
        let vertebraeCenterZ = 0;
        if (meshRefs.current.left.length > 0) {
          const vertebraeBbox = new THREE.Box3();
          meshRefs.current.left.forEach(mesh => {
            vertebraeBbox.expandByObject(mesh);
          });
          const vertebraeCenter = new THREE.Vector3();
          vertebraeBbox.getCenter(vertebraeCenter);
          vertebraeCenterZ = vertebraeCenter.z;
        }

        // Now create IMPLANTS with GREEN color
        implants.forEach((implant, index) => {
          if (!implant) return;


          // CENTER THE GEOMETRY so rotation happens around its own center
          // This is crucial for proper rotation behavior
          implant.geometry.center();
          implant.geometry.computeBoundingBox();

          const bbox = implant.geometry.boundingBox!;
          const size = new THREE.Vector3();
          bbox.getSize(size);

          // Implant color - Light Blue
          const implantColor = 0x85CFF9;

          // Position implant at the center of vertebrae (LPS: Z is vertical)
          // Since geometry is now centered, we just position the mesh directly
          let implantX = 0;
          let implantY = 0;
          let implantZ = vertebraeCenterZ;

          // Left mesh = Latest View - Use GREEN material
          const matLeft = createMeshMaterial(implantColor, showRightView, false, 'I');
          const mesh = new THREE.Mesh(implant.geometry.clone(), matLeft);
          mesh.position.set(implantX, implantY, implantZ);
          // LPS coordinate system - no rotation needed
          mesh.userData = { ...implant, isImplant: true };
          leftGroup.add(mesh);
          meshRefs.current.left.push(mesh);

          // Right mesh = Labelling View - Also GREEN (use cloned geometry)
          const matRight = createMeshMaterial(implantColor, true, false, 'I');
          const meshClone = new THREE.Mesh(implant.geometry.clone(), matRight);
          meshClone.position.copy(mesh.position);
          meshClone.userData = { ...implant, isImplant: true };
          rightGroup.add(meshClone);
          meshRefs.current.right.push(meshClone);

          // Start view mesh - clone geometry instead of re-downloading
          const matStart = createMeshMaterial(implantColor, false, true, 'I');
          const startMesh = new THREE.Mesh(implant.geometry.clone(), matStart);
          startMesh.position.copy(mesh.position);
          startMesh.userData = { ...implant, isImplant: true, isApproved: false };
          startGroup.add(startMesh);
          startMeshRefs.current.push(startMesh);

          allCreatedMeshes.push({
            fileName: implant.fileName,
            originalUrl: implant.originalUrl,
            meshIndex: meshRefs.current.left.length - 1
          });
        });

        // Now add organs for LEFT and RIGHT views (generated versions)
        potentialOrgans.forEach((organ, index) => {
          if (!organ) return;


          const bbox = organ.geometry.boundingBox!;
          const size = new THREE.Vector3();
          bbox.getSize(size);
          const center = new THREE.Vector3();
          bbox.getCenter(center);

          // Determine organ type based on file name if not already classified
          let organType = organ.type;
          const fileName = organ.fileName.toLowerCase();
          if (organType === 'X') {
            if (fileName.includes('aorta') || fileName.includes('ao') || fileName === 'a.stl') {
              organType = 'A';
            } else if (fileName.includes('heart') || fileName.includes('ht') || fileName === 'h.stl') {
              organType = 'H';
            }
          }

          const vertebraeColor = new THREE.Color(colorMap[organType] || 0x00ff00);

          // Calculate organ position based on anatomical location
          let organY = 0;
          let organX = 0;
          let organZ = 0;

          if (organType === 'H' || organ.fileName.toLowerCase().includes('heart')) {
            // Heart position: Centered around T5-T8 level
            organY = -2.5;
            organX = -1.5;
            organZ = 1.5;
          } else if (organType === 'A' || organ.fileName.toLowerCase().includes('aorta')) {
            // Aorta position: Runs along the left side of spine
            organY = -1.5;
            organX = -1.0;
            organZ = 1.0;
          } else {
            // Unknown organ - position it visibly
            organY = -5;
            organX = 3;
            organZ = 0;
          }

          // Left mesh = Latest View (Blue for aorta, Red for heart) - Use generated
          const matLeft = createMeshMaterial(vertebraeColor.getHex(), showRightView, false, organType);
          const mesh = new THREE.Mesh(organ.geometry, matLeft);
          mesh.position.set(organX, organY, organZ);
          // LPS coordinate system - no rotation needed
          mesh.userData = { ...organ, organType };
          leftGroup.add(mesh);
          meshRefs.current.left.push(mesh);

          // Right mesh = Labelling View (Pink for aorta, Purple for heart) - Use generated
          const matRight = createMeshMaterial(vertebraeColor.getHex(), true, false, organType);
          const meshClone = new THREE.Mesh(organ.geometry, matRight);
          meshClone.position.copy(mesh.position);
          meshClone.userData = { ...organ, organType };
          rightGroup.add(meshClone);
          meshRefs.current.right.push(meshClone);

          // Start view mesh - clone geometry instead of re-downloading
          const matStart = createMeshMaterial(vertebraeColor.getHex(), false, true, organType);
          const startMesh = new THREE.Mesh(organ.geometry.clone(), matStart);
          startMesh.position.copy(mesh.position);
          startMesh.userData = { ...organ, organType, isApproved: false };
          startGroup.add(startMesh);
          startMeshRefs.current.push(startMesh);

          allCreatedMeshes.push({
            fileName: organ.fileName,
            originalUrl: organ.originalUrl,
            meshIndex: meshRefs.current.left.length - 1
          });
        });

        addStlFiles(allCreatedMeshes);

        // Center camera on main view
        const bbox = new THREE.Box3().setFromObject(leftGroup);
        const center = bbox.getCenter(new THREE.Vector3());
        const size = bbox.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z);

        if (cameraRef.current) {
          // Coronal view: camera in front (negative Y), Z up
          // Use FOV-based distance so model nearly fills the viewport
          const fov = cameraRef.current.fov * (Math.PI / 180);
          const fitDist = maxDim / (2 * Math.tan(fov / 2));
          const camDist = fitDist * 1.0; // Closer than exact fit for a bigger appearance
          console.log('[useSTLLoader] Camera fit:', { maxDim, fitDist, camDist, center: center.toArray(), size: size.toArray() });

          // Set controls target FIRST, then position camera, then update controls
          // This order prevents OrbitControls.update() from overriding position
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

          // Update controls AFTER camera is in final position so they adopt the new state
          if (leftControlsRef.current) {
            leftControlsRef.current.update();
          }
          if (rightControlsRef.current) {
            rightControlsRef.current.update();
          }
        }

        // Center start view
        const startBbox = new THREE.Box3().setFromObject(startGroup);
        const startCenter = startBbox.getCenter(new THREE.Vector3());
        const startSize = startBbox.getSize(new THREE.Vector3());
        const startMaxDim = Math.max(startSize.x, startSize.y, startSize.z);

        if (startControlsRef.current) {
          const startCamera = startControlsRef.current.object as THREE.PerspectiveCamera;
          // Coronal view: camera in front (negative Y), Z up
          const startFov = startCamera.fov * (Math.PI / 180);
          const startFitDist = startMaxDim / (2 * Math.tan(startFov / 2));
          startCamera.position.set(startCenter.x, startCenter.y - startFitDist * 1.0, startCenter.z);
          startCamera.up.set(0, 0, 1);
          startCamera.lookAt(startCenter);
          startControlsRef.current.target.copy(startCenter);
          startControlsRef.current.update();

          if (startRendererRef.current) {
            startRendererRef.current.render(startSceneRef.current, startCamera);
          }
        }

        // Store vertebra data globally for spine label overlay (works even when STL panel unmounts)
        if (meshRefs.current.left.length > 0) {
          storeVertebraData(meshRefs.current.left);
          storeMeshDataForContours(meshRefs.current.left);
        }

      })
      .catch((error) => {
        console.error('❌ Error in STL loading:', error);
        setError(`Error loading models: ${error.message}`);
      })
      .finally(() => {
        setLoading(false);
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stlUrls]); // Only reload when stlUrls change, not on showRightView change
};