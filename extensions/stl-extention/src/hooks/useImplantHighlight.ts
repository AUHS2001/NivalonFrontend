import { useRef, useCallback, useState, useEffect } from 'react';
import * as THREE from 'three';
import { Enums } from '@cornerstonejs/core';

interface UseImplantHighlightProps {
  meshRefs: React.RefObject<{ left: THREE.Mesh[]; right: THREE.Mesh[] }>;
  servicesManager?: any;
  showMerge: boolean;
}

interface ImplantRegion {
  topVertebra: THREE.Mesh | null;
  bottomVertebra: THREE.Mesh | null;
  implantMesh: THREE.Mesh | null;
  worldBounds: {
    min: [number, number, number];
    max: [number, number, number];
  } | null;
}

export const useImplantHighlight = ({
  meshRefs,
  servicesManager,
  showMerge
}: UseImplantHighlightProps) => {
  const highlightCanvasesRef = useRef<Map<string, HTMLCanvasElement>>(new Map());
  const eventListenersRef = useRef<Array<{ element: any; event: string; handler: (e: any) => void }>>([]);
  const implantRegionRef = useRef<ImplantRegion | null>(null);

  /**
   * Get Cornerstone viewports from servicesManager
   */
  const getCornerstoneViewports = useCallback(() => {
    const { cornerstoneViewportService, viewportGridService } = servicesManager?.services || {};

    if (!cornerstoneViewportService || !viewportGridService) {
      return [];
    }

    const viewportState = viewportGridService.getState();
    const viewports = viewportState?.viewports;

    if (!viewports) return [];

    const result: Array<{
      viewportId: string;
      viewport: any;
      element: HTMLElement;
    }> = [];

    const viewportEntries = viewports instanceof Map
      ? Array.from(viewports.entries())
      : Object.entries(viewports);

    viewportEntries.forEach(([viewportId, viewportInfo]: [string, any]) => {
      const viewportOptions = viewportInfo?.viewportOptions || {};

      // Skip karachi (3D) viewport
      if (viewportOptions.customLayout === 'karachi' || viewportId === 'karachiViewport') {
        return;
      }

      try {
        const viewport = cornerstoneViewportService.getCornerstoneViewport(viewportId);
        if (viewport && viewport.element) {
          result.push({ viewportId, viewport, element: viewport.element });
        }
      } catch (e) {
        console.warn(`Error getting viewport ${viewportId}:`, e);
      }
    });

    return result;
  }, [servicesManager]);

  /**
   * Find the implant mesh and get its actual position
   */
  const detectImplantPosition = useCallback(() => {
    const meshes = meshRefs.current?.left || [];

    // Find the implant mesh
    const implantMesh = meshes.find(mesh =>
      mesh.userData?.isImplant || mesh.userData?.type === 'I'
    );

    if (!implantMesh) {
      console.log('⚠️ No implant found');
      return null;
    }

    console.log('🔧 Found implant:', implantMesh.userData?.fileName);

    // Get implant bounding box in world coordinates
    implantMesh.geometry.computeBoundingBox();
    const implantBBox = implantMesh.geometry.boundingBox!;

    const implantMin = implantBBox.min.clone().applyMatrix4(implantMesh.matrixWorld);
    const implantMax = implantBBox.max.clone().applyMatrix4(implantMesh.matrixWorld);
    const implantCenter = new THREE.Vector3();
    implantBBox.getCenter(implantCenter);
    implantCenter.applyMatrix4(implantMesh.matrixWorld);

    console.log('📍 Implant center:', implantCenter);
    console.log('📍 Implant min:', implantMin);
    console.log('📍 Implant max:', implantMax);

    const region: ImplantRegion = {
      topVertebra: null,
      bottomVertebra: null,
      implantMesh,
      worldBounds: null
    };

    implantRegionRef.current = region;

    // Use the actual implant bounds (slightly padded)
    const padding = 2; // Small padding in STL units
    const regionMin = new THREE.Vector3(
      implantMin.x - padding,
      implantMin.y - padding,
      implantMin.z - padding
    );
    const regionMax = new THREE.Vector3(
      implantMax.x + padding,
      implantMax.y + padding,
      implantMax.z + padding
    );

    return {
      region,
      stlBounds: { min: regionMin, max: regionMax },
      implantCenter
    };
  }, [meshRefs]);

  /**
   * Transform STL coordinates to DICOM world coordinates
   * Uses ratio-based mapping for accurate vertebra-level positioning
   */
  const transformToDICOMWorld = useCallback((
    stlPoint: THREE.Vector3,
    stlBounds: { min: THREE.Vector3; max: THREE.Vector3 },
    volumeBounds: { origin: number[]; dimensions: number[]; spacing: number[] }
  ): [number, number, number] => {
    const stlSize = new THREE.Vector3().subVectors(stlBounds.max, stlBounds.min);

    const volumeSize = [
      volumeBounds.dimensions[0] * volumeBounds.spacing[0],
      volumeBounds.dimensions[1] * volumeBounds.spacing[1],
      volumeBounds.dimensions[2] * volumeBounds.spacing[2]
    ];

    // Calculate ratios: where is the point within the STL bounds (0 to 1)
    // Note: In STL world space with scale.y=-1, max.y is at the bottom, min.y is at the top
    const ratioX = (stlPoint.x - stlBounds.min.x) / stlSize.x;
    const ratioY = (stlPoint.y - stlBounds.min.y) / stlSize.y; // 0=top, 1=bottom in visual
    const ratioZ = (stlPoint.z - stlBounds.min.z) / stlSize.z;

    // Map to DICOM coordinates
    // X: left-right (direct mapping)
    const dicomX = volumeBounds.origin[0] + ratioX * volumeSize[0];

    // Y: anterior-posterior (Z in STL maps to Y in DICOM)
    const dicomY = volumeBounds.origin[1] + ratioZ * volumeSize[1];

    // Z: superior-inferior (Y in STL maps to Z in DICOM)
    // With scale.y=-1: high world Y = bottom of spine visually
    // In DICOM: depends on scan direction, but typically origin is at superior
    // Use direct ratio mapping
    const dicomZ = volumeBounds.origin[2] + ratioY * volumeSize[2];

    console.log('📍 Transform:', {
      stlPoint: { x: stlPoint.x.toFixed(2), y: stlPoint.y.toFixed(2), z: stlPoint.z.toFixed(2) },
      ratios: { x: ratioX.toFixed(2), y: ratioY.toFixed(2), z: ratioZ.toFixed(2) },
      dicom: { x: dicomX.toFixed(2), y: dicomY.toFixed(2), z: dicomZ.toFixed(2) }
    });

    return [dicomX, dicomY, dicomZ];
  }, []);

  /**
   * Draw yellow highlight block on a viewport based on implant center
   */
  const drawHighlightOnViewport = useCallback((
    viewportId: string,
    viewport: any,
    implantWorldCenter: [number, number, number],
    boxWidth: number, // Width of the box in pixels
    boxHeight: number // Height of the box in pixels
  ) => {
    const element = viewport.element;
    if (!element) return;

    // Get or create canvas
    let canvas = highlightCanvasesRef.current.get(viewportId);
    if (!canvas) {
      canvas = document.createElement('canvas');
      canvas.className = 'implant-highlight-canvas';
      canvas.style.cssText = `
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        pointer-events: none;
        z-index: 49;
      `;
      const parent = element.parentElement || element;
      parent.style.position = 'relative';
      parent.appendChild(canvas);
      highlightCanvasesRef.current.set(viewportId, canvas);
    }

    const rect = element.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Get camera info
    const camera = viewport.getCamera?.();
    if (!camera) return;

    const { viewPlaneNormal, focalPoint } = camera;
    const absNormal = viewPlaneNormal.map((n: number) => Math.abs(n));
    const maxIndex = absNormal.indexOf(Math.max(...absNormal));

    let viewType = 'axial';
    if (maxIndex === 0) viewType = 'sagittal';
    else if (maxIndex === 1) viewType = 'coronal';

    // Get volume info
    const imageData = viewport.getImageData?.();
    const volumeSpacing = imageData?.spacing || [1, 1, 1];
    const volumeDimensions = imageData?.dimensions || [512, 512, 100];
    const volumeHeight = volumeDimensions[2] * volumeSpacing[2];
    const volumeOrigin = imageData?.origin || [0, 0, 0];
    const volumeCenter = [
      volumeOrigin[0] + (volumeDimensions[0] * volumeSpacing[0]) / 2,
      volumeOrigin[1] + (volumeDimensions[1] * volumeSpacing[1]) / 2,
      volumeOrigin[2] + (volumeDimensions[2] * volumeSpacing[2]) / 2
    ];

    // Calculate volume size for adjustments
    const volumeSize = [
      volumeDimensions[0] * volumeSpacing[0],
      volumeDimensions[1] * volumeSpacing[1],
      volumeDimensions[2] * volumeSpacing[2]
    ];

    // Use the world center with view-specific adjustments
    let adjustedCenter = [...implantWorldCenter] as [number, number, number];

    // Apply view-specific position corrections
    if (viewType === 'sagittal') {
      // Move anterior (decrease Y) to center on spine body
      adjustedCenter[1] = adjustedCenter[1] - volumeSize[1] * 0.35;
    } else if (viewType === 'axial') {
      // Move anterior (decrease Y) to center on vertebral body
      adjustedCenter[1] = adjustedCenter[1] - volumeSize[1] * 0.20;
    }

    // Convert center to canvas coordinates
    try {
      const canvasPoint = viewport.worldToCanvas(adjustedCenter);
      if (!canvasPoint || isNaN(canvasPoint[0]) || isNaN(canvasPoint[1])) {
        return;
      }

      let centerX = canvasPoint[0];
      let centerY = canvasPoint[1];

      // Calculate box bounds
      const halfWidth = boxWidth / 2;
      const halfHeight = boxHeight / 2;
      const minX = centerX - halfWidth;
      const minY = centerY - halfHeight;

      // Draw yellow highlight block
      ctx.save();

      // Semi-transparent yellow fill
      ctx.fillStyle = 'rgba(255, 255, 0, 0.25)';
      ctx.fillRect(minX, minY, boxWidth, boxHeight);

      // Yellow border with dashed line
      ctx.strokeStyle = 'rgba(255, 200, 0, 0.9)';
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);
      ctx.strokeRect(minX, minY, boxWidth, boxHeight);

      // Solid inner border
      ctx.setLineDash([]);
      ctx.strokeStyle = 'rgba(255, 255, 0, 0.8)';
      ctx.lineWidth = 1;
      ctx.strokeRect(minX + 3, minY + 3, boxWidth - 6, boxHeight - 6);

      ctx.restore();
    } catch (e) {
      console.warn('Could not project implant center');
    }
  }, []);

  /**
   * Draw highlights on all viewports
   */
  const drawAllHighlights = useCallback(() => {
    const implantData = detectImplantPosition();
    if (!implantData) {
      console.log('⚠️ No implant data to highlight');
      return;
    }

    const viewports = getCornerstoneViewports();
    if (viewports.length === 0) return;

    // Get volume bounds from first viewport
    const firstViewport = viewports[0].viewport;
    const imageData = firstViewport.getImageData?.();
    if (!imageData) return;

    const volumeBounds = {
      origin: imageData.origin || [0, 0, 0],
      dimensions: imageData.dimensions || [512, 512, 100],
      spacing: imageData.spacing || [1, 1, 1]
    };

    // Get STL bounds for all meshes (for proper scaling)
    const meshes = meshRefs.current?.left || [];
    const overallBounds = {
      min: new THREE.Vector3(Infinity, Infinity, Infinity),
      max: new THREE.Vector3(-Infinity, -Infinity, -Infinity)
    };

    meshes.forEach(mesh => {
      if (mesh.userData?.isImplant) return; // Skip implant for bounds calculation
      mesh.geometry.computeBoundingBox();
      const bbox = mesh.geometry.boundingBox;
      if (bbox) {
        const min = bbox.min.clone().applyMatrix4(mesh.matrixWorld);
        const max = bbox.max.clone().applyMatrix4(mesh.matrixWorld);
        overallBounds.min.min(min);
        overallBounds.max.max(max);
      }
    });

    // Transform implant CENTER to DICOM world coordinates
    const implantWorldCenter = transformToDICOMWorld(
      implantData.implantCenter,
      overallBounds,
      volumeBounds
    );

    console.log('🟡 Drawing yellow highlight at center:', implantWorldCenter);

    // Use rectangle dimensions (wider than tall)
    const boxWidth = 50;  // Width in pixels
    const boxHeight = 20; // Height in pixels (shorter for rectangle)

    viewports.forEach(({ viewportId, viewport }) => {
      drawHighlightOnViewport(viewportId, viewport, implantWorldCenter, boxWidth, boxHeight);
    });
  }, [detectImplantPosition, getCornerstoneViewports, meshRefs, transformToDICOMWorld, drawHighlightOnViewport]);

  /**
   * Setup event listeners for viewport changes
   */
  const setupEventListeners = useCallback(() => {
    // Clean up existing
    eventListenersRef.current.forEach(({ element, event, handler }) => {
      try { element.removeEventListener(event, handler); } catch (e) {}
    });
    eventListenersRef.current = [];

    if (!showMerge) return;

    const viewports = getCornerstoneViewports();

    viewports.forEach(({ viewportId, viewport, element }) => {
      // Immediate redraw handler (no debounce for smoother tracking)
      const handleChange = () => {
        if (showMerge) {
          requestAnimationFrame(() => {
            drawAllHighlights();
          });
        }
      };

      // Cornerstone events
      const cornerstoneEvents = [
        Enums.Events.CAMERA_MODIFIED,
        Enums.Events.VOLUME_NEW_IMAGE,
        Enums.Events.IMAGE_RENDERED,
      ];

      cornerstoneEvents.forEach(eventName => {
        if (eventName) {
          element.addEventListener(eventName, handleChange);
          eventListenersRef.current.push({ element, event: eventName, handler: handleChange });
        }
      });

      // Mouse/touch events for drag and zoom
      const mouseEvents = ['wheel', 'mouseup', 'mousemove', 'touchend', 'touchmove'];
      mouseEvents.forEach(eventName => {
        element.addEventListener(eventName, handleChange);
        eventListenersRef.current.push({ element, event: eventName, handler: handleChange });
      });
    });
  }, [showMerge, getCornerstoneViewports, drawAllHighlights]);

  /**
   * Remove all highlights
   */
  const removeHighlights = useCallback(() => {
    eventListenersRef.current.forEach(({ element, event, handler }) => {
      try { element.removeEventListener(event, handler); } catch (e) {}
    });
    eventListenersRef.current = [];

    highlightCanvasesRef.current.forEach(canvas => canvas.remove());
    highlightCanvasesRef.current.clear();

    implantRegionRef.current = null;
  }, []);

  /**
   * Show highlights when merge is active
   */
  const showHighlights = useCallback(() => {
    console.log('🟡 Showing implant highlights');
    removeHighlights();

    // Delay to ensure viewports are ready
    setTimeout(() => {
      drawAllHighlights();
      setupEventListeners();
    }, 500);
  }, [removeHighlights, drawAllHighlights, setupEventListeners]);

  // Effect to show/hide highlights based on showMerge state
  useEffect(() => {
    if (showMerge) {
      showHighlights();
    } else {
      removeHighlights();
    }

    return () => {
      removeHighlights();
    };
  }, [showMerge, showHighlights, removeHighlights]);

  return {
    showHighlights,
    removeHighlights,
    detectImplantPosition
  };
};
