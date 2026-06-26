import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';

type ActivePanel = 'left' | 'right' | 'both';

interface ActivePanelContextType {
  activePanel: ActivePanel;
  setActivePanel: (panel: ActivePanel) => void;
  togglePanel: (side: 'left' | 'right') => void;
  isPanelActive: (side: 'left' | 'right') => boolean;
}

const ActivePanelContext = createContext<ActivePanelContextType | undefined>(undefined);

interface ActivePanelProviderProps {
  children: ReactNode;
}

export const ActivePanelProvider: React.FC<ActivePanelProviderProps> = ({ children }) => {
  const [activePanel, setActivePanel] = useState<ActivePanel>('both');

  const togglePanel = useCallback((side: 'left' | 'right') => {
    setActivePanel(prev => {
      const leftOn = prev === 'both' || prev === 'left';
      const rightOn = prev === 'both' || prev === 'right';

      const newLeft = side === 'left' ? !leftOn : leftOn;
      const newRight = side === 'right' ? !rightOn : rightOn;

      // At least one must stay checked
      if (!newLeft && !newRight) return prev;

      if (newLeft && newRight) return 'both';
      if (newLeft) return 'left';
      return 'right';
    });
  }, []);

  const isPanelActive = useCallback((side: 'left' | 'right') => {
    return activePanel === 'both' || activePanel === side;
  }, [activePanel]);

  const value: ActivePanelContextType = {
    activePanel,
    setActivePanel,
    togglePanel,
    isPanelActive,
  };

  return (
    <ActivePanelContext.Provider value={value}>
      {children}
    </ActivePanelContext.Provider>
  );
};

export const useActivePanelContext = (): ActivePanelContextType => {
  const context = useContext(ActivePanelContext);
  if (context === undefined) {
    throw new Error('useActivePanelContext must be used within an ActivePanelProvider');
  }
  return context;
};
