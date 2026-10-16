// hooks/useSTLToDICOMLinking.tsx
import { useEffect, useRef, useCallback, useState } from 'react';
import * as THREE from 'three';
import { cache } from '@cornerstonejs/core';
import { STLToDICOMConfig } from '../types/three.types';
import { redrawContourOverlay } from '../utils/vertebraContourOverlayManager';

export const useSTLToDICOMLinking = (config: STLToDICOMConfig) => {
  const {
    leftRendererRef,
    leftSceneRef,
    cameraRef,
    meshRefs,
    servicesManager,
    commandsManager
  } = config;

  const raycasterRef = useRef<THREE.Raycaster>(new THREE.Raycaster());
  const mouseRef = useRef<THREE.Vector2>(new THREE.Vector2());
  const [isLinkingActive, setIsLinkingActive] = useState<boolean>(false);
  const [selectedMesh, setSelectedMesh] = useState<THREE.Mesh | null>(null);
  const viewportCacheRef = useRef<Map<Element, string>>(new Map());
  const originalMaterialsRef = useRef<Map<THREE.Mesh, THREE.Material>>(new Map());
  const lastClickTimeRef = useRef<number>(0);
  const currentIndicatorRef = useRef<{ viewport: Element; indicator: HTMLDivElement } | null>(null);

  // ADD: Scene bounds ref to store calculated bounds
  const sceneBoundsRef = useRef<{ min: THREE.Vector3; max: THREE.Vector3 } | null>(null);

  // FIXED: CORRECT layout mapping based on your description
  const viewportLayoutMapping = useRef<Map<number, string>>(new Map([
    [0, 'axial'],    // First view: Axial
    [1, 'sagittal'],
    [2, 'coronal'],  // Second view: Coronal  // Third view: Sagittal
  ]));

  // FIXED: Simple and reliable viewport detection using layout position only
  const detectViewportType = useCallback((viewport: Element): string => {
    // Try to get from cache first
    const cached = viewportCacheRef.current.get(viewport);
    if (cached) {
      console.log('✅ Using cached viewport type:', cached);
      return cached;
    }

    const viewportElement = viewport as HTMLElement;

    console.log('🕵️‍♂️ Starting viewport detection for element');

    // Method 1: Get all viewports and find the index
    const viewports = Array.from(document.querySelectorAll([
      '[data-cy="viewport-container"]',
      '.viewport-element',
      '.cornerstone-viewport',
      '.ohif-viewport',
      '.viewport-wrapper',
      '.viewer-viewport'
    ].join(',')));

    const currentIndex = viewports.indexOf(viewportElement);
    console.log('📊 Viewport index in layout:', currentIndex, 'Total viewports:', viewports.length);

    let detectedType = 'axial'; // Default fallback

    // Use the manual layout mapping - CORRECTED
    if (currentIndex !== -1 && viewports.length >= 3) {
      detectedType = viewportLayoutMapping.current.get(currentIndex) || 'sagittal';
      console.log(`✅ Detected ${detectedType.toUpperCase()} via layout mapping (index ${currentIndex})`);

      // Double-check the mapping is correct
      console.log('🔍 Layout mapping verification:', {
        'index 0': viewportLayoutMapping.current.get(0),
        'index 1': viewportLayoutMapping.current.get(1),
        'index 2': viewportLayoutMapping.current.get(2)
      });
    } else {
      console.log('❓ Using default AXIAL (could not determine layout position)');
    }

    // Cache the result
    viewportCacheRef.current.set(viewport, detectedType);
    return detectedType;
  }, []);

  // Rest of your existing code remains the same...
  const debugViewportDetection = useCallback((viewport: Element) => {
    const viewportElement = viewport as HTMLElement;
    console.log('🔍 Debug Viewport Detection:', {
      element: viewportElement,
      classes: viewportElement.className,
      id: viewportElement.id,
      dataset: viewportElement.dataset,
      innerHTML: viewportElement.innerHTML.substring(0, 200)
    });
  }, []);

  const debugSpinalRegions = useCallback(() => {
    console.log('🧠 Debug Spinal Regions:');
    Object.entries(anatomicalCoordinates.current.spinalRegions).forEach(([viewType, regions]) => {
      console.log(`  ${viewType.toUpperCase()} VIEW:`);
      Object.entries(regions).forEach(([boneType, region]) => {
        console.log(`    ${boneType}:`, region);
        // Calculate positions for each bone in this region
        for (let i = 1; i <= region.count; i++) {
          console.log(`      ${boneType}${i}: pixelHeight ${region.pixelHeight}px, total ${region.count} bones`);
        }
      });
    });
  }, []);

  useEffect(() => {
    debugSpinalRegions();
  }, []);

  // ... (rest of your existing useEffect hooks and other functions remain exactly the same)

  const toggleLinking = useCallback(() => {
    const newState = !isLinkingActive;
    setIsLinkingActive(newState);

    if (!newState) {
      setSelectedMesh(null);
      clearDICOMHighlights();
      resetAllMeshColors();
    }

    console.log(`🎯 STL-DICOM Linking ${newState ? 'ACTIVATED' : 'DEACTIVATED'}`);
  }, [isLinkingActive]);

  const clearDICOMHighlights = useCallback(() => {
    const indicators = document.querySelectorAll('.stl-dicom-indicator');
    indicators.forEach(indicator => indicator.remove());
    currentIndicatorRef.current = null;

    const viewports = document.querySelectorAll('[data-cy="viewport-container"], .viewport-element');
    viewports.forEach(viewport => {
      viewport.style.boxShadow = '';
    });
  }, []);

  const resetAllMeshColors = useCallback(() => {
    meshRefs.current.left.forEach(mesh => {
      const originalMaterial = originalMaterialsRef.current.get(mesh);
      if (originalMaterial) {
        mesh.material = originalMaterial;
      }
    });
  }, [meshRefs]);

  useEffect(() => {
    meshRefs.current.left.forEach(mesh => {
      if (!originalMaterialsRef.current.has(mesh)) {
        originalMaterialsRef.current.set(mesh, mesh.material);
      }
    });
  }, [meshRefs]);

  const anatomicalCoordinates = useRef({
    // View-specific spinal region definitions with normalized Y positions
    spinalRegions: {
      axial: {
        'C': {
          count: 7,
          pixelHeight: 50,  // Increased from 35 to 50
          totalPixels: 350  // 7 × 50 = 350
        },
        'T': {
          count: 12,
          pixelHeight: 50,  // Increased from 35 to 50
          totalPixels: 600  // 12 × 50 = 600
        },
        'L': {
          count: 5,
          pixelHeight: 50,  // Increased from 35 to 50
          totalPixels: 250  // 5 × 50 = 250
        },
        'S': {
          count: 5,
          pixelHeight: 50,  // Increased from 35 to 50
          totalPixels: 250  // 5 × 50 = 250
        }
      },
      sagittal: {
        'C': { count: 7, pixelHeight: 35, totalPixels: 245 },  // C1-C7: 7 bones × 35px = 245px
        'T': { count: 12, pixelHeight: 35, totalPixels: 420 }, // T1-T12: 12 bones × 35px = 420px
        'L': { count: 5, pixelHeight: 35, totalPixels: 175 },  // L1-L5: 5 bones × 35px = 175px
        'S': { count: 1, pixelHeight: 35, totalPixels: 35 }    // S1-S2: 2 bones × 35px = 70px
      },
      coronal: {
        'C': { count: 7, pixelHeight: 35, totalPixels: 245 },  // C1-C7: 7 bones × 35px = 245px
        'T': { count: 12, pixelHeight: 35, totalPixels: 420 }, // T1-T12: 12 bones × 35px = 420px
        'L': { count: 5, pixelHeight: 35, totalPixels: 175 },  // L1-L5: 5 bones × 35px = 175px
        'S': { count: 1, pixelHeight: 35, totalPixels: 35 }    // S1-S2: 2 bones × 35px = 70px
      }
    },
    organPositions: {
      'A': { // Aorta - more front/center
        axial: [0.4, 0.5],    // Slightly right of center
        sagittal: [0.4, 0.5],  // More towards front (right side in sagittal)
        coronal: [0.4, 0.5]   // Center position
      },
      'H': { // Heart - left side
        axial: [0.4, 0.4],    // Slightly right of center
        sagittal: [0.4, 0.5],  // More towards front (right side in sagittal)
        coronal: [0.52, 0.5] // Left side
      }
    }
  });


    // FIXED: Axial view uses centered positioning, other views use dynamic positioning
const calculateSpinalPosition = useCallback((meshData: any, viewportHeight: number, viewType: string = 'axial') => {
  const { type, number } = meshData;

  console.log('🔍 Debug: Starting position calculation for:', `${type}${number} in ${viewType} view`);

  // FOR AXIAL VIEW - USE CENTERED POSITIONING (STATIC)
  if (viewType.toLowerCase() === 'axial') {
    console.log('🎯 Using CENTERED positioning for AXIAL view');
    return 0.5; // Always center for axial view
  }

  // FOR SAGITTAL AND CORONAL VIEWS - USE DYNAMIC POSITIONING (MOVING)
  console.log(`🎯 Using DYNAMIC positioning for ${viewType.toUpperCase()} view`);

  // Get the spinal regions for the specific view type
  const viewRegions = anatomicalCoordinates.current.spinalRegions[viewType];
  if (!viewRegions) {
    console.warn(`⚠️ No spinal regions found for view type: ${viewType}`);
    return 0.5;
  }

  const region = viewRegions[type];
  if (!region) {
    console.warn(`⚠️ No region found for ${type}${number} in ${viewType} view`);
    return 0.5;
  }

  // Get all available bones with their types and numbers
  const availableBones = [];
  console.log('📋 All available bones in scene:');
  meshRefs.current.left.forEach((mesh, index) => {
    const meshType = mesh.userData?.type;
    const meshNumber = mesh.userData?.number;
    if (meshType && meshNumber && ['C', 'T', 'L', 'S'].includes(meshType)) {
      availableBones.push({ type: meshType, number: meshNumber });
      console.log(`   ✅ Bone: ${meshType}${meshNumber}`);
    }
  });

  // Group available bones by type and find min/max numbers
  const availableSeries = {};
  availableBones.forEach(bone => {
    if (!availableSeries[bone.type]) {
      availableSeries[bone.type] = {
        minNumber: bone.number,
        maxNumber: bone.number,
        bones: []
      };
    }
    availableSeries[bone.type].bones.push(bone.number);
    availableSeries[bone.type].minNumber = Math.min(availableSeries[bone.type].minNumber, bone.number);
    availableSeries[bone.type].maxNumber = Math.max(availableSeries[bone.type].maxNumber, bone.number);
  });

  console.log('📊 Available series analysis:', availableSeries);

  // Calculate total pixels based on ACTUALLY available bones (not theoretical counts)
  let totalAvailablePixels = 0;
  let offsetBeforeCurrentSeries = 0;

  // Define the order of spinal regions (top to bottom)
  const spinalOrder = ['C', 'T', 'L', 'S'];

  console.log('📐 Calculating total available pixels from ACTUAL bones:');

  // Calculate total pixels from actually available bones
  spinalOrder.forEach(seriesType => {
    if (availableSeries[seriesType]) {
      const seriesData = availableSeries[seriesType];
      const seriesRegion = viewRegions[seriesType];

      if (seriesRegion) {
        // Calculate actual pixels for this series based on available bone range
        const boneCount = seriesData.maxNumber - seriesData.minNumber + 1;
        const actualPixels = boneCount * seriesRegion.pixelHeight;

        totalAvailablePixels += actualPixels;
        console.log(`   ✅ ${seriesType} series: ${boneCount} bones × ${seriesRegion.pixelHeight}px = ${actualPixels}px (Total: ${totalAvailablePixels}px)`);
      }
    } else {
      console.log(`   ❌ ${seriesType} series: NO BONES AVAILABLE`);
    }
  });

  if (totalAvailablePixels === 0) {
    console.warn('⚠️ No spinal regions found, using default positioning');
    return 0.5;
  }

  console.log('📍 Calculating offset for current bone:', `${type}${number}`);

  // Calculate offset for series that come BEFORE current series AND have available bones
  const currentSeriesIndex = spinalOrder.indexOf(type);
  spinalOrder.forEach((seriesType, index) => {
    if (index < currentSeriesIndex && availableSeries[seriesType]) {
      const seriesData = availableSeries[seriesType];
      const seriesRegion = viewRegions[seriesType];

      if (seriesRegion) {
        // Calculate actual pixels for this preceding series
        const boneCount = seriesData.maxNumber - seriesData.minNumber + 1;
        const actualPixels = boneCount * seriesRegion.pixelHeight;

        offsetBeforeCurrentSeries += actualPixels;
        console.log(`   ✅ Adding ${seriesType} offset: ${actualPixels}px (Total offset: ${offsetBeforeCurrentSeries}px)`);
      }
    }
  });

  // Calculate offset WITHIN current series for partial missing bones
  let offsetWithinCurrentSeries = 0;
  if (availableSeries[type]) {
    const currentSeriesData = availableSeries[type];
    const minNumberInSeries = currentSeriesData.minNumber;

    // If current bone is not the first available in its series, add offset
    if (number > minNumberInSeries) {
      const missingBonesBefore = number - minNumberInSeries;
      offsetWithinCurrentSeries = missingBonesBefore * region.pixelHeight;
      console.log(`   📍 Within ${type} series: ${missingBonesBefore} bones missing before ${type}${number}, offset: ${offsetWithinCurrentSeries}px`);
    }
  }

  console.log(`🎯 Final offsets - Before series: ${offsetBeforeCurrentSeries}px, Within series: ${offsetWithinCurrentSeries}px`);

  // Calculate position within the specific bone
  const bonePosition = 0; // Always start at top of the bone for now
  const pixelsWithinBone = bonePosition * region.pixelHeight;

  // Calculate total pixels from top
  const pixelsFromTop = offsetBeforeCurrentSeries + offsetWithinCurrentSeries + pixelsWithinBone;

  // Convert to normalized Y position (0-1)
  const normalizedY = pixelsFromTop / totalAvailablePixels;

  console.log(`🦴 FINAL ${viewType.toUpperCase()} Position for ${type}${number}:`, {
    pixelsFromTop: pixelsFromTop.toFixed(0),
    totalAvailablePixels,
    normalizedY: normalizedY.toFixed(3),
    'Percentage from top': `${(normalizedY * 100).toFixed(1)}%`
  });

  return Math.max(0.05, Math.min(0.95, normalizedY));
}, [meshRefs]);

    const convertSTLToDICOMPosition = useCallback((intersectPoint: THREE.Vector3, viewport: Element, meshData: any, mesh: THREE.Mesh, viewType: string = 'axial') => {
      const rect = viewport.getBoundingClientRect();
      const viewportWidth = rect.width;
      const viewportHeight = rect.height;

      const { type, number } = meshData;

      console.log(`🧮 Converting position for ${type}${number} in ${viewType} view`);

      // Handle organs with fixed positions
      if (meshData.type === 'A' || meshData.type === 'H') {
        const organPositions = anatomicalCoordinates.current.organPositions[meshData.type];

        if (organPositions && organPositions[viewType]) {
          const [x, y] = organPositions[viewType];
          return {
            x: viewportWidth * x,
            y: viewportHeight * y
          };
        }
      }

      // For bones - use dynamic spinal positioning
      let normalizedX = 0.5;
      let normalizedY = 0.5;

      // Use dynamic calculation for spinal regions - PASS viewType parameter
      normalizedY = calculateSpinalPosition(meshData, viewportHeight, viewType); // CHANGED: Added viewType parameter

      // For sagittal and coronal views, use scene bounds for X positioning
      if (viewType.toLowerCase() !== 'axial') {
        if (sceneBoundsRef.current) {
          const bounds = sceneBoundsRef.current;
          const meshBoundingBox = new THREE.Box3().setFromObject(mesh);
          const meshCenter = meshBoundingBox.getCenter(new THREE.Vector3());
          meshCenter.applyMatrix4(mesh.matrixWorld);

          console.log(`🎯 ${viewType.toUpperCase()} view positioning for ${meshData.type}${meshData.number}:`, {
            worldPosition: meshCenter.toArray(),
            bounds: { min: bounds.min.toArray(), max: bounds.max.toArray() }
          });

          if (viewType.toLowerCase() === 'sagittal') {
            // Sagittal: Side view - use Z for horizontal positioning (left-right)
            normalizedX = (meshCenter.z - bounds.min.z) / (bounds.max.z - bounds.min.z);
            console.log(`   Sagittal X from Z: ${meshCenter.z} -> ${normalizedX.toFixed(3)}`);
          } else if (viewType.toLowerCase() === 'coronal') {
            // Coronal: Front view - use X for horizontal positioning (left-right)
            normalizedX = (meshCenter.x - bounds.min.x) / (bounds.max.x - bounds.min.x);
            console.log(`   Coronal X from X: ${meshCenter.x} -> ${normalizedX.toFixed(3)}`);
          }
        } else {
          console.warn(`⚠️ No scene bounds available for ${viewType} view, using center`);
          normalizedX = 0.5;
        }
      } else {
        // For axial view, keep X at center for bones
        normalizedX = 0.5;
        console.log(`🎯 Axial view - X centered for ${meshData.type}${meshData.number}`);
      }

      // Clamp values to viewport with margins
      normalizedX = Math.max(0.15, Math.min(0.85, normalizedX));
      normalizedY = Math.max(0.05, Math.min(0.95, normalizedY));

      const finalX = viewportWidth * normalizedX;
      const finalY = viewportHeight * normalizedY;

      console.log(`🎯 Final ${viewType} position for ${type}${number}:`, {
        normalized: { x: normalizedX.toFixed(3), y: normalizedY.toFixed(3) },
        pixels: { x: Math.round(finalX), y: Math.round(finalY) },
        viewport: { width: viewportWidth, height: viewportHeight }
      });

      return {
        x: finalX,
        y: finalY
      };
    }, [calculateSpinalPosition]);

  const highlightSTLMesh = useCallback((mesh: THREE.Mesh, intersectPoint: THREE.Vector3) => {
    if (!originalMaterialsRef.current.has(mesh)) {
      originalMaterialsRef.current.set(mesh, mesh.material);
    }

    if (selectedMesh) {
      const originalMaterial = originalMaterialsRef.current.get(selectedMesh);
      if (originalMaterial) {
        selectedMesh.material = originalMaterial;
      }
    }

    setSelectedMesh(mesh);

    const highlightMaterial = new THREE.MeshPhongMaterial({
      color: 0x00ff00,
      emissive: 0x00ff00,
      emissiveIntensity: 0.5,
      specular: 0xffffff,
      shininess: 80,
      transparent: true,
      opacity: 0.9
    });

    mesh.material = highlightMaterial;

    return intersectPoint;
  }, [selectedMesh]);

  const createPositionIndicator = useCallback((viewport: Element, position: { x: number, y: number }, meshData: any, viewType: string = 'axial') => {
    const existingIndicators = viewport.querySelectorAll('.stl-dicom-indicator');
    existingIndicators.forEach(indicator => indicator.remove());

    const getViewColors = (viewType: string) => {
      switch (viewType.toLowerCase()) {
        case 'axial':
          return { primary: '#00ff00', accent: '#00cc00', name: 'AXIAL' };
        case 'coronal':
          return { primary: '#0099ff', accent: '#0077cc', name: 'CORONAL' };
        case 'sagittal':
          return { primary: '#ff9900', accent: '#cc7700', name: 'SAGITTAL' };
        default:
          return { primary: '#ff0000', accent: '#cc0000', name: 'UNKNOWN' };
      }
    };

    const colors = getViewColors(viewType);
    const indicatorColor = colors.primary;
    const accentColor = colors.accent;

    const indicator = document.createElement('div');
    indicator.className = 'stl-dicom-indicator';
    indicator.style.position = 'absolute';
    indicator.style.left = '0';
    indicator.style.top = `${position.y}px`;
    indicator.style.width = '100%';
    indicator.style.height = '3px';
    indicator.style.zIndex = '10000';
    indicator.style.pointerEvents = 'none';
    indicator.style.transition = 'top 0.5s ease-in-out';

    const horizontalLine = document.createElement('div');
    horizontalLine.style.position = 'absolute';
    horizontalLine.style.width = '100%';
    horizontalLine.style.height = '100%';
    horizontalLine.style.background = `linear-gradient(90deg,
      transparent 0%,
      ${indicatorColor} 10%,
      ${indicatorColor} 90%,
      transparent 100%)`;
    horizontalLine.style.boxShadow = `0 0 8px ${indicatorColor}, 0 0 16px ${indicatorColor}`;
    horizontalLine.style.opacity = '0.9';

    const positionDot = document.createElement('div');
    positionDot.style.position = 'absolute';
    positionDot.style.width = '12px';
    positionDot.style.height = '12px';
    positionDot.style.background = indicatorColor;
    positionDot.style.borderRadius = '50%';
    positionDot.style.left = `${position.x}px`;
    positionDot.style.top = '50%';
    positionDot.style.transform = 'translate(-50%, -50%)';
    positionDot.style.boxShadow = `0 0 10px ${indicatorColor}, 0 0 20px ${indicatorColor}`;
    positionDot.style.zIndex = '10001';

    const label = document.createElement('div');
    label.textContent = `${meshData.type}${meshData.number}`;
    label.style.position = 'absolute';
    label.style.top = '50%';
    label.style.left = '10px';
    label.style.transform = 'translateY(-50%)';
    label.style.background = 'rgba(0, 0, 0, 0.95)';
    label.style.color = indicatorColor;
    label.style.padding = '4px 10px';
    label.style.borderRadius = '4px';
    label.style.fontSize = '11px';
    label.style.fontWeight = 'bold';
    label.style.fontFamily = 'monospace, system-ui, sans-serif';
    label.style.border = `1px solid ${accentColor}`;
    label.style.whiteSpace = 'nowrap';
    label.style.boxShadow = '0 2px 8px rgba(0,0,0,0.5)';
    label.style.zIndex = '10001';
    label.style.letterSpacing = '0.5px';
    label.style.backdropFilter = 'blur(4px)';

    const viewBadge = document.createElement('div');
    viewBadge.textContent = colors.name;
    viewBadge.style.position = 'absolute';
    viewBadge.style.top = '50%';
    viewBadge.style.right = '10px';
    viewBadge.style.transform = 'translateY(-50%)';
    viewBadge.style.background = 'rgba(0, 0, 0, 0.9)';
    viewBadge.style.color = indicatorColor;
    viewBadge.style.padding = '4px 10px';
    viewBadge.style.borderRadius = '4px';
    viewBadge.style.fontSize = '10px';
    viewBadge.style.fontWeight = 'bold';
    viewBadge.style.boxShadow = '0 1px 4px rgba(0,0,0,0.3)';
    viewBadge.style.zIndex = '10001';
    viewBadge.style.border = `1px solid ${accentColor}`;
    viewBadge.style.fontFamily = 'monospace, system-ui, sans-serif';

    indicator.appendChild(horizontalLine);
    indicator.appendChild(positionDot);
    indicator.appendChild(label);
    indicator.appendChild(viewBadge);

    viewport.appendChild(indicator);

    currentIndicatorRef.current = { viewport, indicator };

    console.log(`📍 ${colors.name} view horizontal indicator for ${meshData.type}${meshData.number} at Y:${position.y.toFixed(0)}`);

    return indicator;
  }, []);

  const updateIndicatorPosition = useCallback((viewport: Element, newPosition: { x: number, y: number }, meshData: any, viewType: string) => {
    if (!currentIndicatorRef.current || currentIndicatorRef.current.viewport !== viewport) {
      return createPositionIndicator(viewport, newPosition, meshData, viewType);
    }

    const indicator = currentIndicatorRef.current.indicator;

    indicator.style.top = `${newPosition.y}px`;

    const positionDot = indicator.querySelector('div:nth-child(2)') as HTMLDivElement;
    if (positionDot) {
      positionDot.style.left = `${newPosition.x}px`;
    }

    const label = indicator.querySelector('div:nth-child(3)') as HTMLDivElement;
    if (label) {
      label.textContent = `${meshData.type}${meshData.number}`;
    }

    const viewBadge = indicator.querySelector('div:nth-child(4)') as HTMLDivElement;
    if (viewBadge) {
      const getViewColors = (viewType: string) => {
        switch (viewType.toLowerCase()) {
          case 'axial':
            return { primary: '#00ff00', accent: '#00cc00', name: 'AXIAL' };
          case 'coronal':
            return { primary: '#0099ff', accent: '#0077cc', name: 'CORONAL' };
          case 'sagittal':
            return { primary: '#ff9900', accent: '#cc7700', name: 'SAGITTAL' };
          default:
            return { primary: '#ff0000', accent: '#cc0000', name: 'UNKNOWN' };
        }
      };

      const colors = getViewColors(viewType);
      viewBadge.textContent = colors.name;
      viewBadge.style.color = colors.primary;
      viewBadge.style.border = `1px solid ${colors.accent}`;

      const horizontalLine = indicator.querySelector('div:first-child') as HTMLDivElement;
      if (horizontalLine) {
        horizontalLine.style.background = `linear-gradient(90deg,
          transparent 0%,
          ${colors.primary} 10%,
          ${colors.primary} 90%,
          transparent 100%)`;
        horizontalLine.style.boxShadow = `0 0 8px ${colors.primary}, 0 0 16px ${colors.primary}`;
      }

      if (positionDot) {
        positionDot.style.background = colors.primary;
        positionDot.style.boxShadow = `0 0 10px ${colors.primary}, 0 0 20px ${colors.primary}`;
      }

      if (label) {
        label.style.color = colors.primary;
        label.style.border = `1px solid ${colors.accent}`;
      }
    }

    console.log(`🔄 Updated ${viewType} indicator position for ${meshData.type}${meshData.number} to Y:${newPosition.y.toFixed(0)}`);
  }, [createPositionIndicator]);

  const highlightDICOMAtPosition = useCallback((meshData: any, intersectPoint: THREE.Vector3, mesh: THREE.Mesh) => {
    clearDICOMHighlights();

    const viewportSelectors = [
      '[data-cy="viewport-container"]',
      '.viewport-element',
      '.cornerstone-viewport',
      '.ohif-viewport',
      '.viewport-wrapper',
      '.viewer-viewport'
    ];

    let indicatorsPlaced = 0;

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
            console.log(`🎯 Processing ${viewType.toUpperCase()} viewport`);

            const screenPosition = convertSTLToDICOMPosition(intersectPoint, viewport, meshData, mesh, viewType);

            const borderColor = viewType === 'axial' ? '#00ff00' :
                               viewType === 'coronal' ? '#0099ff' : '#ff9900';

            viewport.style.boxShadow = `inset 0 0 0 2px ${borderColor}, 0 0 10px ${borderColor}40`;

            if (currentIndicatorRef.current && currentIndicatorRef.current.viewport === viewport) {
              updateIndicatorPosition(viewport, screenPosition, meshData, viewType);
            } else {
              createPositionIndicator(viewport, screenPosition, meshData, viewType);
            }

            indicatorsPlaced++;

            setTimeout(() => {
              if (viewport.style) {
                viewport.style.boxShadow = '';
              }
            }, 1500);

          } catch (error) {
            console.error('Viewport processing error:', error);
          }
        }
      });
    });

    console.log(`🎯 Placed ${indicatorsPlaced} indicators for ${meshData.type}${meshData.number}`);
  }, [convertSTLToDICOMPosition, createPositionIndicator, updateIndicatorPosition, clearDICOMHighlights, detectViewportType]);

  // ─── Scroll DICOM viewports to exact slice matching the clicked STL point ───
  const scrollViewportsToPoint = useCallback((stlPoint: THREE.Vector3) => {
    const { cornerstoneViewportService, viewportGridService } = servicesManager?.services || {};
    if (!cornerstoneViewportService || !viewportGridService) return;

    // STL meshes are already in DICOM LPS world coordinates — use directly
    const dicomPoint: [number, number, number] = [stlPoint.x, stlPoint.y, stlPoint.z];

    // Gather cornerstone viewports
    const viewportState = viewportGridService.getState();
    const viewports = viewportState?.viewports;
    if (!viewports) return;

    const entries = viewports instanceof Map
      ? Array.from(viewports.entries())
      : Object.entries(viewports);

    const csViewports: any[] = [];
    entries.forEach(([vpId, vpInfo]: [string, any]) => {
      const opts = vpInfo?.viewportOptions || {};
      if (opts.customLayout === 'stl' || vpId === 'stlViewport') return;
      try {
        const vp = cornerstoneViewportService.getCornerstoneViewport(vpId);
        if (!vp?.element) return;
        csViewports.push(vp);
      } catch (_) {}
    });

    if (csViewports.length === 0) return;

    // Update Crosshairs tool center if it's active
    try {
      const { toolGroupService } = servicesManager?.services || {};
      if (toolGroupService) {
        const tg = toolGroupService.getToolGroup('mpr');
        const ct = (tg as any)?.getToolInstance?.('Crosshairs');
        if (ct) ct.toolCenter = dicomPoint;
      }
    } catch (_) {}

    // Scroll each viewport to the correct slice (only update scroll axis, preserve pan)
    csViewports.forEach(vp => {
      try {
        const cam = vp.getCamera();
        if (!cam?.focalPoint || !cam?.viewPlaneNormal || !cam?.position) return;
        const vpn = cam.viewPlaneNormal;
        const absVpn = [Math.abs(vpn[0]), Math.abs(vpn[1]), Math.abs(vpn[2])];
        const scrollAxis = absVpn.indexOf(Math.max(...absVpn));
        const delta = dicomPoint[scrollAxis] - cam.focalPoint[scrollAxis];
        const newFP  = [...cam.focalPoint] as [number, number, number];
        const newPos = [...cam.position]   as [number, number, number];
        newFP[scrollAxis]  = dicomPoint[scrollAxis];
        newPos[scrollAxis] = cam.position[scrollAxis] + delta;
        vp.setCamera({ focalPoint: newFP, position: newPos });
        vp.render();
      } catch (_) {}
    });

    // Redraw contour overlay after all viewports have navigated to the new slice.
    redrawContourOverlay();

    console.log('[LinkingTool] Scrolled viewports to DICOM:', dicomPoint.map(v => v.toFixed(1)));
  }, [servicesManager]);

  const handleSTLClick = useCallback((event: MouseEvent) => {
    if (!isLinkingActive || !leftRendererRef.current || !cameraRef.current) return;

    const now = Date.now();
    if (now - lastClickTimeRef.current < 200) return;
    lastClickTimeRef.current = now;

    const canvas = leftRendererRef.current.domElement;
    const rect = canvas.getBoundingClientRect();

    mouseRef.current.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouseRef.current.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    raycasterRef.current.setFromCamera(mouseRef.current, cameraRef.current);

    const meshes = meshRefs.current.left.filter(mesh => mesh.visible);
    const intersects = raycasterRef.current.intersectObjects(meshes, true);

    if (intersects.length > 0) {
      const clickedMesh = intersects[0].object as THREE.Mesh;
      const meshData = clickedMesh.userData;
      const intersectPoint = intersects[0].point;

      console.log(`🖱️ Clicked: ${meshData.type}${meshData.number} at`, intersectPoint.toArray());

      const worldPosition = highlightSTLMesh(clickedMesh, intersectPoint);
      highlightDICOMAtPosition(meshData, worldPosition, clickedMesh);

      // Use actual intersection point for precise slice navigation
      scrollViewportsToPoint(intersectPoint);
    } else {
      setSelectedMesh(null);
      clearDICOMHighlights();
      resetAllMeshColors();
    }
  }, [isLinkingActive, highlightSTLMesh, highlightDICOMAtPosition, scrollViewportsToPoint, meshRefs, clearDICOMHighlights, resetAllMeshColors]);

  useEffect(() => {
    if (!document.querySelector('#stl-dicom-styles')) {
      const style = document.createElement('style');
      style.id = 'stl-dicom-styles';
      style.textContent = `
        @keyframes horizontal-line-appear {
          0% {
            transform: translateY(-20px);
            opacity: 0;
          }
          100% {
            transform: translateY(0);
            opacity: 1;
          }
        }

        @keyframes dot-pulse {
          0%, 100% {
            transform: translate(-50%, -50%) scale(1);
            opacity: 1;
          }
          50% {
            transform: translate(-50%, -50%) scale(1.3);
            opacity: 0.7;
          }
        }

        @keyframes line-glow {
          0%, 100% {
            box-shadow: 0 0 8px currentColor, 0 0 16px currentColor;
          }
          50% {
            box-shadow: 0 0 12px currentColor, 0 0 24px currentColor, 0 0 32px currentColor;
          }
        }

        .stl-dicom-indicator {
          animation: horizontal-line-appear 0.3s ease-out forwards;
        }

        .stl-dicom-indicator > div:first-child {
          animation: line-glow 2s ease-in-out infinite;
        }

        .stl-dicom-indicator > div:nth-child(2) {
          animation: dot-pulse 1.5s ease-in-out infinite;
        }

        .stl-dicom-indicator {
          transition: top 0.5s ease-in-out !important;
        }
      `;
      document.head.appendChild(style);
    }
  }, []);

  useEffect(() => {
    const canvas = leftRendererRef.current?.domElement;
    if (!canvas) return;

    if (isLinkingActive) {
      canvas.style.cursor = 'crosshair';
      canvas.addEventListener('click', handleSTLClick);
    } else {
      canvas.style.cursor = 'default';
      canvas.removeEventListener('click', handleSTLClick);
      setSelectedMesh(null);
      clearDICOMHighlights();
      resetAllMeshColors();
    }

    return () => {
      canvas.style.cursor = 'default';
      canvas.removeEventListener('click', handleSTLClick);
    };
  }, [isLinkingActive, handleSTLClick, leftRendererRef, clearDICOMHighlights, resetAllMeshColors]);

  return {
    isLinkingActive,
    toggleLinking,
    selectedMesh: selectedMesh ? selectedMesh.userData : null,
    clearDICOMHighlights,
    resetAllMeshColors
  };
};
