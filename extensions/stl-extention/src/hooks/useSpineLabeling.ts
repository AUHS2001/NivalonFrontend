import { useEffect, useRef, useCallback } from 'react';
import * as THREE from 'three';
import { MeshRefs } from '../types/three.types';
import { useSpineLabelingContext } from '../context/SpineLabelingContext';

interface UseSpineLabelingProps {
  leftSceneRef: React.RefObject<THREE.Scene>;
  rightSceneRef: React.RefObject<THREE.Scene>;
  cameraRef: React.RefObject<THREE.PerspectiveCamera>;
  meshRefs: React.RefObject<MeshRefs>;
  leftRendererRef: React.RefObject<THREE.WebGLRenderer>;
}

export const useSpineLabeling = ({
  leftSceneRef,
  rightSceneRef,
  cameraRef,
  meshRefs,
  leftRendererRef
}: UseSpineLabelingProps) => {
  const {
    spineLabelingMode,
    labels,
    addLabel,
    removeLabel,
    clearLabels,
    isLabelingPopupOpen,
    openLabelingPopup,
    labelingConfig
  } = useSpineLabelingContext();

  // Refs for Three.js objects
  const labelGroupRef = useRef<THREE.Group>(new THREE.Group());
  const labelMeshesRef = useRef<THREE.Object3D[]>([]); // FIX: Changed from THREE.Mesh[] to THREE.Object3D[]
  const raycasterRef = useRef(new THREE.Raycaster());
  const mouseRef = useRef(new THREE.Vector2());

  // Create a label sprite
  // Create a label sprite
const createLabelSprite = useCallback((text: string, labelPosition: THREE.Vector3, clickPosition: THREE.Vector3, color: number = 0x00ff00, onRemove?: () => void, showRemoveButton: boolean = false): THREE.Object3D => {
  // Create a group to hold both the label and the cross
  // The group position is at the LABEL position (end of line)
  const labelGroup = new THREE.Group();
  labelGroup.position.copy(labelPosition);
  labelGroup.userData = { 
    isLabel: true, 
    text,
    onRemove,
    showRemoveButton,
    labelId: `label_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  };
  
  // Create canvas for text with larger font
  const canvas = document.createElement('canvas');
  canvas.width = 320; // Increased width for larger text
  canvas.height = 160; // Increased height for larger text
  const context = canvas.getContext('2d');
  
  if (!context) throw new Error('Could not get canvas context');
  
  // Fill background with slightly more opacity
  context.fillStyle = 'rgba(0, 0, 0, 0.9)';
  context.fillRect(0, 0, canvas.width, canvas.height);
  
  // Add border
  context.strokeStyle = `#${color.toString(16).padStart(6, '0')}`;
  context.lineWidth = 5; // Thicker border
  context.strokeRect(3, 3, canvas.width - 6, canvas.height - 6);
  
  // Add text with larger font size
  context.font = 'bold 48px Arial, sans-serif'; // Increased from 40px to 48px
  context.fillStyle = `#${color.toString(16).padStart(6, '0')}`;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(text, canvas.width / 2, canvas.height / 2);
  
  // Create texture from canvas
  const texture = new THREE.CanvasTexture(canvas);
  const spriteMaterial = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: false
  });
  
  const sprite = new THREE.Sprite(spriteMaterial);
  sprite.scale.set(20, 10, 1); // Larger scale for larger text
  sprite.userData = { isLabelText: true };
  labelGroup.add(sprite);
  
  // Create a line from click position to label position
  // Since labelGroup is at labelPosition, we need to calculate
  // the click position relative to the label group
  const clickRelative = clickPosition.clone().sub(labelPosition);
  const labelCenter = new THREE.Vector3(0, 0, 0); // Center of the label
  
  // Calculate which edge of the label is closest to the click point
  const labelHalfWidth = 10; // Half of sprite width (20/2)
  const labelHalfHeight = 5; // Half of sprite height (10/2)
  
  // Find intersection point on label border
  let edgePoint = new THREE.Vector3();
  const direction = new THREE.Vector3().subVectors(clickRelative, labelCenter).normalize();
  
  // Calculate intersection with label rectangle
  // For simplicity, we'll use the nearest point on the label border
  const tX = Math.abs(labelHalfWidth / direction.x);
  const tY = Math.abs(labelHalfHeight / direction.y);
  const t = Math.min(tX, tY);
  
  edgePoint.copy(direction).multiplyScalar(t);
  
  // Adjust edge point to be exactly on the border
  if (Math.abs(edgePoint.x) > labelHalfWidth) {
    edgePoint.x = Math.sign(edgePoint.x) * labelHalfWidth;
  }
  if (Math.abs(edgePoint.y) > labelHalfHeight) {
    edgePoint.y = Math.sign(edgePoint.y) * labelHalfHeight;
  }
  
  // Create line from click position to label edge
  const lineGeometry = new THREE.BufferGeometry();
  const linePoints = [clickRelative, edgePoint];
  lineGeometry.setFromPoints(linePoints);
  
  const lineMaterial = new THREE.LineBasicMaterial({
    color,
    linewidth: 3 // Thicker line
  });
  
  const connectingLine = new THREE.Line(lineGeometry, lineMaterial);
  connectingLine.userData = { isLabelLine: true };
  labelGroup.add(connectingLine);
  
  // Add a small marker at the click position
  const sphereGeometry = new THREE.SphereGeometry(0.8, 8, 8);
  const sphereMaterial = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0.8
  });
  const clickMarker = new THREE.Mesh(sphereGeometry, sphereMaterial);
  clickMarker.position.copy(clickRelative);
  clickMarker.userData = { isClickMarker: true };
  labelGroup.add(clickMarker);
  
  // Create red cross (remove button) ONLY if showRemoveButton is true
  if (showRemoveButton) {
    const crossCanvas = document.createElement('canvas');
    crossCanvas.width = 60;
    crossCanvas.height = 60;
    const crossContext = crossCanvas.getContext('2d');
    
    if (crossContext) {
      // Fill with transparent background
      crossContext.clearRect(0, 0, crossCanvas.width, crossCanvas.height);
      
      // Draw red circle background
      crossContext.beginPath();
      crossContext.arc(30, 30, 25, 0, Math.PI * 2);
      crossContext.fillStyle = 'rgba(255, 0, 0, 0.9)';
      crossContext.fill();
      
      // Draw white border
      crossContext.lineWidth = 2;
      crossContext.strokeStyle = 'white';
      crossContext.stroke();
      
      // Draw white X
      crossContext.beginPath();
      crossContext.moveTo(15, 15);
      crossContext.lineTo(45, 45);
      crossContext.moveTo(45, 15);
      crossContext.lineTo(15, 45);
      crossContext.lineWidth = 4;
      crossContext.strokeStyle = 'white';
      crossContext.stroke();
    }
    
    const crossTexture = new THREE.CanvasTexture(crossCanvas);
    const crossMaterial = new THREE.SpriteMaterial({
      map: crossTexture,
      transparent: true,
      depthTest: false,
      opacity: 0.9
    });
    
    const crossSprite = new THREE.Sprite(crossMaterial);
    // Position cross in top-right corner of label
    crossSprite.position.set(labelHalfWidth - 3, labelHalfHeight - 3, 0.1); // Top-right corner
    crossSprite.scale.set(4, 4, 1);
    crossSprite.userData = { 
      isRemoveButton: true,
      onClick: onRemove
    };
    labelGroup.add(crossSprite);
    
    // Add hover effect to cross
    const hoverCanvas = document.createElement('canvas');
    hoverCanvas.width = 60;
    hoverCanvas.height = 60;
    const hoverContext = hoverCanvas.getContext('2d');
    
    if (hoverContext) {
      // Draw red circle with white border
      hoverContext.beginPath();
      hoverContext.arc(30, 30, 25, 0, Math.PI * 2);
      hoverContext.fillStyle = 'rgba(255, 50, 50, 1)'; // Brighter red on hover
      hoverContext.fill();
      
      hoverContext.lineWidth = 3;
      hoverContext.strokeStyle = 'white';
      hoverContext.stroke();
      
      // Draw white X
      hoverContext.beginPath();
      hoverContext.moveTo(15, 15);
      hoverContext.lineTo(45, 45);
      hoverContext.moveTo(45, 15);
      hoverContext.lineTo(15, 45);
      hoverContext.lineWidth = 5; // Thicker X on hover
      hoverContext.strokeStyle = 'white';
      hoverContext.stroke();
    }
    
    // Store hover texture for later use
    const hoverTexture = new THREE.CanvasTexture(hoverCanvas);
    
    // Add mouse event handlers to cross sprite
    labelGroup.userData.crossSprite = crossSprite;
    labelGroup.userData.normalTexture = crossTexture;
    labelGroup.userData.hoverTexture = hoverTexture;
    labelGroup.userData.isHovered = false;
  }
  
  return labelGroup;
}, []);

  // Update labels in scene
