import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';

interface SpineLabelOverlayContextType {
  spineLabelOverlayEnabled: boolean;
  toggleSpineLabelOverlay: () => void;
}

const SpineLabelOverlayContext = createContext<SpineLabelOverlayContextType | undefined>(undefined);

interface SpineLabelOverlayProviderProps {
  children: React.ReactNode;
}

export const SpineLabelOverlayProvider: React.FC<SpineLabelOverlayProviderProps> = ({ children }) => {
  const [spineLabelOverlayEnabled, setSpineLabelOverlayEnabled] = useState(false);

  const toggleSpineLabelOverlay = useCallback(() => {
    setSpineLabelOverlayEnabled(prev => !prev);
  }, []);

  // Listen for CustomEvent from the OHIF command system
  useEffect(() => {
    const handleToggle = () => {
      toggleSpineLabelOverlay();
    };

    window.addEventListener('spineLabelOverlayToggle', handleToggle);
    return () => {
      window.removeEventListener('spineLabelOverlayToggle', handleToggle);
    };
  }, [toggleSpineLabelOverlay]);

  return (
    <SpineLabelOverlayContext.Provider value={{ spineLabelOverlayEnabled, toggleSpineLabelOverlay }}>
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
