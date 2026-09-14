import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { setCenterlineOverlayColor, setOverlayLabelsVisible } from '../utils/spineLabelOverlayManager';

interface CenterlineHooks {
  setCenterlineColor3D: (hex: string) => void;
  setLabels3DVisible: (v: boolean) => void;
  toggleTransparency3D: () => void;
}

interface SpineLabelOverlayContextType {
  spineLabelOverlayEnabled: boolean;
  toggleSpineLabelOverlay: () => void;
  // Centerline controls (shared with sidebar)
  centerlineColor: string;
  labelsVisible: boolean;
  transparencyEnabled: boolean;
  setCenterlineColor: (hex: string) => void;
  setLabelsVisible: (v: boolean) => void;
  toggleTransparency: () => void;
  registerCenterlineHooks: (hooks: CenterlineHooks) => void;
}

const SpineLabelOverlayContext = createContext<SpineLabelOverlayContextType | undefined>(undefined);

interface SpineLabelOverlayProviderProps {
  children: React.ReactNode;
}

export const SpineLabelOverlayProvider: React.FC<SpineLabelOverlayProviderProps> = ({ children }) => {
  const [spineLabelOverlayEnabled, setSpineLabelOverlayEnabled] = useState(false);
  const [centerlineColor, setCenterlineColorState] = useState('#00e5ff');
  const [labelsVisible, setLabelsVisibleState] = useState(true);
  const [transparencyEnabled, setTransparencyEnabledState] = useState(true);

  const hooksRef = useRef<CenterlineHooks | null>(null);

  const toggleSpineLabelOverlay = useCallback(() => {
    setSpineLabelOverlayEnabled(prev => !prev);
  }, []);

  // Listen for CustomEvent from the OHIF command system
  useEffect(() => {
    const handleToggle = () => { toggleSpineLabelOverlay(); };
    window.addEventListener('spineLabelOverlayToggle', handleToggle);
    return () => window.removeEventListener('spineLabelOverlayToggle', handleToggle);
  }, [toggleSpineLabelOverlay]);

  // Reset controls to defaults whenever spine labels are re-enabled
  useEffect(() => {
    if (spineLabelOverlayEnabled) {
      setTransparencyEnabledState(true);
      setLabelsVisibleState(true);
    }
  }, [spineLabelOverlayEnabled]);

  const registerCenterlineHooks = useCallback((hooks: CenterlineHooks) => {
    hooksRef.current = hooks;
  }, []);

  const setCenterlineColor = useCallback((hex: string) => {
    setCenterlineColorState(hex);
    hooksRef.current?.setCenterlineColor3D(hex);
    setCenterlineOverlayColor(hex);
  }, []);

  const setLabelsVisible = useCallback((v: boolean) => {
    setLabelsVisibleState(v);
    hooksRef.current?.setLabels3DVisible(v);
    setOverlayLabelsVisible(v);
  }, []);

  const toggleTransparency = useCallback(() => {
    setTransparencyEnabledState(prev => !prev);
    hooksRef.current?.toggleTransparency3D();
  }, []);

  return (
    <SpineLabelOverlayContext.Provider value={{
      spineLabelOverlayEnabled,
      toggleSpineLabelOverlay,
      centerlineColor,
      labelsVisible,
      transparencyEnabled,
      setCenterlineColor,
      setLabelsVisible,
      toggleTransparency,
      registerCenterlineHooks,
    }}>
      {children}
    </SpineLabelOverlayContext.Provider>
  );
};

export const useSpineLabelOverlayContext = () => {
  const context = useContext(SpineLabelOverlayContext);
  if (context === undefined) {
    throw new Error('useSpineLabelOverlayContext must be used within a SpineLabelOverlayProvider');
  }
  return context;
};
