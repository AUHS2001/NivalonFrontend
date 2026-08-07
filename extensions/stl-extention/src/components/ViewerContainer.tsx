import React from 'react';
import { useVersionHistoryContext } from '../context/VersionHistoryContext';

interface ViewerContainerProps {
  startMountRef: React.RefObject<HTMLDivElement>;
  leftMountRef: React.RefObject<HTMLDivElement>;
  rightMountRef: React.RefObject<HTMLDivElement>;
  removalCanvasRef: React.RefObject<HTMLCanvasElement>;
  showRightView: boolean;
  show: boolean;
  children?: React.ReactNode;
}

export const ViewerContainer: React.FC<ViewerContainerProps> = ({
  startMountRef,
  leftMountRef,
  rightMountRef,
  removalCanvasRef,
  showRightView,
  show,
  children
}) => {
  const { previousViewLoading, isApproving, approveProgress, isDownloading, downloadProgress, isUploading, uploadProgress } = useVersionHistoryContext();
  return (
    <div style={{
        flex: 1,
        display: 'flex',
        width: '100%',
        backgroundColor: '#0a0e17',
        position: 'relative',
        height: '100%',
        minHeight: '700px'
      }}>
      {/* Start View (Previous View) */}
      <div style={{ flex: 1, position: 'relative', display: show ? 'block' : 'none', height: '100%' }}>
        {show && children && (
          <div style={{
            position: 'absolute',
            top: 10,
            left: 10,
            right: 10,
            zIndex: 150,
            padding: '10px',
            backgroundColor: 'rgba(10, 14, 23, 0.92)',
            borderRadius: '8px',
            border: '1px solid #333',
            overflowY: 'auto',
            maxHeight: '60%',
          }}>
            {children}
          </div>
        )}
        <div style={{ width: '100%', height: '100%', position: 'relative' }}>
          {previousViewLoading && (
            <div style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: 'rgba(10, 14, 23, 0.85)',
              zIndex: 200,
            }}>
              <div style={{
                width: '40px',
                height: '40px',
                border: '3px solid rgba(135, 219, 252, 0.3)',
                borderTop: '3px solid #87dbfc',
                borderRadius: '50%',
                animation: 'spin 1s linear infinite',
              }} />
              <div style={{ color: '#87dbfc', marginTop: '12px', fontSize: '13px' }}>
                Loading 3D Model...
              </div>
              <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            </div>
          )}
          <div ref={startMountRef} style={{ width: '100%', height: '100%', position: 'relative' }} />
        </div>
      </div>

      {/* Left Viewer */}
      <div style={{ flex: 1, position: 'relative', display: 'none'  }}>
        <div style={{
          position: 'absolute', top: 0, left: 10, color: '#fff', zIndex: 100,
          backgroundColor: '#0a0e17', padding: '4px 8px', borderRadius: '4px',
          border: '1px solid #000', fontSize: '12px', marginTop: '12px'
        }}>Latest View</div>
        <div ref={leftMountRef} style={{ width: '100%', height: '70%', position: 'relative' }} />
        <canvas
          ref={removalCanvasRef}
          style={{
            position: 'absolute', top: 0, left: 0, width: '100%', height: '70%',
            pointerEvents: 'none', zIndex: 150, userSelect: 'none',
          }}
        />
      </div>

      {/* Right Viewer */}
      <div style={{
        flex: 2,
        position: 'relative',
        display: 'none'
      }}>
        <div style={{
          position: 'absolute', top: 0, left: 10, color: '#fff', zIndex: 100,
          backgroundColor: '#0a0e17', padding: '4px 8px', borderRadius: '4px',
          border: '1px solid #000', fontSize: '12px', marginTop: '12px'
        }}>Labelling View</div>
        <div ref={rightMountRef} style={{ width: '100%', height: '70%' }} />
      </div>

      {/* Upload progress bar */}
      {isUploading && (
        <div style={{
          position: 'absolute',
          bottom: (isApproving ? 60 : 0) + (isDownloading ? 60 : 0) + 20,
          left: 20,
          right: 20,
          zIndex: 200,
          backgroundColor: 'rgba(10, 14, 23, 0.9)',
          borderRadius: '8px',
          padding: '12px 16px',
          border: '1px solid #333',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <span style={{ color: '#87dbfc', fontSize: '13px', fontWeight: 600 }}>
              Uploading 3D Files...
            </span>
            <span style={{ color: '#4FC3F7', fontSize: '13px', fontWeight: 700 }}>
              {uploadProgress}%
            </span>
          </div>
          <div style={{
            width: '100%', height: '6px', backgroundColor: '#333', borderRadius: '3px', overflow: 'hidden'
          }}>
            <div style={{
              width: `${uploadProgress}%`,
              height: '100%',
              background: 'linear-gradient(90deg, #4FC3F7, #2196F3)',
              borderRadius: '3px',
              transition: 'width 0.3s ease-out',
            }} />
          </div>
        </div>
      )}

      {/* Download progress bar */}
      {isDownloading && (
        <div style={{
          position: 'absolute',
          bottom: isApproving ? 80 : 20,
          left: 20,
          right: 20,
          zIndex: 200,
          backgroundColor: 'rgba(10, 14, 23, 0.9)',
          borderRadius: '8px',
          padding: '12px 16px',
          border: '1px solid #333',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <span style={{ color: '#87dbfc', fontSize: '13px', fontWeight: 600 }}>
              Downloading 3D Model...
            </span>
            <span style={{ color: '#4FC3F7', fontSize: '13px', fontWeight: 700 }}>
              {downloadProgress}%
            </span>
          </div>
          <div style={{
            width: '100%', height: '6px', backgroundColor: '#333', borderRadius: '3px', overflow: 'hidden'
          }}>
            <div style={{
              width: `${downloadProgress}%`,
              height: '100%',
              background: 'linear-gradient(90deg, #4FC3F7, #2196F3)',
              borderRadius: '3px',
              transition: 'width 0.3s ease-out',
            }} />
          </div>
        </div>
      )}

      {/* Approve progress bar */}
      {isApproving && (
        <div style={{
          position: 'absolute',
          bottom: 20,
          left: 20,
          right: 20,
          zIndex: 200,
          backgroundColor: 'rgba(10, 14, 23, 0.9)',
          borderRadius: '8px',
          padding: '12px 16px',
          border: '1px solid #333',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <span style={{ color: '#87dbfc', fontSize: '13px', fontWeight: 600 }}>
              Approving 3D Files...
            </span>
            <span style={{ color: '#4FC3F7', fontSize: '13px', fontWeight: 700 }}>
              {approveProgress}%
            </span>
          </div>
          <div style={{
            width: '100%', height: '6px', backgroundColor: '#333', borderRadius: '3px', overflow: 'hidden'
          }}>
            <div style={{
              width: `${approveProgress}%`,
              height: '100%',
              background: 'linear-gradient(90deg, #4FC3F7, #2196F3)',
              borderRadius: '3px',
              transition: 'width 0.3s ease-out',
            }} />
          </div>
        </div>
      )}

      {!show && children}
    </div>
  );
};
