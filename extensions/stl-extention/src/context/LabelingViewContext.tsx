import React, { createContext, useContext, useState, ReactNode } from 'react';

interface LabelingViewContextType {
  showRightView: boolean;
  onToggleRightView: (mode: boolean) => void;
}

const LabelingViewContext = createContext<LabelingViewContextType | undefined>(undefined);

interface LabelingViewProviderProps {
  children: ReactNode;
}

export const LabelingViewProvider: React.FC<LabelingViewProviderProps> = ({ children }) => {
  const [showRightView, onToggleRightView] = useState(false);

  const value: LabelingViewContextType = {
    showRightView,
    onToggleRightView,
  };

  return (
    <LabelingViewContext.Provider value={value}>
      {children}
    </LabelingViewContext.Provider>
  );
};

export const useLabelingViewContext = (): LabelingViewContextType => {
  const context = useContext(LabelingViewContext);
  if (context === undefined) {
    throw new Error('useLabelingViewContext must be used within a LabelingViewProvider');
  }
  return context;
};
