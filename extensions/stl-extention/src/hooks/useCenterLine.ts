import { useRef, useCallback, useState, useEffect } from 'react';
import * as THREE from 'three';
import {
  Enums,
} from '@cornerstonejs/core';

interface CenterlinePoint {
  label: string;
  x: number;
  y: number;
  z: number;
}

interface UseCenterLineProps {
  meshRefs: React.RefObject<{ left: THREE.Mesh[]; right: THREE.Mesh[] }>;
  leftSceneRef: React.RefObject<THREE.Scene>;
  rightSceneRef: React.RefObject<THREE.Scene>;
  servicesManager?: any;
  centerlinePoints?: CenterlinePoint[];
}

export const useCenterLine = ({
  meshRefs,
  leftSceneRef,
  rightSceneRef,
  servicesManager,
  centerlinePoints = []
}: UseCenterLineProps) => {
  const centerLineRefs = useRef<{
    left: THREE.Mesh | null;
    right: THREE.Mesh | null;
    leftGlow: THREE.Mesh | null;
    rightGlow: THREE.Mesh | null;
    dicomCanvases: Map<string, HTMLCanvasElement>;
  }>({ left: null, right: null, leftGlow: null, rightGlow: null, dicomCanvases: new Map() });

  const originalMaterials = useRef<{
    left: (THREE.Material | THREE.Material[])[];
    right: (THREE.Material | THREE.Material[])[];
  }>({ left: [], right: [] });

  const [centerLineEnabled, setCenterLineEnabled] = useState(false);
  const [transparencyEnabled, setTransparencyEnabled] = useState(true);

  // Store centerline points in both coordinate systems
  const centerLineWorldPointsRef = useRef<Array<[number, number, number]>>([]);
  const vertebraNamesRef = useRef<string[]>([]);

  // Store event listeners for cleanup
  const eventListenersRef = useRef<Array<{ element: any; event: string; handler: (e: any) => void }>>([]);

  /**
   * Get Cornerstone viewports and volume bounds from servicesManager
   */
  const getCornerstoneViewportsAndBounds = useCallback(() => {
    const { cornerstoneViewportService, viewportGridService } = servicesManager?.services || {};

    if (!cornerstoneViewportService || !viewportGridService) {
      console.log('Cornerstone services not available');
      return { viewports: [], volumeBounds: null };
    }

    const viewportState = viewportGridService.getState();
    const viewports = viewportState?.viewports;

    if (!viewports) return { viewports: [], volumeBounds: null };

    const result: Array<{
      viewportId: string;
      viewport: any;
      element: HTMLElement;
      orientation: string;
    }> = [];

    let volumeBounds: { origin: number[]; dimensions: number[]; spacing: number[]; direction: number[] } | null = null;

    const viewportEntries = viewports instanceof Map
      ? Array.from(viewports.entries())
      : Object.entries(viewports);

    viewportEntries.forEach(([viewportId, viewportInfo]: [string, any]) => {
      const viewportOptions = viewportInfo?.viewportOptions || {};

      // Skip STL (3D) viewport
      if (viewportOptions.customLayout === 'stl' || viewportId === 'stlViewport') {
        return;
      }

      try {
        const viewport = cornerstoneViewportService.getCornerstoneViewport(viewportId);
        if (viewport && viewport.element) {
          const orientation = viewportOptions.orientation || 'axial';
          result.push({
            viewportId,
            viewport,
            element: viewport.element,
            orientation
          });

          // Try to get volume bounds from this viewport
          if (!volumeBounds) {
            try {
              const imageData = viewport.getImageData?.();
              if (imageData) {
                volumeBounds = {
                  origin: imageData.origin || [0, 0, 0],
                  dimensions: imageData.dimensions || [512, 512, 100],
                  spacing: imageData.spacing || [1, 1, 1],
                  direction: imageData.direction || [1, 0, 0, 0, 1, 0, 0, 0, 1]
                };
              }
            } catch (e) {
              console.warn('Could not get image data from viewport');
            }
          }
        }
      } catch (e) {
        console.warn(`Error getting viewport ${viewportId}:`, e);
      }
    });

    return { viewports: result, volumeBounds };
  }, [servicesManager]);

  /**
   * Draw centerline on a Cornerstone viewport using worldToCanvas
   */
  const drawCenterlineOnViewport = useCallback((
    viewportId: string,
    viewport: any,
    worldPoints: Array<[number, number, number]>,
    vertebraNames: string[] = []
  ) => {
    if (!viewport || worldPoints.length < 2) return;

    const element = viewport.element;
    if (!element) return;

    // Get or create canvas overlay
    let canvas = centerLineRefs.current.dicomCanvases.get(viewportId);

    if (!canvas) {
      canvas = document.createElement('canvas');
      canvas.className = 'centerline-overlay-canvas';
      canvas.style.cssText = `
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        pointer-events: none;
        z-index: 50;
      `;

      // Append to the viewport element's parent
      const parent = element.parentElement || element;
      parent.style.position = 'relative';
      parent.appendChild(canvas);
      centerLineRefs.current.dicomCanvases.set(viewportId, canvas);
    }

    const rect = element.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Get camera info to determine view type
    const camera = viewport.getCamera?.();
    if (!camera) return;

    // Determine view orientation from camera
    const { viewPlaneNormal, focalPoint } = camera;
    const absNormal = viewPlaneNormal.map((n: number) => Math.abs(n));
    const maxIndex = absNormal.indexOf(Math.max(...absNormal));

    let viewType = 'axial';
    if (maxIndex === 0) viewType = 'sagittal';
    else if (maxIndex === 1) viewType = 'coronal';
    else viewType = 'axial';

    // Convert world points to canvas coordinates
    const canvasPoints: Array<{ x: number; y: number; distance: number; originalIndex: number }> = [];

    // Get volume info for calculating world-space offsets
    const imageData = viewport.getImageData?.();
    const volumeSpacing = imageData?.spacing || [1, 1, 1];
    const volumeDimensions = imageData?.dimensions || [512, 512, 100];
    const volumeHeight = volumeDimensions[2] * volumeSpacing[2]; // Z extent in mm

    // Get volume center for reference
    const volumeOrigin = imageData?.origin || [0, 0, 0];
    const volumeCenter = [
      volumeOrigin[0] + (volumeDimensions[0] * volumeSpacing[0]) / 2,
      volumeOrigin[1] + (volumeDimensions[1] * volumeSpacing[1]) / 2,
      volumeOrigin[2] + (volumeDimensions[2] * volumeSpacing[2]) / 2
    ];

    // Calculate volume Y size for axial adjustment
    const volumeYSize = volumeDimensions[1] * volumeSpacing[1]; // Y extent in mm (anterior-posterior)

    worldPoints.forEach((worldPoint, idx) => {
      try {
        // Apply view-specific world coordinate adjustments
        let adjustedWorldPoint = [...worldPoint] as [number, number, number];

        if (viewType === 'sagittal') {
          adjustedWorldPoint[2] = worldPoint[2] - volumeHeight * 0.02;
        } else if (viewType === 'coronal') {
          // For coronal: small downward offset
          adjustedWorldPoint[2] = worldPoint[2] - volumeHeight * 0.02;
        }

        const canvasPoint = viewport.worldToCanvas(adjustedWorldPoint);
        if (canvasPoint && !isNaN(canvasPoint[0]) && !isNaN(canvasPoint[1])) {
          // Calculate distance from focal plane
          let distance = 0;
          if (viewType === 'axial') {
            distance = Math.abs(worldPoint[2] - focalPoint[2]);
          } else if (viewType === 'sagittal') {
            distance = Math.abs(worldPoint[0] - focalPoint[0]);
          } else if (viewType === 'coronal') {
            distance = Math.abs(worldPoint[1] - focalPoint[1]);
          }

          canvasPoints.push({
            x: canvasPoint[0],
            y: canvasPoint[1],
            distance,
            originalIndex: idx
          });
        }
      } catch (e) {
        // Point couldn't be converted
      }
    });

    if (canvasPoints.length === 0) return;

    // Cyan color scheme (like Canon Vitrea)
    const color = '#00e5ff';
    const glowColor = 'rgba(0, 229, 255, 0.4)';

    ctx.save();

    if (viewType === 'axial') {
      // For axial view, find the point closest to the current slice and draw a crosshair
      const closestPoint = canvasPoints.reduce((prev, curr) =>
        prev.distance < curr.distance ? prev : curr
      );

      // Only draw if the point is close to the current slice (within a threshold)
      const sliceThickness = 10; // mm threshold
      if (closestPoint.distance < sliceThickness) {
        const size = 20;
        const { x, y } = closestPoint;

        // Check if point is within canvas bounds
        if (x >= 0 && x <= canvas.width && y >= 0 && y <= canvas.height) {
          // Draw glow
          ctx.shadowColor = color;
          ctx.shadowBlur = 15;
          ctx.strokeStyle = glowColor;
          ctx.lineWidth = 5;

          ctx.beginPath();
          ctx.moveTo(x - size, y);
          ctx.lineTo(x + size, y);
          ctx.stroke();

          ctx.beginPath();
          ctx.moveTo(x, y - size);
          ctx.lineTo(x, y + size);
          ctx.stroke();

          // Draw main crosshair
          ctx.shadowBlur = 0;
          ctx.strokeStyle = color;
          ctx.lineWidth = 3;

          ctx.beginPath();
          ctx.moveTo(x - size, y);
          ctx.lineTo(x + size, y);
          ctx.stroke();

          ctx.beginPath();
          ctx.moveTo(x, y - size);
          ctx.lineTo(x, y + size);
          ctx.stroke();

          // Draw center dot
          ctx.beginPath();
          ctx.fillStyle = color;
          ctx.arc(x, y, 5, 0, Math.PI * 2);
          ctx.fill();

          // Draw label for closest vertebra
          const name = vertebraNames[closestPoint.originalIndex];
          if (name) {
            ctx.shadowBlur = 0;
            ctx.font = 'bold 14px Arial';
            ctx.fillStyle = color;
            ctx.fillText(name, x + size + 6, y + 5);
          }
        }
      }
    } else {
      // For sagittal and coronal views, draw the full centerline
      const threshold = 500; // mm - large threshold to show all points
      const visiblePoints = canvasPoints.filter(p => p.distance < threshold);

      // Sort by canvas Y to draw a smooth line
      const sortedPoints = [...visiblePoints].sort((a, b) => a.y - b.y);

      if (sortedPoints.length >= 2) {
        // Filter to points within canvas bounds
        const validPoints = sortedPoints.filter(p =>
          p.x >= -50 && p.x <= canvas.width + 50 &&
          p.y >= -50 && p.y <= canvas.height + 50
        );

        if (validPoints.length >= 2) {
          // Draw cross-section lines first (behind everything else)
          validPoints.forEach(point => {
            const name = vertebraNames[point.originalIndex];
            if (name) {
              ctx.beginPath();
              ctx.strokeStyle = 'rgba(0, 229, 255, 0.25)';
              ctx.lineWidth = 1;
              ctx.setLineDash([4, 4]);
              ctx.moveTo(0, point.y);
              ctx.lineTo(canvas.width, point.y);
              ctx.stroke();
              ctx.setLineDash([]);
            }
          });

          // Smooth curve helper using quadratic Bezier through midpoints
          const drawSmoothCurve = (pts: typeof validPoints) => {
            if (pts.length < 3) {
              pts.forEach((p, i) => { if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y); });
              return;
            }
            ctx.moveTo(pts[0].x, pts[0].y);
            for (let i = 1; i < pts.length - 1; i++) {
              const xc = (pts[i].x + pts[i + 1].x) / 2;
              const yc = (pts[i].y + pts[i + 1].y) / 2;
              ctx.quadraticCurveTo(pts[i].x, pts[i].y, xc, yc);
            }
            const last = pts[pts.length - 1];
            ctx.lineTo(last.x, last.y);
          };

          // Draw glow path
          ctx.beginPath();
          ctx.strokeStyle = glowColor;
          ctx.lineWidth = 8;
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          ctx.shadowColor = color;
          ctx.shadowBlur = 20;
          drawSmoothCurve(validPoints);
          ctx.stroke();

          // Draw main path
          ctx.beginPath();
          ctx.strokeStyle = color;
          ctx.lineWidth = 4;
          ctx.shadowBlur = 0;
          drawSmoothCurve(validPoints);
          ctx.stroke();

          // Draw dots at each vertebra center
          validPoints.forEach(point => {
            ctx.beginPath();
            ctx.fillStyle = color;
            ctx.shadowColor = color;
            ctx.shadowBlur = 10;
            ctx.arc(point.x, point.y, 4, 0, Math.PI * 2);
            ctx.fill();
          });

          // Draw vertebra text labels
          ctx.shadowBlur = 0;
          validPoints.forEach(point => {
            const name = vertebraNames[point.originalIndex];
            if (!name) return;

            const labelX = point.x - 55;
            const labelY = point.y;

            // Draw connecting line from dot to label
            ctx.beginPath();
            ctx.strokeStyle = 'rgba(0, 229, 255, 0.5)';
            ctx.lineWidth = 1;
            ctx.moveTo(point.x - 5, point.y);
            ctx.lineTo(labelX + 30, labelY);
            ctx.stroke();

            // Draw label background
            ctx.font = 'bold 14px Arial';
            const textWidth = ctx.measureText(name).width;
            const bgPadding = 4;
            ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
            ctx.fillRect(
              labelX - bgPadding,
              labelY - 10 - bgPadding,
              textWidth + bgPadding * 2,
              14 + bgPadding * 2
            );

            // Draw label text
            ctx.fillStyle = color;
            ctx.fillText(name, labelX, labelY + 4);
          });
        }
      }
    }

    ctx.restore();
  }, []);

  /**
   * Redraw centerlines on all viewports
   */
  const redrawAllCenterlines = useCallback(() => {
    const worldPoints = centerLineWorldPointsRef.current;
    const names = vertebraNamesRef.current;
    if (worldPoints.length < 2) return;

    const { viewports } = getCornerstoneViewportsAndBounds();
    viewports.forEach(({ viewportId, viewport }) => {
      drawCenterlineOnViewport(viewportId, viewport, worldPoints, names);
    });
  }, [getCornerstoneViewportsAndBounds, drawCenterlineOnViewport]);

  /**
   * Setup event listeners for viewport changes
   */
  const setupEventListeners = useCallback(() => {
    // Clean up existing listeners
    eventListenersRef.current.forEach(({ element, event, handler }) => {
      try { element.removeEventListener(event, handler); } catch (e) {}
    });
    eventListenersRef.current = [];

    const { viewports } = getCornerstoneViewportsAndBounds();

    viewports.forEach(({ viewportId, viewport, element }) => {
      // Debounced redraw handler
      let timeout: NodeJS.Timeout | null = null;
      const handleChange = () => {
        if (timeout) clearTimeout(timeout);
        timeout = setTimeout(() => {
          if (centerLineWorldPointsRef.current.length > 0) {
            drawCenterlineOnViewport(viewportId, viewport, centerLineWorldPointsRef.current, vertebraNamesRef.current);
          }
        }, 16);
      };

      // Cornerstone events
      const cornerstoneEvents = [
        Enums.Events.CAMERA_MODIFIED,
        Enums.Events.VOLUME_NEW_IMAGE,
        Enums.Events.STACK_NEW_IMAGE,
        Enums.Events.IMAGE_RENDERED,
      ];

      cornerstoneEvents.forEach(eventName => {
        if (eventName) {
          element.addEventListener(eventName, handleChange);
          eventListenersRef.current.push({ element, event: eventName, handler: handleChange });
        }
      });

      // Wheel event for scroll
      element.addEventListener('wheel', handleChange);
      eventListenersRef.current.push({ element, event: 'wheel', handler: handleChange });
    });
  }, [getCornerstoneViewportsAndBounds, drawCenterlineOnViewport]);

  /**
   * Remove all DICOM centerlines
   */
  const removeDICOMCenterlines = useCallback(() => {
    // Clean up event listeners
    eventListenersRef.current.forEach(({ element, event, handler }) => {
      try { element.removeEventListener(event, handler); } catch (e) {}
    });
    eventListenersRef.current = [];

    // Remove canvas overlays
    centerLineRefs.current.dicomCanvases.forEach((canvas) => {
      canvas.remove();
    });
    centerLineRefs.current.dicomCanvases.clear();

    // Clear points
    centerLineWorldPointsRef.current = [];
    vertebraNamesRef.current = [];
  }, []);

  /**
   * Build spinal centerline from backend API data directly.
   * Backend supplies {label, x, y, z} in real LPS mm coordinates.
   */
  const calculateSpinalCenterline = useCallback(() => {
    if (centerlinePoints.length < 2) {
      console.warn('No backend centerline points available');
      return null;
    }
    const threePoints = centerlinePoints.map(p => new THREE.Vector3(p.x, p.y, p.z));
    const worldPoints = centerlinePoints.map(p => [p.x, p.y, p.z] as [number, number, number]);
    const vertebraNames = centerlinePoints.map(p => p.label);
    return { threePoints, worldPoints, vertebraNames };
  }, [centerlinePoints]);

  /**
   * Create DICOM centerlines on all viewports
   */
  const createDICOMCenterlines = useCallback((centerData: { threePoints: THREE.Vector3[], worldPoints: Array<[number, number, number]>, vertebraNames: string[] }) => {
    centerLineWorldPointsRef.current = centerData.worldPoints;
    vertebraNamesRef.current = centerData.vertebraNames;

    // Wait for viewports to be ready
    setTimeout(() => {
      const { viewports } = getCornerstoneViewportsAndBounds();

      if (viewports.length === 0) {
        setTimeout(() => {
          redrawAllCenterlines();
          setupEventListeners();
        }, 1000);
        return;
      }

      viewports.forEach(({ viewportId, viewport }) => {
        drawCenterlineOnViewport(viewportId, viewport, centerData.worldPoints, centerData.vertebraNames);
      });

      setupEventListeners();
    }, 500);
  }, [getCornerstoneViewportsAndBounds, drawCenterlineOnViewport, setupEventListeners, redrawAllCenterlines]);

  // Material handling functions
  const makeMeshesTransparent = useCallback(() => {
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

      const applyTransparency = (mesh: THREE.Mesh) => {
        if (Array.isArray(mesh.material)) {
          mesh.material.forEach(mat => {
            if (mat instanceof THREE.Material) {
              mat.transparent = true;
              mat.opacity = 0.2;
              if (mat instanceof THREE.MeshPhongMaterial) {
                mat.color = new THREE.Color(0xffffff);
                mat.emissive = new THREE.Color(0xaaaaaa);
                mat.emissiveIntensity = 0.7;
                mat.needsUpdate = true;
              }
            }
          });
        } else {
          mesh.material.transparent = true;
          mesh.material.opacity = 0.2;
          if (mesh.material instanceof THREE.MeshPhongMaterial) {
            mesh.material.color = new THREE.Color(0xffffff);
            mesh.material.emissive = new THREE.Color(0xaaaaaa);
            mesh.material.emissiveIntensity = 0.7;
            mesh.material.needsUpdate = true;
          }
        }
      };

      meshRefs.current.left.forEach(applyTransparency);
      meshRefs.current.right.forEach(applyTransparency);
    }
  }, [meshRefs]);

  const restoreOriginalMaterials = useCallback(() => {
    if (meshRefs.current && originalMaterials.current.left.length > 0) {
      meshRefs.current.left.forEach((mesh, index) => {
        if (Array.isArray(mesh.material)) {
          mesh.material.forEach(mat => mat.dispose());
        } else {
          mesh.material.dispose();
        }

        const originalMaterial = originalMaterials.current.left[index];
        if (Array.isArray(originalMaterial)) {
          mesh.material = originalMaterial.map(mat => mat.clone());
        } else {
          mesh.material = (originalMaterial as THREE.Material).clone();
        }
      });

      meshRefs.current.right.forEach((mesh, index) => {
        if (Array.isArray(mesh.material)) {
          mesh.material.forEach(mat => mat.dispose());
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

      originalMaterials.current = { left: [], right: [] };
    }
  }, [meshRefs]);

  const toggleTransparency = useCallback(() => {
    if (!centerLineEnabled) return;

    if (transparencyEnabled) {
      // Turn off transparency - restore original materials
      restoreOriginalMaterials();
      setTransparencyEnabled(false);
    } else {
      // Turn on transparency
      makeMeshesTransparent();
      setTransparencyEnabled(true);
    }
  }, [centerLineEnabled, transparencyEnabled, restoreOriginalMaterials, makeMeshesTransparent]);

  const removeCenterLine = useCallback(() => {
    // Remove 3D centerlines
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

    // Remove DICOM centerlines
    removeDICOMCenterlines();

    centerLineRefs.current = {
      ...centerLineRefs.current,
      left: null,
      right: null,
      leftGlow: null,
      rightGlow: null
    };

    restoreOriginalMaterials();
    setCenterLineEnabled(false);
    setTransparencyEnabled(true);
  }, [leftSceneRef, rightSceneRef, restoreOriginalMaterials, removeDICOMCenterlines]);

  const showCenterLine = useCallback(() => {
    removeCenterLine();

    const centerData = calculateSpinalCenterline();
    if (!centerData || centerData.threePoints.length < 2) {
      console.warn('Not enough points for centerline');
      return;
    }

    const { threePoints } = centerData;

    // Create 3D tube (cyan color)
    const curve = new THREE.CatmullRomCurve3(threePoints);

    const tubeGeometry = new THREE.TubeGeometry(curve, threePoints.length * 20, 1.5, 8, false);
    const tubeMaterial = new THREE.MeshBasicMaterial({ color: 0x00e5ff, transparent: true, opacity: 1.0 });

    const leftTube = new THREE.Mesh(tubeGeometry, tubeMaterial);
    const rightTube = new THREE.Mesh(tubeGeometry.clone(), tubeMaterial);

    const glowTubeGeometry = new THREE.TubeGeometry(curve, threePoints.length * 20, 2.5, 8, false);
    const glowMaterial = new THREE.MeshBasicMaterial({ color: 0x00b8cc, transparent: true, opacity: 0.6 });

    const leftGlowTube = new THREE.Mesh(glowTubeGeometry, glowMaterial);
    const rightGlowTube = new THREE.Mesh(glowTubeGeometry.clone(), glowMaterial);

    leftSceneRef.current?.add(leftGlowTube);
    leftSceneRef.current?.add(leftTube);
    rightSceneRef.current?.add(rightGlowTube);
    rightSceneRef.current?.add(rightTube);

    centerLineRefs.current = {
      ...centerLineRefs.current,
      left: leftTube,
      right: rightTube,
      leftGlow: leftGlowTube,
      rightGlow: rightGlowTube
    };

    // DICOM overlays (axial/sagittal/coronal) are drawn by spineLabelOverlayManager
    // using the same API points — no duplication needed here.

    makeMeshesTransparent();
    setCenterLineEnabled(true);
    setTransparencyEnabled(true);
  }, [
    calculateSpinalCenterline,
    leftSceneRef,
    rightSceneRef,
    makeMeshesTransparent,
    removeCenterLine
  ]);

  const toggleCenterLine = useCallback(() => {
    if (centerLineRefs.current.left) {
      removeCenterLine();
    } else {
      showCenterLine();
    }
  }, [showCenterLine, removeCenterLine]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      eventListenersRef.current.forEach(({ element, event, handler }) => {
        try { element.removeEventListener(event, handler); } catch (e) {}
      });
      centerLineRefs.current.dicomCanvases.forEach(canvas => canvas.remove());
    };
  }, []);

  return {
    showCenterLine,
    removeCenterLine,
    toggleCenterLine,
    toggleTransparency,
    hasCenterLine: !!centerLineRefs.current.left,
    centerLineEnabled,
    transparencyEnabled
  };
};
