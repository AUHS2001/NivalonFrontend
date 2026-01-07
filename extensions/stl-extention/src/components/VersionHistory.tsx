import React, { useState, useEffect } from 'react';
import { Version } from '../types/three.types';
import { useVersionHistoryContext } from '../context/VersionHistoryContext';

interface VersionHistoryProps {
  versions: Version[];
  selectedVersion: number | null;
  loadingVersions: boolean;
  versionHistoryEnabled: boolean;
  onSelectVersion: (id: number) => void;
  onRestoreVersion: (id: number) => void;
}

export const VersionHistory: React.FC<VersionHistoryProps> = ({
  versions,
  selectedVersion,
  loadingVersions,
  versionHistoryEnabled,
  onSelectVersion,
  onRestoreVersion
}) => {
  const { toggleVersionHistory, setVersionHistoryEnabled } = useVersionHistoryContext();
  const [isListExpanded, setIsListExpanded] = useState(false);

  console.log('VersionHistory rendered:', {
    versionHistoryEnabled,
    versionsCount: versions.length,
    loadingVersions,
    versions,
    isListExpanded
  });

  const handleVersionSelect = (id: number) => {
    onSelectVersion(id);
    // Only expand the list when selecting a version, don't toggle
    if (!isListExpanded) {
      setIsListExpanded(true);
    }
  };

  const handleRestoreVersion = (e: React.MouseEvent, versionId: number) => {
    e.stopPropagation();
    onRestoreVersion(versionId);
    // Close the list only after restoration
    setIsListExpanded(false);
  };

  const toggleList = () => {
    setIsListExpanded(prev => !prev);
    // Clear selection when collapsing
    if (isListExpanded) {
      onSelectVersion(null);
    }
  };

  if (!versionHistoryEnabled) {
    console.log('VersionHistory: not enabled, returning null');
    return null;
  }

  return (
    <div style={{ border: "1px solid #444", padding: "10px", borderRadius: "8px" }}>
      {/* Header that toggles the list */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          cursor: 'pointer',
          padding: '8px',
          backgroundColor: '#1a1a1a',
          borderRadius: '4px',
          marginBottom: isListExpanded ? '0px' : '0'
        }}
        onClick={toggleList}
      >
        <div style={{ fontWeight: "bold", color: "#87dbfc" }}>
          Version History ({versions.length})
        </div>
        <div style={{ color: "#87dbfc", fontSize: "14px" }}>
          {isListExpanded ? '▼' : '►'}
        </div>
      </div>

      {/* Collapsible content */}
      {isListExpanded && (
        <>
          {loadingVersions ? (
            <div style={{ color: "#9fcfff", textAlign: "center", padding: "20px" }}>
              Loading versions...
            </div>
          ) : versions.length === 0 ? (
            <div style={{ color: "#888", textAlign: "center", padding: "20px" }}>
              No version history available
            </div>
          ) : (
            <div style={{ maxHeight: "300px", overflowY: "auto" }}>
              {versions.map((version) => (
                <div
                  key={version.id}
                  style={{
                    padding: "8px",
                    marginBottom: "8px",
                    border: "1px solid #333",
                    borderRadius: "4px",
                    backgroundColor: selectedVersion === version.id ? "#2c3e50" : "transparent",
                    cursor: "pointer"
                  }}
                  onClick={() => handleVersionSelect(version.id)}
                >
                  <div style={{ fontWeight: "bold", color: "#87dbfc" }}>
                    Version {version.version}
                  </div>
                  <div style={{ color: "#e8e8e8", fontSize: "12px" }}>
                    Total files: {version.urls.length || 0}
                  </div>
                  <div style={{ color: "#aaa", fontSize: "11px" }}>
                    {new Date(version.uploaded_at).toLocaleDateString()}
                  </div>

                  {selectedVersion === version.id && (
                    <button
                      onClick={(e) => handleRestoreVersion(e, version.id)}
                      style={{
                        marginTop: "8px",
                        padding: "4px 8px",
                        backgroundColor: "#27ae60",
                        color: "white",
                        border: "none",
                        borderRadius: "4px",
                        cursor: "pointer",
                        fontSize: "11px"
                      }}
                    >
                      Restore
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
};
