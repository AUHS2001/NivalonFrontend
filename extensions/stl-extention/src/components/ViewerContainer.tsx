import React from 'react';

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
  return (
    <div style={{
        flex: 1, // Change from flex: 6 to flex: 1
        display: 'flex',
        width: '100%',
        backgroundColor: '#000',
        borderTop: '1.5px solid #fff',
        position: 'relative',
        height: '100%', // Add this
        minHeight: '700px'
      }}>
      {/* Start View */}
      <div style={{ flex: 1, position: 'relative', borderRight: '1.5px solid #fff', display: show ? 'block' : 'none', height: ''  }}>
        <div style={{
          position: 'absolute', top: 0, left: 10, color: '#fff', zIndex: 100,
          backgroundColor: '#17202a', padding: '4px 8px', borderRadius: '4px',
          border: '1px solid #000', fontSize: '12px'
        }}>Previous View</div>
        <div ref={startMountRef} style={{ width: '100%', height: '100%', position: 'relative' }} />
      </div>

      {/* Left Viewer */}
      <div style={{ flex: 1, position: 'relative', borderRight: '1.5px solid #fff', display: 'none'  }}>
        <div style={{
          position: 'absolute', top: 0, left: 10, color: '#fff', zIndex: 100,
          backgroundColor: '#17202a', padding: '4px 8px', borderRadius: '4px',
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
        borderRight: '1.5px solid #fff',
        display: 'none'
      }}>
        <div style={{
          position: 'absolute', top: 0, left: 10, color: '#fff', zIndex: 100,
          backgroundColor: '#17202a', padding: '4px 8px', borderRadius: '4px',
          border: '1px solid #000', fontSize: '12px', marginTop: '12px'
        }}>Labelling View</div>
        <div ref={rightMountRef} style={{ width: '100%', height: '70%' }} />
      </div>

      {children}
    </div>
  );
};
