import React from 'react';
import { useLabelingViewContext } from '../context/LabelingViewContext';
import { useActivePanelContext } from '../context/ActivePanelContext';

interface SingleViewerContainerProps {
  startMountRef: React.RefObject<HTMLDivElement>;
  leftMountRef: React.RefObject<HTMLDivElement>;
  rightMountRef: React.RefObject<HTMLDivElement>;
  removalCanvasRef: React.RefObject<HTMLCanvasElement>;
  rightRemovalCanvasRef?: React.RefObject<HTMLCanvasElement>;
  children?: React.ReactNode;
  inertialRotationMode?: boolean;
  pivotBoneIndex?: number | null;
  currentRotationAngle?: number;
  onResetBone?: () => void;
  localOnly?: boolean;
  compareMode?: boolean;
  onBrowseLeft?: () => void;
  leftHasModel?: boolean;
  leftLoading?: boolean;
  onBrowseRight?: () => void;
  rightHasModel?: boolean;
  rightLoading?: boolean;
  syncCameras?: boolean;
  onToggleSync?: () => void;
}

export const SingleViewerContainer: React.FC<SingleViewerContainerProps> = ({
  startMountRef,
  leftMountRef,
  rightMountRef,
  removalCanvasRef,
  rightRemovalCanvasRef,
  children,
  inertialRotationMode = false,
  pivotBoneIndex = null,
  currentRotationAngle = 0,
  onResetBone,
  localOnly = false,
  compareMode = false,
  onBrowseLeft,
  leftHasModel = false,
  leftLoading = false,
  onBrowseRight,
  rightHasModel = false,
  rightLoading = false,
  syncCameras = false,
  onToggleSync,
}) => {

  const { showRightView, onToggleRightView } = useLabelingViewContext();
  const { togglePanel, isPanelActive } = useActivePanelContext();
  const showComparePanel = localOnly || compareMode;

  return (
    <div style={{ flex: 1, display: 'flex', width: '100%', height: '100%', backgroundColor: '#0a0e17', position: 'relative' }}>
      {/* Start View */}
      <div style={{ flex: 1, position: 'relative', display: 'none'  }}>
        <div style={{
          position: 'absolute', top: 0, left: 10, color: '#fff', zIndex: 100,
          backgroundColor: '#0a0e17', padding: '4px 8px', borderRadius: '4px',
          fontSize: '12px', marginTop: '12px'
        }}>3D View</div>
        <div ref={startMountRef} style={{ width: '100%', height: '70%', position: 'relative' }} />
      </div>

      {/* Left Viewer */}
      <div style={{ flex: 1, position: 'relative', height: '100%', borderRight: showComparePanel ? '2px solid #ffffff' : 'none' }}>
        {/* 3D View Header with Instructions */}
        <div style={{
          position: 'absolute', top: 0, left: 10, color: '#fff', zIndex: 100,
          marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '6px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{
              backgroundColor: '#0a0e17', padding: '4px 8px', borderRadius: '4px',
              fontSize: '12px', width: 'fit-content'
            }}>3D View</div>
            {showComparePanel && (
              <div
                onClick={() => togglePanel('left')}
                style={{
                  width: '14px', height: '14px', borderRadius: '50%', cursor: 'pointer',
                  border: `2px solid ${isPanelActive('left') ? '#00ffff' : '#555'}`,
                  backgroundColor: isPanelActive('left') ? '#00ffff' : 'transparent',
                  transition: 'all 0.15s ease',
                }}
                title={isPanelActive('left') ? 'Tools active on this panel' : 'Tools inactive on this panel'}
              />
            )}
          </div>

          {/* Interactive Rotation Instructions */}
          {inertialRotationMode && (
            <div style={{
              backgroundColor: 'rgba(23, 32, 42, 0.95)',
              padding: '8px 12px',
              borderRadius: '4px',
              fontSize: '11px',
              lineHeight: '1.5',
              maxWidth: '220px',
              border: '1px solid #1a2030'
            }}>
              {/* Rotation angle display */}
              {currentRotationAngle !== 0 && (
                <div style={{
                  color: '#00ffff',
                  fontSize: '14px',
                  fontWeight: 'bold',
                  marginBottom: '6px',
                  textAlign: 'center'
                }}>
                  {currentRotationAngle.toFixed(1)}°
                </div>
              )}

              {/* Ring colors */}
              <div style={{
                display: 'flex',
                gap: '10px',
                marginBottom: '6px',
                justifyContent: 'center'
              }}>
                <span><span style={{ color: '#ff4444' }}>●</span> X</span>
                <span><span style={{ color: '#4488ff' }}>●</span> Y</span>
                <span><span style={{ color: '#44ff44' }}>●</span> Z</span>
              </div>

              {/* Instructions */}
              <div style={{ color: '#aaa', fontSize: '10px' }}>
                {pivotBoneIndex === null ? (
                  <span style={{ color: '#4FC3F7' }}>Click bone to place gizmo</span>
                ) : (
                  <>
                    <div>• Drag ring to rotate</div>
                    <div>• Drag <span style={{ color: '#FFD93D' }}>●</span> center to move</div>
                    <div>• Double-click to reset</div>
                  </>
                )}
              </div>

              {/* Reset All Bones Button */}
              {onResetBone && (
                <button
                  onClick={onResetBone}
                  style={{
                    marginTop: '10px',
                    width: '100%',
                    padding: '6px 12px',
                    backgroundColor: '#e74c3c',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '4px',
                    fontSize: '11px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px'
                  }}
                >
                  <i className="fas fa-undo" />
                  Reset All Bones
                </button>
              )}
            </div>
          )}
        </div>

        {/* Browse STL button for localOnly mode when files are loaded */}
        {localOnly && !leftLoading && leftHasModel && (
          <button
            onClick={onBrowseLeft}
            style={{
              position: 'absolute', top: 10, right: 10, zIndex: 100,
              padding: '6px 14px', borderRadius: '4px', border: '1px solid #334',
              backgroundColor: '#1a1f2e', color: '#aab', cursor: 'pointer',
              fontSize: '11px', fontWeight: 500,
            }}
          >
            Browse STL
          </button>
        )}

        {/* Loading overlay for localOnly mode — inside left panel */}
        {localOnly && leftLoading && (
          <div style={{
            position: 'absolute', inset: 0, zIndex: 30,
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            backgroundColor: 'rgba(0, 0, 0, 0.88)',
          }}>
            <div style={{
              width: '56px', height: '56px',
              border: '4px solid rgba(255,255,255,0.1)',
              borderTop: '4px solid #4FC3F7',
              borderRadius: '50%',
              animation: 'stl-spin 0.8s linear infinite',
            }} />
            <div style={{ color: '#fff', marginTop: '20px', fontSize: '16px', fontWeight: 600 }}>Loading 3D Model</div>
            <div style={{ color: '#888', marginTop: '10px', fontSize: '12px' }}>Please wait while the model loads</div>
            <style>{`@keyframes stl-spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        )}

        {/* Browse overlay for localOnly mode when no files loaded */}
        {localOnly && !leftLoading && !leftHasModel && (
          <div style={{
            position: 'absolute', inset: 0, zIndex: 50,
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            pointerEvents: 'none',
          }}>
            <div style={{
              color: '#667', fontSize: '16px', textAlign: 'center',
              padding: '20px', pointerEvents: 'auto',
            }}>
              <div style={{ marginBottom: '16px', fontSize: '36px', opacity: 0.4 }}>+</div>
              <div style={{ marginBottom: '12px' }}>Drop files or browse</div>
              <div style={{ marginBottom: '16px', fontSize: '12px', opacity: 0.6 }}>or</div>
              <button
                onClick={onBrowseLeft}
                style={{
                  padding: '8px 20px', borderRadius: '6px', border: '1px solid #334',
                  backgroundColor: '#1a1f2e', color: '#aab', cursor: 'pointer',
                  fontSize: '13px', fontWeight: 500,
                }}
              >
                Browse STL Files
              </button>
            </div>
          </div>
        )}

        <div ref={leftMountRef} style={{ width: '100%', height: '100%', overflow: 'hidden' }} />
         <canvas
          ref={removalCanvasRef}
          style={{
            position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
            pointerEvents: 'none', zIndex: 150, userSelect: 'none',
          }}
        />
      </div>

      {/* Right Viewer */}
      <div style={{
        flex: 1,
        position: 'relative',
        height: '100%',
        display: showComparePanel ? 'block' : 'none',
      }}>
        <div style={{
          position: 'absolute', top: 0, left: 10, color: '#fff', zIndex: 100,
          display: 'flex', alignItems: 'center', gap: '8px',
          marginTop: '12px',
        }}>
          <div style={{
            backgroundColor: '#0a0e17', padding: '4px 8px', borderRadius: '4px',
            fontSize: '12px',
          }}>Compare Panel</div>
          <div
            onClick={() => togglePanel('right')}
            style={{
              width: '14px', height: '14px', borderRadius: '50%', cursor: 'pointer',
              border: `2px solid ${isPanelActive('right') ? '#00ffff' : '#555'}`,
              backgroundColor: isPanelActive('right') ? '#00ffff' : 'transparent',
              transition: 'all 0.15s ease',
            }}
            title={isPanelActive('right') ? 'Tools active on this panel' : 'Tools inactive on this panel'}
          />
          {onToggleSync && (
            <button
              onClick={onToggleSync}
              style={{
                padding: '4px 10px', borderRadius: '4px', fontSize: '11px',
                border: syncCameras ? '1px solid #4FC3F7' : '1px solid #334',
                backgroundColor: syncCameras ? 'rgba(79,195,247,0.2)' : '#1a1f2e',
                color: syncCameras ? '#4FC3F7' : '#aab',
                cursor: 'pointer', fontWeight: 500,
                display: 'flex', alignItems: 'center', gap: '4px',
              }}
            >
              <i className="fas fa-sync-alt" style={{ fontSize: '10px' }} />
              Sync
            </button>
          )}
        </div>

        {/* Loading overlay for right panel */}
        {showComparePanel && rightLoading && (
          <div style={{
            position: 'absolute', inset: 0, zIndex: 30,
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            backgroundColor: 'rgba(0, 0, 0, 0.88)',
          }}>
            <div style={{
              width: '56px', height: '56px',
              border: '4px solid rgba(255,255,255,0.1)',
              borderTop: '4px solid #4FC3F7',
              borderRadius: '50%',
              animation: 'stl-spin 0.8s linear infinite',
            }} />
            <div style={{ color: '#fff', marginTop: '20px', fontSize: '16px', fontWeight: 600 }}>Loading 3D Model</div>
            <div style={{ color: '#888', marginTop: '10px', fontSize: '12px' }}>Please wait while the model loads</div>
            <style>{`@keyframes stl-spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        )}

        {/* Browse overlay when no model loaded */}
        {showComparePanel && !rightLoading && !rightHasModel && (
          <div style={{
            position: 'absolute', inset: 0, zIndex: 50,
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            pointerEvents: 'none',
          }}>
            <div style={{
              color: '#667', fontSize: '16px', textAlign: 'center',
              padding: '20px', pointerEvents: 'auto',
            }}>
              <div style={{ marginBottom: '16px', fontSize: '36px', opacity: 0.4 }}>+</div>
              <div style={{ marginBottom: '12px' }}>Drop files or browse</div>
              <div style={{ marginBottom: '16px', fontSize: '12px', opacity: 0.6 }}>or</div>
              <button
                onClick={onBrowseRight}
                style={{
                  padding: '8px 20px', borderRadius: '6px', border: '1px solid #334',
                  backgroundColor: '#1a1f2e', color: '#aab', cursor: 'pointer',
                  fontSize: '13px', fontWeight: 500,
                }}
              >
                Browse STL Files
              </button>
            </div>
          </div>
        )}

        {/* Browse button when model already loaded */}
        {showComparePanel && !rightLoading && rightHasModel && (
          <button
            onClick={onBrowseRight}
            style={{
              position: 'absolute', top: 10, right: 10, zIndex: 100,
              padding: '6px 14px', borderRadius: '4px', border: '1px solid #334',
              backgroundColor: '#1a1f2e', color: '#aab', cursor: 'pointer',
              fontSize: '11px', fontWeight: 500,
            }}
          >
            Browse STL
          </button>
        )}

        <div ref={rightMountRef} style={{ width: '100%', height: '100%' }} />
        {rightRemovalCanvasRef && (
          <canvas
            ref={rightRemovalCanvasRef}
            style={{
              position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
              pointerEvents: 'none', zIndex: 150, userSelect: 'none',
            }}
          />
        )}
      </div>

      {children}
    </div>
  );
};
