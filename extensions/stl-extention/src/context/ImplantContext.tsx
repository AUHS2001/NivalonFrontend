// context/ImplantContext.tsx
import React, { createContext, useContext, useState, ReactNode } from 'react';

interface ImplantContextType {
  // State
  showImplantView: boolean;
  implantFile: File | null;
  loading: boolean;
  error: string | null;

  // Actions
  setShowImplantView: (show: boolean) => void;
  setImplantFile: (file: File | null) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;

  // Handlers
  handleImplantFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  toggleImplantView: () => void;
  closeImplantView: () => void;
  openImplantView: () => void;
  resetImplant: () => void;
}

const ImplantContext = createContext<ImplantContextType | undefined>(undefined);

interface ImplantProviderProps {
  children: ReactNode;
}

export const ImplantProvider: React.FC<ImplantProviderProps> = ({ children }) => {
  const [showImplantView, setShowImplantView] = useState(false);
  const [implantFile, setImplantFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleImplantFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    console.log('Implant file change triggered');
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      console.log('File selected:', file.name);
      if (file.name.toLowerCase().endsWith('.stl')) {
        setImplantFile(file);
        setError(null);
        setShowImplantView(true); // Automatically show implant view when file is selected
      } else {
        setError('Please select an STL file for the implant');
        setImplantFile(null);
      }
    }
  };

  const toggleImplantView = () => {
    console.log('Toggling implant view, current:', showImplantView);
    setShowImplantView(prev => !prev);
  };

  const closeImplantView = () => {
    console.log('Closing implant view');
    setShowImplantView(false);
  };

  const openImplantView = () => {
    console.log('Opening implant view');
    setShowImplantView(true);
  };

  const resetImplant = () => {
    setShowImplantView(false);
    setImplantFile(null);
    setLoading(false);
    setError(null);
  };

  const value: ImplantContextType = {
    showImplantView,
    implantFile,
    loading,
    error,
    setShowImplantView,
    setImplantFile,
    setLoading,
    setError,
    handleImplantFileChange,
    toggleImplantView,
    closeImplantView,
    openImplantView,
    resetImplant,
  };

  return (
    <ImplantContext.Provider value={value}>
      {children}
    </ImplantContext.Provider>
  );
};

export const useImplantContext = () => {
  const context = useContext(ImplantContext);
  if (context === undefined) {
    throw new Error('useImplantContext must be used within an ImplantProvider');
  }
  return context;
};
