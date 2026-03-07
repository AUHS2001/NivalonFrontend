import React, { createContext, useContext, useReducer, useCallback, useRef } from 'react';
import * as THREE from 'three';
import { Measurement, MeshRefs, BoneDimension } from './types/three.types';

// Types
interface MeasurementState {
  measurements: Measurement[];
  measurementEnabled: boolean;
  tempPoints: THREE.Vector3[];
  isMeasuring: boolean;
}

interface MeasurementContextType extends MeasurementState {
  toggleMeasurement: () => void;
  clearMeasurements: () => void;
  removeMeasurement: (id: string) => void;
  addMeasurementPoint: (position: THREE.Vector3) => void;
  getMeasurementStats: () => any;
  exportMeasurements: () => string;
  calculateBoneDimensions: () => BoneDimension[];
  setupMeasurementMode: (config: {
    leftRendererRef: React.MutableRefObject<THREE.WebGLRenderer | undefined>;
    leftSceneRef: React.MutableRefObject<THREE.Scene>;
    cameraRef: React.MutableRefObject<THREE.PerspectiveCamera | undefined>;
    meshRefs: React.MutableRefObject<MeshRefs>;
  }) => void;
  cleanupMeasurementMode: () => void;
  updateMeasurementsOnBoneMove: () => void;
}

// Initial state
const initialState: MeasurementState = {
  measurements: [],
  measurementEnabled: false,
  tempPoints: [],
  isMeasuring: false,
};

// Action types
type MeasurementAction =
  | { type: 'TOGGLE_MEASUREMENT' }
  | { type: 'ADD_MEASUREMENT'; payload: Measurement }
  | { type: 'REMOVE_MEASUREMENT'; payload: string }
  | { type: 'CLEAR_MEASUREMENTS' }
  | { type: 'ADD_TEMP_POINT'; payload: THREE.Vector3 }
  | { type: 'CLEAR_TEMP_POINTS' }
  | { type: 'SET_IS_MEASURING'; payload: boolean };

// Reducer
function measurementReducer(state: MeasurementState, action: MeasurementAction): MeasurementState {
  switch (action.type) {
    case 'TOGGLE_MEASUREMENT':
      return {
        ...state,
        measurementEnabled: !state.measurementEnabled,
        tempPoints: [],
        isMeasuring: false,
      };
    case 'ADD_MEASUREMENT':
      return {
        ...state,
        measurements: [...state.measurements, action.payload],
        tempPoints: [],
        isMeasuring: false,
      };
    case 'REMOVE_MEASUREMENT':
      return {
        ...state,
        measurements: state.measurements.filter(m => m.id !== action.payload),
      };
    case 'CLEAR_MEASUREMENTS':
      return {
        ...state,
        measurements: [],
        tempPoints: [],
        isMeasuring: false,
      };
    case 'ADD_TEMP_POINT':
      return {
        ...state,
        tempPoints: [...state.tempPoints, action.payload],
        isMeasuring: true,
      };
    case 'CLEAR_TEMP_POINTS':
      return {
        ...state,
        tempPoints: [],
        isMeasuring: false,
      };
    case 'SET_IS_MEASURING':
      return {
        ...state,
        isMeasuring: action.payload,
      };
    default:
      return state;
  }
}

// Context
const MeasurementContext = createContext<MeasurementContextType | undefined>(undefined);

// Provider component
interface MeasurementProviderProps {
  children: React.ReactNode;
}

