import React, { useState } from 'react';
import { Measurement } from '../types/three.types';

// Volume preset preview images
import imgCTAAA from '../../../../platform/ui-next/assets/images/CT-AAA.png';
import imgCTAAA2 from '../../../../platform/ui-next/assets/images/CT-AAA2.png';
import imgCTAir from '../../../../platform/ui-next/assets/images/CT-Air.png';
import imgCTBone from '../../../../platform/ui-next/assets/images/CT-Bone.png';
import imgCTBones from '../../../../platform/ui-next/assets/images/CT-Bones.png';
import imgCTCardiac from '../../../../platform/ui-next/assets/images/CT-Cardiac.png';
import imgCTCardiac2 from '../../../../platform/ui-next/assets/images/CT-Cardiac2.png';
import imgCTCardiac3 from '../../../../platform/ui-next/assets/images/CT-Cardiac3.png';
import imgCTChestCE from '../../../../platform/ui-next/assets/images/CT-Chest-Contrast-Enhanced.png';
import imgCTChestV from '../../../../platform/ui-next/assets/images/CT-Chest-Vessels.png';
import imgCTCoronary from '../../../../platform/ui-next/assets/images/CT-Coronary-Arteries.png';
import imgCTCoronary2 from '../../../../platform/ui-next/assets/images/CT-Coronary-Arteries-2.png';
import imgCTCoronary3 from '../../../../platform/ui-next/assets/images/CT-Coronary-Arteries-3.png';
import imgCTCroppedBone from '../../../../platform/ui-next/assets/images/CT-Cropped-Volume-Bone.png';
import imgCTFat from '../../../../platform/ui-next/assets/images/CT-Fat.png';
import imgCTLiver from '../../../../platform/ui-next/assets/images/CT-Liver-Vasculature.png';
import imgCTLung from '../../../../platform/ui-next/assets/images/CT-Lung.png';
import imgCTMIP from '../../../../platform/ui-next/assets/images/CT-MIP.png';
import imgCTMuscle from '../../../../platform/ui-next/assets/images/CT-Muscle.png';
import imgCTPulmonary from '../../../../platform/ui-next/assets/images/CT-Pulmonary-Arteries.png';
import imgCTSoftTissue from '../../../../platform/ui-next/assets/images/CT-Soft-Tissue.png';
import imgMRAngio from '../../../../platform/ui-next/assets/images/MR-Angio.png';
import imgMRDefault from '../../../../platform/ui-next/assets/images/MR-Default.png';
import imgMRMIP from '../../../../platform/ui-next/assets/images/MR-MIP.png';
import imgMRT2Brain from '../../../../platform/ui-next/assets/images/MR-T2-Brain.png';

