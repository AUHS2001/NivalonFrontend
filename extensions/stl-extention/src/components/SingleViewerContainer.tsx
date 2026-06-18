import React from 'react';
import { useLabelingViewContext } from '../context/LabelingViewContext';

interface SingleViewerContainerProps {
  startMountRef: React.RefObject<HTMLDivElement>;
  leftMountRef: React.RefObject<HTMLDivElement>;
  rightMountRef: React.RefObject<HTMLDivElement>;
  removalCanvasRef: React.RefObject<HTMLCanvasElement>;
  children?: React.ReactNode;
  inertialRotationMode?: boolean;
  pivotBoneIndex?: number | null;
  currentRotationAngle?: number;
  onResetBone?: () => void;
}

export const SingleViewerContainer: React.FC<SingleViewerContainerProps> = ({
  startMountRef,
  leftMountRef,
  rightMountRef,
  removalCanvasRef,
  children,
  inertialRotationMode = false,
  pivotBoneIndex = null,
  currentRotationAngle = 0,
  onResetBone,
}) => {

  const { showRightView, onToggleRightView } = useLabelingViewContext();

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
      <div style={{ flex: 1, position: 'relative', height: '100%' }}>
        {/* 3D View Header with Instructions */}
        <div style={{
          position: 'absolute', top: 0, left: 10, color: '#fff', zIndex: 100,
          marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '6px'
        }}>
          <div style={{
            backgroundColor: '#0a0e17', padding: '4px 8px', borderRadius: '4px',
            fontSize: '12px', width: 'fit-content'
          }}>3D View</div>

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
        display: 'none'
        // display: showRightView ? 'block' : 'none'
      }}>
        <div style={{
          position: 'absolute', top: 0,left: 300, color: '#fff', zIndex: 100,
          backgroundColor: '#0a0e17', padding: '4px 8px', borderRadius: '4px',
          fontSize: '12px', marginTop: '12px'
        }}>Labelling View</div>
        <div ref={rightMountRef} style={{ width: '100%', height: '100%' }} />
      </div>

      {children}
    </div>
  );
};