export const MeasurementProvider: React.FC<MeasurementProviderProps> = ({ children }) => {
  const [state, dispatch] = useReducer(measurementReducer, initialState);

  // Refs for Three.js objects
  const leftRendererRef = useRef<THREE.WebGLRenderer>();
  const leftSceneRef = useRef<THREE.Scene>();
  const cameraRef = useRef<THREE.PerspectiveCamera>();
  const meshRefs = useRef<MeshRefs>();
  const tempVisualsRef = useRef<{ points: THREE.Mesh[]; lines: THREE.Line[]; textLabel?: THREE.Sprite }>({ points: [], lines: [], textLabel: undefined });
  const measurementIdCounter = useRef<number>(0);
  const clickHandlerRef = useRef<((event: MouseEvent) => void) | null>(null);

  // Add this ref to track tempPoints without stale closures
  const tempPointsRef = useRef<THREE.Vector3[]>([]);

  // Track bone attachments for each measurement point
  const measurementBoneAttachments = useRef<Map<string, {
    point1BoneIndex: number | null;
    point1LocalOffset: THREE.Vector3 | null;
    point2BoneIndex: number | null;
    point2LocalOffset: THREE.Vector3 | null;
  }>>(new Map());

  // Sync the ref with state
  React.useEffect(() => {
    tempPointsRef.current = state.tempPoints;
  }, [state.tempPoints]);

  // Helper functions
  const generateMeasurementId = useCallback(() => {
    return `measurement_${Date.now()}_${measurementIdCounter.current++}`;
  }, []);

  const createMeasurementPoint = useCallback((position: THREE.Vector3, color: number = 0xff0000): THREE.Mesh => {
    const geometry = new THREE.SphereGeometry(0.3, 16, 16); // Slightly larger for better visibility
    const material = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.9
    });
    const sphere = new THREE.Mesh(geometry, material);
    sphere.position.copy(position);
    sphere.userData = { isMeasurementPoint: true };
    return sphere;
  }, []);

  const createMeasurementLine = useCallback((start: THREE.Vector3, end: THREE.Vector3, color: number = 0x00ff00): THREE.Line => {
    const geometry = new THREE.BufferGeometry().setFromPoints([start, end]);
    const material = new THREE.LineBasicMaterial({
      color,
      linewidth: 3, // Thicker line
      transparent: true,
      opacity: 1.0 // Full opacity
    });
    const line = new THREE.Line(geometry, material);
    line.userData = { isMeasurementLine: true };
    return line;
  }, []);

  // Create distance text label to show on the measurement line
  const createDistanceTextLabel = useCallback((position: THREE.Vector3, distance: number): THREE.Sprite => {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d')!;

    canvas.width = 512;
    canvas.height = 256;

    context.clearRect(0, 0, canvas.width, canvas.height);

    const distanceText = `${distance.toFixed(2)} mm`;
    const fontSize = 48;
    const padding = 40;

    // Set font first to measure text correctly
    context.font = `bold ${fontSize}px Arial`;
    const textMetrics = context.measureText(distanceText);
    const textWidth = textMetrics.width;

    // Calculate rectangle dimensions based on text size
    const rectWidth = textWidth + padding * 2;
    const rectHeight = fontSize + padding;
    const rectX = (canvas.width - rectWidth) / 2;
    const rectY = (canvas.height - rectHeight) / 2;

    // Draw rounded rectangle background
    context.fillStyle = 'rgba(0, 0, 0, 0.9)';
    context.beginPath();
    context.roundRect(rectX, rectY, rectWidth, rectHeight, 15);
    context.fill();

    // Glow effect border
    context.shadowColor = '#00ff00';
    context.shadowBlur = 20;
    context.strokeStyle = '#00ff00';
    context.lineWidth = 3;
    context.beginPath();
    context.roundRect(rectX, rectY, rectWidth, rectHeight, 15);
    context.stroke();
    context.shadowBlur = 0;

    // Draw text centered in the rectangle
    context.fillStyle = '#ffffff';
    context.font = `bold ${fontSize}px Arial`;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(distanceText, canvas.width / 2, canvas.height / 2);

    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;

    const spriteMaterial = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      opacity: 0.95,
      depthTest: false
    });

    const sprite = new THREE.Sprite(spriteMaterial);
    sprite.position.copy(position);
    sprite.position.y += 1.5; // Offset slightly above the line
    sprite.scale.set(10, 5, 1); // Scale for visibility
    sprite.userData = {
      isDistanceTextLabel: true,
      distance: distance,
      text: distanceText
    };

    return sprite;
  }, []);

  // Store the last intersected mesh for bone attachment tracking
  const lastIntersectedMeshRef = useRef<THREE.Mesh | null>(null);

  // Track initial bone positions AND original point positions when measurement was created
  const measurementOriginalDataRef = useRef<Map<string, {
    originalPoint1: THREE.Vector3;
    originalPoint2: THREE.Vector3;
    point1BonePos: THREE.Vector3 | null;
    point2BonePos: THREE.Vector3 | null;
  }>>(new Map());

  // Find bone attachment using the actual intersected mesh from raycasting
  const findBoneAttachmentFromMesh = useCallback((worldPoint: THREE.Vector3, intersectedMesh: THREE.Mesh | null): {
    boneIndex: number | null;
    localOffset: THREE.Vector3 | null;
    initialBonePos: THREE.Vector3 | null;
  } => {
    if (!meshRefs.current || !intersectedMesh) return { boneIndex: null, localOffset: null, initialBonePos: null };

    const meshes = meshRefs.current.left;

    // Find the index of the intersected mesh
    const boneIndex = meshes.findIndex(mesh => mesh === intersectedMesh);

    if (boneIndex === -1) {
      // Try to find in right meshes and map to left
      const rightIndex = meshRefs.current.right.findIndex(mesh => mesh === intersectedMesh);
      if (rightIndex !== -1 && meshes[rightIndex]) {
        const bone = meshes[rightIndex];
        const localOffset = worldPoint.clone().sub(bone.position);
        return {
          boneIndex: rightIndex,
          localOffset,
          initialBonePos: bone.position.clone()
        };
      }
      return { boneIndex: null, localOffset: null, initialBonePos: null };
    }

    const bone = meshes[boneIndex];
    // Calculate local offset (point position relative to bone position)
    const localOffset = worldPoint.clone().sub(bone.position);

    return {
      boneIndex,
      localOffset,
      initialBonePos: bone.position.clone()
    };
  }, []);

  const getSurfaceIntersection = useCallback((mouse: THREE.Vector2): THREE.Vector3 | null => {
    if (!leftRendererRef.current || !cameraRef.current || !meshRefs.current) {
      return null;
    }

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, cameraRef.current);

    const meshes = [
      ...meshRefs.current.left.filter(mesh => mesh.visible),
      ...meshRefs.current.right.filter(mesh => mesh.visible)
    ];

    if (meshes.length === 0) {
      return null;
    }

    const intersects = raycaster.intersectObjects(meshes, false);
    if (intersects.length > 0) {
      // Store the intersected mesh for bone attachment tracking
      lastIntersectedMeshRef.current = intersects[0].object as THREE.Mesh;
      return intersects[0].point;
    }

    lastIntersectedMeshRef.current = null;
    return null;
  }, []);

  const calculate3DDistance = useCallback((point1: THREE.Vector3, point2: THREE.Vector3) => {
    const distance = point1.distanceTo(point2);
    const vector = new THREE.Vector3().subVectors(point2, point1);
    const midpoint = new THREE.Vector3().addVectors(point1, point2).multiplyScalar(0.5);
    const direction = vector.clone().normalize();

    const angleXY = Math.atan2(vector.y, vector.x) * (180 / Math.PI);
    const angleXZ = Math.atan2(vector.z, vector.x) * (180 / Math.PI);
    const angleYZ = Math.atan2(vector.z, vector.y) * (180 / Math.PI);

    return {
      distance,
      vector,
      midpoint,
      direction,
      angles: { xy: angleXY, xz: angleXZ, yz: angleYZ }
    };
  }, []);

  const cleanupTempVisuals = useCallback(() => {
    if (!leftSceneRef.current) return;

    tempVisualsRef.current.points.forEach(point => {
      leftSceneRef.current!.remove(point);
      point.geometry.dispose();
      point.material.dispose();
    });

    tempVisualsRef.current.lines.forEach(line => {
      leftSceneRef.current!.remove(line);
      line.geometry.dispose();
      line.material.dispose();
    });

    if (tempVisualsRef.current.textLabel) {
      leftSceneRef.current!.remove(tempVisualsRef.current.textLabel);
      tempVisualsRef.current.textLabel.material.dispose();
      (tempVisualsRef.current.textLabel.material as THREE.SpriteMaterial).map?.dispose();
    }

    tempVisualsRef.current = { points: [], lines: [], textLabel: undefined };
  }, []);

  const removeMeasurementVisuals = useCallback((visualElements: { points: THREE.Mesh[]; lines: THREE.Line[]; textLabel?: THREE.Sprite }) => {
    visualElements.points.forEach(point => {
      if (point.parent) {
        point.parent.remove(point);
      }
      point.geometry.dispose();
      point.material.dispose();
    });

    visualElements.lines.forEach(line => {
      if (line.parent) {
        line.parent.remove(line);
      }
      line.geometry.dispose();
      line.material.dispose();
    });

    if (visualElements.textLabel) {
      if (visualElements.textLabel.parent) {
        visualElements.textLabel.parent.remove(visualElements.textLabel);
      }
      visualElements.textLabel.material.dispose();
      (visualElements.textLabel.material as THREE.SpriteMaterial).map?.dispose();
    }
  }, []);

  // Public API methods
  const toggleMeasurement = useCallback(() => {
    if (state.measurementEnabled) {
      // When turning OFF, clean up any temporary visuals
      cleanupTempVisuals();
    }
    dispatch({ type: 'TOGGLE_MEASUREMENT' });
  }, [state.measurementEnabled, cleanupTempVisuals]);

  const clearMeasurements = useCallback(() => {
    console.log('Clearing all measurements');

    // Remove visual elements from scene
    state.measurements.forEach(measurement => {
      if (measurement.visualElements) {
        removeMeasurementVisuals(measurement.visualElements);
      }
    });

    cleanupTempVisuals();
    dispatch({ type: 'CLEAR_MEASUREMENTS' });
  }, [state.measurements, removeMeasurementVisuals, cleanupTempVisuals]);

  const removeMeasurement = useCallback((id: string) => {
    console.log('Removing measurement:', id);

    const measurementToRemove = state.measurements.find(meas => meas.id === id);
    if (measurementToRemove && measurementToRemove.visualElements) {
      removeMeasurementVisuals(measurementToRemove.visualElements);
    }
    dispatch({ type: 'REMOVE_MEASUREMENT', payload: id });
  }, [state.measurements, removeMeasurementVisuals]);

  // Store the first point's intersected mesh
  const firstPointMeshRef = useRef<THREE.Mesh | null>(null);

  // FIXED: Use ref to avoid stale closure
  const addMeasurementPoint = useCallback((position: THREE.Vector3) => {
    if (!leftSceneRef.current) return;

    console.log('Adding measurement point:', position);
    console.log('Current tempPoints from ref:', tempPointsRef.current);

    // Use the ref to get current tempPoints (no stale closure)
    const currentTempPoints = [...tempPointsRef.current, position];

    // Add visual point marker
    const pointMesh = createMeasurementPoint(position);
    leftSceneRef.current.add(pointMesh);
    tempVisualsRef.current.points.push(pointMesh);

    console.log('After adding, tempPoints length:', currentTempPoints.length);

    // If we have two points, create measurement
    if (currentTempPoints.length === 2) {
      console.log('Creating measurement with points:', currentTempPoints);

      const measurementData = calculate3DDistance(currentTempPoints[0], currentTempPoints[1]);

      // Create measurement line
      const line = createMeasurementLine(currentTempPoints[0], currentTempPoints[1]);
      leftSceneRef.current.add(line);

      // Create distance text label at the midpoint of the line
      const textLabel = createDistanceTextLabel(measurementData.midpoint, measurementData.distance);
      leftSceneRef.current.add(textLabel);

      // Create measurement object
      const measurementId = generateMeasurementId();
      const measurement: Measurement = {
        id: measurementId,
        point1: currentTempPoints[0].clone(),
        point2: currentTempPoints[1].clone(),
        distance: measurementData.distance,
        vector: measurementData.vector,
        midpoint: measurementData.midpoint,
        direction: measurementData.direction,
        angles: measurementData.angles,
        timestamp: new Date(),
        visualElements: {
          points: [...tempVisualsRef.current.points], // Keep all points
          lines: [line],
          textLabel: textLabel
        }
      };

      // Store bone attachments using the actual intersected meshes
      const point1Attachment = findBoneAttachmentFromMesh(currentTempPoints[0], firstPointMeshRef.current);
      const point2Attachment = findBoneAttachmentFromMesh(currentTempPoints[1], lastIntersectedMeshRef.current);

      console.log('Point 1 attachment:', point1Attachment);
      console.log('Point 2 attachment:', point2Attachment);

      measurementBoneAttachments.current.set(measurementId, {
        point1BoneIndex: point1Attachment.boneIndex,
        point1LocalOffset: point1Attachment.localOffset,
        point2BoneIndex: point2Attachment.boneIndex,
        point2LocalOffset: point2Attachment.localOffset
      });

      // Store original point positions and initial bone positions
      measurementOriginalDataRef.current.set(measurementId, {
        originalPoint1: currentTempPoints[0].clone(),
        originalPoint2: currentTempPoints[1].clone(),
        point1BonePos: point1Attachment.initialBonePos,
        point2BonePos: point2Attachment.initialBonePos
      });

      // Clear temporary visuals and refs for next measurement
      tempVisualsRef.current = { points: [], lines: [], textLabel: undefined };
      firstPointMeshRef.current = null;

      dispatch({ type: 'ADD_MEASUREMENT', payload: measurement });
      console.log('Measurement created with bone attachments:', measurementId);
    } else {
      // Store the first point's intersected mesh for later
      firstPointMeshRef.current = lastIntersectedMeshRef.current;
      // Just add the point to tempPoints
      dispatch({ type: 'ADD_TEMP_POINT', payload: position });
    }
  }, [createMeasurementPoint, createMeasurementLine, createDistanceTextLabel, calculate3DDistance, generateMeasurementId, findBoneAttachmentFromMesh]);

  const handleMeasurementClick = useCallback((event: MouseEvent) => {
    if (!state.measurementEnabled || !leftRendererRef.current) return;

    const rect = leftRendererRef.current.domElement.getBoundingClientRect();
    const mouse = new THREE.Vector2(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1
    );

    const surfacePoint = getSurfaceIntersection(mouse);
    if (surfacePoint) {
      console.log('Surface intersection found:', surfacePoint);
      addMeasurementPoint(surfacePoint);
    } else {
      console.log('No surface intersection found');
    }
  }, [state.measurementEnabled, getSurfaceIntersection, addMeasurementPoint]);

  // Add this function to recreate visual elements from stored measurements
  const recreateMeasurementVisuals = useCallback(() => {
    if (!leftSceneRef.current) {
      console.log('Cannot recreate visuals: no scene reference');
      return;
    }

    console.log('Recreating measurement visuals for', state.measurements.length, 'measurements');

    // First, clean up any existing visuals that might be orphaned
    state.measurements.forEach(measurement => {
      if (measurement.visualElements) {
        removeMeasurementVisuals(measurement.visualElements);
      }
    });

    // Create new measurements array with updated visualElements
    const updatedMeasurements = state.measurements.map(measurement => {
      // Recreate points
      const point1Mesh = createMeasurementPoint(measurement.point1);
      const point2Mesh = createMeasurementPoint(measurement.point2);

      // Recreate line
      const line = createMeasurementLine(measurement.point1, measurement.point2);

      // Recreate text label
      const textLabel = createDistanceTextLabel(measurement.midpoint, measurement.distance);

      // Add to scene
      leftSceneRef.current!.add(point1Mesh);
      leftSceneRef.current!.add(point2Mesh);
      leftSceneRef.current!.add(line);
      leftSceneRef.current!.add(textLabel);

      // Return new measurement object with updated visualElements
      return {
        ...measurement,
        visualElements: {
          points: [point1Mesh, point2Mesh],
          lines: [line],
          textLabel: textLabel
        }
      };
    });

    // Update state with new measurements array
    // Note: This requires a state update, so we need to dispatch an action
    // For now, we'll store them in a ref for immediate access
    updatedMeasurements.forEach((measurement, index) => {
      state.measurements[index] = measurement;
    });

    console.log('Measurement visuals recreated');
  }, [createMeasurementPoint, createMeasurementLine, createDistanceTextLabel, state.measurements, removeMeasurementVisuals]);

