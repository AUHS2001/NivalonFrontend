import React, { createContext, useContext, useState, ReactNode } from 'react';

interface ClickRemoveContextType {
  clickRemovalMode: boolean;
  onToggleClickRemoval: (mode: boolean) => void;
}

const ClickRemoveContext = createContext<ClickRemoveContextType | undefined>(undefined);

interface ClickRemoveProviderProps {
  children: ReactNode;
}

export const ClickRemoveProvider: React.FC<ClickRemoveProviderProps> = ({ children }) => {
  const [clickRemovalMode, onToggleClickRemoval] = useState(false);

  const value: ClickRemoveContextType = {
    clickRemovalMode,
    onToggleClickRemoval,
  };

  return (
    <ClickRemoveContext.Provider value={value}>
      {children}
    </ClickRemoveContext.Provider>
  );
};

export const useClickRemoveContext = (): ClickRemoveContextType => {
  const context = useContext(ClickRemoveContext);
  if (context === undefined) {
    throw new Error('useClickRemoveContext must be used within a ClickRemoveProvider');
  }
  return context;
};
