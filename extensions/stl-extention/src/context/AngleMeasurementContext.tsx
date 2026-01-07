import React, { createContext, useContext, useReducer, useCallback, useRef, useEffect } from 'react';
import * as THREE from 'three';
import { AngleMeasurement, AngleMeasurementState, AngleMeasurementConfig } from '../types/three.types';

// Action types
type AngleMeasurementAction =
  | { type: 'TOGGLE_ANGLE_MEASUREMENT' }
  | { type: 'ADD_ANGLE_MEASUREMENT'; payload: AngleMeasurement }
  | { type: 'REMOVE_ANGLE_MEASUREMENT'; payload: string }
  | { type: 'CLEAR_ANGLE_MEASUREMENTS' }
  | { type: 'ADD_TEMP_ANGLE_POINT'; payload: THREE.Vector3 }
  | { type: 'CLEAR_TEMP_ANGLE_POINTS' }
  | { type: 'SET_IS_MEASURING_ANGLE'; payload: boolean }
  | { type: 'SET_IS_DRAGGING_ANGLE_POINT'; payload: boolean }
  | { type: 'UPDATE_ANGLE_MEASUREMENT'; payload: { id: string; measurement: AngleMeasurement } };

// Initial state
const initialState: AngleMeasurementState = {
  angleMeasurements: [],
  angleMeasurementEnabled: false,
  tempAnglePoints: [],
  isMeasuringAngle: false,
  isDraggingAnglePoint: false,
};

// Reducer
function angleMeasurementReducer(state: AngleMeasurementState, action: AngleMeasurementAction): AngleMeasurementState {
  switch (action.type) {
    case 'TOGGLE_ANGLE_MEASUREMENT':
      return {
        ...state,
        angleMeasurementEnabled: !state.angleMeasurementEnabled,
        tempAnglePoints: [],
        isMeasuringAngle: false,
      };
    case 'ADD_ANGLE_MEASUREMENT':
      return {
        ...state,
        angleMeasurements: [...state.angleMeasurements, action.payload],
        tempAnglePoints: [],
        isMeasuringAngle: false,
      };
    case 'REMOVE_ANGLE_MEASUREMENT':
      return {
        ...state,
        angleMeasurements: state.angleMeasurements.filter(m => m.id !== action.payload),
      };
    case 'CLEAR_ANGLE_MEASUREMENTS':
      return {
        ...state,
        angleMeasurements: [],
        tempAnglePoints: [],
        isMeasuringAngle: false,
      };
    case 'ADD_TEMP_ANGLE_POINT':
      return {
        ...state,
        tempAnglePoints: [...state.tempAnglePoints, action.payload],
        isMeasuringAngle: true,
      };
    case 'CLEAR_TEMP_ANGLE_POINTS':
      return {
        ...state,
        tempAnglePoints: [],
        isMeasuringAngle: false,
      };
    case 'SET_IS_MEASURING_ANGLE':
      return {
        ...state,
        isMeasuringAngle: action.payload,
      };
    case 'SET_IS_DRAGGING_ANGLE_POINT':
      return {
        ...state,
        isDraggingAnglePoint: action.payload,
      };
    case 'UPDATE_ANGLE_MEASUREMENT':
      return {
        ...state,
        angleMeasurements: state.angleMeasurements.map(m =>
          m.id === action.payload.id ? action.payload.measurement : m
        ),
      };
    default:
      return state;
  }
}

// Context interface
interface AngleMeasurementContextType extends AngleMeasurementState {
  toggleAngleMeasurement: () => void;
  clearAngleMeasurements: () => void;
  removeAngleMeasurement: (id: string) => void;
  addAngleMeasurementPoint: (position: THREE.Vector3) => void;
  setupAngleMeasurementMode: (config: AngleMeasurementConfig) => void;
  cleanupAngleMeasurementMode: () => void;
  exportAngleMeasurements: () => string;
  getAngleMeasurementStats: () => any;
  calculateAnglesBetweenVertebrae: () => any[];
  updateAngleMeasurement: (id: string, measurement: AngleMeasurement) => void;
}

// Context
const AngleMeasurementContext = createContext<AngleMeasurementContextType | undefined>(undefined);

// Provider component
interface AngleMeasurementProviderProps {
  children: React.ReactNode;
}

