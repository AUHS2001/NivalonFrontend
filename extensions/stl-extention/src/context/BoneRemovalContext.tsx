import React, { createContext, useContext, useState, ReactNode } from 'react';

interface BoneRemovalContextType {
  removalMode: boolean;
  setRemovalMode: (mode: boolean) => void;
}

const BoneRemovalContext = createContext<BoneRemovalContextType | undefined>(undefined);

interface BoneRemovalProviderProps {
  children: ReactNode;
}

export const BoneRemovalProvider: React.FC<BoneRemovalProviderProps> = ({ children }) => {
  const [removalMode, setRemovalMode] = useState(false);

  const value: BoneRemovalContextType = {
    removalMode,
    setRemovalMode,
  };

  return (
    <BoneRemovalContext.Provider value={value}>
      {children}
    </BoneRemovalContext.Provider>
  );
};

export const useBoneRemovalContext = (): BoneRemovalContextType => {
  const context = useContext(BoneRemovalContext);
  if (context === undefined) {
    throw new Error('useBoneRemovalContext must be used within a BoneRemovalProvider');
  }
  return context;
};
