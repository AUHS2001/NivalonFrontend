import React, { useRef } from 'react';
import { useOVFSetup } from '../hooks/useOVFSetup';

interface OVFViewerProps {
  servicesManager: any;
  commandsManager: any;
  extensionManager?: any;
  dataSource?: any;
}

const OVFViewer: React.FC<OVFViewerProps> = ({ servicesManager, commandsManager, extensionManager, dataSource }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const csContainerRef = useRef<HTMLDivElement>(null);
  const threeCanvasRef = useRef<HTMLCanvasElement>(null);

  const { loading, error, loadProgress, vertebraLegend } = useOVFSetup({
    servicesManager,
    commandsManager,
    extensionManager,
    dataSource,
    csContainerRef,
    containerRef,
    threeCanvasRef,
  });

  return (
    <div
      ref={containerRef}
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        background: '#0A0F17',
      }}
    >
      {/* Layer 1: Cornerstone volume3d (CT bone volume, bottom) */}
      <div
        ref={csContainerRef}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          pointerEvents: 'none',
          zIndex: 0,
        }}
      />

      {/* Layer 2: Three.js canvas (colored STL meshes, transparent bg, on top) */}
      <canvas
        ref={threeCanvasRef}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          zIndex: 1,
        }}
      />

      {/* UI Overlay */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          pointerEvents: 'none',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          zIndex: 2,
        }}
      >
        {/* Title */}
        <div
          style={{
            padding: '12px 16px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <span
            style={{
              color: '#fff',
              fontSize: '14px',
              fontWeight: 600,
              background: 'rgba(0,0,0,0.5)',
              padding: '4px 12px',
              borderRadius: '4px',
              letterSpacing: '0.5px',
            }}
          >
            OVF Screening
          </span>
        </div>

        {/* Legend (bottom-left) */}
        {vertebraLegend.length > 0 && (
          <div
            style={{
              padding: '12px 16px',
              maxHeight: '40%',
              overflow: 'auto',
            }}
          >
            <div
              style={{
                background: 'rgba(0,0,0,0.6)',
                borderRadius: '6px',
                padding: '8px 12px',
                display: 'inline-flex',
                flexDirection: 'column',
                gap: '3px',
                maxWidth: '200px',
              }}
            >
              <span
                style={{
                  color: '#aaa',
                  fontSize: '11px',
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                  marginBottom: '2px',
                }}
              >
                Vertebrae
              </span>
              {vertebraLegend.map((entry, i) => (
                <div
                  key={i}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                >
                  <div
                    style={{
                      width: '10px',
                      height: '10px',
                      borderRadius: '2px',
                      backgroundColor: entry.color,
                      flexShrink: 0,
                    }}
                  />
                  <span style={{ color: '#ddd', fontSize: '11px' }}>{entry.name}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Loading overlay */}
      {loading && (
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(0, 0, 0, 0.85)',
            zIndex: 10,
          }}
        >
          <div
            style={{
              width: '200px',
              height: '4px',
              background: '#333',
              borderRadius: '2px',
              overflow: 'hidden',
              marginBottom: '12px',
            }}
          >
            <div
              style={{
                width: `${loadProgress}%`,
                height: '100%',
                background: '#4fc3f7',
                borderRadius: '2px',
                transition: 'width 0.3s ease',
              }}
            />
          </div>
          <span style={{ color: '#aaa', fontSize: '13px' }}>
            Loading OVF view... {loadProgress}%
          </span>
        </div>
      )}

      {/* Error overlay */}
      {error && !loading && (
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            background: 'rgba(0,0,0,0.7)',
            padding: '16px 24px',
            borderRadius: '8px',
            color: '#ef5350',
            fontSize: '14px',
            zIndex: 10,
            textAlign: 'center',
            maxWidth: '400px',
          }}
        >
          {error}
        </div>
      )}
    </div>
  );
};

export default OVFViewer;
