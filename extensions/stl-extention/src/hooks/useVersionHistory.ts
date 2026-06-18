import { useState, useContext } from 'react';
import { Version } from '../types/three.types';
import { useVersionHistoryContext } from '../context/VersionHistoryContext';
import { StlInstanceContext } from '../../../../platform/app/src/context/StlInstanceContext';
import { SERVER_URL } from '../../../../config/server';

interface UseVersionHistoryProps {
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setApproveSuccess: (message: string | null) => void;
  setStlUrls?: (urls: string[]) => void;
}

export const useVersionHistory = ({
  setLoading,
  setError,
  setApproveSuccess,
  setStlUrls
}: UseVersionHistoryProps) => {
  const [selectedVersion, setSelectedVersion] = useState<number | null>(null);
  const [loadingVersions, setLoadingVersions] = useState(false);
  const { versionHistoryEnabled, versions, setVersions, toggleVersionHistory, setRestoredUrls } = useVersionHistoryContext();
  const context = useContext(StlInstanceContext);
  const { stlInstanceId, updateStlInstanceId } = context;
  const userToken = localStorage.getItem('token') || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIzIiwicm9sZSI6ImFuYWx5c3QiLCJleHAiOjE3OTYyMDMxNDF9.cLkGlpxslfYOe_ZKuseyCiuP7jsr3m8XXZyyrUU5B1Y';

  const fetchVersionHistory = async () => {
    try {
      setLoadingVersions(true);
      try {
        const response = await fetch(
          `${SERVER_URL}/analyst/meshes?series_instance_uid=${stlInstanceId}`,
          {
            headers: {
              Authorization: `Bearer ${userToken}`,
              "Content-Type": "application/json"
            },
            credentials: 'include',
          }
        );

        if (!response.ok) {
          throw new Error('Failed to fetch data');
        }

        const data = await response.json();
        console.log('Fetched versions', data?.data?.versions);
        setVersions(data?.data?.versions);
      } catch (err: any) {
        setError(err.message);
      }
    } catch (err) {
      setError('Error loading version history');
    } finally {
      setLoadingVersions(false);
    }
  };

  const restoreVersion = (versionNumber: number) => {
    // Find the version to restore by version number
    const version = versions.find(v => v.version === versionNumber);
    if (version && version.urls && version.urls.length > 0) {
      console.log("Restoring version", versionNumber, "URLs ==>", version.urls);
      // Set restored URLs in shared context — only the Previous View reacts to this
      setRestoredUrls([...version.urls]);
    } else {
      console.warn("Version not found or has no URLs:", versionNumber, versions);
      setError('Version has no STL files to restore');
    }
    setSelectedVersion(null);
  };

  const getVersionHistory = () => {
    if (!versionHistoryEnabled) {
      fetchVersionHistory();
    }
  };

  // Always refetch versions (used after approve to update the list in real time)
  const refreshVersionHistory = () => {
    fetchVersionHistory();
  };

  return {
    versionHistoryEnabled,
    versions,
    selectedVersion,
    loadingVersions,
    setSelectedVersion,
    getVersionHistory,
    refreshVersionHistory,
    restoreVersion,
  };
};