const setupMeasurementMode = useCallback((config: {
  leftRendererRef: React.MutableRefObject<THREE.WebGLRenderer | undefined>;
  leftSceneRef: React.MutableRefObject<THREE.Scene>;
  cameraRef: React.MutableRefObject<THREE.PerspectiveCamera | undefined>;
  meshRefs: React.MutableRefObject<MeshRefs>;
}) => {
  leftRendererRef.current = config.leftRendererRef.current;
  leftSceneRef.current = config.leftSceneRef.current;
  cameraRef.current = config.cameraRef.current;
  meshRefs.current = config.meshRefs.current;

  console.log('Setting up measurement mode:', {
    hasRenderer: !!leftRendererRef.current,
    hasScene: !!leftSceneRef.current,
    hasCamera: !!cameraRef.current,
    hasMeshes: !!meshRefs.current,
    measurementCount: state.measurements.length
  });

  // Recreate visual elements for existing measurements when scene is available
  if (state.measurements.length > 0 && leftSceneRef.current) {
    recreateMeasurementVisuals();
  }

  if (state.measurementEnabled && leftRendererRef.current) {
    const canvas = leftRendererRef.current.domElement;

    if (!clickHandlerRef.current) {
      clickHandlerRef.current = handleMeasurementClick;
      canvas.addEventListener('click', handleMeasurementClick);
      canvas.style.cursor = 'pointer';
      console.log('Measurement click handler added');
    }
  }
}, [state.measurementEnabled, state.measurements, handleMeasurementClick, recreateMeasurementVisuals]);

  const cleanupMeasurementMode = useCallback(() => {
    if (clickHandlerRef.current && leftRendererRef.current) {
      const canvas = leftRendererRef.current.domElement;
      canvas.removeEventListener('click', clickHandlerRef.current);
      canvas.style.cursor = 'default';
      clickHandlerRef.current = null;
      console.log('Measurement click handler removed');
    }
    cleanupTempVisuals();
    dispatch({ type: 'CLEAR_TEMP_POINTS' });
  }, [cleanupTempVisuals]);

  // Update all measurements when bones move
  const updateMeasurementsOnBoneMove = useCallback(() => {
    if (!meshRefs.current || state.measurements.length === 0) return;

    const meshes = meshRefs.current.left;

    state.measurements.forEach(measurement => {
      const attachment = measurementBoneAttachments.current.get(measurement.id);
      const originalData = measurementOriginalDataRef.current.get(measurement.id);

      if (!attachment || !originalData) {
        console.log('No attachment or original data found for measurement:', measurement.id);
        return;
      }

      // Start with original point positions
      let newPoint1 = originalData.originalPoint1.clone();
      let newPoint2 = originalData.originalPoint2.clone();
      let hasUpdate = false;

      // Update point1 if attached to a bone
      if (attachment.point1BoneIndex !== null && originalData.point1BonePos) {
        const bone = meshes[attachment.point1BoneIndex];
        if (bone) {
          // Calculate how much the bone has moved from its initial position
          const boneMovement = bone.position.clone().sub(originalData.point1BonePos);
          // Note: Geometries are now transformed to LPS during loading, no inversion needed
          // Apply that movement to the ORIGINAL point position
          newPoint1 = originalData.originalPoint1.clone().add(boneMovement);
          hasUpdate = true;
        }
      }

      // Update point2 if attached to a bone
      if (attachment.point2BoneIndex !== null && originalData.point2BonePos) {
        const bone = meshes[attachment.point2BoneIndex];
        if (bone) {
          // Calculate how much the bone has moved from its initial position
          const boneMovement = bone.position.clone().sub(originalData.point2BonePos);
          // Note: Geometries are now transformed to LPS during loading, no inversion needed
          // Apply that movement to the ORIGINAL point position
          newPoint2 = originalData.originalPoint2.clone().add(boneMovement);
          hasUpdate = true;
        }
      }

      // If any point was updated, recalculate and update visuals
      if (hasUpdate) {
        // Calculate new distance
        const newDistance = newPoint1.distanceTo(newPoint2);
        const newMidpoint = new THREE.Vector3().addVectors(newPoint1, newPoint2).multiplyScalar(0.5);

        // Update visual elements FIRST (before updating measurement data)
        if (measurement.visualElements) {
          // Update point meshes positions
          if (measurement.visualElements.points[0]) {
            measurement.visualElements.points[0].position.copy(newPoint1);
          }
          if (measurement.visualElements.points[1]) {
            measurement.visualElements.points[1].position.copy(newPoint2);
          }

          // Update line geometry
          if (measurement.visualElements.lines[0]) {
            const lineGeometry = measurement.visualElements.lines[0].geometry;
            const positions = new Float32Array([
              newPoint1.x, newPoint1.y, newPoint1.z,
              newPoint2.x, newPoint2.y, newPoint2.z
            ]);
            lineGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
            lineGeometry.attributes.position.needsUpdate = true;
            lineGeometry.computeBoundingSphere();
          }

          // Update text label
          if (measurement.visualElements.textLabel && leftSceneRef.current) {
            // Update label position and text
            measurement.visualElements.textLabel.position.copy(newMidpoint);
            measurement.visualElements.textLabel.position.y += 1.5;

            // Update the texture with new distance
            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d')!;
            canvas.width = 512;
            canvas.height = 256;
            context.clearRect(0, 0, canvas.width, canvas.height);

            const distanceText = `${newDistance.toFixed(2)} mm`;
            const fontSize = 48;
            const padding = 40;

            context.font = `bold ${fontSize}px Arial`;
            const textMetrics = context.measureText(distanceText);
            const textWidth = textMetrics.width;

            const rectWidth = textWidth + padding * 2;
            const rectHeight = fontSize + padding;
            const rectX = (canvas.width - rectWidth) / 2;
            const rectY = (canvas.height - rectHeight) / 2;

            context.fillStyle = 'rgba(0, 0, 0, 0.9)';
            context.beginPath();
            context.roundRect(rectX, rectY, rectWidth, rectHeight, 15);
            context.fill();

            context.shadowColor = '#00ff00';
            context.shadowBlur = 20;
            context.strokeStyle = '#00ff00';
            context.lineWidth = 3;
            context.beginPath();
            context.roundRect(rectX, rectY, rectWidth, rectHeight, 15);
            context.stroke();
            context.shadowBlur = 0;

            context.fillStyle = '#ffffff';
            context.font = `bold ${fontSize}px Arial`;
            context.textAlign = 'center';
            context.textBaseline = 'middle';
            context.fillText(distanceText, canvas.width / 2, canvas.height / 2);

            // Update the texture
            const material = measurement.visualElements.textLabel.material as THREE.SpriteMaterial;
            if (material.map) {
              material.map.dispose();
            }
            material.map = new THREE.CanvasTexture(canvas);
            material.map.needsUpdate = true;
            material.needsUpdate = true;
          }
        }

        // Update measurement data (for panel display)
        // Note: We update point1/point2 for display but use originalData for calculations
        measurement.point1.copy(newPoint1);
        measurement.point2.copy(newPoint2);
        measurement.distance = newDistance;
        measurement.midpoint.copy(newMidpoint);
        measurement.vector = new THREE.Vector3().subVectors(newPoint2, newPoint1);
        measurement.direction = measurement.vector.clone().normalize();
      }
    });

    // Force re-render the measurement panel
    dispatch({ type: 'SET_IS_MEASURING', payload: state.isMeasuring });
  }, [state.measurements, state.isMeasuring]);

  const calculateBoneDimensions = useCallback((): BoneDimension[] => {
    return state.measurements.map(meas => ({
      measurementId: meas.id,
      length: meas.distance,
      vector: meas.vector.clone(),
      midpoint: meas.midpoint.clone(),
      direction: meas.direction.clone(),
      angles: meas.angles,
      crossSectionalArea: Math.PI * Math.pow(meas.distance / 2, 2),
      volume: (4/3) * Math.PI * Math.pow(meas.distance / 2, 3),
      timestamp: meas.timestamp
    }));
  }, [state.measurements]);

  const getMeasurementStats = useCallback(() => {
    if (state.measurements.length === 0) return null;

    const boneDimensions = calculateBoneDimensions();
    const distances = state.measurements.map(m => m.distance);
    const averageDistance = distances.reduce((sum, d) => sum + d, 0) / distances.length;

    return {
      totalMeasurements: state.measurements.length,
      averageDistance,
      minDistance: Math.min(...distances),
      maxDistance: Math.max(...distances),
      boneDimensions,
      recommendedImplantSize: Math.max(...distances) * 1.15,
      criticalMeasurements: boneDimensions.filter(dim => dim.length > 15),
      measurementQuality: averageDistance > 5 ? 'GOOD' : 'REVIEW_REQUIRED'
    };
  }, [state.measurements, calculateBoneDimensions]);

  const exportMeasurements = useCallback((): string => {
    const stats = getMeasurementStats();
    const exportData = {
      metadata: {
        exportVersion: '1.0',
        exportDate: new Date().toISOString(),
        software: 'SpinalCordViewer',
        unit: 'millimeters'
      },
      measurements: state.measurements.map(meas => ({
        id: meas.id,
        point1: {
          x: Number(meas.point1.x.toFixed(3)),
          y: Number(meas.point1.y.toFixed(3)),
          z: Number(meas.point1.z.toFixed(3))
        },
        point2: {
          x: Number(meas.point2.x.toFixed(3)),
          y: Number(meas.point2.y.toFixed(3)),
          z: Number(meas.point2.z.toFixed(3))
        },
        distance: Number(meas.distance.toFixed(3)),
        vector: meas.vector,
        midpoint: meas.midpoint,
        direction: meas.direction,
        angles: meas.angles,
        timestamp: meas.timestamp.toISOString()
      })),
      statistics: stats
    };

    return JSON.stringify(exportData, null, 2);
  }, [state.measurements, getMeasurementStats]);

  // Effect to handle measurement mode changes
  React.useEffect(() => {
    if (state.measurementEnabled && leftRendererRef.current) {
      const canvas = leftRendererRef.current.domElement;

      if (!clickHandlerRef.current) {
        clickHandlerRef.current = handleMeasurementClick;
        canvas.addEventListener('click', handleMeasurementClick);
        canvas.style.cursor = 'pointer';
      }
    } else {
      cleanupMeasurementMode();
    }
  }, [state.measurementEnabled, handleMeasurementClick, cleanupMeasurementMode]);

  const value: MeasurementContextType = {
    ...state,
    toggleMeasurement,
    clearMeasurements,
    removeMeasurement,
    addMeasurementPoint,
    getMeasurementStats,
    exportMeasurements,
    calculateBoneDimensions,
    setupMeasurementMode,
    cleanupMeasurementMode,
    updateMeasurementsOnBoneMove,
  };

  return (
    <MeasurementContext.Provider value={value}>
      {children}
    </MeasurementContext.Provider>
  );
};

// Hook to use the measurement context
export const useMeasurementContext = () => {
  const context = useContext(MeasurementContext);
  if (context === undefined) {
    throw new Error('useMeasurementContext must be used within a MeasurementProvider');
  }
  return context;
};
