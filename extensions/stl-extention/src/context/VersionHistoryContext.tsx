import React, { createContext, useContext, useState, ReactNode } from 'react';
import { Version } from '../types/three.types';

interface VersionHistoryContextType {
  versionHistoryEnabled: boolean;
  toggleVersionHistory: () => void;
  versions: Version[];
  setVersions: (versions: Version[]) => void;
  setVersionHistoryEnabled: (enabled: boolean) => void;
  restoredUrls: string[] | null;
  setRestoredUrls: (urls: string[] | null) => void;
  previousViewLoading: boolean;
  setPreviousViewLoading: (loading: boolean) => void;
  isApproving: boolean;
  setIsApproving: (v: boolean) => void;
  approveProgress: number;
  setApproveProgress: (v: number) => void;
  isDownloading: boolean;
  setIsDownloading: (v: boolean) => void;
  downloadProgress: number;
  setDownloadProgress: (v: number) => void;
}

const VersionHistoryContext = createContext<VersionHistoryContextType | undefined>(undefined);

interface VersionHistoryProviderProps {
  children: ReactNode;
}

export const VersionHistoryProvider: React.FC<VersionHistoryProviderProps> = ({ children }) => {
  const [versionHistoryEnabled, setVersionHistoryEnabled] = useState(false);
  const [versions, setVersions] = useState<Version[]>([]);
  const [restoredUrls, setRestoredUrls] = useState<string[] | null>(null);
  const [previousViewLoading, setPreviousViewLoading] = useState(false);
  const [isApproving, setIsApproving] = useState(false);
  const [approveProgress, setApproveProgress] = useState(0);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);

  const toggleVersionHistory = () => {
    setVersionHistoryEnabled(prev => !prev);
  };

  const value: VersionHistoryContextType = {
    versionHistoryEnabled,
    toggleVersionHistory,
    versions,
    setVersions,
    setVersionHistoryEnabled,
    restoredUrls,
    setRestoredUrls,
    previousViewLoading,
    setPreviousViewLoading,
    isApproving,
    setIsApproving,
    approveProgress,
    setApproveProgress,
    isDownloading,
    setIsDownloading,
    downloadProgress,
    setDownloadProgress,
  };

  return (
    <VersionHistoryContext.Provider value={value}>
      {children}
    </VersionHistoryContext.Provider>
  );
};

export const useVersionHistoryContext = (): VersionHistoryContextType => {
  const context = useContext(VersionHistoryContext);
  if (context === undefined) {
    throw new Error('useVersionHistoryContext must be used within a VersionHistoryProvider');
  }
  return context;
};