const updateLabelsInScene = useCallback(() => {
  // Clear existing label meshes
  labelMeshesRef.current.forEach(mesh => {
    // Check if it's a group and remove all children properly
    if (mesh.parent) {
      mesh.parent.remove(mesh);
    }
    // Dispose of materials and textures
    mesh.traverse((child) => {
      if (child instanceof THREE.Sprite && child.material instanceof THREE.SpriteMaterial) {
        child.material.map?.dispose();
        child.material.dispose();
      } else if (child instanceof THREE.Line) {
        child.geometry.dispose();
        child.material.dispose();
      } else if (child instanceof THREE.Mesh && child.geometry instanceof THREE.SphereGeometry) {
        child.geometry.dispose();
        child.material.dispose();
      }
    });
  });
  labelMeshesRef.current = [];

  // Add labels to scene
  labels.forEach(label => {
    try {
      const removeCallback = () => removeLabel(label.id);
      
      // The label position is where the label text should be (end of line)
      // The bone position is where the click was (start of line)
      const labelGroup = createLabelSprite(
        label.vertebraName, 
        label.position, // Label position (end of line)
        label.bonePosition, // Click position (start of line)
        label.color,
        removeCallback,
        spineLabelingMode
      );
      
      labelMeshesRef.current.push(labelGroup);
      
      // Add to appropriate scene
      if (label.scene === 'left' && leftSceneRef.current) {
        leftSceneRef.current.add(labelGroup);
      } else if (label.scene === 'right' && rightSceneRef.current) {
        rightSceneRef.current.add(labelGroup);
      }
    } catch (error) {
      console.error('Error creating label sprite:', error);
    }
  });
}, [labels, leftSceneRef, rightSceneRef, createLabelSprite, removeLabel, spineLabelingMode]);

  // Handle click for placing labels
