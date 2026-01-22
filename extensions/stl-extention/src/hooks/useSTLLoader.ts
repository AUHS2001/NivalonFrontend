import { useEffect, useCallback } from 'react';
import * as THREE from 'three';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader';
import { VertebraInfo, MeshRefs } from '../types/three.types';
import { useLabelingViewContext } from '../context/LabelingViewContext';
import { useStlVisibilityContext } from '../context/StlVisibilityContext';
import { useMeshVisibility } from '../hooks/useMeshVisibility';

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
  setError
}: UseSTLLoaderProps) => {

  const { showRightView, onToggleRightView } = useLabelingViewContext();
  const { addStlFiles, stlFiles, clearStlFiles } = useStlVisibilityContext();

  useMeshVisibility({
    meshRefs,
    startMeshRefs
  });

  const getVertebraInfo = useCallback((fileName: string, url: string): VertebraInfo & { fileName: string } => {
    console.log('🔍 Analyzing file:', fileName, 'URL:', url);

    // Check if this is an implant file (blob URL)
    const isImplantFile = url.startsWith('blob:') || fileName.includes('blob:') || fileName === 'implant.stl';
    
    if (isImplantFile) {
      console.log('🟢 Identified as IMPLANT file');
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
      console.log('✅ Identified as vertebra:', result);
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
      console.log('✅ Identified as aorta:', result);
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
      console.log('✅ Identified as heart:', result);
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
      console.log('✅ Identified as aorta by pattern:', result);
      return result;
    }

    if (nameWithoutExt === 'ht' || nameWithoutExt === 'cor' || nameWithoutExt.includes('cardio')) {
      const result = {
        type: 'H', // H for Heart
        number: 0,
        fullName: 'HEART',
        fileName,
      };
      console.log('✅ Identified as heart by pattern:', result);
      return result;
    }

    // Default for unrecognized bones - let's check if it might be an organ
    console.log('❓ Unrecognized file, checking if organ:', fileName);

    // If it's not a vertebra pattern and has a short name, it might be an organ
    if (!fileName.match(/(C|T|L|S)(\d+)/i) && nameWithoutExt.length < 10) {
      console.log('⚠️ Short file name detected, might be organ:', fileName);
    }

    return {
      type: 'X',
      number: 0,
      fullName: fileName.replace('.stl', '').toUpperCase(),
      fileName
    };
  }, []);

  const createMeshMaterial = useCallback((color: number, isRightView: boolean = false, isStartView: boolean = false, organType?: string) => {
    console.log('🎨 Creating material for organType:', organType, 'isRightView:', isRightView, 'isStartView:', isStartView);
    
    // IMPLANT (Type 'I'): Always use GREEN in all views
    if (organType === 'I') {
      console.log('✅ Creating GREEN material for implant');
      return new THREE.MeshPhongMaterial({
        color: 0x00ff00, // BRIGHT GREEN for implants
        specular: 0x111111,
        shininess: 30,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.9,
        emissive: new THREE.Color(0x00ff00),
        emissiveIntensity: 0.3
      });
    }

    // For organs in Labelling view (right view), use pink/purple
    if (isRightView && organType) {
      if (organType === 'A') {
        // Aorta - Pink for Labelling view
        return new THREE.MeshPhongMaterial({
          color: 0xe91e63, // Pink
          specular: 0x00000000,
          shininess: 0,
          side: THREE.DoubleSide,
          emissive: new THREE.Color(0x222222),
          emissiveIntensity: 0.2
        });
      } else if (organType === 'H') {
        // Heart - Purple for Labelling view
        return new THREE.MeshPhongMaterial({
          color: 0x9c27b0, // Purple
          specular: 0x00000000,
          shininess: 0,
          side: THREE.DoubleSide,
          emissive: new THREE.Color(0x222222),
          emissiveIntensity: 0.2
        });
      }
    }

    // For organs in Latest view (left view) and Start view, use blue/red
    if (organType && (isStartView || !isRightView)) {
      if (organType === 'A') {
        // Aorta - Blue for Latest and Start views
        return new THREE.MeshPhongMaterial({
          color: 0x3498db, // Blue
          specular: 0x00000000,
          shininess: 0,
          side: THREE.DoubleSide,
          emissive: new THREE.Color(0x222222),
          emissiveIntensity: 0.2
        });
      } else if (organType === 'H') {
        // Heart - Red for Latest and Start views
        return new THREE.MeshPhongMaterial({
          color: 0xe74c3c, // Red
          specular: 0x00000000,
          shininess: 0,
          side: THREE.DoubleSide,
          emissive: new THREE.Color(0x222222),
          emissiveIntensity: 0.2
        });
      }
    }

    if (isRightView) {
      // Right view (Labelling View): Colored materials for vertebrae
      return new THREE.MeshPhongMaterial({
        color: color,
        specular: 0x00000000,
        shininess: 0,
        side: THREE.DoubleSide,
        emissive: new THREE.Color(0x000000),
        emissiveIntensity: 0.2
      });
    } else {
      // Left view (Latest View): White materials for vertebrae
      return new THREE.MeshPhongMaterial({
        color: 0xffffff,
        specular: 0xffffff,
        shininess: 0,
        side: THREE.DoubleSide,
        emissive: new THREE.Color(0xffffff),
        emissiveIntensity: 0.2
      });
    }
  }, []);

  // Function to convert "generated" to "approved" in URLs for start view only
  const getApprovedUrl = useCallback((url: string): string => {
    // Don't convert blob URLs (implants)
    if (url.startsWith('blob:')) {
      return url;
    }
    return url.replace('/generated/', '/approved/');
  }, []);

  // Function to load STL from URL
  const loadSTL = useCallback(async (url: string, loader: STLLoader) => {
    try {
      console.log(`📥 Loading STL from: ${url}`);
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status} for ${url}`);
      }
      const arrayBuffer = await response.arrayBuffer();
      const geometry = loader.parse(arrayBuffer);
      geometry.computeBoundingBox();
      return geometry;
    } catch (error) {
      console.error(`❌ Failed to load ${url}:`, error);
      throw error;
    }
  }, []);

  useEffect(() => {
    if (!stlUrls || stlUrls.length === 0) {
      console.log('❌ No STL URLs provided');
      return;
    }

    console.log('🚀 Starting STL loading with URLs:', stlUrls);
    setLoading(true);
    setError(null);

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

    const loadPromises = stlUrls.map(async (url, index) => {
      try {
        console.log(`📥 Loading STL ${index + 1}/${stlUrls.length}:`, url);
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(`HTTP ${response.status} for ${url}`);
        }
        const arrayBuffer = await response.arrayBuffer();
        console.log(`✅ Downloaded ${arrayBuffer.byteLength} bytes from ${url}`);

        const geometry = loader.parse(arrayBuffer);
        geometry.computeBoundingBox();

        const fileName = url.substring(url.lastIndexOf('/') + 1);
        const vertebraInfo = getVertebraInfo(fileName, url);

        console.log(`✅ Parsed STL: ${fileName}`, {
          type: vertebraInfo.type,
          fullName: vertebraInfo.fullName,
          boundingBox: geometry.boundingBox
        });

        return {
          geometry,
          fileName,
          ...vertebraInfo,
          originalUrl: url // Store original URL for approved version lookup
        };
      } catch (error) {
        console.error(`❌ Failed to load ${url}:`, error);
        return null;
      }
    });

    Promise.all(loadPromises)
      .then((loadedObjects) => {
        const valid = loadedObjects.filter(Boolean);
        console.log(`📊 Loaded ${valid.length} valid objects out of ${stlUrls.length} URLs`);

        // Log all loaded objects with their types
        console.log('📋 All loaded objects:');
        valid.forEach((obj, index) => {
          console.log(`   ${index + 1}. ${obj!.fileName} -> Type: '${obj!.type}', Name: '${obj!.fullName}'`);
        });

        // Separate objects by type
        const vertebrae = valid.filter(v => ['C', 'T', 'L', 'S'].includes(v!.type));
        const organs = valid.filter(v => ['A', 'H'].includes(v!.type));
        const implants = valid.filter(v => v!.type === 'I'); // NEW: Filter implants
        const unknown = valid.filter(v => v!.type === 'X');

        console.log(`🦴 Vertebrae count: ${vertebrae.length}`);
        console.log(`❤️ Organs count: ${organs.length}`, organs.map(o => o!.fullName));
        console.log(`🟢 Implants count: ${implants.length}`, implants.map(i => i!.fileName));
        console.log(`❓ Unknown files count: ${unknown.length}`, unknown.map(u => u!.fileName));

        // If we have unknown files, they might be our organs - let's try to identify them
        const potentialOrgans = [...organs];
        unknown.forEach(unk => {
          const name = unk!.fileName.toLowerCase();
          // If file name is short and doesn't look like a vertebra, treat it as organ
          if (name.length < 8 && !name.match(/(c|t|l|s)\d/)) {
            console.log(`🔍 Treating ${unk!.fileName} as potential organ`);
            potentialOrgans.push(unk!);
          }
        });

        console.log(`🔍 Final organs to process: ${potentialOrgans.length}`, potentialOrgans.map(o => o!.fileName));

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
          I: 0x00ff00,    // Implant - BRIGHT GREEN
          X: 0x00ff00,    // Unknown - Green (so they stand out)
        };

        const allCreatedMeshes: { fileName: string; originalUrl: string; meshIndex: number }[] = [];

        // First, create all vertebrae in their original positions for LEFT and RIGHT views
        console.log('🎨 Creating vertebrae meshes for left/right views...');
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
          mesh.position.y = currentY - center.y * compression;
          mesh.rotation.x = Math.PI / 2;
          mesh.userData = v;
          leftGroup.add(mesh);
          meshRefs.current.left.push(mesh);

          // Right mesh = Labelling View (Colored for vertebrae) - Use generated
          const matRight = createMeshMaterial(color.getHex(), true, false, v.type);
          const meshClone = new THREE.Mesh(v.geometry, matRight);
          meshClone.position.copy(mesh.position);
          meshClone.rotation.copy(mesh.rotation);
          rightGroup.add(meshClone);
          meshRefs.current.right.push(meshClone);

          currentY -= size.y * compression + gap;

          allCreatedMeshes.push({
            fileName: v.fileName,
            originalUrl: v.originalUrl,
            meshIndex: meshRefs.current.left.length - 1
          });
        });

        // Calculate center of all vertebrae for implant positioning
        let vertebraeCenterY = 0;
        if (meshRefs.current.left.length > 0) {
          const vertebraeBbox = new THREE.Box3();
          meshRefs.current.left.forEach(mesh => {
            vertebraeBbox.expandByObject(mesh);
          });
          const vertebraeCenter = new THREE.Vector3();
          vertebraeBbox.getCenter(vertebraeCenter);
          vertebraeCenterY = vertebraeCenter.y;
        }

        // Now create IMPLANTS with GREEN color
        console.log('🟢 Creating implant meshes with GREEN color...');
        implants.forEach((implant, index) => {
          if (!implant) return;

          console.log(`🟢 Creating GREEN implant: ${implant.fileName}`);

          // CENTER THE GEOMETRY so rotation happens around its own center
          // This is crucial for proper rotation behavior
          implant.geometry.center();
          implant.geometry.computeBoundingBox();

          const bbox = implant.geometry.boundingBox!;
          const size = new THREE.Vector3();
          bbox.getSize(size);

          // Implant color is always BRIGHT GREEN (0x00ff00)
          const implantColor = 0x00ff00;

          // Position implant at the center of vertebrae
          // Since geometry is now centered, we just position the mesh directly
          let implantX = 0;
          let implantY = vertebraeCenterY;
          let implantZ = 0;

          // Left mesh = Latest View - Use GREEN material
          const matLeft = createMeshMaterial(implantColor, showRightView, false, 'I');
          const mesh = new THREE.Mesh(implant.geometry.clone(), matLeft);
          mesh.position.set(implantX, implantY, implantZ);
          mesh.rotation.x = Math.PI / 2;
          mesh.userData = { ...implant, isImplant: true };
          leftGroup.add(mesh);
          meshRefs.current.left.push(mesh);

          // Right mesh = Labelling View - Also GREEN (use cloned geometry)
          const matRight = createMeshMaterial(implantColor, true, false, 'I');
          const meshClone = new THREE.Mesh(implant.geometry.clone(), matRight);
          meshClone.position.copy(mesh.position);
          meshClone.rotation.copy(mesh.rotation);
          rightGroup.add(meshClone);
          meshRefs.current.right.push(meshClone);

          console.log(`✅ Created GREEN implant mesh: ${implant.fileName} at center Y: ${vertebraeCenterY}`);
          allCreatedMeshes.push({
            fileName: implant.fileName,
            originalUrl: implant.originalUrl,
            meshIndex: meshRefs.current.left.length - 1
          });
        });

        // Now load APPROVED versions for START view (both vertebrae and organs)
        console.log('🔄 Loading APPROVED versions for START view...');
        const startViewPromises = valid.map(async (obj) => {
          if (!obj) return;

          // Skip implants for start view (they don't have approved versions)
          if (obj.type === 'I') {
            console.log(`⏭️ Skipping implant for start view: ${obj.fileName}`);

            // But still create a mesh for start view with implant
            // Geometry is already centered from the main implant creation
            const color = new THREE.Color(colorMap['I'] || 0x00ff00);
            const matStart = createMeshMaterial(color.getHex(), false, true, 'I');
            const startMesh = new THREE.Mesh(obj.geometry.clone(), matStart);

            // Position implant at center of vertebrae (geometry is already centered)
            startMesh.position.set(0, vertebraeCenterY, 0);
            startMesh.rotation.x = Math.PI / 2;
            startMesh.userData = { ...obj, isApproved: false };
            startGroup.add(startMesh);
            startMeshRefs.current.push(startMesh);

            console.log(`✅ Created implant mesh for start view: ${obj.fileName}`);
            return;
          }

          try {
            const approvedUrl = getApprovedUrl(obj.originalUrl);
            console.log(`📥 Loading approved version for start view: ${approvedUrl}`);

            const approvedGeometry = await loadSTL(approvedUrl, loader);
            const color = new THREE.Color(colorMap[obj.type] || 0x9b59b6);

            // Start mesh = Previous View - Use APPROVED version
            const matStart = createMeshMaterial(color.getHex(), false, true, obj.type);
            const startMesh = new THREE.Mesh(approvedGeometry, matStart);

            // Position like other views
            const bbox = approvedGeometry.boundingBox!;
            const size = new THREE.Vector3();
            bbox.getSize(size);
            const center = new THREE.Vector3();
            bbox.getCenter(center);

            // For organs, use anatomical positioning
            if (['A', 'H', 'X'].includes(obj.type)) {
              let organY = 0;
              let organX = 0;
              let organZ = 0;

              if (obj.type === 'H' || obj.fileName.toLowerCase().includes('heart')) {
                organY = -2.5;
                organX = -1.5;
                organZ = 1.5;
              } else if (obj.type === 'A' || obj.fileName.toLowerCase().includes('aorta')) {
                organY = -1.5;
                organX = -1.0;
                organZ = 1.0;
              } else {
                organY = -5;
                organX = 3;
                organZ = 0;
              }
              startMesh.position.set(organX, organY, organZ);
            } else {
              // For vertebrae, use the stacking position
              startMesh.position.y = currentY - center.y * compression;
            }

            startMesh.rotation.x = Math.PI / 2;
            startMesh.userData = { ...obj, isApproved: true };
            startGroup.add(startMesh);
            startMeshRefs.current.push(startMesh);

            console.log(`✅ Created approved mesh for start view: ${obj.fileName}`);
          } catch (error) {
            console.error(`❌ Failed to load approved version for ${obj.fileName}, using generated as fallback:`, error);
            // Fallback to generated version
            const color = new THREE.Color(colorMap[obj.type] || 0x9b59b6);
            const matStart = createMeshMaterial(color.getHex(), false, true, obj.type);
            const startMesh = new THREE.Mesh(obj.geometry, matStart);

            // Position like other views
            const bbox = obj.geometry.boundingBox!;
            const size = new THREE.Vector3();
            bbox.getSize(size);
            const center = new THREE.Vector3();
            bbox.getCenter(center);

            // For organs, use anatomical positioning
            if (['A', 'H', 'X'].includes(obj.type)) {
              let organY = 0;
              let organX = 0;
              let organZ = 0;

              if (obj.type === 'H' || obj.fileName.toLowerCase().includes('heart')) {
                organY = -2.5;
                organX = -1.5;
                organZ = 1.5;
              } else if (obj.type === 'A' || obj.fileName.toLowerCase().includes('aorta')) {
                organY = -1.5;
                organX = -1.0;
                organZ = 1.0;
              } else {
                organY = -5;
                organX = 3;
                organZ = 0;
              }
              startMesh.position.set(organX, organY, organZ);
            } else {
              // For vertebrae, use the stacking position
              startMesh.position.y = currentY - center.y * compression;
            }

            startMesh.rotation.x = Math.PI / 2;
            startMesh.userData = obj;
            startGroup.add(startMesh);
            startMeshRefs.current.push(startMesh);
            console.log(`✅ Created fallback mesh for start view: ${obj.fileName}`);
          }
        });

        // Now add organs for LEFT and RIGHT views (generated versions)
        console.log('🎨 Creating organ meshes for left/right views...');
        potentialOrgans.forEach((organ, index) => {
          if (!organ) return;

          console.log(`❤️ Creating mesh for: ${organ.fileName} (${organ.fullName})`);

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
            console.log(`📍 Positioning heart (${organ.fileName}) at: (${organX}, ${organY}, ${organZ})`);
          } else if (organType === 'A' || organ.fileName.toLowerCase().includes('aorta')) {
            // Aorta position: Runs along the left side of spine
            organY = -1.5;
            organX = -1.0;
            organZ = 1.0;
            console.log(`📍 Positioning aorta (${organ.fileName}) at: (${organX}, ${organY}, ${organZ})`);
          } else {
            // Unknown organ - position it visibly
            organY = -5;
            organX = 3;
            organZ = 0;
            console.log(`📍 Positioning unknown organ (${organ.fileName}) at: (${organX}, ${organY}, ${organZ})`);
          }

          // Left mesh = Latest View (Blue for aorta, Red for heart) - Use generated
          const matLeft = createMeshMaterial(vertebraeColor.getHex(), showRightView, false, organType);
          const mesh = new THREE.Mesh(organ.geometry, matLeft);
          mesh.position.set(organX, organY, organZ);
          mesh.rotation.x = Math.PI / 2;
          mesh.userData = { ...organ, organType };
          leftGroup.add(mesh);
          meshRefs.current.left.push(mesh);

          // Right mesh = Labelling View (Pink for aorta, Purple for heart) - Use generated
          const matRight = createMeshMaterial(vertebraeColor.getHex(), true, false, organType);
          const meshClone = new THREE.Mesh(organ.geometry, matRight);
          meshClone.position.copy(mesh.position);
          meshClone.rotation.copy(mesh.rotation);
          rightGroup.add(meshClone);
          meshRefs.current.right.push(meshClone);

          console.log(`✅ Created organ mesh for left/right views: ${organ.fileName} as ${organType}`);
          allCreatedMeshes.push({
            fileName: organ.fileName,
            originalUrl: organ.originalUrl,
            meshIndex: meshRefs.current.left.length - 1
          });
        });

        addStlFiles(allCreatedMeshes);
        return Promise.all(startViewPromises);
      })
      .then(() => {
        leftGroup.scale.y = -1;
        rightGroup.scale.y = -1;
        startGroup.scale.y = -1;

        console.log('🎯 Final mesh counts:', {
          left: meshRefs.current.left.length,
          right: meshRefs.current.right.length,
          start: startMeshRefs.current.length
        });

        // Center camera on main view
        const bbox = new THREE.Box3().setFromObject(leftGroup);
        const center = bbox.getCenter(new THREE.Vector3());
        const size = bbox.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z);

        if (cameraRef.current) {
          cameraRef.current.position.set(center.x, center.y, maxDim * 2.5);
          cameraRef.current.lookAt(center);
          console.log('📷 Camera positioned');
        }

        if (leftControlsRef.current) {
          leftControlsRef.current.target.copy(center);
          leftControlsRef.current.update();
        }

        if (rightControlsRef.current) {
          rightControlsRef.current.target.copy(center);
          rightControlsRef.current.update();
        }

        // Center start view
        const startBbox = new THREE.Box3().setFromObject(startGroup);
        const startCenter = startBbox.getCenter(new THREE.Vector3());
        const startSize = startBbox.getSize(new THREE.Vector3());
        const startMaxDim = Math.max(startSize.x, startSize.y, startSize.z);

        if (startControlsRef.current) {
          const startCamera = startControlsRef.current.object as THREE.PerspectiveCamera;
          startCamera.position.set(startCenter.x, startCenter.y, startMaxDim * 2.5);
          startCamera.lookAt(startCenter);
          startControlsRef.current.target.copy(startCenter);
          startControlsRef.current.update();

          if (startRendererRef.current) {
            startRendererRef.current.render(startSceneRef.current, startCamera);
          }
        }

        console.log('✅ STL loading completed successfully');
        console.log('📊 Summary:');
        console.log('   - Left/Right views: Generated STLs');
        console.log('   - Start view: Approved STLs (with fallback to generated)');
        console.log('   - Implants: GREEN color in all views');
      })
      .catch((error) => {
        console.error('❌ Error in STL loading:', error);
        setError(`Error loading models: ${error.message}`);
      })
      .finally(() => {
        console.log('🏁 STL loading process finished');
        setLoading(false);
      });
  }, [stlUrls, showRightView]);
};