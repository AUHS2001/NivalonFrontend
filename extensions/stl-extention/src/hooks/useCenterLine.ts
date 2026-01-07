import { useRef, useCallback, useState } from 'react';
import * as THREE from 'three';

interface UseCenterLineProps {
  meshRefs: React.RefObject<{ left: THREE.Mesh[]; right: THREE.Mesh[] }>;
  leftSceneRef: React.RefObject<THREE.Scene>;
  rightSceneRef: React.RefObject<THREE.Scene>;
}

export const useCenterLine = ({
  meshRefs,
  leftSceneRef,
  rightSceneRef
}: UseCenterLineProps) => {
  const centerLineRefs = useRef<{
    left: THREE.Line | null;
    right: THREE.Line | null;
    leftGlow: THREE.Line | null;
    rightGlow: THREE.Line | null;
    dicomIndicators: HTMLDivElement[];
  }>({ left: null, right: null, leftGlow: null, rightGlow: null, dicomIndicators: [] });

  const originalMaterials = useRef<{
    left: (THREE.Material | THREE.Material[])[];
    right: (THREE.Material | THREE.Material[])[];
  }>({ left: [], right: [] });

  const [centerLineEnabled, setCenterLineEnabled] = useState(false);

  const type = localStorage.getItem('myLayout');

  console.log("type ==> ", type);

  const detectViewportType = useCallback((viewport: Element): string => {
    const viewports = Array.from(document.querySelectorAll([
      '[data-cy="viewport-container"]',
      '.viewport-element',
      '.cornerstone-viewport',
      '.ohif-viewport',
      '.viewport-wrapper',
      '.viewer-viewport'
    ].join(',')));

    const currentIndex = viewports.indexOf(viewport);

    // Simple layout mapping
    const viewportLayoutMapping = new Map([
      [0, 'axial'],    // First view: Axial
      [1, 'sagittal'],
      [2, 'coronal'],  // Third view: Coronal
    ]);

    return viewportLayoutMapping.get(currentIndex) || 'sagittal';
  }, []);

  // NEW: Function to create center line indicators in DICOM views
  const createDICOMCenterLineIndicators = useCallback((centerPoints: THREE.Vector3[]) => {
    // Clear any existing indicators first
    removeDICOMCenterLineIndicators();

    const viewportSelectors = [
      '[data-cy="viewport-container"]',
      '.viewport-element',
      '.cornerstone-viewport',
      '.ohif-viewport',
      '.viewport-wrapper',
      '.viewer-viewport'
    ];

    const indicators: HTMLDivElement[] = [];

    viewportSelectors.forEach(selector => {
      const viewports = document.querySelectorAll(selector);

      viewports.forEach(viewport => {
        const rect = viewport.getBoundingClientRect();

        if (rect.width > 100 && rect.height > 100 &&
            rect.top >= 0 && rect.left >= 0 &&
            viewport instanceof HTMLElement &&
            viewport.offsetParent !== null) {

          try {
            const viewType = detectViewportType(viewport);
            console.log(`🎯 Creating center line for ${viewType.toUpperCase()} view`);

            // Calculate position based on view type
            const position = calculateDICOMPositionForCenterLine(centerPoints, viewport, viewType);

            // Create the indicator
            const indicator = createCenterLineIndicator(viewport, position, viewType);
            indicators.push(indicator);

          } catch (error) {
            console.error('Error creating DICOM center line indicator:', error);
          }
        }
      });
    });

    // Store references to all created indicators
    centerLineRefs.current.dicomIndicators = indicators;

    console.log(`📍 Created ${indicators.length} DICOM center line indicators`);
  }, [detectViewportType]);

  // NEW: Function to calculate center line position in DICOM views
  const calculateDICOMPositionForCenterLine = useCallback((centerPoints: THREE.Vector3[], viewport: Element, viewType: string): { x: number, y: number } => {
    const rect = viewport.getBoundingClientRect();
    const viewportWidth = rect.width;
    const viewportHeight = rect.height;

    // For center line, we want to show it at a consistent position based on the view type
    let normalizedX = 0.5; // Center horizontally
    let normalizedY = 0.5; // Center vertically by default

    // Adjust position based on view type for better anatomical representation
    switch (viewType.toLowerCase()) {
      case 'axial':
        // Axial view: Show vertical center line
        normalizedX = 0.5; // Center line
        normalizedY = 0.5; // Middle of viewport
        break;
      case 'sagittal':
        // Sagittal view: Show vertical line slightly offset for spinal cord
        normalizedX = 0.5; // Right of center (spinal cord position)
        normalizedY = 0.5;
        break;
      case 'coronal':
        // Coronal view: Show vertical center line
        normalizedX = 0.5;
        normalizedY = 0.7;
        break;
      default:
        normalizedX = 0.5;
        normalizedY = 0.5;
    }

    const finalX = viewportWidth * normalizedX;
    const finalY = viewportHeight * normalizedY;

    console.log(`🎯 ${viewType.toUpperCase()} center line position:`, {
      normalized: { x: normalizedX, y: normalizedY },
      pixels: { x: Math.round(finalX), y: Math.round(finalY) }
    });

    return { x: finalX, y: finalY };
  }, []);

  // NEW: Function to create visual indicator for center line in DICOM views
  const createCenterLineIndicator = useCallback((viewport: Element, position: { x: number, y: number }, viewType: string): HTMLDivElement => {
    // Remove any existing center line indicators from this viewport
    const existingIndicators = viewport.querySelectorAll('.spinal-centerline-indicator');
    existingIndicators.forEach(indicator => indicator.remove());

    // Get colors based on view type
    const getViewColors = (viewType: string) => {
      switch (viewType.toLowerCase()) {
        case 'axial':
          return { primary: '#ff0000', accent: '#cc0000', name: 'AXIAL' };
        case 'coronal':
          return { primary: '#ff0000', accent: '#cc0000', name: 'CORONAL' };
        case 'sagittal':
          return { primary: '#ff0000', accent: '#cc0000', name: 'SAGITTAL' };
        default:
          return { primary: '#ff0000', accent: '#cc0000', name: 'CENTERLINE' };
      }
    };

    const colors = getViewColors(viewType);

    // Create the main indicator container
    const indicator = document.createElement('div');
    indicator.className = 'spinal-centerline-indicator';
    indicator.style.position = 'absolute';
    indicator.style.zIndex = '9999';
    indicator.style.pointerEvents = 'none';

    if (viewType.toLowerCase() === 'coronal') {
      // CORONAL VIEW: Show multiple vertical lines for each vertebra
      const rect = viewport.getBoundingClientRect();
      const viewportHeight = rect.height;
      console.log(rect.width," =>coronel")

      // Get actual vertebra count from the 3D model
      const meshes = meshRefs.current?.left || [];
      const vertebrae = meshes.filter(mesh => {
        const userData = mesh.userData;
        return userData && ['C', 'T', 'L', 'S'].includes(userData.type);
      });

      const vertebraCount = vertebrae.length;
      console.log(`🦴 Found ${vertebraCount} vertebrae in 3D model`);

      if (vertebraCount > 0) {
        // Create a container for all vertebra lines
        indicator.style.left = '0';
        indicator.style.top = '15px';
        indicator.style.width = '100%';
        indicator.style.height = '100%';
        indicator.style.background = 'transparent';

        // Calculate the height for each segment
        const segmentHeight = viewportHeight / (vertebraCount + 1);

        // Create individual lines for each vertebra segment
        for (let i = 1; i <= vertebraCount; i++) {
          const vertebraLine = document.createElement('div');
          vertebraLine.className = 'vertebra-line';
          vertebraLine.style.position = 'absolute';
          vertebraLine.style.left = `${position.x}px`;
          vertebraLine.style.top = `${(i * segmentHeight) - (segmentHeight / 2)}px`;
          vertebraLine.style.width = '2px';
          vertebraLine.style.height = `${segmentHeight}px`; // Shorter line for individual vertebra
          vertebraLine.style.background = `linear-gradient(180deg,
            transparent 0%,
            ${colors.primary} 20%,
            ${colors.primary} 80%,
            transparent 100%)`;
          vertebraLine.style.boxShadow = `0 0 8px ${colors.primary}, 0 0 16px ${colors.primary}`;
          vertebraLine.style.opacity = '0.7';
          vertebraLine.style.transform = 'translateY(-50%)';

          indicator.appendChild(vertebraLine);
        }
      } else {
        // Fallback if no vertebrae found
        console.warn('No vertebrae found in 3D model, showing default center line');
        indicator.style.left = `${position.x}px`;
        indicator.style.top = '15px';
        indicator.style.width = '2px';
        indicator.style.height = '100%';
        indicator.style.background = `linear-gradient(180deg,
          transparent 0%,
          ${colors.primary} 10%,
          ${colors.primary} 90%,
          transparent 100%)`;
        indicator.style.boxShadow = `0 0 10px ${colors.primary}, 0 0 20px ${colors.primary}`;
        indicator.style.opacity = '0.8';
      }
    } else if(viewType.toLowerCase() === 'sagittal') {
      indicator.className = 'spinal-centerline-indicator s-curve-indicator';
      indicator.style.position = 'absolute';
      indicator.style.width = '150px';
      indicator.style.height = '72%';
      indicator.style.top = '40%';
      indicator.style.left = (type === 'main3D' || type === 'fourUp') ? '54%' : '50%';
      indicator.style.transform = 'translate(-50%, -50%)';
      indicator.style.pointerEvents = 'none';

      indicator.innerHTML = '<div class="s-shape"></div>';
    } else {
      // CORONAL and SAGITTAL VIEWS: Show dot at the calculated position
      indicator.style.left = `${position.x}px`;
      indicator.style.top = `${position.y}px`;
      indicator.style.width = '5px'; // Dot size
      indicator.style.height = '5px';
      indicator.style.background = colors.primary;
      indicator.style.borderRadius = '50%';
      indicator.style.boxShadow = `0 0 15px ${colors.primary}, 0 0 30px ${colors.primary}`;
      indicator.style.opacity = '0.9';
    }

    viewport.appendChild(indicator);

    console.log(`📍 Created ${viewType} center line ${viewType === 'axial' ? 'line' : 'dot'} at X:${position.x}, Y:${position.y}`);

    return indicator;
  }, []);

  // NEW: Function to remove DICOM center line indicators
  const removeDICOMCenterLineIndicators = useCallback(() => {
    // Remove all center line indicators from DOM
    const indicators = document.querySelectorAll('.spinal-centerline-indicator');
    indicators.forEach(indicator => indicator.remove());

    // Clear the stored references
    centerLineRefs.current.dicomIndicators = [];

    console.log('🗑️ Removed all DICOM center line indicators');
  }, []);

  // NEW: Add CSS styles for center line indicators
  const addCenterLineStyles = useCallback(() => {
    if (!document.querySelector('#spinal-centerline-styles')) {
      const style = document.createElement('style');
      style.id = 'spinal-centerline-styles';
      style.textContent = `
        @keyframes centerline-appear {
          0% {
            transform: translateX(-20px);
            opacity: 0;
          }
          100% {
            transform: translateX(0);
            opacity: 0.8;
          }
        }

        @keyframes dot-appear {
          0% {
            transform: translate(-50%, -50%) scale(0);
            opacity: 0;
          }
          100% {
            transform: translate(-50%, -50%) scale(1);
            opacity: 0.9;
          }
        }


        @keyframes dot-pulse {
          0%, 100% {
            transform: translate(-50%, -50%) scale(1);
            box-shadow: 0 0 15px currentColor, 0 0 30px currentColor;
          }
          50% {
            transform: translate(-50%, -50%) scale(1.2);
            box-shadow: 0 0 25px currentColor, 0 0 50px currentColor;
          }
        }

        .s-curve-indicator .s-shape::before {
          content: '';
          position: absolute;
          top: 0px;
          left: 73%;
          width: 70px;
          height: 100%;
          border: 2px solid #ff0000; /* Changed to 2px */
          border-top: none;
          border-right: none;
          border-radius: 0 0 0 65px;
          transform: rotate(16deg);
          transform-origin: top left;
        }

        .spinal-centerline-indicator {
          animation: centerline-appear 0.5s ease-out forwards;
        }

        .spinal-centerline-indicator {
          animation: centerline-glow 2s ease-in-out infinite;
        }

        /* Specific styles for dot indicators (coronal/sagittal) */
        .spinal-centerline-indicator[style*="border-radius"] {
          animation: dot-appear 0.5s ease-out forwards, dot-pulse 2s ease-in-out infinite !important;
        }
      `;
      document.head.appendChild(style);
    }
  }, []);

  const calculateSpinalCenterline = useCallback(() => {
    const meshes = meshRefs.current?.left || [];
    if (meshes.length === 0) return null;

    // Filter only vertebrae meshes (C, T, L, S types)
    const vertebrae = meshes.filter(mesh => {
      const userData = mesh.userData;
      return userData && ['C', 'T', 'L', 'S'].includes(userData.type);
    });

    if (vertebrae.length === 0) return null;

    // Calculate center points for each vertebra
    const centerPoints: THREE.Vector3[] = [];

    vertebrae.forEach(mesh => {
      const geometry = mesh.geometry;
      geometry.computeBoundingBox();

      const boundingBox = geometry.boundingBox;
      if (boundingBox) {
        const center = new THREE.Vector3();
        boundingBox.getCenter(center);

        // Transform to world coordinates
        center.applyMatrix4(mesh.matrixWorld);
        centerPoints.push(center);
      }
    });

    // Sort points by Y position (assuming spinal column runs vertically)
    centerPoints.sort((a, b) => a.y - b.y);

    // Simple linear regression to find the best fit line
    if (centerPoints.length < 2) return null;

    return centerPoints;
  }, [meshRefs]);

  const makeMeshesTransparent = useCallback(() => {
    // Store original materials and make meshes transparent with BRIGHTER white color
    if (meshRefs.current) {
      originalMaterials.current.left = meshRefs.current.left.map(mesh => {
        if (Array.isArray(mesh.material)) {
          return mesh.material.map(mat => mat.clone());
        } else {
          return mesh.material.clone();
        }
      });

      originalMaterials.current.right = meshRefs.current.right.map(mesh => {
        if (Array.isArray(mesh.material)) {
          return mesh.material.map(mat => mat.clone());
        } else {
          return mesh.material.clone();
        }
      });

      // Apply BRIGHTER white transparency to left meshes
      meshRefs.current.left.forEach(mesh => {
        if (Array.isArray(mesh.material)) {
          mesh.material.forEach(mat => {
            if (mat instanceof THREE.Material) {
              mat.transparent = true;
              mat.opacity = 0.2; // INCREASED opacity for better brightness
              // Change to BRIGHTER white appearance
              if (mat instanceof THREE.MeshPhongMaterial) {
                mat.color = new THREE.Color(0xffffff); // Pure white
                mat.emissive = new THREE.Color(0xaaaaaa); // LIGHTER gray emissive
                mat.emissiveIntensity = 0.7; // INCREASED emissive intensity
                mat.specular = new THREE.Color(0xffffff); // White specular for shine
                mat.shininess = 15; // Add some shininess
                // Increase overall brightness
                mat.needsUpdate = true;
              }
            }
          });
        } else {
          mesh.material.transparent = true;
          mesh.material.opacity = 0.2; // INCREASED opacity
          if (mesh.material instanceof THREE.MeshPhongMaterial) {
            const phongMat = mesh.material as THREE.MeshPhongMaterial;
            phongMat.color = new THREE.Color(0xffffff);
            phongMat.emissive = new THREE.Color(0xaaaaaa); // LIGHTER gray
            phongMat.emissiveIntensity = 0.7; // INCREASED intensity
            phongMat.specular = new THREE.Color(0xffffff);
            phongMat.shininess = 15;
            phongMat.needsUpdate = true;
          }
        }
      });

      // Apply BRIGHTER white transparency to right meshes
      meshRefs.current.right.forEach(mesh => {
        if (Array.isArray(mesh.material)) {
          mesh.material.forEach(mat => {
            if (mat instanceof THREE.Material) {
              mat.transparent = true;
              mat.opacity = 0.2; // INCREASED opacity
              if (mat instanceof THREE.MeshPhongMaterial) {
                mat.color = new THREE.Color(0xffffff);
                mat.emissive = new THREE.Color(0xaaaaaa); // LIGHTER gray
                mat.emissiveIntensity = 0.7; // INCREASED intensity
                mat.specular = new THREE.Color(0xffffff);
                mat.shininess = 15;
                mat.needsUpdate = true;
              }
            }
          });
        } else {
          mesh.material.transparent = true;
          mesh.material.opacity = 0.2; // INCREASED opacity
          if (mesh.material instanceof THREE.MeshPhongMaterial) {
            const phongMat = mesh.material as THREE.MeshPhongMaterial;
            phongMat.color = new THREE.Color(0xffffff);
            phongMat.emissive = new THREE.Color(0xaaaaaa); // LIGHTER gray
            phongMat.emissiveIntensity = 0.7; // INCREASED intensity
            phongMat.specular = new THREE.Color(0xffffff);
            phongMat.shininess = 15;
            phongMat.needsUpdate = true;
          }
        }
      });
    }
  }, [meshRefs]);

  const restoreOriginalMaterials = useCallback(() => {
    // Restore original materials
    if (meshRefs.current && originalMaterials.current.left.length > 0) {
      meshRefs.current.left.forEach((mesh, index) => {
        if (Array.isArray(mesh.material)) {
          mesh.material.forEach((mat, matIndex) => {
            mat.dispose();
          });
        } else {
          mesh.material.dispose();
        }

        // Restore original material
        const originalMaterial = originalMaterials.current.left[index];
        if (Array.isArray(originalMaterial)) {
          mesh.material = originalMaterial.map(mat => mat.clone());
        } else {
          mesh.material = (originalMaterial as THREE.Material).clone();
        }
      });

      meshRefs.current.right.forEach((mesh, index) => {
        if (Array.isArray(mesh.material)) {
          mesh.material.forEach((mat, matIndex) => {
            mat.dispose();
          });
        } else {
          mesh.material.dispose();
        }

        const originalMaterial = originalMaterials.current.right[index];
        if (Array.isArray(originalMaterial)) {
          mesh.material = originalMaterial.map(mat => mat.clone());
        } else {
          mesh.material = (originalMaterial as THREE.Material).clone();
        }
      });

      // Clear stored materials
      originalMaterials.current = { left: [], right: [] };
    }
  }, [meshRefs]);

  const removeCenterLine = useCallback(() => {
    // Remove main line from 3D views
    if (centerLineRefs.current.left) {
      leftSceneRef.current?.remove(centerLineRefs.current.left);
      centerLineRefs.current.left.geometry.dispose();
      (centerLineRefs.current.left.material as THREE.Material).dispose();
    }
    if (centerLineRefs.current.right) {
      rightSceneRef.current?.remove(centerLineRefs.current.right);
      centerLineRefs.current.right.geometry.dispose();
      (centerLineRefs.current.right.material as THREE.Material).dispose();
    }

    // Remove glow lines from 3D views
    if (centerLineRefs.current.leftGlow) {
      leftSceneRef.current?.remove(centerLineRefs.current.leftGlow);
      centerLineRefs.current.leftGlow.geometry.dispose();
      (centerLineRefs.current.leftGlow.material as THREE.Material).dispose();
    }
    if (centerLineRefs.current.rightGlow) {
      rightSceneRef.current?.remove(centerLineRefs.current.rightGlow);
      centerLineRefs.current.rightGlow.geometry.dispose();
      (centerLineRefs.current.rightGlow.material as THREE.Material).dispose();
    }

    // NEW: Remove DICOM center line indicators
    removeDICOMCenterLineIndicators();

    // Reset 3D line references
    centerLineRefs.current = {
      ...centerLineRefs.current,
      left: null,
      right: null,
      leftGlow: null,
      rightGlow: null
    };

    // Restore original mesh materials
    restoreOriginalMaterials();

    setCenterLineEnabled(false);

    console.log('🗑️ Spinal Center Line removed from ALL views');
  }, [leftSceneRef, rightSceneRef, restoreOriginalMaterials, removeDICOMCenterLineIndicators]);


  const showCenterLine = useCallback(() => {
    // Remove existing center lines
    removeCenterLine();

    const centerPoints = calculateSpinalCenterline();
    if (!centerPoints || centerPoints.length < 2) {
      console.warn('Not enough vertebrae found to calculate center line');
      return;
    }

    // Add CSS styles for center line indicators
    addCenterLineStyles();

    // Create a smooth curve from the center points for THICK tube geometry
    const curve = new THREE.CatmullRomCurve3(centerPoints);

    // Create THICK tube geometry for the main center line
    const tubeGeometry = new THREE.TubeGeometry(
      curve,
      centerPoints.length * 20, // More segments for smoother curve
      1.5, // RADIUS - this makes it thick! Increase for thicker lines
      8,   // Radial segments
      false // Not closed
    );

    // Create material for the thick tube
    const tubeMaterial = new THREE.MeshBasicMaterial({
      color: 0xff0000, // Bright red
      transparent: true,
      opacity: 1.0
    });

    // Create tube objects for 3D views
    const leftTube = new THREE.Mesh(tubeGeometry, tubeMaterial);
    const rightTube = new THREE.Mesh(tubeGeometry.clone(), tubeMaterial);

    // Create even THICKER glow tube
    const glowTubeGeometry = new THREE.TubeGeometry(
      curve,
      centerPoints.length * 20,
      2.5, // LARGER radius for glow - makes it even thicker
      8,
      false
    );

    const glowMaterial = new THREE.MeshBasicMaterial({
      color: 0xff4444, // Lighter red for glow
      transparent: true,
      opacity: 0.6
    });

    const leftGlowTube = new THREE.Mesh(glowTubeGeometry, glowMaterial);
    const rightGlowTube = new THREE.Mesh(glowTubeGeometry.clone(), glowMaterial);

    // Add both tubes to 3D scenes (glow first, then main tube)
    leftSceneRef.current?.add(leftGlowTube);
    leftSceneRef.current?.add(leftTube);
    rightSceneRef.current?.add(rightGlowTube);
    rightSceneRef.current?.add(rightTube);

    // Store references to both tubes
    centerLineRefs.current = {
      ...centerLineRefs.current,
      left: leftTube,
      right: rightTube,
      leftGlow: leftGlowTube,
      rightGlow: rightGlowTube
    };

    // NEW: Create center line indicators in DICOM views
    createDICOMCenterLineIndicators(centerPoints);

    // Make meshes transparent with BRIGHT white color
    makeMeshesTransparent();

    setCenterLineEnabled(true);

    console.log('🎯 THICK Spinal Center Line enabled on ALL views (3D + DICOM)');
  }, [
    calculateSpinalCenterline,
    leftSceneRef,
    rightSceneRef,
    makeMeshesTransparent,
    addCenterLineStyles,
    createDICOMCenterLineIndicators,
    removeCenterLine
  ]);


  const toggleCenterLine = useCallback(() => {
    if (centerLineRefs.current.left) {
      removeCenterLine();
    } else {
      showCenterLine();
    }
  }, [showCenterLine, removeCenterLine]);

  return {
    showCenterLine,
    removeCenterLine,
    toggleCenterLine,
    hasCenterLine: !!centerLineRefs.current.left,
    centerLineEnabled
  };
};
