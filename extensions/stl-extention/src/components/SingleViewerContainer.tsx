import React from 'react';
import { useLabelingViewContext } from '../context/LabelingViewContext';

interface SingleViewerContainerProps {
  startMountRef: React.RefObject<HTMLDivElement>;
  leftMountRef: React.RefObject<HTMLDivElement>;
  rightMountRef: React.RefObject<HTMLDivElement>;
  removalCanvasRef: React.RefObject<HTMLCanvasElement>;
  children?: React.ReactNode;
}

export const SingleViewerContainer: React.FC<SingleViewerContainerProps> = ({
  startMountRef,
  leftMountRef,
  rightMountRef,
  removalCanvasRef,
  children
}) => {

  const { showRightView, onToggleRightView } = useLabelingViewContext();

  return (
    <div style={{ flex: 1, display: 'flex', width: '100%', backgroundColor: '#000', position: 'relative' }}>
      {/* Start View */}
      <div style={{ flex: 1, position: 'relative', display: 'none'  }}>
        <div style={{
          position: 'absolute', top: 0, left: 10, color: '#fff', zIndex: 100,
          backgroundColor: '#17202a', padding: '4px 8px', borderRadius: '4px',
          fontSize: '12px', marginTop: '12px'
        }}>3D View</div>
        <div ref={startMountRef} style={{ width: '100%', height: '70%', position: 'relative' }} />
      </div>

      {/* Left Viewer */}
      <div style={{ flex: 1, position: 'relative' }}>
        <div style={{
          position: 'absolute', top: 0, left: 10, color: '#fff', zIndex: 100,
          backgroundColor: '#17202a', padding: '4px 8px', borderRadius: '4px',
          fontSize: '12px', marginTop: '12px'
        }}>3D View</div>
        <div ref={leftMountRef} style={{ width: '100%', height: '70%' }} />
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
        flex: 1,
        position: 'relative',
        display: 'none'
        // display: showRightView ? 'block' : 'none'
      }}>
        <div style={{
          position: 'absolute', top: 0,left: 300, color: '#fff', zIndex: 100,
          backgroundColor: '#17202a', padding: '4px 8px', borderRadius: '4px',
          fontSize: '12px', marginTop: '12px'
        }}>Labelling View</div>
        <div ref={rightMountRef} style={{ width: '100%', height: '70%' }} />
      </div>

      {children}
    </div>
  );
};
