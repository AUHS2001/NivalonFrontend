import { useState, useContext } from 'react';
import { Version } from '../types/three.types';
import { useVersionHistoryContext } from '../context/VersionHistoryContext';
import { StlInstanceContext } from '../../../../platform/app/src/context/StlInstanceContext';
import { useSTLLoader } from './useSTLLoader';
import { SERVER_URL } from '../../../../config/server';

interface UseVersionHistoryProps {
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setApproveSuccess: (message: string | null) => void;
}

export const useVersionHistory = ({
  setLoading,
  setError,
  setApproveSuccess
}: UseVersionHistoryProps) => {
  const [selectedVersion, setSelectedVersion] = useState<number | null>(null);
  const [loadingVersions, setLoadingVersions] = useState(false);
  const { versionHistoryEnabled, versions, setVersions, toggleVersionHistory } = useVersionHistoryContext();
  const context = useContext(StlInstanceContext);
  const { stlInstanceId, updateStlInstanceId } = context;
  const userToken = localStorage.getItem('token') || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIzIiwicm9sZSI6ImFuYWx5c3QiLCJleHAiOjE3OTYyMDMxNDF9.cLkGlpxslfYOe_ZKuseyCiuP7jsr3m8XXZyyrUU5B1Y';

  const [versionUrlsToRestore, setVersionUrlsToRestore] = useState<string[]>([]);

  const fetchVersionHistory = async () => {
    try {
      setLoadingVersions(true);
      try {
        const response = await fetch(
          `${SERVER_URL}/analyst/get-3d?series_instance_uid=${stlInstanceId}`,
          {
            headers: {
              Authorization: `Bearer ${userToken}`,
              "Content-Type": "application/json"
            }
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

  const restoreVersion = async (versionId: number) => {
    try {
      setLoading(true);

      // Find the version to restore
      const version = versions.find(v => v.id === versionId);
      if (version) {
        console.log("Selected version URLs ==> ", version.urls);

        // Store the URLs to be used for restoration
        setVersionUrlsToRestore(version.urls);

        // setApproveSuccess(`  Version ${version.version} restored successfully!`);

      }

      setSelectedVersion(null);

    } catch (err) {
      setError('Error restoring version');
    } finally {
      setLoading(false);
    }
  };

  const getVersionHistory = () => {
    if (!versionHistoryEnabled) {
      fetchVersionHistory();
    }
  };

  return {
    versionHistoryEnabled,
    versions,
    selectedVersion,
    loadingVersions,
    setSelectedVersion,
    getVersionHistory,
    restoreVersion,
    versionUrlsToRestore
  };
};
