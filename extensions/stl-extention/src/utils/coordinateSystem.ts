import * as THREE from 'three';

/**
 * LPS Coordinate System Configuration
 *
 * LPS (Left-Posterior-Superior) is the standard medical imaging coordinate system:
 * - L (Left): +X direction (patient's left)
 * - P (Posterior): +Y direction (patient's back)
 * - S (Superior): +Z direction (patient's head/up)
 *
 * RAS (Right-Anterior-Superior) is another common medical coordinate system:
 * - R (Right): +X direction (patient's right)
 * - A (Anterior): +Y direction (patient's front)
 * - S (Superior): +Z direction (patient's head/up)
 *
 * To convert from RAS to LPS:
 * - X_LPS = -X_RAS (Right → Left: negate X)
 * - Y_LPS = -Y_RAS (Anterior → Posterior: negate Y)
 * - Z_LPS = Z_RAS (Superior stays the same)
 *
 * Three.js uses Y-up by default, so we configure cameras and controls for Z-up.
 */

// LPS Up Vector (Superior direction)
export const LPS_UP = new THREE.Vector3(0, 0, 1);

// Default camera position for LPS viewing (looking from anterior)
export const LPS_CAMERA_POSITION = new THREE.Vector3(0, -500, 100);

// Alternative camera positions for different views
export const LPS_CAMERA_POSITIONS = {
  anterior: new THREE.Vector3(0, -500, 100),   // Looking from front
  posterior: new THREE.Vector3(0, 500, 100),   // Looking from back
  left: new THREE.Vector3(-500, 0, 100),       // Looking from left
  right: new THREE.Vector3(500, 0, 100),       // Looking from right
  superior: new THREE.Vector3(0, 0, 500),      // Looking from top
  inferior: new THREE.Vector3(0, 0, -500),     // Looking from bottom
};

/**
 * Configure camera for LPS coordinate system
 */
export const configureCameraForLPS = (camera: THREE.PerspectiveCamera): void => {
  camera.up.copy(LPS_UP);
  camera.position.copy(LPS_CAMERA_POSITION);
  camera.lookAt(0, 0, 0);
  camera.updateProjectionMatrix();
};

/**
 * Configure OrbitControls for LPS coordinate system
 */
export const configureControlsForLPS = (controls: any, target?: THREE.Vector3): void => {
  // Set the up vector for proper orbiting in LPS
  controls.object.up.copy(LPS_UP);

  if (target) {
    controls.target.copy(target);
  }

  controls.update();
};

/**
 * Apply LPS transformation to a mesh
 * No rotation needed - STL files should already be in LPS
 */
export const applyLPSTransform = (mesh: THREE.Mesh): void => {
  // No rotation needed for LPS - mesh stays as-is
  // The camera/controls handle the viewing orientation
};

/**
 * Transform geometry - NO-OP since STLs are already in LPS coordinate system
 *
 * The STL files are already in LPS (Left-Posterior-Superior) format,
 * so no transformation is needed. This function is kept for API compatibility
 * but simply returns the geometry as-is.
 */
export const transformGeometryRAStoLPS = (geometry: THREE.BufferGeometry): THREE.BufferGeometry => {
  // STLs are already in LPS - no transformation needed
  // Just compute bounding box/sphere for camera positioning
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
};

/**
 * Legacy function - NO-OP since STLs are already in LPS
 * Kept for backward compatibility
 */
export const applyRAStoLPS = (group: THREE.Group): void => {
  // STLs are already in LPS - no transformation needed
};

/**
 * Check if a group has LPS coordinate system (always true since STLs are in LPS)
 */
export const hasRAStoLPSTransform = (group: THREE.Group): boolean => {
  return true; // STLs are already in LPS
};

/**
 * Get camera position based on bounding box for optimal viewing
 */
export const getCameraPositionForBounds = (
  boundingBox: THREE.Box3,
  viewDirection: 'anterior' | 'posterior' | 'left' | 'right' | 'superior' | 'inferior' = 'anterior'
): THREE.Vector3 => {
  const center = new THREE.Vector3();
  const size = new THREE.Vector3();
  boundingBox.getCenter(center);
  boundingBox.getSize(size);

  const maxDim = Math.max(size.x, size.y, size.z);
  const distance = maxDim * 2.5;

  const position = new THREE.Vector3();

  switch (viewDirection) {
    case 'anterior':
      position.set(center.x, center.y - distance, center.z);
      break;
    case 'posterior':
      position.set(center.x, center.y + distance, center.z);
      break;
    case 'left':
      position.set(center.x - distance, center.y, center.z);
      break;
    case 'right':
      position.set(center.x + distance, center.y, center.z);
      break;
    case 'superior':
      position.set(center.x, center.y, center.z + distance);
      break;
    case 'inferior':
      position.set(center.x, center.y, center.z - distance);
      break;
  }

  return position;
};
