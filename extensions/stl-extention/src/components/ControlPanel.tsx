import React from 'react';
import { Measurement } from '../types/three.types';
import { useMeasurementContext } from '../context/MeasurementContext';
import { useBrightnessContext } from '../context/BrightnessContext';
import { useBoneRemovalContext } from '../context/BoneRemovalContext';
import { useClickRemoveContext } from '../context/ClickRemoveContext';
import { useLabelingViewContext } from '../context/LabelingViewContext';
import { useVersionHistoryContext } from '../context/VersionHistoryContext';
import { useImplantContext } from '../context/ImplantContext';
import { useStlVisibilityContext } from '../context/StlVisibilityContext';

interface ControlPanelProps {
  loading: boolean;
  error: string | null;
  approveSuccess: string | null;
  children?: React.ReactNode;
}

export const ControlPanel: React.FC<ControlPanelProps> = ({
  loading,
  error,
  approveSuccess,
  children
}) => {

  const { measurements: contextMeasurements, measurementEnabled, clearMeasurements, removeMeasurement } = useMeasurementContext();
  const { brightnessEnabled, brightness, handleBrightnessChange } = useBrightnessContext();
  const { removalMode, setRemovalMode } = useBoneRemovalContext();
  const { clickRemovalMode, onToggleClickRemoval } = useClickRemoveContext();
  const { showRightView, onToggleRightView } = useLabelingViewContext();
  const { versionHistoryEnabled, toggleVersionHistory } = useVersionHistoryContext();
  const {
    showImplantView,
    closeImplantView,
    implantFile
  } = useImplantContext();
  const {
    stlFiles,
    toggleStlVisibility,
    hideAllStlFiles,
    showAllStlFiles,
    toggleAllStlVisibility,
    compareRightFiles,
    toggleCompareRightVisibility,
    toggleAllCompareRightVisibility,
  } = useStlVisibilityContext();

  const type = localStorage.getItem('myLayout');
  const isCompareLayout = type === '3d-compare';

  // Show content if layout type matches or if no layout is set yet (default behavior)
  const shouldShowContent = !type || type === 'fourUp' || type === 'main3D' || type === 'karachi-layout' || type === 'primary3D' || type === '3d-compare';

  return (
    <div style={{
      flex: 2,
      position: 'relative',
      display: 'flex',
      flexDirection: 'column',
      borderRight: '1.5px solid #fff',
      overflow: 'hidden',
    }}>
      {
        shouldShowContent ?
          <div style={{ backgroundColor: '#0a0e17', borderRight: '1.5px solid #fff', padding: '10px', overflowY: 'auto', flex: 1 }}>
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

            {/* Error state */}
            {error && (
              <div style={{
                backgroundColor: 'rgba(239, 68, 68, 0.15)',
                color: '#ef4444',
                padding: '10px',
                borderRadius: '6px',
                marginBottom: '10px',
                fontSize: '12px'
              }}>
                {error}
              </div>
            )}

            {!loading && !showImplantView && !versionHistoryEnabled && !removalMode && !showRightView &&
            !brightnessEnabled && !measurementEnabled && !clickRemovalMode && stlFiles.length > 0 && (
              <div style={{ marginBottom: '20px', padding: '10px' }}>
                <div style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: "10px",
                  padding: "5px"
                }}>
                  <h4 style={{ fontSize: "14px", margin: 0, color: "#9fcfff" }}>Loaded STL Files</h4>
                  <span style={{ fontSize: "11px", color: "#888" }}>{stlFiles.length} files</span>
                </div>
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
                <div style={{
                  maxHeight: "600px",
                  overflowY: "auto",
                  border: "1px solid #1a2030",
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
                        borderBottom: "1px solid #1a2030",
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
              </div>
            )}

            {/* Compare Right Panel Files - only in 3D compare layout */}
            {isCompareLayout && compareRightFiles.length > 0 && !loading && !showImplantView &&
            !versionHistoryEnabled && !removalMode && !showRightView &&
            !brightnessEnabled && !measurementEnabled && !clickRemovalMode && (
              <div style={{ marginBottom: '20px', padding: '10px' }}>
                <div style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: "10px",
                  padding: "5px"
                }}>
                  <h4 style={{ fontSize: "14px", margin: 0, color: "#9fcfff" }}>Compare Panel Files</h4>
                  <span style={{ fontSize: "11px", color: "#888" }}>{compareRightFiles.length} files</span>
                </div>
                <div style={{
                  display: "flex",
                  gap: "8px",
                  marginBottom: "10px"
                }}>
                  <button
                    onClick={() => toggleAllCompareRightVisibility(false)}
                    className="icon-button"
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
                    onClick={() => toggleAllCompareRightVisibility(true)}
                    className="icon-button"
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
                <div style={{
                  maxHeight: "600px",
                  overflowY: "auto",
                  border: "1px solid #1a2030",
                  borderRadius: "4px",
                  padding: "8px"
                }}>
                  {compareRightFiles.map((file) => (
                    <div
                      key={file.id}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: "6px 8px",
                        borderBottom: "1px solid #1a2030",
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
                        onClick={() => toggleCompareRightVisibility(file.id)}
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
              </div>
            )}

            {showImplantView && (
              <div style={{ marginTop: '10px'}}>
                {children}
              </div>
            )}


            {versionHistoryEnabled && (
              <div>
                {children}
              </div>
            )}

            {removalMode && (
              <div style={{ color: "#0f0", fontSize: "12px", marginTop: "4px" }}>
                Right-click and drag on the Color View to draw a green outline. Release to remove bones inside.
              </div>
            )}

          {clickRemovalMode && (
              <div style={{ color: "#0f0", fontSize: "12px", marginTop: "4px" }}>
                Click on any bone to remove from the view.
              </div>
            )}

            {showRightView && (
              <>
                <div style={{
                  position: 'relative', color: '#fff', zIndex: 100, width: '60px',
                  backgroundColor: '#0a0e17', padding: '4px 8px', borderRadius: '4px',
                  border: '1px solid #000', fontSize: '12px', marginTop: '12px'
                }}>Labels</div>
                <div style={{ marginTop: "10px", marginBottom: "3px" }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: "2.5px" }}>
                    <div style={{ display: "flex", justifyContent: "flex-start" }}>
                      <span style={{ color: "#3498db", fontSize: "12px" }}>■ Cervical (C1-C7)</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "flex-start" }}>
                      <span style={{ color: "#2ecc71", fontSize: "12px" }}>■ Thoracic (T1-T12)</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "flex-start" }}>
                      <span style={{ width: "1px" }}></span>
                      <span style={{ color: "#e74c3c", fontSize: "12px" }}>■ Lumbar (L1-L5)</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "flex-start" }}>
                      <span style={{ color: "#f1c40f", fontSize: "12px" }}>■ Sacral (S1-S5)</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "flex-start" }}>
                      <span style={{ width: "1px" }}></span>
                      <span style={{ color: "#e91e63", fontSize: "12px" }}>■ Aorta</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "flex-start" }}>
                      <span style={{ color: "#9c27b0", fontSize: "12px" }}>■ Heart</span>
                    </div>
                  </div>
                </div>
              </>
            )}

            {brightnessEnabled && (
              <div style={{ marginTop: "18px" }}>
                <label style={{ fontSize: "12px", display: "block", marginBottom: "5px", color: "#9ceaff" }}>
                  Brightness Level: {brightness.toFixed(1)}
                </label>
                <input
                  type="range"
                  min="0.1"
                  max="100.0"
                  step="0.1"
                  value={brightness}
                  onChange={(e) => handleBrightnessChange(parseFloat(e.target.value))}
                  style={{ width: "100%" }}
                />
              </div>
            )}

            {measurementEnabled && (
              <div style={{ color: "#00ea00", fontSize: "12px", marginTop: "12px" }}>
                Click on the model to place measurement points. Click two points to measure distance.
              </div>
            )}

            {contextMeasurements.length > 0 && (
              <div style={{ marginTop: "18px" }}>
                <div style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: "7px",
                  padding: "5px"
                }}>
                  <h4 style={{ fontSize: "14px", margin: 0, color: "#9fcfff" }}>Measurements</h4>
                  <button
                    onClick={clearMeasurements}
                    className="icon-button danger"
                    data-tooltip="Clear All"
                    style={{ fontSize: "13px", width: "28px", height: "28px", borderRadius: 8 }}
                  >
                    <i className="fas fa-trash-alt" />
                  </button>
                </div>
                <div style={{
                  maxHeight: "330px",
                  overflowY: "auto",
                  border: "1px solid #1a2030",
                  borderRadius: "4px",
                }}>
                  {contextMeasurements.map((meas) => (
                    <div
                      key={meas.id}
                      style={{
                        padding: "6px",
                        borderBottom: "1px solid #1a2030",
                        fontSize: "12px",
                        marginBottom: "12px",
                      }}
                    >
                      <div style={{ fontWeight: "bold", color: "#87dbfc", display: "flex", justifyContent: "space-between" }}>
                        <div>Distance: {meas.distance.toFixed(2)} mm</div>
                        <button
                          onClick={() => removeMeasurement(meas.id)}
                          className="icon-button danger"
                          data-tooltip="Remove"
                          style={{
                            fontSize: "11px",
                            width: "22px",
                            height: "22px",
                            borderRadius: "6px",
                            marginTop: "4px",
                            marginLeft: "-2px",
                          }}
                        >
                          <i className="fas fa-times" />
                        </button>
                      </div>
                      <div style={{ marginTop: "1px", color: "#e8e8e8" }}>
                        Point 1: ({meas.point1.x.toFixed(2)}, {meas.point1.y.toFixed(2)}, {meas.point1.z.toFixed(2)})
                      </div>
                      <div style={{ color: "#e8e8e8" }}>
                        Point 2: ({meas.point2.x.toFixed(2)}, {meas.point2.y.toFixed(2)}, {meas.point2.z.toFixed(2)})
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {!loading && !showImplantView && !versionHistoryEnabled && !removalMode && !showRightView &&
            !brightnessEnabled && !measurementEnabled && !clickRemovalMode && stlFiles.length === 0 && (
              <div style={{
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                height: '100px',
                color: '#888',
                fontSize: '14px',
                marginTop: '40%'
              }}>No STL files loaded</div>
            )}

            {approveSuccess && (
              <div style={{
                color: approveSuccess.startsWith('Approval successful') ? '#2ecc71' : '#2ecc71',
                marginTop: 8,
                fontSize: '12px'
              }}>
                {approveSuccess}
              </div>
            )}
          </div>
       : <></>
      }
    </div>
  );
};
