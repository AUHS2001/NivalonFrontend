// hooks/useAngleMeasurement.ts
import { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { MeshRefs } from '../types/three.types';

interface UseAngleMeasurementProps {
  angleMode: boolean;
  meshRefs: React.RefObject<MeshRefs>;
  leftGroupRef: React.RefObject<THREE.Group>;
  leftSceneRef: React.RefObject<THREE.Scene>;
  cameraRef: React.RefObject<THREE.PerspectiveCamera>;
  leftControlsRef: React.RefObject<any>;
  leftRendererRef: React.RefObject<THREE.WebGLRenderer>;
}

interface AnglePoint {
  position: THREE.Vector3;
  vertebraIndex: number;
  type: 'superior' | 'inferior' | 'body';
}

interface AngleMeasurement {
  id: string;
  points: AnglePoint[];
  angle: number;
  color: number;
  line?: THREE.Line;
  arc?: THREE.Line;
  label?: THREE.Sprite;
}

export const useAngleMeasurement = ({
  angleMode,
  meshRefs,
  leftGroupRef,
  leftSceneRef,
  cameraRef,
  leftControlsRef,
  leftRendererRef
}: UseAngleMeasurementProps) => {
  const [measurements, setMeasurements] = useState<AngleMeasurement[]>([]);
  const [activeMeasurementId, setActiveMeasurementId] = useState<string | null>(null);
  const [isMeasuring, setIsMeasuring] = useState(false);
  const [measurementPoints, setMeasurementPoints] = useState<AnglePoint[]>([]);
  
  // Refs
  const measurementGroupRef = useRef<THREE.Group>(new THREE.Group());
  const raycasterRef = useRef(new THREE.Raycaster());
  const mouseRef = useRef(new THREE.Vector2());
  const pointMarkersRef = useRef<THREE.Mesh[]>([]);
  const temporaryLineRef = useRef<THREE.Line | null>(null);
  
  // Create a measurement (Cobb angle style)
  const createMeasurement = useCallback((points: AnglePoint[]): AngleMeasurement => {
    if (points.length !== 3) {
      throw new Error('Angle measurement requires 3 points (superior, inferior, body)');
    }
    
    // Calculate angle between the three points
    const v1 = new THREE.Vector3().subVectors(points[0].position, points[1].position);
    const v2 = new THREE.Vector3().subVectors(points[2].position, points[1].position);
    
    v1.normalize();
    v2.normalize();
    
    const dot = v1.dot(v2);
    const angleRad = Math.acos(Math.max(-1, Math.min(1, dot)));
    const angleDeg = angleRad * (180 / Math.PI);
    
    const id = `angle-${Date.now()}`;
    const color = 0xffff00; // Yellow for angle measurements
    
    // Create visual elements
    const line = createMeasurementLine(points, color);
    const arc = createAngleArc(points[1].position, v1, v2, angleRad, color);
    const label = createAngleLabel(angleDeg, points[1].position);
    
    return {
      id,
      points,
      angle: angleDeg,
      color,
      line,
      arc,
      label
    };
  }, []);
  
  // Create measurement line
  const createMeasurementLine = useCallback((points: AnglePoint[], color: number): THREE.Line => {
    const linePoints = points.map(p => p.position);
    const geometry = new THREE.BufferGeometry().setFromPoints(linePoints);
    const material = new THREE.LineBasicMaterial({
      color,
      linewidth: 3,
      transparent: true,
      opacity: 0.8,
      depthTest: false
    });
    
    const line = new THREE.Line(geometry, material);
    line.renderOrder = 999;
    return line;
  }, []);
  
  // Create angle arc
  const createAngleArc = useCallback(
    (center: THREE.Vector3, v1: THREE.Vector3, v2: THREE.Vector3, angleRad: number, color: number
  ): THREE.Line => {
    const segments = 32;
    const radius = 10;
    const points: THREE.Vector3[] = [];
    
    // Get the starting angle (v1)
    const startAngle = Math.atan2(v1.z, v1.x);
    
    for (let i = 0; i <= segments; i++) {
      const theta = startAngle + (i / segments) * angleRad;
      const point = new THREE.Vector3(
        center.x + radius * Math.cos(theta),
        center.y,
        center.z + radius * Math.sin(theta)
      );
      points.push(point);
    }
    
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineBasicMaterial({
      color,
      linewidth: 2,
      transparent: true,
      opacity: 0.6,
      depthTest: false
    });
    
    const arc = new THREE.Line(geometry, material);
    arc.renderOrder = 998;
    return arc;
  }, []);
  
  // Create angle label
  const createAngleLabel = useCallback((angle: number, position: THREE.Vector3): THREE.Sprite => {
    const canvas = document.createElement('canvas');
    canvas.width = 120;
    canvas.height = 40;
    const context = canvas.getContext('2d');
    
    if (!context) throw new Error('Could not get canvas context');
    
    // Background
    context.fillStyle = 'rgba(0, 0, 0, 0.8)';
    context.fillRect(0, 0, canvas.width, canvas.height);
    
    // Border
    context.strokeStyle = '#ffff00';
    context.lineWidth = 2;
    context.strokeRect(1, 1, canvas.width - 2, canvas.height - 2);
    
    // Text
    context.font = 'bold 16px Arial';
    context.fillStyle = '#ffff00';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(`${angle.toFixed(1)}°`, canvas.width / 2, canvas.height / 2);
    
    // Create sprite
    const texture = new THREE.CanvasTexture(canvas);
    const spriteMaterial = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthTest: false
    });
    
    const sprite = new THREE.Sprite(spriteMaterial);
    sprite.position.copy(position);
    sprite.position.y += 15;
    sprite.scale.set(25, 8, 1);
    sprite.renderOrder = 1000;
    
    return sprite;
  }, []);
  
  // Start measurement
  const startMeasurement = useCallback(() => {
    setIsMeasuring(true);
    setMeasurementPoints([]);
    setActiveMeasurementId(null);
    
    // Clear temporary visuals
    if (temporaryLineRef.current) {
      measurementGroupRef.current.remove(temporaryLineRef.current);
      temporaryLineRef.current = null;
    }
    
    // Clear point markers
    pointMarkersRef.current.forEach(marker => {
      measurementGroupRef.current.remove(marker);
    });
    pointMarkersRef.current = [];
    
    console.log('Angle measurement started - click on 3 points to measure angle');
  }, []);
  
  // Add measurement point
  const addMeasurementPoint = useCallback((point: AnglePoint) => {
    setMeasurementPoints(prev => {
      const newPoints = [...prev, point];
      
      // Create point marker
      const marker = createPointMarker(point.position, point.type);
      pointMarkersRef.current.push(marker);
      measurementGroupRef.current.add(marker);
      
      // Update temporary line
      if (newPoints.length > 1) {
        updateTemporaryLine(newPoints);
      }
      
      // If we have 3 points, complete the measurement
      if (newPoints.length === 3) {
        completeMeasurement(newPoints);
        return [];
      }
      
      return newPoints;
    });
  }, []);
  
  // Create point marker
  const createPointMarker = useCallback((position: THREE.Vector3, type: 'superior' | 'inferior' | 'body'): THREE.Mesh => {
    const color = type === 'superior' ? 0x00ff00 : type === 'inferior' ? 0xff0000 : 0x0000ff;
    const size = type === 'body' ? 3 : 2;
    
    const geometry = new THREE.SphereGeometry(size, 16, 16);
    const material = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.8,
      depthTest: false
    });
    
    const marker = new THREE.Mesh(geometry, material);
    marker.position.copy(position);
    marker.renderOrder = 1001;
    marker.userData = { type };
    
    return marker;
  }, []);
  
  // Update temporary line
  const updateTemporaryLine = useCallback((points: AnglePoint[]) => {
    if (temporaryLineRef.current) {
      measurementGroupRef.current.remove(temporaryLineRef.current);
    }
    
    const linePoints = points.map(p => p.position);
    const geometry = new THREE.BufferGeometry().setFromPoints(linePoints);
    const material = new THREE.LineDashedMaterial({
      color: 0xffff00,
      linewidth: 2,
      dashSize: 3,
      gapSize: 2,
      transparent: true,
      opacity: 0.6,
      depthTest: false
    });
    
    const line = new THREE.Line(geometry, material);
    line.computeLineDistances();
    line.renderOrder = 997;
    
    temporaryLineRef.current = line;
    measurementGroupRef.current.add(line);
  }, []);
  
  // Complete measurement
  const completeMeasurement = useCallback((points: AnglePoint[]) => {
    try {
      const measurement = createMeasurement(points);
      
      // Add to measurements
      setMeasurements(prev => [...prev, measurement]);
      setActiveMeasurementId(measurement.id);
      
      // Add visuals to scene
      if (measurement.line) measurementGroupRef.current.add(measurement.line);
      if (measurement.arc) measurementGroupRef.current.add(measurement.arc);
      if (measurement.label) measurementGroupRef.current.add(measurement.label);
      
      // Clear temporary visuals
      if (temporaryLineRef.current) {
        measurementGroupRef.current.remove(temporaryLineRef.current);
        temporaryLineRef.current = null;
      }
      
      console.log(`Measurement created: ${measurement.angle.toFixed(1)}°`);
      
      // Reset measurement mode
      setIsMeasuring(false);
      
      return measurement;
    } catch (error) {
      console.error('Failed to create measurement:', error);
      return null;
    }
  }, [createMeasurement]);
  
  // Calculate angle between vertebrae (automatic)
  const calculateVertebraAngle = useCallback((vertebraIndex1: number, vertebraIndex2: number): number | null => {
    if (!meshRefs.current || meshRefs.current.left.length === 0) return null;
    
    const meshes = meshRefs.current.left;
    if (vertebraIndex1 >= meshes.length || vertebraIndex2 >= meshes.length) return null;
    
    const mesh1 = meshes[vertebraIndex1];
    const mesh2 = meshes[vertebraIndex2];
    
    // Get bounding boxes
    mesh1.geometry.computeBoundingBox();
    mesh2.geometry.computeBoundingBox();
    
    const bbox1 = mesh1.geometry.boundingBox;
    const bbox2 = mesh2.geometry.boundingBox;
    
    if (!bbox1 || !bbox2) return null;
    
    // Calculate center points
    const center1 = new THREE.Vector3();
    const center2 = new THREE.Vector3();
    bbox1.getCenter(center1);
    bbox2.getCenter(center2);
    
    // Convert to world coordinates
    center1.applyMatrix4(mesh1.matrixWorld);
    center2.applyMatrix4(mesh2.matrixWorld);
    
    // For Cobb angle, we need superior and inferior points
    const size1 = new THREE.Vector3();
    const size2 = new THREE.Vector3();
    bbox1.getSize(size1);
    bbox2.getSize(size2);
    
    // Superior point of vertebra 1
    const superior1 = new THREE.Vector3(0, size1.y * 0.4, size1.z * 0.2);
    superior1.applyMatrix4(mesh1.matrixWorld);
    
    // Inferior point of vertebra 2
    const inferior2 = new THREE.Vector3(0, -size2.y * 0.4, size2.z * 0.2);
    inferior2.applyMatrix4(mesh2.matrixWorld);
    
    // Body point (midpoint between centers)
    const bodyPoint = new THREE.Vector3().addVectors(center1, center2).multiplyScalar(0.5);
    
    // Calculate angle
    const v1 = new THREE.Vector3().subVectors(superior1, bodyPoint);
    const v2 = new THREE.Vector3().subVectors(inferior2, bodyPoint);
    
    v1.normalize();
    v2.normalize();
    
    const dot = v1.dot(v2);
    const angleRad = Math.acos(Math.max(-1, Math.min(1, dot)));
    const angleDeg = angleRad * (180 / Math.PI);
    
    return angleDeg;
  }, [meshRefs]);
  
  // Create automatic measurement between two vertebrae
  const createAutomaticMeasurement = useCallback((vertebraIndex1: number, vertebraIndex2: number): AngleMeasurement | null => {
    const angle = calculateVertebraAngle(vertebraIndex1, vertebraIndex2);
    if (angle === null) return null;
    
    // Get meshes
    const mesh1 = meshRefs.current.left[vertebraIndex1];
    const mesh2 = meshRefs.current.left[vertebraIndex2];
    
    // Calculate points for visualization
    mesh1.geometry.computeBoundingBox();
    mesh2.geometry.computeBoundingBox();
    
    const bbox1 = mesh1.geometry.boundingBox!;
    const bbox2 = mesh2.geometry.boundingBox!;
    
    const size1 = new THREE.Vector3();
    const size2 = new THREE.Vector3();
    bbox1.getSize(size1);
    bbox2.getSize(size2);
    
    // Superior point of vertebra 1
    const superior1 = new THREE.Vector3(0, size1.y * 0.4, size1.z * 0.2);
    superior1.applyMatrix4(mesh1.matrixWorld);
    
    // Inferior point of vertebra 2
    const inferior2 = new THREE.Vector3(0, -size2.y * 0.4, size2.z * 0.2);
    inferior2.applyMatrix4(mesh2.matrixWorld);
    
    // Body point (midpoint)
    const center1 = new THREE.Vector3();
    const center2 = new THREE.Vector3();
    bbox1.getCenter(center1);
    bbox2.getCenter(center2);
    center1.applyMatrix4(mesh1.matrixWorld);
    center2.applyMatrix4(mesh2.matrixWorld);
    
    const bodyPoint = new THREE.Vector3().addVectors(center1, center2).multiplyScalar(0.5);
    
    // Create points
    const points: AnglePoint[] = [
      { position: superior1, vertebraIndex: vertebraIndex1, type: 'superior' },
      { position: bodyPoint, vertebraIndex: -1, type: 'body' },
      { position: inferior2, vertebraIndex: vertebraIndex2, type: 'inferior' }
    ];
    
    return createMeasurement(points);
  }, [calculateVertebraAngle, createMeasurement, meshRefs]);
  
  // Remove measurement
  const removeMeasurement = useCallback((measurementId: string) => {
    setMeasurements(prev => {
      const measurement = prev.find(m => m.id === measurementId);
      if (measurement) {
        // Remove visuals from scene
        if (measurement.line) measurementGroupRef.current.remove(measurement.line);
        if (measurement.arc) measurementGroupRef.current.remove(measurement.arc);
        if (measurement.label) measurementGroupRef.current.remove(measurement.label);
      }
      
      return prev.filter(m => m.id !== measurementId);
    });
    
    if (activeMeasurementId === measurementId) {
      setActiveMeasurementId(null);
    }
  }, [activeMeasurementId]);
  
  // Clear all measurements
  const clearMeasurements = useCallback(() => {
    measurements.forEach(measurement => {
      if (measurement.line) measurementGroupRef.current.remove(measurement.line);
      if (measurement.arc) measurementGroupRef.current.remove(measurement.arc);
      if (measurement.label) measurementGroupRef.current.remove(measurement.label);
    });
    
    setMeasurements([]);
    setActiveMeasurementId(null);
    setIsMeasuring(false);
    setMeasurementPoints([]);
    
    // Clear temporary visuals
    if (temporaryLineRef.current) {
      measurementGroupRef.current.remove(temporaryLineRef.current);
      temporaryLineRef.current = null;
    }
    
    pointMarkersRef.current.forEach(marker => {
      measurementGroupRef.current.remove(marker);
    });
    pointMarkersRef.current = [];
  }, [measurements]);
  
  // Export measurements
  const exportMeasurements = useCallback((): string => {
    const exportData = {
      timestamp: new Date().toISOString(),
      measurements: measurements.map(m => ({
        id: m.id,
        angle: m.angle,
        points: m.points.map(p => ({
          position: p.position.toArray(),
          vertebraIndex: p.vertebraIndex,
          type: p.type
        }))
      })),
      totalMeasurements: measurements.length,
      averageAngle: measurements.length > 0 ? 
        (measurements.reduce((sum, m) => sum + m.angle, 0) / measurements.length).toFixed(2) : 0
    };
    
    return JSON.stringify(exportData, null, 2);
  }, [measurements]);
  
  // Handle mouse click for point selection
  const handleMouseClick = useCallback((event: MouseEvent) => {
    if (!isMeasuring || !leftRendererRef.current || !cameraRef.current) return;
    
    const canvas = leftRendererRef.current.domElement;
    const rect = canvas.getBoundingClientRect();
    
    mouseRef.current.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouseRef.current.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    
    raycasterRef.current.setFromCamera(mouseRef.current, cameraRef.current);
    
    // Check for mesh intersection
    const meshes = meshRefs.current.left;
    const intersects = raycasterRef.current.intersectObjects(meshes, true);
    
    if (intersects.length > 0) {
      const intersect = intersects[0];
      const mesh = intersect.object as THREE.Mesh;
      const vertebraIndex = meshes.indexOf(mesh);
      
      if (vertebraIndex !== -1) {
        // Determine point type based on measurement sequence
        let pointType: 'superior' | 'inferior' | 'body';
        switch (measurementPoints.length) {
          case 0:
            pointType = 'superior';
            break;
          case 1:
            pointType = 'inferior';
            break;
          case 2:
            pointType = 'body';
            break;
          default:
            pointType = 'body';
        }
        
        const point: AnglePoint = {
          position: intersect.point,
          vertebraIndex,
          type: pointType
        };
        
        addMeasurementPoint(point);
      }
    }
  }, [isMeasuring, leftRendererRef, cameraRef, meshRefs, measurementPoints, addMeasurementPoint]);
  
  // Initialize angle mode
  useEffect(() => {
    if (angleMode) {
      console.log('Angle measurement mode activated');
      
      // Add measurement group to scene
      if (leftSceneRef.current && !leftSceneRef.current.getObjectById(measurementGroupRef.current.id)) {
        leftSceneRef.current.add(measurementGroupRef.current);
      }
      
      // Disable orbit controls rotation for precise clicking
      if (leftControlsRef.current) {
        leftControlsRef.current.enableRotate = false;
        leftControlsRef.current.enableZoom = true;
        leftControlsRef.current.enablePan = true;
      }
      
      // Add click listener
      if (leftRendererRef.current) {
        const canvas = leftRendererRef.current.domElement;
        canvas.addEventListener('click', handleMouseClick);
        canvas.style.cursor = 'crosshair';
      }
      
      return () => {
        // Cleanup
        if (leftRendererRef.current) {
          const canvas = leftRendererRef.current.domElement;
          canvas.removeEventListener('click', handleMouseClick);
          canvas.style.cursor = 'auto';
        }
        
        if (leftControlsRef.current) {
          leftControlsRef.current.enableRotate = true;
        }
      };
    } else {
      // Exit measurement mode
      setIsMeasuring(false);
      setMeasurementPoints([]);
      
      // Clear temporary visuals
      if (temporaryLineRef.current) {
        measurementGroupRef.current.remove(temporaryLineRef.current);
        temporaryLineRef.current = null;
      }
      
      pointMarkersRef.current.forEach(marker => {
        measurementGroupRef.current.remove(marker);
      });
      pointMarkersRef.current = [];
      
      // Remove measurement group from scene (but keep measurements)
      // if (leftSceneRef.current) {
      //   leftSceneRef.current.remove(measurementGroupRef.current);
      // }
    }
  }, [angleMode, leftSceneRef, leftControlsRef, leftRendererRef, handleMouseClick]);
  
  // Update measurements when meshes change
  useEffect(() => {
    if (measurements.length > 0 && meshRefs.current.left.length > 0) {
      // Recalculate angles if meshes have moved
      const updatedMeasurements = measurements.map(measurement => {
        // Recreate measurement with updated positions
        return createMeasurement(measurement.points.map(p => ({
          ...p,
          // Update position if vertebra index is valid
          position: p.vertebraIndex >= 0 && p.vertebraIndex < meshRefs.current.left.length ?
            // Get updated position (this is simplified - you'd need proper point tracking)
            p.position :
            p.position
        })));
      });
      
      // Update visuals
      updatedMeasurements.forEach((newMeasurement, index) => {
        const oldMeasurement = measurements[index];
        
        // Remove old visuals
        if (oldMeasurement.line) measurementGroupRef.current.remove(oldMeasurement.line);
        if (oldMeasurement.arc) measurementGroupRef.current.remove(oldMeasurement.arc);
        if (oldMeasurement.label) measurementGroupRef.current.remove(oldMeasurement.label);
        
        // Add new visuals
        if (newMeasurement.line) measurementGroupRef.current.add(newMeasurement.line);
        if (newMeasurement.arc) measurementGroupRef.current.add(newMeasurement.arc);
        if (newMeasurement.label) measurementGroupRef.current.add(newMeasurement.label);
      });
      
      setMeasurements(updatedMeasurements);
    }
  }, [meshRefs.current.left, measurements, createMeasurement]);
  
  return {
    // State
    measurements,
    isMeasuring,
    measurementPoints,
    activeMeasurementId,
    
    // Actions
    startMeasurement,
    clearMeasurements,
    removeMeasurement,
    exportMeasurements,
    
    // Automatic calculations
    calculateVertebraAngle,
    createAutomaticMeasurement,
    
    // Utility
    getMeasurementById: (id: string) => measurements.find(m => m.id === id),
    getTotalMeasurements: () => measurements.length,
    getAverageAngle: () => measurements.length > 0 ? 
      measurements.reduce((sum, m) => sum + m.angle, 0) / measurements.length : 0
  };
};