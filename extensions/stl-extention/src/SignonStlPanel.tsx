import React, { useEffect, useContext, useState } from 'react';
import "./styles/style.css";

// Context
import { StlInstanceContext } from './../../../platform/app/src/context/StlInstanceContext';
import { useStlVisibilityContext } from './context/StlVisibilityContext';
import { SERVER_URL } from '../../../config/server';

// Hardcoded token for signon viewer
const SIGNON_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIzIiwicm9sZSI6ImFuYWx5c3QiLCJleHAiOjE3OTYyMDMxNDF9.cLkGlpxslfYOe_ZKuseyCiuP7jsr3m8XXZyyrUU5B1Y';

interface SignonStlPanelProps {
  servicesManager?: any;
  commandsManager?: any;
  extensionManager?: any;
}

const SignonStlPanel: React.FC<SignonStlPanelProps> = ({
  servicesManager,
  commandsManager,
  extensionManager
}) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Context
  const context = useContext(StlInstanceContext);
  const stlInstanceId = context?.stlInstanceId;

  const {
    stlFiles,
    toggleStlVisibility,
    toggleAllStlVisibility,
    addStlFiles,
    clearStlFiles
  } = useStlVisibilityContext();

  // Fetch STL files and add them to visibility context
  useEffect(() => {
    const fetchStlFiles = async () => {
      if (!stlInstanceId) return;

      setLoading(true);
      setError(null);

      try {
        const response = await fetch(
          `${SERVER_URL}/analyst/meshes?series_instance_uid=${stlInstanceId}`,
          {
            headers: {
              Authorization: `Bearer ${SIGNON_TOKEN}`,
              "Content-Type": "application/json"
            }
          }
        );

        if (!response.ok) {
          throw new Error('Failed to fetch STL data');
        }

        const data = await response.json();
        const urls = data?.data?.processed?.urls || [];

        console.log('SignonStlPanel - Fetched STL URLs:', urls);

        if (urls.length > 0) {
          // Only add new files if not already present (avoid clearing segmentation mode files)
          const filesInfo = urls.map((url: string, index: number) => ({
            fileName: url.split('/').pop() || `STL-${index + 1}`,
            originalUrl: url,
            meshIndex: index
          }));
          // Check if files are already loaded to avoid duplicates
          if (stlFiles.length === 0 || stlFiles[0]?.originalUrl !== urls[0]) {
            clearStlFiles();
            addStlFiles(filesInfo);
          }
        }
      } catch (err: any) {
        console.error('Error fetching STL files:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchStlFiles();
  }, [stlInstanceId]);

  return (
    <div style={{
      width: '100%',
      height: '100%',
      backgroundColor: '#000',
      color: 'white',
      display: 'flex',
      flexDirection: 'column',
      padding: '10px'
    }}>
      {/* Header */}
      <div style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: "10px",
        marginTop: "40px",
        padding: "5px",
        flexWrap: "nowrap"
      }}>
        <h4 style={{ fontSize: "14px", margin: 0, color: "#9fcfff", whiteSpace: "nowrap" }}>
          Loaded STL Files
        </h4>
        <span style={{
          fontSize: "11px",
          color: "#888",
          whiteSpace: "nowrap",
          display: "inline-flex",
          alignItems: "center",
          gap: "6px"
        }}>
          {stlFiles.length} files
        </span>
      </div>

      {/* Loading state */}
      {loading && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '20px',
          color: '#888'
        }}>
          <span className="spinner-border spinner-border-sm" style={{ marginRight: '10px' }} />
          Loading STL files...
        </div>
      )}

      {/* Error state - hidden, only logged to console */}

      {/* Show All / Hide All buttons */}
      {stlFiles.length > 0 && (
        <>
          <div style={{
            display: "flex",
            gap: "8px",
            marginBottom: "10px"
          }}>
            <button
              onClick={() => toggleAllStlVisibility(false)}
              className="icon-button"
              data-tooltip="Hide all STL files"
              style={{
                fontSize: "11px",
                padding: "2px 4px",
                borderRadius: "4px",
                backgroundColor: 'rgba(255, 77, 77, 0.2)',
                border: '1px solid rgba(255, 77, 77, 0.5)',
                color: '#ff4d4d',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                flex: 1,
                height: "24px",
                justifyContent: 'center'
              }}
            >
              <i className="fas fa-eye-slash" />
              <span>Hide All</span>
            </button>
            <button
              onClick={() => toggleAllStlVisibility(true)}
              className="icon-button"
              data-tooltip="Show all STL files"
              style={{
                fontSize: "11px",
                padding: "2px 4px",
                borderRadius: "4px",
                backgroundColor: 'rgba(77, 255, 77, 0.2)',
                border: '1px solid rgba(77, 255, 77, 0.5)',
                color: '#4dff4d',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                flex: 1,
                height: "24px",
                justifyContent: 'center'
              }}
            >
              <i className="fas fa-eye" />
              <span>Show All</span>
            </button>
          </div>

          {/* File list */}
          <div style={{
            flex: 1,
            overflowY: "auto",
            border: "1px solid #333",
            borderRadius: "4px",
            padding: "8px"
          }}>
            {stlFiles.map((file) => (
              <div
                key={file.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: "6px 8px",
                  borderBottom: "1px solid #363c48",
                  fontSize: "12px",
                  backgroundColor: file.isVisible ? 'transparent' : 'rgba(255,255,255,0.1)',
                }}
              >
                <span
                  style={{
                    color: file.isVisible ? '#fff' : '#888',
                    flex: 1,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap'
                  }}
                  title={file.fileName}
                >
                  {file.fileName}
                </span>
                <button
                  onClick={() => toggleStlVisibility(file.id)}
                  className="icon-button"
                  data-tooltip={file.isVisible ? "Hide from scene" : "Show in scene"}
                  style={{
                    fontSize: "12px",
                    width: "24px",
                    height: "24px",
                    borderRadius: "4px",
                    backgroundColor: 'transparent',
                    border: 'none',
                    color: file.isVisible ? '#87dbfc' : '#888',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                >
                  <i className={`fas ${file.isVisible ? 'fa-eye' : 'fa-eye-slash'}`} />
                </button>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Empty state */}
      {!loading && stlFiles.length === 0 && (
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          flex: 1,
          color: '#888',
          fontSize: '14px'
        }}>
          No STL files loaded
        </div>
      )}
    </div>
  );
};

export default SignonStlPanel;
