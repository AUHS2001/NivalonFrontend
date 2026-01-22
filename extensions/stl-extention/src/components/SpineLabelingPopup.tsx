import React, { useState } from 'react';
import { useSpineLabelingContext } from '../context/SpineLabelingContext';

interface SpineLabelingPopupProps {
  onClose: () => void;
}

export const SpineLabelingPopup: React.FC<SpineLabelingPopupProps> = ({ onClose }) => {
  const { setLabelingConfig, getVertebraeList } = useSpineLabelingContext();
  const [selectedStart, setSelectedStart] = useState('C1');
  const [direction, setDirection] = useState<'ascend' | 'descend'>('ascend');

  const vertebraeList = getVertebraeList();

  // Group vertebrae by type
  const cervical = vertebraeList.filter(v => v.startsWith('C'));
  const thoracic = vertebraeList.filter(v => v.startsWith('T'));
  const lumbar = vertebraeList.filter(v => v.startsWith('L'));
  const sacral = vertebraeList.filter(v => v.startsWith('S'));

  const handleStartLabeling = () => {
    setLabelingConfig({
      startFrom: selectedStart,
      direction,
      currentIndex: 0
    });
    onClose();
  };

  const handleCancel = () => {
    onClose();
  };

  return (
    <div className="spine-labeling-popup" style={{
      position: 'fixed',
      top: '50%',
      left: '50%',
      transform: 'translate(-50%, -50%)',
      backgroundColor: '#090D2A',
      color: 'white',
      padding: '24px',
      borderRadius: '12px',
      zIndex: 10000,
      boxShadow: '0 4px 20px rgba(0, 0, 0, 0.5)',
      minWidth: '500px',
      maxWidth: '90vw'
    }}>
      <h3 style={{
        marginTop: 0,
        marginBottom: '20px',
        color: '#ffffff',
        textAlign: 'center',
        fontSize: '20px'
      }}>
        SPINE LABELING
      </h3>

      {/* Start From Selection */}
      <div style={{ marginBottom: '20px' }}>
        <div style={{
          marginBottom: '8px',
          fontSize: '14px',
          fontWeight: 'bold',
          color: '#ecf0f1'
        }}>
          Select the label to start from: *
        </div>
        
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: '8px'
        }}>
          {/* Column Headers */}
          <div style={{ textAlign: 'center', fontWeight: 'bold', color: '#0D307F' }}>Cervical</div>
          <div style={{ textAlign: 'center', fontWeight: 'bold', color: '#2ecc71' }}>Thoracic</div>
          <div style={{ textAlign: 'center', fontWeight: 'bold', color: '#e74c3c' }}>Lumbar</div>
          <div style={{ textAlign: 'center', fontWeight: 'bold', color: '#f1c40f' }}>Sacral</div>
          
          {/* Vertebrae Grid */}
          {Array.from({ length: Math.max(cervical.length, thoracic.length, lumbar.length, sacral.length) }).map((_, rowIndex) => (
            <React.Fragment key={rowIndex}>
              {/* Cervical */}
              <div style={{ textAlign: 'center' }}>
                {rowIndex < cervical.length && (
                  <button
                    onClick={() => setSelectedStart(cervical[rowIndex])}
                    style={{
                      width: '100%',
                      padding: '8px 4px',
                      backgroundColor: selectedStart === cervical[rowIndex] ? '#0D307F' : '#34495e',
                      color: 'white',
                      border: `2px solid ${selectedStart === cervical[rowIndex] ? '#2980b9' : '#2c3e50'}`,
                      borderRadius: '6px',
                      cursor: 'pointer',
                      fontSize: '12px'
                    }}
                  >
                    {cervical[rowIndex]}
                  </button>
                )}
              </div>
              
              {/* Thoracic */}
              <div style={{ textAlign: 'center' }}>
                {rowIndex < thoracic.length && (
                  <button
                    onClick={() => setSelectedStart(thoracic[rowIndex])}
                    style={{
                      width: '100%',
                      padding: '8px 4px',
                      backgroundColor: selectedStart === thoracic[rowIndex] ? '#2ecc71' : '#34495e',
                      color: 'white',
                      border: `2px solid ${selectedStart === thoracic[rowIndex] ? '#27ae60' : '#2c3e50'}`,
                      borderRadius: '6px',
                      cursor: 'pointer',
                      fontSize: '12px'
                    }}
                  >
                    {thoracic[rowIndex]}
                  </button>
                )}
              </div>
              
              {/* Lumbar */}
              <div style={{ textAlign: 'center' }}>
                {rowIndex < lumbar.length && (
                  <button
                    onClick={() => setSelectedStart(lumbar[rowIndex])}
                    style={{
                      width: '100%',
                      padding: '8px 4px',
                      backgroundColor: selectedStart === lumbar[rowIndex] ? '#e74c3c' : '#34495e',
                      color: 'white',
                      border: `2px solid ${selectedStart === lumbar[rowIndex] ? '#c0392b' : '#2c3e50'}`,
                      borderRadius: '6px',
                      cursor: 'pointer',
                      fontSize: '12px'
                    }}
                  >
                    {lumbar[rowIndex]}
                  </button>
                )}
              </div>
              
              {/* Sacral */}
              <div style={{ textAlign: 'center' }}>
                {rowIndex < sacral.length && (
                  <button
                    onClick={() => setSelectedStart(sacral[rowIndex])}
                    style={{
                      width: '100%',
                      padding: '8px 4px',
                      backgroundColor: selectedStart === sacral[rowIndex] ? '#f1c40f' : '#34495e',
                      color: 'white',
                      border: `2px solid ${selectedStart === sacral[rowIndex] ? '#f39c12' : '#2c3e50'}`,
                      borderRadius: '6px',
                      cursor: 'pointer',
                      fontSize: '12px'
                    }}
                  >
                    {sacral[rowIndex]}
                  </button>
                )}
              </div>
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* Direction Selection */}
      <div style={{ marginBottom: '24px' }}>
        <div style={{
          marginBottom: '8px',
          fontSize: '14px',
          fontWeight: 'bold',
          color: '#ecf0f1'
        }}>
          Set direction of labeling:
        </div>
        
        <div style={{
          display: 'flex',
          gap: '20px'
        }}>
          <label style={{
            display: 'flex',
            alignItems: 'center',
            cursor: 'pointer'
          }}>
            <input
              type="radio"
              name="direction"
              checked={direction === 'ascend'}
              onChange={() => setDirection('ascend')}
              style={{
                marginRight: '8px',
                accentColor: '#0D307F'
              }}
            />
            <span style={{ color: '#ecf0f1' }}>Ascend</span>
          </label>
          
          <label style={{
            display: 'flex',
            alignItems: 'center',
            cursor: 'pointer'
          }}>
            <input
              type="radio"
              name="direction"
              checked={direction === 'descend'}
              onChange={() => setDirection('descend')}
              style={{
                marginRight: '8px',
                accentColor: '#0D307F'
              }}
            />
            <span style={{ color: '#ecf0f1' }}>Descend</span>
          </label>
        </div>
      </div>

      {/* Buttons */}
      <div style={{
        display: 'flex',
        justifyContent: 'flex-end',
        gap: '12px',
        borderTop: '1px solid #34495e',
        paddingTop: '16px'
      }}>
        <button
          onClick={handleCancel}
          style={{
            padding: '10px 20px',
            backgroundColor: '#7f8c8d',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: 'bold',
            minWidth: '100px'
          }}
        >
          Close
        </button>
        
        <button
          onClick={handleStartLabeling}
          style={{
            padding: '10px 20px',
            backgroundColor: '#0D307F',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: 'bold',
            minWidth: '100px'
          }}
        >
          Start Labeling
        </button>
      </div>
    </div>
  );
};