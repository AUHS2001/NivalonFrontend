import React, { createContext, useContext, useState, useCallback } from 'react';
import * as THREE from 'three';

// Types for spine labeling
export interface SpineLabel {
  id: string;
  vertebraName: string;
  position: THREE.Vector3;
  bonePosition: THREE.Vector3;
  scene: 'left' | 'right' | 'dicom';
  color: number;
  timestamp: Date;
  meshIndex?: number;
}

export interface SpineLabelingConfig {
  startFrom: string; // e.g., "C1", "T1", "L1", "S1"
  direction: 'ascend' | 'descend';
  currentIndex: number;
}

interface SpineLabelingContextType {
  // State
  spineLabelingMode: boolean;
  isLabelingPopupOpen: boolean;
  labels: SpineLabel[];
  labelingConfig: SpineLabelingConfig | null;
  
  // Actions
  toggleSpineLabelingMode: () => void;
  openLabelingPopup: () => void;
  closeLabelingPopup: () => void;
  setLabelingConfig: (config: SpineLabelingConfig) => void;
  addLabel: (position: THREE.Vector3, bonePosition: THREE.Vector3, scene: 'left' | 'right' | 'dicom', meshIndex?: number) => void;
  removeLabel: (id: string) => void;
  clearLabels: () => void;
  getNextVertebraName: () => string;
  getVertebraeList: () => string[];
}

// Create context
const SpineLabelingContext = createContext<SpineLabelingContextType | undefined>(undefined);

// Provider component
interface SpineLabelingProviderProps {
  children: React.ReactNode;
}

export const SpineLabelingProvider: React.FC<SpineLabelingProviderProps> = ({ children }) => {
  const [spineLabelingMode, setSpineLabelingMode] = useState(false);
  const [isLabelingPopupOpen, setIsLabelingPopupOpen] = useState(false);
  const [labels, setLabels] = useState<SpineLabel[]>([]);
  const [labelingConfig, setLabelingConfig] = useState<SpineLabelingConfig | null>(null);

  // List of all vertebrae in anatomical order
  const vertebraeList = [
    'C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7',
    'T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'T8', 'T9', 'T10', 'T11', 'T12',
    'L1', 'L2', 'L3', 'L4', 'L5',
    'S1', 'S2', 'S3', 'S4', 'S5'
  ];

  // Toggle labeling mode
  const toggleSpineLabelingMode = useCallback(() => {
    setSpineLabelingMode(prev => !prev);
    if (spineLabelingMode) {
      setIsLabelingPopupOpen(false);
    }
  }, [spineLabelingMode]);

  // Open labeling popup
  const openLabelingPopup = useCallback(() => {
    setIsLabelingPopupOpen(true);
  }, []);

  // Close labeling popup
  const closeLabelingPopup = useCallback(() => {
    setIsLabelingPopupOpen(false);
  }, []);

  // Set labeling configuration
  const setLabelingConfigHandler = useCallback((config: SpineLabelingConfig) => {
    setLabelingConfig(config);
    setIsLabelingPopupOpen(false);
  }, []);

  // Get next vertebra name based on current configuration
  const getNextVertebraName = useCallback((): string => {
    if (!labelingConfig) return '';
    
    const { startFrom, direction, currentIndex } = labelingConfig;
    const startIndex = vertebraeList.indexOf(startFrom);
    
    if (startIndex === -1) return '';
    
    let nextIndex;
    if (direction === 'ascend') {
      nextIndex = startIndex + currentIndex;
    } else {
      nextIndex = startIndex - currentIndex;
    }
    
    // Ensure index is within bounds
    if (nextIndex >= 0 && nextIndex < vertebraeList.length) {
      return vertebraeList[nextIndex];
    }
    
    return '';
  }, [labelingConfig, vertebraeList]);

  // In your context file, update the addLabel function:
const addLabel = useCallback((position: THREE.Vector3, bonePosition: THREE.Vector3, scene: 'left' | 'right' | 'dicom', meshIndex?: number) => {
  if (!labelingConfig) return;
  
  const vertebraName = getNextVertebraName();
  if (!vertebraName) return;
  
  const newLabel: SpineLabel = {
    id: `label_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    vertebraName,
    position: position.clone(),
    bonePosition: bonePosition.clone(), // Store bone position
    scene,
    color: 0x00ff00,
    timestamp: new Date(),
    meshIndex
  };
  
  setLabels(prev => [...prev, newLabel]);
  
  // Update current index for next label
  setLabelingConfig(prev => prev ? {
    ...prev,
    currentIndex: prev.currentIndex + 1
  } : null);
}, [labelingConfig, getNextVertebraName]);

  // Remove a label
  const removeLabel = useCallback((id: string) => {
    setLabels(prev => prev.filter(label => label.id !== id));
  }, []);

  // Clear all labels
  const clearLabels = useCallback(() => {
    setLabels([]);
    setLabelingConfig(null);
  }, []);

  // Get vertebrae list
  const getVertebraeList = useCallback(() => vertebraeList, [vertebraeList]);

  const value: SpineLabelingContextType = {
    // State
    spineLabelingMode,
    isLabelingPopupOpen,
    labels,
    labelingConfig,
    
    // Actions
    toggleSpineLabelingMode,
    openLabelingPopup,
    closeLabelingPopup,
    setLabelingConfig: setLabelingConfigHandler,
    addLabel,
    removeLabel,
    clearLabels,
    getNextVertebraName,
    getVertebraeList
  };

  return (
    <SpineLabelingContext.Provider value={value}>
      {children}
    </SpineLabelingContext.Provider>
  );
};

// Hook to use the spine labeling context
export const useSpineLabelingContext = () => {
  const context = useContext(SpineLabelingContext);
  if (context === undefined) {
    throw new Error('useSpineLabelingContext must be used within a SpineLabelingProvider');
  }
  return context;
};