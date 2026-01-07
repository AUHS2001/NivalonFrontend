import React, { createContext, useState, ReactNode, FC } from 'react';

// Define the shape of your context state and updater function
interface ParentStudyIdContextValue {
  parentStudyId: string | null;
  updateParentStudyId: (newId: string | null) => void;
}

// Create the context with default undefined for proper null checking
export const ParentStudyIdContext = createContext<ParentStudyIdContextValue | undefined>(undefined);

// Define props for the provider component
interface ParentStudyIdProviderProps {
  children: ReactNode;
}

// Provider component with typing
export const ParentStudyIdProvider: FC<ParentStudyIdProviderProps> = ({ children }) => {
  const [parentStudyId, setParentStudyId] = useState<string | null>(null);

  const updateParentStudyId = (newId: string | null) => {
    setParentStudyId(newId);
  };

  return (
    <ParentStudyIdContext.Provider value={{ parentStudyId, updateParentStudyId }}>
      {children}
    </ParentStudyIdContext.Provider>
  );
};
