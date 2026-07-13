import React, { createContext, useContext, useState, ReactNode } from 'react';

interface BrightnessContextType {
  brightnessEnabled: boolean;
  brightness: number;
  setBrightnessEnabled: (enabled: boolean) => void;
  setBrightness: (value: number) => void;
  toggleBrightness: () => void;
  handleBrightnessChange: (value: number) => void;
}

const BrightnessContext = createContext<BrightnessContextType | undefined>(undefined);

interface BrightnessProviderProps {
  children: ReactNode;
}

export const BrightnessProvider: React.FC<BrightnessProviderProps> = ({ children }) => {
  const [brightnessEnabled, setBrightnessEnabled] = useState(false);
  const [brightness, setBrightness] = useState(100);

  const toggleBrightness = () => {
    setBrightnessEnabled(prev => !prev);
  };

  const handleBrightnessChange = (value: number) => {
    setBrightness(value);
  };

  const value: BrightnessContextType = {
    brightnessEnabled,
    brightness,
    setBrightnessEnabled,
    setBrightness,
    toggleBrightness,
    handleBrightnessChange
  };

  return (
    <BrightnessContext.Provider value={value}>
      {children}
    </BrightnessContext.Provider>
  );
};

export const useBrightnessContext = (): BrightnessContextType => {
  const context = useContext(BrightnessContext);
  if (context === undefined) {
    throw new Error('useBrightnessContext must be used within a BrightnessProvider');
  }
  return context;
};
