import React, { createContext, useState, ReactNode, FC } from 'react';

// Define the shape of your context state and updater function
interface StlInstanceListDataContextValue {
  stlInstanceListData: Record<string, unknown>[];  // Changed to array type
  updateStlInstanceListData: (newListData: Record<string, unknown>[]) => void;  // Changed to accept array
}

// Create the context with default undefined for proper null checking
export const StlInstanceListDataContext = createContext<StlInstanceListDataContextValue | undefined>(undefined);

// Define props for the provider component
interface StlInstanceListDataProviderProps {
  children: ReactNode;
}

// Provider component with typing
export const StlInstanceListDataProvider: FC<StlInstanceListDataProviderProps> = ({ children }) => {
  const [stlInstanceListData, setStlInstanceListData] = useState<Record<string, unknown>[]>([]);  // Initialize with empty array

  const updateStlInstanceListData = (newListData: Record<string, unknown>[]) => {
    setStlInstanceListData(newListData);
  };

  return (
    <StlInstanceListDataContext.Provider value={{ stlInstanceListData, updateStlInstanceListData }}>
      {children}
    </StlInstanceListDataContext.Provider>
  );
};
