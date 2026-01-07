import React, { createContext, useContext, useState, ReactNode } from 'react';

interface CenterLineContextType {
  centerLineEnabled: boolean;
  toggleCenterLine: () => void;
}

const CenterLineContext = createContext<CenterLineContextType | undefined>(undefined);

export const useCenterLineContext = () => {
  const context = useContext(CenterLineContext);
  if (context === undefined) {
    throw new Error('useCenterLineContext must be used within a CenterLineProvider');
  }
  return context;
};

interface CenterLineProviderProps {
  children: ReactNode;
  toggleCenterLine: () => void;
  centerLineEnabled: boolean;
}

export const CenterLineProvider: React.FC<CenterLineProviderProps> = ({
  children,
  toggleCenterLine,
  centerLineEnabled
}) => {
  return (
    <CenterLineContext.Provider value={{
      centerLineEnabled,
      toggleCenterLine
    }}>
      {children}
    </CenterLineContext.Provider>
  );
};
