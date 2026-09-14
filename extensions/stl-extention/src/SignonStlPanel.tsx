import React, { useEffect, useContext, useState, useRef } from 'react';
import "./styles/style.css";

// Context
import { StlInstanceContext } from './../../../platform/app/src/context/StlInstanceContext';
import { useStlVisibilityContext } from './context/StlVisibilityContext';
import { useSpineLabelOverlayContext } from './context/SpineLabelOverlayContext';
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
  const colorInputRef = useRef<HTMLInputElement>(null);

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

  const {
    spineLabelOverlayEnabled,
    centerlineColor,
    labelsVisible,
    transparencyEnabled,
    setCenterlineColor,
    setLabelsVisible,
    toggleTransparency,
  } = useSpineLabelOverlayContext();

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
            },
            credentials: 'include',
          }
        );

        if (!response.ok) {
          throw new Error('Failed to fetch STL data');
        }

        const data = await response.json();
        const versions = data?.data?.versions || [];
        const urls = versions.length > 0
          ? (versions.reduce((a, b) => (a.version > b.version ? a : b)).urls || [])
          : (data?.data?.processed?.urls || []);

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
      padding: '10px',
      overflowY: 'auto',
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
            flexGrow: 1,
            minHeight: 0,
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

      {/* Spine Label Controls — only visible when spine labels are enabled */}
      {spineLabelOverlayEnabled && (
        <div style={{
          marginTop: '12px',
          padding: '12px',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
          background: 'rgba(159, 207, 255, 0.04)',
          border: '1px solid rgba(159, 207, 255, 0.15)',
          borderRadius: '8px',
          flexShrink: 0,
        }}>
          <div style={{
            fontSize: '10px',
            color: '#9fcfff',
            letterSpacing: '0.08em',
            textTransform: 'uppercase' as const,
            marginBottom: '4px',
            fontWeight: 600,
          }}>Spine Label Controls</div>

          {/* Solid / Transparent */}
          <button
            onClick={toggleTransparency}
            style={{
              backgroundColor: transparencyEnabled ? 'rgba(33, 150, 243, 0.15)' : 'rgba(76, 175, 80, 0.15)',
              color: transparencyEnabled ? '#90caf9' : '#a5d6a7',
              border: `1px solid ${transparencyEnabled ? 'rgba(33, 150, 243, 0.6)' : 'rgba(76, 175, 80, 0.6)'}`,
              borderRadius: '6px',
              padding: '9px 12px',
              fontSize: '12px',
              fontWeight: 500,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              width: '100%',
              boxShadow: transparencyEnabled ? '0 0 10px rgba(33, 150, 243, 0.2)' : '0 0 10px rgba(76, 175, 80, 0.2)',
            }}
            title={transparencyEnabled ? 'Click to show solid bones' : 'Click to show transparent bones'}
          >
            <i className={`fas ${transparencyEnabled ? 'fa-cube' : 'fa-eye'}`} style={{ fontSize: '11px', flexShrink: 0 }} />
            {transparencyEnabled ? 'Solid' : 'Transparent'}
          </button>

          {/* Colors */}
          <input
            ref={colorInputRef}
            type="color"
            value={centerlineColor}
            onChange={e => setCenterlineColor(e.target.value)}
            style={{ position: 'absolute', opacity: 0, pointerEvents: 'none', width: 0, height: 0 }}
          />
          <button
            onClick={() => colorInputRef.current?.click()}
            style={{
              backgroundColor: `${centerlineColor}18`,
              color: '#fff',
              border: `1px solid ${centerlineColor}99`,
              borderRadius: '6px',
              padding: '9px 12px',
              fontSize: '12px',
              fontWeight: 500,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              width: '100%',
              boxShadow: `0 0 10px ${centerlineColor}33`,
            }}
            title="Change centerline color"
          >
            <span style={{
              width: '14px',
              height: '14px',
              borderRadius: '50%',
              backgroundColor: centerlineColor,
              display: 'inline-block',
              flexShrink: 0,
              boxShadow: `0 0 6px ${centerlineColor}`,
              border: '1px solid rgba(255,255,255,0.3)',
            }} />
            Centerline Color
          </button>

          {/* Hide / Show Labels */}
          <button
            onClick={() => setLabelsVisible(!labelsVisible)}
            style={{
              backgroundColor: labelsVisible ? 'rgba(0, 229, 255, 0.12)' : 'rgba(255, 255, 255, 0.05)',
              color: labelsVisible ? '#87dbfc' : '#888',
              border: `1px solid ${labelsVisible ? 'rgba(0, 229, 255, 0.5)' : 'rgba(255, 255, 255, 0.15)'}`,
              borderRadius: '6px',
              padding: '9px 12px',
              fontSize: '12px',
              fontWeight: 500,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              width: '100%',
              boxShadow: labelsVisible ? '0 0 10px rgba(0, 229, 255, 0.15)' : 'none',
            }}
          >
            <i className={`fas ${labelsVisible ? 'fa-eye' : 'fa-eye-slash'}`} style={{ fontSize: '11px', flexShrink: 0 }} />
            {labelsVisible ? 'Labels Visible' : 'Labels Hidden'}
          </button>
        </div>
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