const PRESET_IMAGES: Record<string, string> = {
  'CT-AAA': imgCTAAA, 'CT-AAA2': imgCTAAA2, 'CT-Air': imgCTAir,
  'CT-Bone': imgCTBone, 'CT-Bones': imgCTBones,
  'CT-Cardiac': imgCTCardiac, 'CT-Cardiac2': imgCTCardiac2, 'CT-Cardiac3': imgCTCardiac3,
  'CT-Chest-Contrast-Enhanced': imgCTChestCE, 'CT-Chest-Vessels': imgCTChestV,
  'CT-Coronary-Arteries': imgCTCoronary, 'CT-Coronary-Arteries-2': imgCTCoronary2, 'CT-Coronary-Arteries-3': imgCTCoronary3,
  'CT-Cropped-Volume-Bone': imgCTCroppedBone, 'CT-Fat': imgCTFat,
  'CT-Liver-Vasculature': imgCTLiver, 'CT-Lung': imgCTLung, 'CT-MIP': imgCTMIP,
  'CT-Muscle': imgCTMuscle, 'CT-Pulmonary-Arteries': imgCTPulmonary,
  'CT-Soft-Tissue': imgCTSoftTissue,
  'MR-Angio': imgMRAngio, 'MR-Default': imgMRDefault, 'MR-MIP': imgMRMIP, 'MR-T2-Brain': imgMRT2Brain,
};
import { useMeasurementContext } from '../context/MeasurementContext';
import { useBrightnessContext } from '../context/BrightnessContext';
import { useBoneRemovalContext } from '../context/BoneRemovalContext';
import { useClickRemoveContext } from '../context/ClickRemoveContext';
import { useLabelingViewContext } from '../context/LabelingViewContext';
import { useVersionHistoryContext } from '../context/VersionHistoryContext';
import { useImplantContext } from '../context/ImplantContext';
import { useStlVisibilityContext } from '../context/StlVisibilityContext';
import { useOvfLegendContext } from '../context/OvfLegendContext';

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
    compareLeftFiles,
    toggleCompareLeftVisibility,
    toggleAllCompareLeftVisibility,
  } = useStlVisibilityContext();
  const { vertebraLegend, colorsDisabled, setColorsDisabled, hiddenVertebrae, toggleVertebraVisibility, selectedPreset, setSelectedPreset, tissueOpacity, setTissueOpacity } = useOvfLegendContext();
  const [showPresetPopup, setShowPresetPopup] = useState(false);

  const type = localStorage.getItem('myLayout');
  const isCompareLayout = type === '3d-compare';
  const isLocalCompareLayout = type === 'local-3d-compare';
  const isOvfLayout = type === 'ovf-layout';

  // Show content if layout type matches or if no layout is set yet (default behavior)
  const shouldShowContent = !type || type === 'fourUp' || type === 'main3D' || type === 'stl-layout' || type === 'primary3D' || type === '3d-compare' || type === 'local-3d-compare' || type === 'ovf-layout';

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

            {/* OVF Vertebrae Legend — shows when OVF data is available */}
            {vertebraLegend.length > 0 && (
              <div style={{ marginBottom: '20px', padding: '10px' }}>
                <div style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: "10px",
                  padding: "5px"
                }}>
                  <h4 style={{ fontSize: "14px", margin: 0, color: "#9fcfff" }}>OVF Screening</h4>
                  <span style={{ fontSize: "11px", color: "#888" }}>{vertebraLegend.length} vertebrae</span>
                </div>
                <div style={{
                  maxHeight: "600px",
                  overflowY: "auto",
                  border: "1px solid #1a2030",
                  borderRadius: "4px",
                  padding: "8px"
                }}>
                  <span style={{
                    color: '#aaa',
                    fontSize: '11px',
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                    marginBottom: '6px',
                    display: 'block',
                  }}>
                    Vertebrae
                  </span>
                  {vertebraLegend.map((entry, i) => {
                    const isHidden = hiddenVertebrae.has(entry.name);
                    return (
                      <div
                        key={i}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '5px 8px',
                          borderBottom: '1px solid #1a2030',
                          fontSize: '12px',
                          backgroundColor: isHidden ? 'rgba(255,255,255,0.05)' : 'transparent',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <div
                            style={{
                              width: '12px',
                              height: '12px',
                              borderRadius: '3px',
                              backgroundColor: isHidden ? '#555' : entry.color,
                              flexShrink: 0,
                            }}
                          />
                          <span style={{ color: isHidden ? '#888' : '#ddd' }}>{entry.name}</span>
                        </div>
                        <button
                          onClick={() => toggleVertebraVisibility(entry.name)}
                          style={{
                            fontSize: '12px',
                            width: '24px',
                            height: '24px',
                            borderRadius: '4px',
                            backgroundColor: 'transparent',
                            border: 'none',
                            color: isHidden ? '#888' : '#87dbfc',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          <i className={`fas ${isHidden ? 'fa-eye-slash' : 'fa-eye'}`} />
                        </button>
                      </div>
                    );
                  })}
                </div>

                <button
                  style={{
                    width: '100%',
                    marginTop: '12px',
                    padding: '5px 12px',
                    borderRadius: '6px',
                    border: '1px solid #555',
                    backgroundColor: 'rgba(255, 255, 255, 0.06)',
                    color: '#ccc',
                    fontSize: '13px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                  }}
                >
                  Fracture Detection Report
                </button>

                <button
                  style={{
                    width: '100%',
                    marginTop: '8px',
                    padding: '5px 12px',
                    borderRadius: '6px',
                    border: '1px solid #555',
                    backgroundColor: 'rgba(255, 255, 255, 0.06)',
                    color: '#ccc',
                    fontSize: '13px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                  }}
                >
                  Show Calculations
                </button>

                <button
                  onClick={() => setColorsDisabled(!colorsDisabled)}
                  style={{
                    width: '100%',
                    marginTop: '8px',
                    padding: '5px 12px',
                    borderRadius: '6px',
                    border: colorsDisabled ? '1px solid #43a047' : '1px solid #555',
                    backgroundColor: colorsDisabled ? 'rgba(67, 160, 71, 0.15)' : 'rgba(255, 255, 255, 0.06)',
                    color: colorsDisabled ? '#66bb6a' : '#ccc',
                    fontSize: '13px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                  }}
                >
                  {colorsDisabled ? 'Enable Colors' : 'Disable Colors'}
                </button>

                <button
                  onClick={() => setShowPresetPopup(true)}
                  style={{
                    width: '100%',
                    marginTop: '8px',
                    padding: '5px 12px',
                    borderRadius: '6px',
                    border: '1px solid #555',
                    backgroundColor: 'rgba(255, 255, 255, 0.06)',
                    color: '#ccc',
                    fontSize: '13px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                  }}
                >
                  Volume Presets
                </button>

                {/* Tissue Visibility Slider */}
                <div style={{ marginTop: '14px' }}>
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '6px',
                  }}>
                    <span style={{ fontSize: '12px', color: '#aaa', fontWeight: 600 }}>
                      Tissue Visibility
                    </span>
                    <span style={{ fontSize: '11px', color: '#888' }}>
                      {tissueOpacity}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={1}
                    value={tissueOpacity}
                    onChange={(e) => setTissueOpacity(Number(e.target.value))}
                    style={{
                      width: '100%',
                      height: '6px',
                      cursor: 'pointer',
                      accentColor: '#0E326E',
                    }}
                  />
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: '10px',
                    color: '#666',
                    marginTop: '2px',
                  }}>
                    <span>Bone Only</span>
                    <span>Full Tissue</span>
                  </div>
                </div>
              </div>
            )}

            {/* Volume Presets Popup */}
            {showPresetPopup && (
              <div
                style={{
                  position: 'fixed',
                  inset: 0,
                  zIndex: 3000,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: 'rgba(0,0,0,0.6)',
                }}
                onClick={() => setShowPresetPopup(false)}
              >
                <div
                  style={{
                    background: '#1a1f2e',
                    borderRadius: '10px',
                    border: '1px solid #333',
                    padding: '20px',
                    width: '480px',
                    maxHeight: '80vh',
                    display: 'flex',
                    flexDirection: 'column',
                    boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
                  }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '14px',
                  }}>
                    <h4 style={{ margin: 0, fontSize: '15px', color: '#9fcfff', fontWeight: 600 }}>
                      Volume Presets
                    </h4>
                    <button
                      onClick={() => setShowPresetPopup(false)}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: '#888',
                        fontSize: '18px',
                        cursor: 'pointer',
                        padding: '2px 6px',
                      }}
                    >
                      <i className="fas fa-times" />
                    </button>
                  </div>
                  <div style={{
                    overflowY: 'auto',
                    flex: 1,
                    display: 'grid',
                    gridTemplateColumns: 'repeat(3, 1fr)',
                    gap: '10px',
                    padding: '4px',
                  }}>
                    {[
                      'CT-AAA', 'CT-AAA2', 'CT-Bone', 'CT-Bones',
                      'CT-Cardiac', 'CT-Cardiac2', 'CT-Cardiac3',
                      'CT-Chest-Contrast-Enhanced', 'CT-Chest-Vessels',
                      'CT-Coronary-Arteries', 'CT-Coronary-Arteries-2', 'CT-Coronary-Arteries-3',
                      'CT-Cropped-Volume-Bone', 'CT-Fat',
                      'CT-Liver-Vasculature', 'CT-Lung', 'CT-MIP',
                      'CT-Muscle', 'CT-Pulmonary-Arteries',
                      'CT-Soft-Tissue', 'CT-Air',
                      'MR-Angio', 'MR-Default', 'MR-MIP', 'MR-T2-Brain',
                    ].map((name) => {
                      const isSelected = selectedPreset === name;
                      return (
                        <div
                          key={name}
                          onClick={() => {
                            setSelectedPreset(name);
                            setShowPresetPopup(false);
                          }}
                          style={{
                            cursor: 'pointer',
                            borderRadius: '6px',
                            border: isSelected ? '2px solid #43a047' : '2px solid transparent',
                            backgroundColor: isSelected ? 'rgba(67, 160, 71, 0.1)' : 'rgba(255,255,255,0.03)',
                            padding: '6px',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            transition: 'border-color 0.15s',
                          }}
                        >
                          {PRESET_IMAGES[name] ? (
                            <img
                              src={PRESET_IMAGES[name]}
                              alt={name}
                              style={{
                                width: '100%',
                                height: '80px',
                                objectFit: 'cover',
                                borderRadius: '4px',
                                backgroundColor: '#000',
                              }}
                            />
                          ) : (
                            <div style={{
                              width: '100%',
                              height: '80px',
                              borderRadius: '4px',
                              backgroundColor: '#111',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              color: '#555',
                              fontSize: '10px',
                            }}>
                              No preview
                            </div>
                          )}
                          <span style={{
                            marginTop: '4px',
                            fontSize: '10px',
                            color: isSelected ? '#66bb6a' : '#aaa',
                            fontWeight: isSelected ? 600 : 400,
                            textAlign: 'center',
                            lineHeight: '1.2',
                            wordBreak: 'break-word',
                          }}>
                            {name}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {!loading && !showImplantView && !versionHistoryEnabled && !removalMode && !showRightView &&
            !brightnessEnabled && !measurementEnabled && !clickRemovalMode && !isLocalCompareLayout && vertebraLegend.length === 0 && stlFiles.length > 0 && (
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

            {/* 3D View Files — local 3D compare layout (uses compareLeftFiles) */}
            {isLocalCompareLayout && compareLeftFiles.length > 0 && !loading && !showImplantView &&
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
                  <h4 style={{ fontSize: "14px", margin: 0, color: "#9fcfff" }}>3D View Files</h4>
                  <span style={{ fontSize: "11px", color: "#888" }}>{compareLeftFiles.length} files</span>
                </div>
                <div style={{
                  display: "flex",
                  gap: "8px",
                  marginBottom: "10px"
                }}>
                  <button
                    onClick={() => toggleAllCompareLeftVisibility(false)}
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
                    onClick={() => toggleAllCompareLeftVisibility(true)}
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
                  {compareLeftFiles.map((file) => (
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
                        onClick={() => toggleCompareLeftVisibility(file.id)}
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
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                  <span style={{ fontSize: "12px", color: "#9ceaff", fontWeight: 500 }}>Brightness</span>
                  <span style={{
                    fontSize: "12px",
                    fontWeight: 600,
                    color: brightness > 100 ? "#9ceaff" : brightness < 100 ? "#6b8aad" : "#c0d8f0"
                  }}>
                    {brightness}%
                  </span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="200"
                  step="1"
                  value={brightness}
                  onChange={(e) => handleBrightnessChange(parseInt(e.target.value))}
                  className="brightness-slider"
                  style={{
                    background: `linear-gradient(90deg, #0A6FFD ${(brightness / 200) * 100}%, #1a2236 ${(brightness / 200) * 100}%)`
                  }}
                />
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "4px" }}>
                  <span style={{ fontSize: "10px", color: "#4a6a8a" }}>Dark</span>
                  <span
                    style={{ fontSize: "10px", color: "#0A6FFD", cursor: "pointer", userSelect: "none" }}
                    onClick={() => handleBrightnessChange(100)}
                  >
                    Reset
                  </span>
                  <span style={{ fontSize: "10px", color: "#4a6a8a" }}>Bright</span>
                </div>
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
            !brightnessEnabled && !measurementEnabled && !clickRemovalMode && stlFiles.length === 0 && !isLocalCompareLayout && vertebraLegend.length === 0 && (
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

            {/* Empty state for local 3D compare layout */}
            {isLocalCompareLayout && compareLeftFiles.length === 0 && compareRightFiles.length === 0 && !loading && (
              <div style={{
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                height: '100px',
                color: '#888',
                fontSize: '14px',
                marginTop: '40%',
                textAlign: 'center',
              }}>Browse STL files from both panels to see file lists here</div>
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

            {/* Compare Right Panel Files - for local 3D compare layout */}
            {isLocalCompareLayout && compareRightFiles.length > 0 && !loading && !showImplantView &&
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
          </div>
       : <></>
      }
    </div>
  );
};