const handleLabelClick = useCallback((event: MouseEvent) => {
  if (!leftRendererRef.current || !cameraRef.current) return;
  
  const canvas = leftRendererRef.current.domElement;
  const rect = canvas.getBoundingClientRect();
  
  const mouse = new THREE.Vector2(
    ((event.clientX - rect.left) / rect.width) * 2 - 1,
    -((event.clientY - rect.top) / rect.height) * 2 + 1
  );
  
  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(mouse, cameraRef.current);
  
  // First, check if user clicked on a remove button
  const labelObjects = labelMeshesRef.current.filter(obj => 
    obj.userData?.isLabel && obj.userData?.showRemoveButton
  );
  const removeIntersects = raycaster.intersectObjects(labelObjects, true);
  
  if (removeIntersects.length > 0) {
    const intersect = removeIntersects[0];
    const clickedObject = intersect.object;
    
    // Traverse up to find the remove button
    let currentObject = clickedObject;
    while (currentObject && !currentObject.userData?.isRemoveButton) {
      currentObject = currentObject.parent as THREE.Object3D;
    }
    
    if (currentObject?.userData?.isRemoveButton && currentObject.userData.onClick) {
      // Found a remove button, call its onClick handler
      event.stopPropagation();
      currentObject.userData.onClick();
      return;
    }
  }
  
  // If not clicking on a remove button, check for regular label creation
  if (!spineLabelingMode || !meshRefs.current) return;
  
  // Check for mesh intersection for new label placement
  const meshes = [...meshRefs.current.left, ...meshRefs.current.right].filter(mesh => mesh.visible);
  const meshIntersects = raycaster.intersectObjects(meshes, true);
  
  if (meshIntersects.length > 0) {
    const intersect = meshIntersects[0];
    const mesh = intersect.object as THREE.Mesh;
    
    // Find which side this mesh belongs to
    let scene: 'left' | 'right' = 'left';
    let meshIndex = -1;
    
    if (meshRefs.current.left.includes(mesh)) {
      scene = 'left';
      meshIndex = meshRefs.current.left.indexOf(mesh);
    } else if (meshRefs.current.right.includes(mesh)) {
      scene = 'right';
      meshIndex = meshRefs.current.right.indexOf(mesh);
    }
    
    // Check if labeling config is set
    if (!labelingConfig) {
      openLabelingPopup();
      return;
    }
    
    // Get click position on bone surface
    const clickPosition = intersect.point.clone();
    
    // Calculate a good label position (offset from click position)
    // Get camera direction
    const cameraDirection = new THREE.Vector3();
    cameraRef.current.getWorldDirection(cameraDirection);
    
    // Calculate normal at click point (simplified - use mesh normal)
    const normal = intersect.face?.normal || new THREE.Vector3(0, 1, 0);
    
    // Calculate label position offset
    // Move away from the bone in camera direction for better visibility
    const cameraOffset = cameraDirection.clone().multiplyScalar(-10); // Away from camera
    
    // Add some upward offset
    const upwardOffset = new THREE.Vector3(0, 8, 0);
    
    // Add some random horizontal offset to avoid overlapping labels
    const randomHorizontal = new THREE.Vector3(
      (Math.random() - 0.5) * 15,
      0,
      (Math.random() - 0.5) * 10
    );
    
    // Combine offsets
    const totalOffset = new THREE.Vector3()
      .add(cameraOffset)
      .add(upwardOffset)
      .add(randomHorizontal);
    
    // Calculate final label position
    const labelPosition = clickPosition.clone().add(totalOffset);
    
    // Add label with both positions
    addLabel(labelPosition, clickPosition, scene, meshIndex);
  }
}, [spineLabelingMode, leftRendererRef, cameraRef, meshRefs, labelingConfig, addLabel, openLabelingPopup]);

  // Handle hover effects
  useEffect(() => {
    if (!leftRendererRef.current || !cameraRef.current || !spineLabelingMode) return;
    
    const canvas = leftRendererRef.current.domElement;
    
    const handleMouseMove = (event: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const mouse = new THREE.Vector2(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1
      );
      
      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(mouse, cameraRef.current!);
      
      // Check for hover on remove buttons (only when labeling mode is active)
      const labelObjects = labelMeshesRef.current.filter(obj => 
        obj.userData?.isLabel && obj.userData?.showRemoveButton
      );
      const intersects = raycaster.intersectObjects(labelObjects, true);
      
      let foundHover = false;
      
      labelMeshesRef.current.forEach(labelGroup => {
        // Only check labels that have remove buttons enabled
        if (!labelGroup.userData?.showRemoveButton || !labelGroup.userData?.crossSprite) return;
        
        const crossSprite = labelGroup.userData.crossSprite;
        const isHovered = labelGroup.userData.isHovered;
        
        // Check if mouse is over this cross sprite
        const isOverCross = intersects.some(intersect => {
          let obj = intersect.object;
          while (obj) {
            if (obj === crossSprite) return true;
            obj = obj.parent as THREE.Object3D;
          }
          return false;
        });
        
        if (isOverCross) {
          // Mouse is over this cross
          if (!isHovered) {
            (crossSprite.material as THREE.SpriteMaterial).map = labelGroup.userData.hoverTexture;
            (crossSprite.material as THREE.SpriteMaterial).needsUpdate = true;
            canvas.style.cursor = 'pointer';
            labelGroup.userData.isHovered = true;
          }
          foundHover = true;
        } else if (isHovered) {
          // Mouse left this cross
          (crossSprite.material as THREE.SpriteMaterial).map = labelGroup.userData.normalTexture;
          (crossSprite.material as THREE.SpriteMaterial).needsUpdate = true;
          labelGroup.userData.isHovered = false;
        }
      });
      
      if (!foundHover && canvas.style.cursor === 'pointer') {
        canvas.style.cursor = spineLabelingMode ? 'crosshair' : 'auto';
      }
    };
    
    canvas.addEventListener('mousemove', handleMouseMove);
    
    return () => {
      canvas.removeEventListener('mousemove', handleMouseMove);
    };
  }, [spineLabelingMode, leftRendererRef, cameraRef, labels]); // FIX: Use labels as dependency instead of labelMeshesRef

  // Setup and cleanup
  useEffect(() => {
    if (!spineLabelingMode) return;
    
    const canvas = leftRendererRef.current?.domElement;
    if (!canvas) return;
    
    // Add click listener
    canvas.addEventListener('click', handleLabelClick);
    canvas.style.cursor = 'crosshair';
    
    console.log('Spine labeling mode activated');
    
    return () => {
      canvas.removeEventListener('click', handleLabelClick);
      canvas.style.cursor = 'auto';
    };
  }, [spineLabelingMode, leftRendererRef, handleLabelClick]);

  // Update labels when they change OR when labeling mode changes
  useEffect(() => {
    updateLabelsInScene();
  }, [labels, spineLabelingMode, updateLabelsInScene]); // FIX: Added spineLabelingMode dependency

  return {
    // State
    spineLabelingMode,
    labels,
    isLabelingPopupOpen,
    labelingConfig,
    
    // Actions
    clearLabels,
    removeLabel,
    
    // Utility
    getLabelCount: () => labels.length,
    exportLabels: () => JSON.stringify(labels, null, 2)
  };
};