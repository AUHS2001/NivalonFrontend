// components/SeriesSelectionPopup.tsx
import React, { useState, useContext } from 'react';

import { StlInstanceContext } from '../../../../platform/app/src/context/StlInstanceContext';

interface Series {
  series_instance_uid: string;
  series_number: string;
  description: string;
  modality: string;
  num_series_instances: number;
  instance_urls: string[];
}

interface SeriesSelectionPopupProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (series1: Series | null, series2: Series | null) => void;
  seriesList: Series[];
}

export const SeriesSelectionPopup: React.FC<SeriesSelectionPopupProps> = ({
  isOpen,
  onClose,
  onConfirm,
  seriesList
}) => {
  const [selectedSeries1, setSelectedSeries1] = useState<Series | null>(null);
  const [selectedSeries2, setSelectedSeries2] = useState<Series | null>(null);
  const [error, setError] = useState<string>('');
  const context = useContext(StlInstanceContext);
  const { stlInstanceId, updateStlInstanceId, seriesName, seriesName1, updateSeriesName, updateSeriesName1 } = context;

  if (!isOpen) return null;

  const handleConfirm = () => {
    if (!selectedSeries1 || !selectedSeries2) {
      setError('Please select two series for comparison');
      return;
    }

    if (selectedSeries1.series_instance_uid === selectedSeries2.series_instance_uid) {
      setError('Please select two different series');
      return;
    }

    onConfirm(selectedSeries1, selectedSeries2);
    handleClose();
  };

  const handleClose = () => {
    setSelectedSeries1(null);
    setSelectedSeries2(null);
    setError('');
    onClose();
  };

  const handleSeriesSelect = (series: Series, position: 1 | 2) => {
    if (position === 1) {
      setSelectedSeries1(series);
      updateSeriesName(series.description);
    } else {
      setSelectedSeries2(series);
      updateSeriesName1(series.description);
    }
    setError('');
  };

  const getSeriesDescription = (series: Series) => {
    return `Series ${series.series_number}: ${series.description} (${series.modality}) - ${series.num_series_instances} instances`;
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      width: '100%',
      height: '100%',
      backgroundColor: 'rgba(0, 0, 0, 0.7)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 10000,
    }}>
      <div style={{
        backgroundColor: '#0a0b29',
        padding: '24px',
        borderRadius: '12px',
        width: '800px',
        maxWidth: '90%',
        maxHeight: '80%',
        overflow: 'auto',
        border: '1px solid #333',
      }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '20px',
          paddingBottom: '10px',
          borderBottom: '1px solid #333',
        }}>
          <h3 style={{ margin: 0, color: '#fff' }}>Select Series for Comparison</h3>
          <button
            onClick={handleClose}
            style={{
              background: 'none',
              border: 'none',
              color: '#888',
              fontSize: '24px',
              cursor: 'pointer',
              padding: '0',
              width: '30px',
              height: '30px',
            }}
          >
            ×
          </button>
        </div>

        {error && (
          <div style={{
            backgroundColor: 'rgba(255, 100, 100, 0.2)',
            border: '1px solid rgba(255, 100, 100, 0.5)',
            color: '#ff4d4d',
            padding: '10px',
            borderRadius: '6px',
            marginBottom: '20px',
          }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', gap: '20px', marginBottom: '30px' }}>
          {/* Left Panel - Series 1 */}
          <div style={{ flex: 1 }}>
            <h4 style={{ color: '#fff', marginBottom: '10px' }}>
              Series 1: {selectedSeries1 && ` ${selectedSeries1.description}`}
            </h4>
            <div style={{
              height: '300px',
              overflowY: 'auto',
              border: '1px solid #444',
              borderRadius: '6px',
              padding: '10px',
              backgroundColor: '#0a0b29',
            }}>
              {seriesList.map((series) => (
                <div
                  key={series.series_instance_uid}
                  onClick={() => handleSeriesSelect(series, 1)}
                  style={{
                    padding: '12px',
                    marginBottom: '8px',
                    backgroundColor: selectedSeries1?.series_instance_uid === series.series_instance_uid
                      ? 'rgba(77, 255, 77, 0.2)'
                      : 'transparent',
                    border: selectedSeries1?.series_instance_uid === series.series_instance_uid
                      ? '1px solid rgba(77, 255, 77, 0.5)'
                      : '1px solid #444',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    color: '#fff',
                    transition: 'all 0.2s',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = selectedSeries1?.series_instance_uid === series.series_instance_uid
                      ? 'rgba(13, 48, 127, 0.3)'
                      : 'rgba(255, 255, 255, 0.1)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = selectedSeries1?.series_instance_uid === series.series_instance_uid
                      ? 'rgba(13, 48, 127, 0.2)'
                      : 'transparent';
                  }}
                >
                  <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>
                    {series.description}
                  </div>
                  <div style={{ fontSize: '12px', color: '#aaa', marginBottom: '4px' }}>
                    Series {series.series_number}
                  </div>
                  <div style={{ fontSize: '11px', color: '#888' }}>
                    Modality: {series.modality} | Instances: {series.num_series_instances}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Right Panel - Series 2 */}
          <div style={{ flex: 1 }}>
            <h4 style={{ color: '#fff', marginBottom: '10px' }}>
              Series 2: {selectedSeries2 && ` ${selectedSeries2.description}`}
            </h4>
            <div style={{
              height: '300px',
              overflowY: 'auto',
              border: '1px solid #444',
              borderRadius: '6px',
              padding: '10px',
              backgroundColor: '#0a0b29',
            }}>
              {seriesList.map((series) => (
                <div
                  key={series.series_instance_uid}
                  onClick={() => handleSeriesSelect(series, 2)}
                  style={{
                    padding: '12px',
                    marginBottom: '8px',
                    backgroundColor: selectedSeries2?.series_instance_uid === series.series_instance_uid
                      ? 'rgba(77, 255, 77, 0.2)'
                      : 'transparent',
                    border: selectedSeries2?.series_instance_uid === series.series_instance_uid
                      ? '1px solid rgba(77, 255, 77, 0.5)'
                      : '1px solid #444',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    color: '#fff',
                    transition: 'all 0.2s',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = selectedSeries2?.series_instance_uid === series.series_instance_uid
                      ? 'rgba(13, 48, 127, 0.3)'
                      : 'rgba(255, 255, 255, 0.1)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = selectedSeries2?.series_instance_uid === series.series_instance_uid
                      ? 'rgba(13, 48, 127, 0.2)'
                      : 'transparent';
                  }}
                >
                  <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>
                    {series.description}
                  </div>
                  <div style={{ fontSize: '12px', color: '#aaa', marginBottom: '4px' }}>
                     Series {series.series_number}
                  </div>
                  <div style={{ fontSize: '11px', color: '#888' }}>
                    Modality: {series.modality} | Instances: {series.num_series_instances}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div style={{
          display: 'flex',
          justifyContent: 'flex-end',
          gap: '12px',
          marginTop: '20px',
          paddingTop: '20px',
          borderTop: '1px solid #333',
        }}>
          <button
            onClick={handleClose}
            style={{
              padding: '10px 20px',
              backgroundColor: 'transparent',
              border: '1px solid #555',
              borderRadius: '6px',
              color: '#aaa',
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
              e.currentTarget.style.color = '#fff';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
              e.currentTarget.style.color = '#aaa';
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            style={{
              padding: '10px 20px',
              backgroundColor: selectedSeries1 && selectedSeries2
                ? 'rgba(30, 144, 255, 0.8)'  // Dodger Blue - good visibility
                : 'rgba(30, 144, 255, 0.3)',
              border: 'none',
              borderRadius: '6px',
              color: selectedSeries1 && selectedSeries2 ? '#ffffff' : '#ffffff',
              cursor: selectedSeries1 && selectedSeries2 ? 'pointer' : 'not-allowed',
              fontWeight: 'bold',
              transition: 'all 0.2s',
            }}
            onMouseEnter={(e) => {
              if (selectedSeries1 && selectedSeries2) {
                e.currentTarget.style.backgroundColor = 'rgba(30, 144, 255, 0.8)';
              }
            }}
            onMouseLeave={(e) => {
              if (selectedSeries1 && selectedSeries2) {
                e.currentTarget.style.backgroundColor = 'rgba(30, 144, 255, 0.8)';
              }
            }}
            disabled={!selectedSeries1 || !selectedSeries2}
          >
            Load Comparison
          </button>
        </div>
      </div>
    </div>
  );
};
