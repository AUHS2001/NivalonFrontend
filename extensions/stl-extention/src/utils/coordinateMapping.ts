import { DICOMMetadata, DICOMPosition } from '../types/three.types';
import * as THREE from 'three';

export class CoordinateMapper {
  private dicomMetadata: DICOMMetadata;
  private stlBounds: THREE.Box3;

  constructor(dicomMetadata: DICOMMetadata, stlBounds: THREE.Box3) {
    this.dicomMetadata = dicomMetadata;
    this.stlBounds = stlBounds;
  }

  // Map STL coordinates to DICOM image coordinates
  stlToDICOM(stlPosition: THREE.Vector3): DICOMPosition {
    // This is a simplified mapping - adjust based on your data
    // In real implementation, use DICOM Image Position Patient and other metadata

    const scaleX = this.dicomMetadata.width / (this.stlBounds.max.x - this.stlBounds.min.x);
    const scaleY = this.dicomMetadata.height / (this.stlBounds.max.y - this.stlBounds.min.y);

    return {
      x: (stlPosition.x - this.stlBounds.min.x) * scaleX,
      y: (stlPosition.y - this.stlBounds.min.y) * scaleY,
      z: this.calculateSliceIndex(stlPosition.z)
    };
  }

  private calculateSliceIndex(zPosition: number): number {
    // Calculate which DICOM slice corresponds to the Z position
    const sliceThickness = this.dicomMetadata.sliceThickness || 1;
    return Math.floor(zPosition / sliceThickness);
  }

  // Get STL bounds from mesh group
  static getSTLBounds(meshes: THREE.Mesh[]): THREE.Box3 {
    const bounds = new THREE.Box3();
    meshes.forEach(mesh => bounds.union(mesh.geometry.boundingBox!));
    return bounds;
  }

  // Get DICOM metadata from active viewport
  static async getDICOMMetadata(servicesManager: any): Promise<DICOMMetadata | null> {
    try {
      const { viewportGridService, cornerstoneViewportService } = servicesManager.services;
      const activeViewportId = viewportGridService.getActiveViewportId();

      if (!activeViewportId) return null;

      const viewport = cornerstoneViewportService.getCornerstoneViewport(activeViewportId);
      const imageData = viewport.getImageData();

      if (!imageData) return null;

      return {
        width: imageData.dimensions[0],
        height: imageData.dimensions[1],
        sliceThickness: imageData.spacing[2] || 1,
        spacing: imageData.spacing,
        dimensions: imageData.dimensions,
        imagePositionPatient: imageData.imagePositionPatient,
        imageOrientationPatient: imageData.imageOrientationPatient,
      };
    } catch (error) {
      console.error('Error getting DICOM metadata:', error);
      return null;
    }
  }
}
