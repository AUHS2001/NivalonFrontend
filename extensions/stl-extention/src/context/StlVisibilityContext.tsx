import React, { createContext, useContext, useState, ReactNode } from 'react';

export interface StlFileInfo {
  id: string;
  fileName: string;
  isVisible: boolean;
  originalUrl: string;
  meshIndex?: number;
}

interface StlVisibilityContextType {
  stlFiles: StlFileInfo[];
  addStlFiles: (files: { fileName: string; originalUrl: string; meshIndex?: number }[]) => void;
  toggleStlVisibility: (id: string) => void;
  setStlVisibility: (id: string, visible: boolean) => void;
  clearStlFiles: () => void;
  updateMeshVisibility: (meshIndex: number, visible: boolean) => void;
  hideAllStlFiles: () => void;
  showAllStlFiles: () => void;
  toggleAllStlVisibility: (visible: boolean) => void;
  compareRightFiles: StlFileInfo[];
  setCompareRightFiles: (files: StlFileInfo[]) => void;
  toggleCompareRightVisibility: (id: string) => void;
  toggleAllCompareRightVisibility: (visible: boolean) => void;
}

const StlVisibilityContext = createContext<StlVisibilityContextType | undefined>(undefined);

export const StlVisibilityProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [stlFiles, setStlFiles] = useState<StlFileInfo[]>([]);
  const [compareRightFiles, setCompareRightFiles] = useState<StlFileInfo[]>([]);

  const addStlFiles = (files: { fileName: string; originalUrl: string; meshIndex?: number }[]) => {
    setStlFiles(prev => {
      const newFiles = files.filter(newFile =>
        !prev.some(existingFile => existingFile.fileName === newFile.fileName)
      );

      const newStlFiles = newFiles.map(file => ({
        id: `${file.fileName}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        fileName: file.fileName,
        isVisible: true,
        originalUrl: file.originalUrl,
        meshIndex: file.meshIndex
      }));

      return [...prev, ...newStlFiles];
    });
  };

  const toggleStlVisibility = (id: string) => {
    setStlFiles(prev =>
      prev.map(file => {
        if (file.id === id) {
          const newVisibility = !file.isVisible;
          return { ...file, isVisible: newVisibility };
        }
        return file;
      })
    );
  };

  const setStlVisibility = (id: string, visible: boolean) => {
    setStlFiles(prev =>
      prev.map(file =>
        file.id === id ? { ...file, isVisible: visible } : file
      )
    );
  };

  const updateMeshVisibility = (meshIndex: number, visible: boolean) => {
    setStlFiles(prev =>
      prev.map(file =>
        file.meshIndex === meshIndex ? { ...file, isVisible: visible } : file
      )
    );
  };

  const clearStlFiles = () => {
    setStlFiles([]);
  };

  // NEW: Hide all STL files
  const hideAllStlFiles = () => {
    setStlFiles(prev =>
      prev.map(file => ({
        ...file,
        isVisible: false
      }))
    );
  };

  // NEW: Show all STL files
  const showAllStlFiles = () => {
    setStlFiles(prev =>
      prev.map(file => ({
        ...file,
        isVisible: true
      }))
    );
  };

  const toggleAllStlVisibility = (visible: boolean) => {
    setStlFiles(prev =>
      prev.map(file => ({
        ...file,
        isVisible: visible
      }))
    );
  };

  const toggleCompareRightVisibility = (id: string) => {
    setCompareRightFiles(prev =>
      prev.map(file =>
        file.id === id ? { ...file, isVisible: !file.isVisible } : file
      )
    );
  };

  const toggleAllCompareRightVisibility = (visible: boolean) => {
    setCompareRightFiles(prev =>
      prev.map(file => ({ ...file, isVisible: visible }))
    );
  };

  return (
    <StlVisibilityContext.Provider
      value={{
        stlFiles,
        addStlFiles,
        toggleStlVisibility,
        setStlVisibility,
        clearStlFiles,
        updateMeshVisibility,
        hideAllStlFiles,
        showAllStlFiles,
        toggleAllStlVisibility,
        compareRightFiles,
        setCompareRightFiles,
        toggleCompareRightVisibility,
        toggleAllCompareRightVisibility,
      }}
    >
      {children}
    </StlVisibilityContext.Provider>
  );
};

export const useStlVisibilityContext = () => {
  const context = useContext(StlVisibilityContext);
  if (context === undefined) {
    throw new Error('useStlVisibilityContext must be used within a StlVisibilityProvider');
  }
  return context;
};