export const AngleMeasurementProvider: React.FC<AngleMeasurementProviderProps> = ({ children }) => {
  const [state, dispatch] = useReducer(angleMeasurementReducer, initialState);

  // Refs for Three.js objects
  const leftRendererRef = useRef<THREE.WebGLRenderer>();
  const leftSceneRef = useRef<THREE.Scene>();
  const cameraRef = useRef<THREE.PerspectiveCamera>();
  const meshRefs = useRef<any>();
  const leftControlsRef = useRef<any>();
  
  // Other refs
  const tempAnglePointsRef = useRef<THREE.Vector3[]>([]);
  const angleTempVisualsRef = useRef<{ 
    points: THREE.Mesh[]; 
    lines: THREE.Line[]; 
    arc?: THREE.Line; 
    textLabel?: THREE.Sprite;
  }>({ 
    points: [], 
    lines: [], 
    arc: undefined,
    textLabel: undefined
  });
  const clickHandlerRef = useRef<((event: MouseEvent) => void) | null>(null);
  const mouseMoveHandlerRef = useRef<((event: MouseEvent) => void) | null>(null);
  const mouseUpHandlerRef = useRef<((event: MouseEvent) => void) | null>(null);
  const angleMeasurementIdCounter = useRef<number>(0);
  
  // Dragging refs
  const isDraggingRef = useRef<boolean>(false);
  const dragStartPointRef = useRef<THREE.Vector3 | null>(null);
  const dragMeasurementRef = useRef<AngleMeasurement | null>(null);
  const dragPointIndexRef = useRef<number | null>(null);
  const dragPlaneRef = useRef<THREE.Plane | null>(null);
  
  // Bone movement refs
  const startBoneRef = useRef<THREE.Mesh | null>(null);
  const endBoneRef = useRef<THREE.Mesh | null>(null);
  const vertexBoneRef = useRef<THREE.Mesh | null>(null);
  const originalStartBonePosRef = useRef<THREE.Vector3 | null>(null);
  const originalEndBonePosRef = useRef<THREE.Vector3 | null>(null);
  const originalVertexBonePosRef = useRef<THREE.Vector3 | null>(null);

  // Sync ref with state
  useEffect(() => {
    tempAnglePointsRef.current = state.tempAnglePoints;
  }, [state.tempAnglePoints]);

  // Helper: Generate unique ID
  const generateAngleMeasurementId = useCallback(() => {
    return `angle_measurement_${Date.now()}_${angleMeasurementIdCounter.current++}`;
  }, []);

  // Helper: Create measurement point with custom size
  const createMeasurementPoint = useCallback((position: THREE.Vector3, color: number = 0xFF0000, size: number = 0.4): THREE.Mesh => {
    const geometry = new THREE.SphereGeometry(size, 16, 16);
    const material = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.9
    });
    const sphere = new THREE.Mesh(geometry, material);
    sphere.position.copy(position);
    sphere.userData = { 
      isAngleMeasurementPoint: true,
      isDraggable: true
    };
    return sphere;
  }, []);

  // Helper: Create measurement line
  const createMeasurementLine = useCallback((start: THREE.Vector3, end: THREE.Vector3, color: number = 0x4dff4d, width: number = 3): THREE.Line => {
    const geometry = new THREE.BufferGeometry().setFromPoints([start, end]);
    const material = new THREE.LineBasicMaterial({
      color,
      linewidth: width,
      transparent: true,
      opacity: 1.0
    });
    const line = new THREE.Line(geometry, material);
    line.userData = { isAngleMeasurementLine: true };
    return line;
  }, []);

  // Helper: Update line geometry directly without recreating
  const updateLineGeometry = useCallback((line: THREE.Line, start: THREE.Vector3, end: THREE.Vector3) => {
    const positions = new Float32Array([
      start.x, start.y, start.z,
      end.x, end.y, end.z
    ]);
    
    if (line.geometry.attributes.position) {
      // Update existing geometry
      line.geometry.attributes.position.array = positions;
      line.geometry.attributes.position.needsUpdate = true;
      line.geometry.computeBoundingSphere();
    } else {
      // Create new attribute if it doesn't exist
      line.geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    }
  }, []);

  // Helper: Create angle arc
  const createAngleArc = useCallback((
    center: THREE.Vector3, 
    startDir: THREE.Vector3, 
    endDir: THREE.Vector3, 
    angle: number, 
    radius: number = 1,
    color: number = 0xFF0000
  ): THREE.Line => {
    const segments = 32;
    const points: THREE.Vector3[] = [];
    
    const normalizedStart = startDir.clone().normalize();
    const normalizedEnd = endDir.clone().normalize();
    
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const currentAngle = t * angle * (Math.PI / 180);
      
      const point = new THREE.Vector3()
        .copy(normalizedStart)
        .applyAxisAngle(
          new THREE.Vector3().crossVectors(normalizedStart, normalizedEnd).normalize(),
          currentAngle
        )
        .multiplyScalar(radius)
        .add(center);
      
      points.push(point);
    }
    
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineBasicMaterial({
      color,
      linewidth: 3,
      transparent: true,
      opacity: 0.9
    });
    
    const arc = new THREE.Line(geometry, material);
    arc.userData = { isAngleArc: true };
    return arc;
  }, []);

  // Helper: Update arc geometry without recreating it
  const updateArcGeometry = useCallback((
    arc: THREE.Line,
    center: THREE.Vector3, 
    startDir: THREE.Vector3, 
    endDir: THREE.Vector3, 
    angle: number, 
    radius: number = 1
  ) => {
    const segments = 32;
    const points: THREE.Vector3[] = [];
    
    const normalizedStart = startDir.clone().normalize();
    const normalizedEnd = endDir.clone().normalize();
    
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const currentAngle = t * angle * (Math.PI / 180);
      
      const point = new THREE.Vector3()
        .copy(normalizedStart)
        .applyAxisAngle(
          new THREE.Vector3().crossVectors(normalizedStart, normalizedEnd).normalize(),
          currentAngle
        )
        .multiplyScalar(radius)
        .add(center);
      
      points.push(point);
    }
    
    // Create new geometry
    const newGeometry = new THREE.BufferGeometry().setFromPoints(points);
    
    // Replace geometry without disposing (let Three.js handle disposal)
    arc.geometry = newGeometry;
  }, []);

  // Helper: Create BIG angle text label with dynamic size
  const createAngleTextLabel = useCallback((position: THREE.Vector3, angle: number, scaleMultiplier: number = 1): THREE.Sprite => {
    const baseSize = 512;
    const dynamicSize = Math.floor(baseSize * scaleMultiplier);
    
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d')!;
    
    canvas.width = dynamicSize;
    canvas.height = dynamicSize;
    
    context.clearRect(0, 0, dynamicSize, dynamicSize);
    
    const angleText = `${angle.toFixed(1)}°`;
    const fontSize = Math.floor(dynamicSize * 0.5);
    
    // Background with glow effect
    context.fillStyle = 'rgba(0, 0, 0, 0.8)';
    context.beginPath();
    context.arc(dynamicSize/2, dynamicSize/2, dynamicSize/2 - 10, 0, Math.PI * 2);
    context.fill();
    
    // Glow effect
    context.shadowColor = '#00ffff';
    context.shadowBlur = 20;
    context.strokeStyle = 'rgba(0, 255, 255, 0.3)';
    context.lineWidth = 4;
    context.beginPath();
    context.arc(dynamicSize/2, dynamicSize/2, dynamicSize/2 - 8, 0, Math.PI * 2);
    context.stroke();
    context.shadowBlur = 0;
    
    // Text
    context.fillStyle = '#ffffff';
    context.font = `bold ${fontSize}px Arial`;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(angleText, dynamicSize/2, dynamicSize/2);
    
    // Border
    context.strokeStyle = '#00ffff';
    context.lineWidth = 3;
    context.beginPath();
    context.arc(dynamicSize/2, dynamicSize/2, dynamicSize/2 - 5, 0, Math.PI * 2);
    context.stroke();
    
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
    sprite.position.y += 1.5;
    const spriteScale = 6 * scaleMultiplier;
    sprite.scale.set(spriteScale, spriteScale, 1);
    sprite.userData = { 
      isAngleTextLabel: true, 
      angle: angle,
      text: angleText,
      scaleMultiplier: scaleMultiplier
    };
    
    return sprite;
  }, []);

  // Helper: Update angle text label with dynamic size
  const updateAngleTextLabel = useCallback((sprite: THREE.Sprite, angle: number, position: THREE.Vector3, scaleMultiplier: number = 1) => {
    const baseSize = 512;
    const dynamicSize = Math.floor(baseSize * scaleMultiplier);
    
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d')!;
    
    canvas.width = dynamicSize;
    canvas.height = dynamicSize;
    
    context.clearRect(0, 0, dynamicSize, dynamicSize);
    
    const angleText = `${angle.toFixed(1)}°`;
    const fontSize = Math.floor(dynamicSize * 0.5);
    
    // Background
    context.fillStyle = 'rgba(0, 0, 0, 0.8)';
    context.beginPath();
    context.arc(dynamicSize/2, dynamicSize/2, dynamicSize/2 - 10, 0, Math.PI * 2);
    context.fill();
    
    // Glow effect
    context.shadowColor = '#00ffff';
    context.shadowBlur = 20;
    context.strokeStyle = 'rgba(0, 255, 255, 0.3)';
    context.lineWidth = 4;
    context.beginPath();
    context.arc(dynamicSize/2, dynamicSize/2, dynamicSize/2 - 8, 0, Math.PI * 2);
    context.stroke();
    context.shadowBlur = 0;
    
    // Text
    context.fillStyle = '#ffffff';
    context.font = `bold ${fontSize}px Arial`;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(angleText, dynamicSize/2, dynamicSize/2);
    
    // Border
    context.strokeStyle = '#00ffff';
    context.lineWidth = 3;
    context.beginPath();
    context.arc(dynamicSize/2, dynamicSize/2, dynamicSize/2 - 5, 0, Math.PI * 2);
    context.stroke();
    
    const texture = (sprite.material as THREE.SpriteMaterial).map as THREE.CanvasTexture;
    if (texture) {
      texture.image = canvas;
      texture.needsUpdate = true;
    }
    
    sprite.position.copy(position);
    sprite.position.y += 1.5;
    const spriteScale = 6 * scaleMultiplier;
    sprite.scale.set(spriteScale, spriteScale, 1);
    sprite.userData.angle = angle;
    sprite.userData.text = angleText;
    sprite.userData.scaleMultiplier = scaleMultiplier;
  }, []);

  // Helper: Calculate angle between three points
  const calculateAngle = useCallback((
    pointA: THREE.Vector3, 
    pointB: THREE.Vector3, 
    pointC: THREE.Vector3
  ): { 
    angle: number; 
    vertex: THREE.Vector3; 
    startDir: THREE.Vector3; 
    endDir: THREE.Vector3;
    normal: THREE.Vector3;
  } => {
    const vectorBA = new THREE.Vector3().subVectors(pointA, pointB);
    const vectorBC = new THREE.Vector3().subVectors(pointC, pointB);
    
    const normalizedBA = vectorBA.clone().normalize();
    const normalizedBC = vectorBC.clone().normalize();
    
    const dot = normalizedBA.dot(normalizedBC);
    const angle = Math.acos(Math.min(Math.max(dot, -1), 1)) * (180 / Math.PI);
    
    const normal = new THREE.Vector3().crossVectors(vectorBA, vectorBC).normalize();
    
    return {
      angle,
      vertex: pointB,
      startDir: vectorBA,
      endDir: vectorBC,
      normal
    };
  }, []);

  // Helper: Get surface intersection
  const getSurfaceIntersection = useCallback((mouse: THREE.Vector2): THREE.Vector3 | null => {
    if (!leftRendererRef.current || !cameraRef.current || !meshRefs.current) {
      return null;
    }

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, cameraRef.current);

    const meshes = [
      ...(meshRefs.current.left || []).filter((mesh: THREE.Mesh) => mesh.visible),
      ...(meshRefs.current.right || []).filter((mesh: THREE.Mesh) => mesh.visible)
    ];

    if (meshes.length === 0) {
      return null;
    }

    const intersects = raycaster.intersectObjects(meshes, false);
    return intersects.length > 0 ? intersects[0].point : null;
  }, []);

  // Helper: Find the closest bone to a point
  const findClosestBone = useCallback((position: THREE.Vector3): THREE.Mesh | null => {
    if (!meshRefs.current) return null;
    
    const allMeshes = [
      ...(meshRefs.current.left || [])
    ];
    
    let closestBone: THREE.Mesh | null = null;
    let closestDistance = Infinity;
    
    allMeshes.forEach((mesh: THREE.Mesh) => {
      if (!mesh.geometry.boundingBox) {
        mesh.geometry.computeBoundingBox();
      }
      
      const bbox = mesh.geometry.boundingBox;
      if (!bbox) return;
      
      const center = new THREE.Vector3();
      bbox.getCenter(center);
      center.applyMatrix4(mesh.matrixWorld);
      
      const distance = position.distanceTo(center);
      if (distance < closestDistance) {
        closestDistance = distance;
        closestBone = mesh;
      }
    });
    
    return closestBone;
  }, []);

  // Helper: Get mouse position in normalized device coordinates
  const getMouseNDC = useCallback((event: MouseEvent): THREE.Vector2 | null => {
    if (!leftRendererRef.current) return null;
    
    const rect = leftRendererRef.current.domElement.getBoundingClientRect();
    return new THREE.Vector2(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1
    );
  }, []);

  // Helper: Find bones connected to angle measurement
  const findConnectedBones = useCallback((measurement: AngleMeasurement): {
    startBone: THREE.Mesh | null;
    vertexBone: THREE.Mesh | null;
    endBone: THREE.Mesh | null;
  } => {
    const startBone = findClosestBone(measurement.startPoint);
    const vertexBone = findClosestBone(measurement.vertex);
    const endBone = findClosestBone(measurement.endPoint);
    
    return {
      startBone,
      vertexBone,
      endBone
    };
  }, [findClosestBone]);

  // Helper: Clean up temporary visuals
  const cleanupAngleTempVisuals = useCallback(() => {
    if (!leftSceneRef.current) return;

    angleTempVisualsRef.current.points.forEach(point => {
      leftSceneRef.current!.remove(point);
      point.geometry.dispose();
      point.material.dispose();
    });

    angleTempVisualsRef.current.lines.forEach(line => {
      leftSceneRef.current!.remove(line);
      line.geometry.dispose();
      line.material.dispose();
    });

    if (angleTempVisualsRef.current.arc) {
      leftSceneRef.current!.remove(angleTempVisualsRef.current.arc);
      angleTempVisualsRef.current.arc.geometry.dispose();
      angleTempVisualsRef.current.arc.material.dispose();
    }

    if (angleTempVisualsRef.current.textLabel) {
      leftSceneRef.current!.remove(angleTempVisualsRef.current.textLabel);
      angleTempVisualsRef.current.textLabel.material.dispose();
      angleTempVisualsRef.current.textLabel.material.map?.dispose();
    }

    angleTempVisualsRef.current = { 
      points: [], 
      lines: [], 
      arc: undefined, 
      textLabel: undefined 
    };
  }, []);

  // Helper: Remove measurement visuals
  const removeAngleMeasurementVisuals = useCallback((visualElements: { 
    points: THREE.Mesh[]; 
    lines: THREE.Line[]; 
    arc?: THREE.Line; 
    textLabel?: THREE.Sprite 
  }) => {
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

    if (visualElements.arc) {
      if (visualElements.arc.parent) {
        visualElements.arc.parent.remove(visualElements.arc);
      }
      visualElements.arc.geometry.dispose();
      visualElements.arc.material.dispose();
    }

    if (visualElements.textLabel) {
      if (visualElements.textLabel.parent) {
        visualElements.textLabel.parent.remove(visualElements.textLabel);
      }
      visualElements.textLabel.material.dispose();
      visualElements.textLabel.material.map?.dispose();
    }
  }, []);

  // Main function: Add angle measurement point
  const addAngleMeasurementPoint = useCallback((position: THREE.Vector3) => {
    if (!leftSceneRef.current) return;

    console.log('Adding angle measurement point:', position);

    const currentTempPoints = [...tempAnglePointsRef.current, position];

    // Add visual point marker (bigger points for better dragging)
    const pointMesh = createMeasurementPoint(position, 0xFF0000, 0.5);
    leftSceneRef.current.add(pointMesh);
    angleTempVisualsRef.current.points.push(pointMesh);

    // If we have three points, create angle measurement
    if (currentTempPoints.length === 3) {
      console.log('Creating angle measurement with points:', currentTempPoints);

      const angleData = calculateAngle(
        currentTempPoints[0],
        currentTempPoints[1],
        currentTempPoints[2]
      );

      console.log('Calculated angle:', angleData.angle);

      // Create lines for the angle (thicker lines)
      const line1 = createMeasurementLine(currentTempPoints[1], currentTempPoints[0], 0x00FF00, 4);
      const line2 = createMeasurementLine(currentTempPoints[1], currentTempPoints[2], 0x00FF00, 4);
      
      leftSceneRef.current.add(line1);
      leftSceneRef.current.add(line2);
      angleTempVisualsRef.current.lines.push(line1, line2);

      // Create arc for visualization
      const arcRadius = Math.max(
        Math.min(angleData.startDir.length() * 0.3, angleData.endDir.length() * 0.3),
        1.5
      );
      
      const arc = createAngleArc(
        currentTempPoints[1],
        angleData.startDir,
        angleData.endDir,
        angleData.angle,
        arcRadius,
        0xFF00FF
      );
      leftSceneRef.current.add(arc);
      angleTempVisualsRef.current.arc = arc;

      // Create BIG text label on arc
      const textPosition = new THREE.Vector3()
        .copy(currentTempPoints[1])
        .add(angleData.startDir.clone().normalize().multiplyScalar(arcRadius * 0.5))
        .add(angleData.endDir.clone().normalize().multiplyScalar(arcRadius * 0.5))
        .add(angleData.normal.clone().multiplyScalar(0.5));
      
      const textLabel = createAngleTextLabel(textPosition, angleData.angle, 1.5);
      leftSceneRef.current.add(textLabel);
      angleTempVisualsRef.current.textLabel = textLabel;

      // Create angle measurement object
      const measurementId = generateAngleMeasurementId();
      const measurement: AngleMeasurement = {
        id: measurementId,
        points: [...currentTempPoints],
        angle: angleData.angle,
        vertex: currentTempPoints[1],
        startPoint: currentTempPoints[0],
        endPoint: currentTempPoints[2],
        direction1: angleData.startDir,
        direction2: angleData.endDir,
        normal: angleData.normal,
        timestamp: new Date(),
        visualElements: {
          points: [...angleTempVisualsRef.current.points],
          lines: [...angleTempVisualsRef.current.lines],
          arc: arc,
          textLabel: textLabel
        }
      };

      // Add measurement ID to points for dragging
      measurement.visualElements.points.forEach((point, index) => {
        point.userData.measurementId = measurementId;
        point.userData.pointIndex = index;
        point.userData.isDraggable = true;
      });

      // Clear temporary visuals for next measurement
      angleTempVisualsRef.current = { 
        points: [], 
        lines: [], 
        arc: undefined, 
        textLabel: undefined 
      };

      dispatch({ type: 'ADD_ANGLE_MEASUREMENT', payload: measurement });
      console.log('Angle measurement created successfully');
    } else {
      // Just add the point to tempAnglePoints
      dispatch({ type: 'ADD_TEMP_ANGLE_POINT', payload: position });
    }
  }, [createMeasurementPoint, createMeasurementLine, createAngleArc, createAngleTextLabel, calculateAngle, generateAngleMeasurementId]);

  // Handle angle measurement click
  const handleAngleMeasurementClick = useCallback((event: MouseEvent) => {
    if (!state.angleMeasurementEnabled || !leftRendererRef.current || isDraggingRef.current) return;

    const rect = leftRendererRef.current.domElement.getBoundingClientRect();
    const mouse = new THREE.Vector2(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1
    );

    const surfacePoint = getSurfaceIntersection(mouse);
    if (surfacePoint) {
      console.log('Surface intersection found for angle measurement:', surfacePoint);
      addAngleMeasurementPoint(surfacePoint);
    } else {
      console.log('No surface intersection found for angle measurement');
    }
  }, [state.angleMeasurementEnabled, getSurfaceIntersection, addAngleMeasurementPoint]);

  // Handle mouse down for dragging
  const handleMouseDown = useCallback((event: MouseEvent) => {
    if (!state.angleMeasurementEnabled || !cameraRef.current) return;
  
    const mouse = getMouseNDC(event);
    if (!mouse) return;
  
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, cameraRef.current);
  
    const points: THREE.Mesh[] = [];
    state.angleMeasurements.forEach(m =>
      m.visualElements?.points.forEach(p => points.push(p))
    );
  
    const hits = raycaster.intersectObjects(points, false);
    if (!hits.length) return;
  
    event.preventDefault();
  
    const point = hits[0].object as THREE.Mesh;
    const measurement = state.angleMeasurements.find(
      m => m.id === point.userData.measurementId
    );
    if (!measurement) return;
  
    // Disable orbit
    if (leftControlsRef.current) {
      leftControlsRef.current.enabled = false;
    }
  
    // Hide STL meshes
    meshRefs.current?.left?.forEach((m: THREE.Mesh) => (m.visible = false));
  
    isDraggingRef.current = true;
    dragMeasurementRef.current = measurement;
    dragPointIndexRef.current = point.userData.pointIndex;
  
    const camDir = new THREE.Vector3();
    cameraRef.current.getWorldDirection(camDir);
  
    dragPlaneRef.current = new THREE.Plane().setFromNormalAndCoplanarPoint(
      camDir,
      point.position
    );
  
    point.scale.set(1.6, 1.6, 1.6);
    (point.material as THREE.MeshBasicMaterial).color.set(0xffff00);
  
    dispatch({ type: 'SET_IS_DRAGGING_ANGLE_POINT', payload: true });
  }, [state.angleMeasurementEnabled, state.angleMeasurements, getMouseNDC]);
  
  

  // Handle mouse move for dragging - FIXED VERSION
  const handleMouseMove = useCallback((event: MouseEvent) => {
    if (!isDraggingRef.current || !dragMeasurementRef.current) return;
    if (!cameraRef.current || !dragPlaneRef.current) return;
  
    const mouse = getMouseNDC(event);
    if (!mouse) return;
  
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, cameraRef.current);
  
    const hit = new THREE.Vector3();
    raycaster.ray.intersectPlane(dragPlaneRef.current, hit);
  
    const m = dragMeasurementRef.current;
    const i = dragPointIndexRef.current!;
    const v = m.visualElements;
  
    // 🔒 CLONE ORIGINAL POINTS
    const p0 = m.points[0].clone();
    const p1 = m.points[1].clone(); // ← FIXED PIVOT
    const p2 = m.points[2].clone();
  
    // ===============================
    // 🔴 DRAG LOGIC
    // ===============================
  
    if (i === 0) {
      // rotate START arm only
      const radius = p0.distanceTo(p1);
      const dir = hit.clone().sub(p1).normalize();
      const newP0 = p1.clone().add(dir.multiplyScalar(radius));
  
      // update data
      m.points[0] = newP0;
      v.points[0].position.copy(newP0);
  
      // update ONLY start line
      updateLineGeometry(v.lines[0], p1, newP0);
    }
  
    else if (i === 2) {
      // rotate END arm only
      const radius = p2.distanceTo(p1);
      const dir = hit.clone().sub(p1).normalize();
      const newP2 = p1.clone().add(dir.multiplyScalar(radius));
  
      // update data
      m.points[2] = newP2;
      v.points[2].position.copy(newP2);
  
      // update ONLY end line
      updateLineGeometry(v.lines[1], p1, newP2);
    }
  
    else if (i === 1) {
      // move whole angle
      const delta = hit.clone().sub(p1);
      m.points[0].add(delta);
      m.points[1].add(delta);
      m.points[2].add(delta);
  
      v.points.forEach((p, idx) => p.position.copy(m.points[idx]));
      updateLineGeometry(v.lines[0], m.points[1], m.points[0]);
      updateLineGeometry(v.lines[1], m.points[1], m.points[2]);
    }
  
    // ===============================
    // 📐 ANGLE RECALC (USES FIXED VERTEX)
    // ===============================
    const angleData = calculateAngle(
      m.points[0],
      m.points[1],
      m.points[2]
    );
  
    updateArcGeometry(
      v.arc!,
      m.points[1],
      angleData.startDir,
      angleData.endDir,
      angleData.angle,
      1.5
    );
  
    updateAngleTextLabel(
      v.textLabel!,
      angleData.angle,
      m.points[1],
      2
    );
  
    m.angle = angleData.angle;
    m.direction1 = angleData.startDir;
    m.direction2 = angleData.endDir;
    m.normal = angleData.normal;
  
  }, [getMouseNDC, calculateAngle]);
  
  
  

  // Handle mouse up for dragging
  const handleMouseUp = useCallback(() => {
    if (leftControlsRef.current) {
      leftControlsRef.current.enabled = true;
    }
  
    // Show STL meshes again
    meshRefs.current?.left?.forEach((m: THREE.Mesh) => (m.visible = true));
  
    if (dragMeasurementRef.current && dragPointIndexRef.current !== null) {
      const p =
        dragMeasurementRef.current.visualElements.points[
          dragPointIndexRef.current
        ];
      p.scale.set(1, 1, 1);
      (p.material as THREE.MeshBasicMaterial).color.set(0xff0000);
    }
  
    isDraggingRef.current = false;
    dragMeasurementRef.current = null;
    dragPointIndexRef.current = null;
    dragPlaneRef.current = null;
  
    dispatch({ type: 'SET_IS_DRAGGING_ANGLE_POINT', payload: false });
  }, []);
  
  

  // Toggle angle measurement
  const toggleAngleMeasurement = useCallback(() => {
    if (state.angleMeasurementEnabled) {
      cleanupAngleTempVisuals();
    }
    dispatch({ type: 'TOGGLE_ANGLE_MEASUREMENT' });
  }, [state.angleMeasurementEnabled, cleanupAngleTempVisuals]);

  // Clear all angle measurements
  const clearAngleMeasurements = useCallback(() => {
    console.log('Clearing all angle measurements');

    state.angleMeasurements.forEach(measurement => {
      if (measurement.visualElements) {
        removeAngleMeasurementVisuals(measurement.visualElements);
      }
    });

    cleanupAngleTempVisuals();
    dispatch({ type: 'CLEAR_ANGLE_MEASUREMENTS' });
  }, [state.angleMeasurements, removeAngleMeasurementVisuals, cleanupAngleTempVisuals]);

  // Remove specific angle measurement
  const removeAngleMeasurement = useCallback((id: string) => {
    console.log('Removing angle measurement:', id);

    const measurementToRemove = state.angleMeasurements.find(meas => meas.id === id);
    if (measurementToRemove && measurementToRemove.visualElements) {
      removeAngleMeasurementVisuals(measurementToRemove.visualElements);
    }
    dispatch({ type: 'REMOVE_ANGLE_MEASUREMENT', payload: id });
  }, [state.angleMeasurements, removeAngleMeasurementVisuals]);

  // Setup angle measurement mode
  const setupAngleMeasurementMode = useCallback((config: AngleMeasurementConfig) => {
    leftRendererRef.current = config.leftRendererRef.current;
    leftSceneRef.current = config.leftSceneRef.current;
    cameraRef.current = config.cameraRef.current;
    meshRefs.current = config.meshRefs.current;
    leftControlsRef.current = config.leftControlsRef?.current;

    console.log('Setting up angle measurement mode with bone dragging');

    const canvas = leftRendererRef.current?.domElement;
    if (!canvas) return;

    // Remove any existing handlers
    if (clickHandlerRef.current) {
      canvas.removeEventListener('click', clickHandlerRef.current);
    }
    if (mouseMoveHandlerRef.current) {
      canvas.removeEventListener('mousemove', mouseMoveHandlerRef.current);
    }
    if (mouseUpHandlerRef.current) {
      canvas.removeEventListener('mouseup', mouseUpHandlerRef.current);
      canvas.removeEventListener('mouseleave', mouseUpHandlerRef.current);
    }

    // Set up new handlers
    clickHandlerRef.current = handleAngleMeasurementClick;
    mouseMoveHandlerRef.current = handleMouseMove;
    mouseUpHandlerRef.current = handleMouseUp;
    
    if (state.angleMeasurementEnabled) {
      canvas.addEventListener('mousedown', handleMouseDown);
      canvas.addEventListener('click', clickHandlerRef.current);
      canvas.addEventListener('mousemove', mouseMoveHandlerRef.current);
      canvas.addEventListener('mouseup', mouseUpHandlerRef.current);
      canvas.addEventListener('mouseleave', mouseUpHandlerRef.current);
      canvas.style.cursor = 'crosshair';
      console.log('Event listeners added for angle measurement and bone dragging');
    } else {
      canvas.style.cursor = 'default';
    }
  }, [state.angleMeasurementEnabled, handleAngleMeasurementClick, handleMouseDown, handleMouseMove, handleMouseUp]);

  // Clean up angle measurement mode
  const cleanupAngleMeasurementMode = useCallback(() => {
    const canvas = leftRendererRef.current?.domElement;
    if (!canvas) return;

    canvas.removeEventListener('mousedown', handleMouseDown);
    
    if (clickHandlerRef.current) {
      canvas.removeEventListener('click', clickHandlerRef.current);
    }
    if (mouseMoveHandlerRef.current) {
      canvas.removeEventListener('mousemove', mouseMoveHandlerRef.current);
    }
    if (mouseUpHandlerRef.current) {
      canvas.removeEventListener('mouseup', mouseUpHandlerRef.current);
      canvas.removeEventListener('mouseleave', mouseUpHandlerRef.current);
    }
    
    canvas.style.cursor = 'default';
    cleanupAngleTempVisuals();
    
    // Reset all dragging state
    isDraggingRef.current = false;
    dragMeasurementRef.current = null;
    dragPointIndexRef.current = null;
    dragStartPointRef.current = null;
    dragPlaneRef.current = null;
    
    startBoneRef.current = null;
    endBoneRef.current = null;
    vertexBoneRef.current = null;
    originalStartBonePosRef.current = null;
    originalEndBonePosRef.current = null;
    originalVertexBonePosRef.current = null;
    
    dispatch({ type: 'SET_IS_DRAGGING_ANGLE_POINT', payload: false });
    dispatch({ type: 'CLEAR_TEMP_ANGLE_POINTS' });
  }, [cleanupAngleTempVisuals, handleMouseDown]);

  // Export angle measurements
  const exportAngleMeasurements = useCallback((): string => {
    const stats = getAngleMeasurementStats();
    const exportData = {
      metadata: {
        exportVersion: '1.0',
        exportDate: new Date().toISOString(),
        software: 'SpinalCordViewer',
        measurementType: 'angle'
      },
      measurements: state.angleMeasurements.map(meas => ({
        id: meas.id,
        points: meas.points.map(p => ({
          x: Number(p.x.toFixed(3)),
          y: Number(p.y.toFixed(3)),
          z: Number(p.z.toFixed(3))
        })),
        vertex: {
          x: Number(meas.vertex.x.toFixed(3)),
          y: Number(meas.vertex.y.toFixed(3)),
          z: Number(meas.vertex.z.toFixed(3))
        },
        startPoint: {
          x: Number(meas.startPoint.x.toFixed(3)),
          y: Number(meas.startPoint.y.toFixed(3)),
          z: Number(meas.startPoint.z.toFixed(3))
        },
        endPoint: {
          x: Number(meas.endPoint.x.toFixed(3)),
          y: Number(meas.endPoint.y.toFixed(3)),
          z: Number(meas.endPoint.z.toFixed(3))
        },
        angle: Number(meas.angle.toFixed(2)),
        direction1: meas.direction1,
        direction2: meas.direction2,
        normal: meas.normal,
        timestamp: meas.timestamp.toISOString()
      })),
      statistics: stats
    };

    return JSON.stringify(exportData, null, 2);
  }, [state.angleMeasurements]);

  // Get statistics
  const getAngleMeasurementStats = useCallback(() => {
    if (state.angleMeasurements.length === 0) return null;

    const angles = state.angleMeasurements.map(m => m.angle);
    const averageAngle = angles.reduce((sum, angle) => sum + angle, 0) / angles.length;

    return {
      totalAngleMeasurements: state.angleMeasurements.length,
      angles,
      averageAngle,
      minAngle: Math.min(...angles),
      maxAngle: Math.max(...angles),
      standardDeviation: Math.sqrt(
        angles.reduce((sum, angle) => sum + Math.pow(angle - averageAngle, 2), 0) / angles.length
      )
    };
  }, [state.angleMeasurements]);

  // Calculate angles between vertebrae
  const calculateAnglesBetweenVertebrae = useCallback((): any[] => {
    if (state.angleMeasurements.length === 0) return [];

    const vertebraAngles = state.angleMeasurements.map(meas => {
      return {
        measurementId: meas.id,
        angle: meas.angle,
        angleType: 'inter-vertebral',
        severity: meas.angle > 45 ? 'HIGH' : meas.angle > 20 ? 'MODERATE' : 'NORMAL',
        clinicalSignificance: meas.angle > 45 ? 'Requires attention' : 'Within normal range'
      };
    });

    return vertebraAngles;
  }, [state.angleMeasurements]);

  // Update angle measurement
  const updateAngleMeasurement = useCallback((id: string, measurement: AngleMeasurement) => {
    dispatch({ type: 'UPDATE_ANGLE_MEASUREMENT', payload: { id, measurement } });
  }, []);

  // Effect to handle measurement mode changes
  useEffect(() => {
    if (state.angleMeasurementEnabled && leftRendererRef.current) {
      setupAngleMeasurementMode({
        leftRendererRef: leftRendererRef,
        leftSceneRef: leftSceneRef,
        cameraRef: cameraRef,
        meshRefs: meshRefs,
        leftControlsRef: leftControlsRef
      });
    } else {
      cleanupAngleMeasurementMode();
    }

    return () => {
      cleanupAngleMeasurementMode();
    };
  }, [state.angleMeasurementEnabled, setupAngleMeasurementMode, cleanupAngleMeasurementMode]);

  const value: AngleMeasurementContextType = {
    ...state,
    toggleAngleMeasurement,
    clearAngleMeasurements,
    removeAngleMeasurement,
    addAngleMeasurementPoint,
    setupAngleMeasurementMode,
    cleanupAngleMeasurementMode,
    exportAngleMeasurements,
    getAngleMeasurementStats,
    calculateAnglesBetweenVertebrae,
    updateAngleMeasurement,
  };

  return (
    <AngleMeasurementContext.Provider value={value}>
      {children}
    </AngleMeasurementContext.Provider>
  );
};

// Hook to use the angle measurement context
export const useAngleMeasurementContext = () => {
  const context = useContext(AngleMeasurementContext);
  if (context === undefined) {
    throw new Error('useAngleMeasurementContext must be used within an AngleMeasurementProvider');
  }
  return context;
};