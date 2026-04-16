import * as THREE from 'three';

export interface VertebraInfo {
  type: string;
  number: number;
  fullName: string;
  fileName: string;
  isImplant?: boolean;
}

export interface Measurement {
  id: string;
  point1: THREE.Vector3;
  point2: THREE.Vector3;
  distance: number;
  vector: THREE.Vector3;
  midpoint: THREE.Vector3;
  direction: THREE.Vector3;
  angles: { xy: number; xz: number; yz: number };
  timestamp: Date;
  visualElements: {
    points: THREE.Mesh[];
    lines: THREE.Line[];
    textLabel?: THREE.Sprite;
  };
}

export interface BoneDimension {
  measurementId: string;
  length: number;
  vector: THREE.Vector3;
  midpoint: THREE.Vector3;
  direction: THREE.Vector3;
  angles: { xy: number; xz: number; yz: number };
  crossSectionalArea: number;
  volume: number;
  timestamp: Date;
}

export interface Version {
  id: number;
  version: number;
  uploaded_at: string;
  approved_path: string;
  approved_by: number;
  urls: string[];
}

export interface RemovalUndoItem {
  leftMesh: THREE.Mesh;
  rightMesh: THREE.Mesh;
  index: number;
}

export interface HighlightMaterials {
  original: THREE.Material;
  highlighted: THREE.Material;
}


export interface MeshRefs {
  left: THREE.Mesh[];
  right: THREE.Mesh[];
}

export interface DICOMPosition {
  x: number;
  y: number;
  z: number;
  meshData?: any;
}

export interface DICOMMetadata {
  width: number;
  height: number;
  sliceThickness: number;
  spacing: number[];
  dimensions: number[];
  imagePositionPatient?: number[];
  imageOrientationPatient?: number[];
}

export interface STLToDICOMConfig {
  leftRendererRef: React.RefObject<THREE.WebGLRenderer | undefined>;
  leftSceneRef: React.RefObject<THREE.Scene>;
  cameraRef: React.RefObject<THREE.PerspectiveCamera | undefined>;
  meshRefs: React.MutableRefObject<{
    left: THREE.Mesh[];
    right: THREE.Mesh[];
  }>;
  servicesManager?: any;
  commandsManager?: any;
}

export interface MeshUserData {
  fileName: string;
  type: string;
  fullName: string;
  originalUrl?: string;
  isUploaded?: boolean;
  originalFile?: File;
  organType?: string;
  isApproved?: boolean;
}

// Add to your types/three.types.ts
export interface AngleMeasurement {
  id: string;
  points: THREE.Vector3[];
  angle: number;
  vertex: THREE.Vector3;
  startPoint: THREE.Vector3;
  endPoint: THREE.Vector3;
  direction1: THREE.Vector3;
  direction2: THREE.Vector3;
  normal: THREE.Vector3;
  timestamp: Date;
  visualElements: {
    points: THREE.Mesh[];
    lines: THREE.Line[];
    arc?: THREE.Line;
    textLabel?: THREE.Sprite;
  };
  // Add these for bone tracking
  boneIndices?: {
    start?: number;
    vertex?: number;
    end?: number;
  };
  originalBonePositions?: {
    start?: THREE.Vector3;
    vertex?: THREE.Vector3;
    end?: THREE.Vector3;
  };
}

export interface AngleMeasurementState {
  angleMeasurements: AngleMeasurement[];
  angleMeasurementEnabled: boolean;
  tempAnglePoints: THREE.Vector3[];
  isMeasuringAngle: boolean;
  isDraggingAnglePoint: boolean;
}

export interface MeshRefs {
  left: THREE.Mesh[];
  right: THREE.Mesh[];
}

export interface AngleMeasurementConfig {
  leftRendererRef: React.MutableRefObject<THREE.WebGLRenderer | undefined>;
  leftSceneRef: React.MutableRefObject<THREE.Scene>;
  cameraRef: React.MutableRefObject<THREE.PerspectiveCamera | undefined>;
  meshRefs: React.MutableRefObject<MeshRefs>;
  leftControlsRef?: React.MutableRefObject<any>;
}

export interface CrosshairSyncConfig {
  leftSceneRef: React.RefObject<THREE.Scene>;
  cameraRef: React.RefObject<THREE.PerspectiveCamera | undefined>;
  meshRefs: React.MutableRefObject<MeshRefs>;
  leftRendererRef: React.RefObject<THREE.WebGLRenderer | undefined>;
  leftControlsRef?: React.RefObject<any>;
  servicesManager?: any;
}