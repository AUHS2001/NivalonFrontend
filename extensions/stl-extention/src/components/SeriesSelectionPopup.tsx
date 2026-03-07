// components/SeriesSelectionPopup.tsx
import React, { useState, useContext, useEffect } from 'react';

import { StlInstanceContext } from '../../../../platform/app/src/context/StlInstanceContext';
import { SERVER_URL } from '../../../../config/server';

interface Series {
  series_instance_uid: string;
  series_number: string;
  description: string;
  modality: string;
  num_series_instances: number;
  instance_urls: string[];
}

interface Study {
  study_instance_uid: string;
  patient_name: string;
  patient_id: string;
  date: string;
  time: string;
  description: string;
  series: Series[];
}

interface SeriesSelectionPopupProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (
    series1: Series | null,
    series2: Series | null,
    study1?: Study | null,
    study2?: Study | null
  ) => void;
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
  const [comparisonMode, setComparisonMode] = useState<'same' | 'different'>('same');

  // For different studies mode
  const [studies, setStudies] = useState<Study[]>([]);
  const [selectedStudy1, setSelectedStudy1] = useState<Study | null>(null);
  const [selectedStudy2, setSelectedStudy2] = useState<Study | null>(null);
  const [seriesListStudy1, setSeriesListStudy1] = useState<Series[]>([]);
  const [seriesListStudy2, setSeriesListStudy2] = useState<Series[]>([]);
  const [loadingStudies, setLoadingStudies] = useState(false);

  const context = useContext(StlInstanceContext);
  const { stlInstanceId, updateStlInstanceId, seriesName, seriesName1, updateSeriesName, updateSeriesName1 } = context;
  const userToken = localStorage.getItem('token') || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIzIiwicm9sZSI6ImFuYWx5c3QiLCJleHAiOjE3OTYyMDMxNDF9.cLkGlpxslfYOe_ZKuseyCiuP7jsr3m8XXZyyrUU5B1Y';

  // Fetch available studies when popup opens in different mode
  useEffect(() => {
    if (isOpen && comparisonMode === 'different' && studies.length === 0) {
      fetchStudies();
    }
  }, [isOpen, comparisonMode]);

  const fetchStudies = async () => {
    setLoadingStudies(true);
    try {
      const response = await fetch(`${SERVER_URL}/imaging/studies`, {
        headers: {
          Authorization: `Bearer ${userToken}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        setStudies(data?.data || []);
      }
    } catch (error) {
      console.error('Error fetching studies:', error);
    } finally {
      setLoadingStudies(false);
    }
  };

  // Series are included in the study object from the API, so we just extract them
  const getSeriesFromStudy = (study: Study, position: 1 | 2) => {
    const seriesData = study.series || [];
    if (position === 1) {
      setSeriesListStudy1(seriesData);
    } else {
      setSeriesListStudy2(seriesData);
    }
  };

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

    if (comparisonMode === 'different') {
      onConfirm(selectedSeries1, selectedSeries2, selectedStudy1, selectedStudy2);
    } else {
      onConfirm(selectedSeries1, selectedSeries2, null, null);
    }
    handleClose();
  };

  const handleClose = () => {
    setSelectedSeries1(null);
    setSelectedSeries2(null);
    setSelectedStudy1(null);
    setSelectedStudy2(null);
    setSeriesListStudy1([]);
    setSeriesListStudy2([]);
    setError('');
    onClose();
  };

  const handleStudySelect = (study: Study, position: 1 | 2) => {
    if (position === 1) {
      setSelectedStudy1(study);
      setSelectedSeries1(null);
      getSeriesFromStudy(study, 1);
    } else {
      setSelectedStudy2(study);
      setSelectedSeries2(null);
      getSeriesFromStudy(study, 2);
    }
    setError('');
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

  const handleModeChange = (mode: 'same' | 'different') => {
    setComparisonMode(mode);
    setSelectedSeries1(null);
    setSelectedSeries2(null);
    setSelectedStudy1(null);
    setSelectedStudy2(null);
    setSeriesListStudy1([]);
    setSeriesListStudy2([]);
    setError('');

    if (mode === 'different' && studies.length === 0) {
      fetchStudies();
    }
  };

  const getCurrentSeriesList = (position: 1 | 2) => {
    if (comparisonMode === 'same') {
      return seriesList;
    }
    return position === 1 ? seriesListStudy1 : seriesListStudy2;
  };

  const renderStudyDropdown = (position: 1 | 2) => {
    const selectedStudy = position === 1 ? selectedStudy1 : selectedStudy2;

    return (
      <div style={{ marginBottom: '10px' }}>
        <label style={{ color: '#aaa', fontSize: '12px', marginBottom: '4px', display: 'block' }}>
          Select Study:
        </label>
        <select
          value={selectedStudy?.study_instance_uid || ''}
          onChange={(e) => {
            const study = studies.find(s => s.study_instance_uid === e.target.value);
            if (study) handleStudySelect(study, position);
          }}
          style={{
            width: '100%',
            padding: '8px',
            backgroundColor: '#1a1a2e',
            border: '1px solid #444',
            borderRadius: '4px',
            color: '#fff',
            fontSize: '12px',
            cursor: 'pointer'
          }}
        >
          <option value="">-- Select a Study --</option>
          {studies.map((study) => (
            <option key={study.study_instance_uid} value={study.study_instance_uid}>
              {study.patient_name || 'Unknown'} - {study.date || 'N/A'} - {study.description || 'No description'}
            </option>
          ))}
        </select>
      </div>
    );
  };

  const renderSeriesList = (position: 1 | 2) => {
    const currentList = getCurrentSeriesList(position);
    const selectedSeries = position === 1 ? selectedSeries1 : selectedSeries2;
    const selectedStudy = position === 1 ? selectedStudy1 : selectedStudy2;

    if (comparisonMode === 'different' && !selectedStudy) {
      return (
        <div style={{
          height: '250px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#666',
          fontSize: '14px'
        }}>
          Select a study first
        </div>
      );
    }

    if (currentList.length === 0) {
      return (
        <div style={{
          height: '250px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#666',
          fontSize: '14px'
        }}>
          No series available
        </div>
      );
    }

    return (
      <div style={{
        height: comparisonMode === 'different' ? '220px' : '300px',
        overflowY: 'auto',
        border: '1px solid #444',
        borderRadius: '6px',
        padding: '10px',
        backgroundColor: '#0a0b29',
      }}>
        {currentList.map((series) => (
          <div
            key={series.series_instance_uid}
            onClick={() => handleSeriesSelect(series, position)}
            style={{
              padding: '12px',
              marginBottom: '8px',
              backgroundColor: selectedSeries?.series_instance_uid === series.series_instance_uid
                ? 'rgba(77, 255, 77, 0.2)'
                : 'transparent',
              border: selectedSeries?.series_instance_uid === series.series_instance_uid
                ? '1px solid rgba(77, 255, 77, 0.5)'
                : '1px solid #444',
              borderRadius: '6px',
              cursor: 'pointer',
              color: '#fff',
              transition: 'all 0.2s',
            }}
            onMouseEnter={(e) => {
              if (selectedSeries?.series_instance_uid !== series.series_instance_uid) {
                e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
              }
            }}
            onMouseLeave={(e) => {
              if (selectedSeries?.series_instance_uid !== series.series_instance_uid) {
                e.currentTarget.style.backgroundColor = 'transparent';
              }
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
    );
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
        width: '900px',
        maxWidth: '90%',
        maxHeight: '85%',
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
          <h3 style={{ margin: 0, color: '#fff' }}>Select Series for 3D Comparison</h3>
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

        {/* Mode Toggle */}
        <div style={{
          display: 'flex',
          gap: '10px',
          marginBottom: '20px',
        }}>
          <button
            onClick={() => handleModeChange('same')}
            style={{
              flex: 1,
              padding: '12px',
              backgroundColor: comparisonMode === 'same' ? 'rgba(30, 144, 255, 0.3)' : 'transparent',
              border: comparisonMode === 'same' ? '2px solid rgba(30, 144, 255, 0.8)' : '1px solid #444',
              borderRadius: '8px',
              color: comparisonMode === 'same' ? '#fff' : '#aaa',
              cursor: 'pointer',
              fontWeight: comparisonMode === 'same' ? 'bold' : 'normal',
              transition: 'all 0.2s',
            }}
          >
            Same Study
            <div style={{ fontSize: '11px', marginTop: '4px', opacity: 0.7 }}>
              Compare series from current study
            </div>
          </button>
          <button
            onClick={() => handleModeChange('different')}
            style={{
              flex: 1,
              padding: '12px',
              backgroundColor: comparisonMode === 'different' ? 'rgba(30, 144, 255, 0.3)' : 'transparent',
              border: comparisonMode === 'different' ? '2px solid rgba(30, 144, 255, 0.8)' : '1px solid #444',
              borderRadius: '8px',
              color: comparisonMode === 'different' ? '#fff' : '#aaa',
              cursor: 'pointer',
              fontWeight: comparisonMode === 'different' ? 'bold' : 'normal',
              transition: 'all 0.2s',
            }}
          >
            Different Studies
            <div style={{ fontSize: '11px', marginTop: '4px', opacity: 0.7 }}>
              Compare series from different studies
            </div>
          </button>
        </div>

        {loadingStudies && comparisonMode === 'different' && (
          <div style={{
            textAlign: 'center',
            padding: '20px',
            color: '#aaa'
          }}>
            Loading studies...
          </div>
        )}

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
            <h4 style={{ color: '#fff', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{
                width: '12px',
                height: '12px',
                borderRadius: '50%',
                backgroundColor: '#ffffff',
                display: 'inline-block',
                border: '1px solid #444'
              }}></span>
              Series 1 {selectedSeries1 && <span style={{ color: '#4dff4d', fontSize: '12px' }}>({selectedSeries1.description})</span>}
            </h4>
            {comparisonMode === 'different' && renderStudyDropdown(1)}
            {renderSeriesList(1)}
          </div>

          {/* Right Panel - Series 2 */}
          <div style={{ flex: 1 }}>
            <h4 style={{ color: '#00ffff', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{
                width: '12px',
                height: '12px',
                borderRadius: '50%',
                backgroundColor: '#00ffff',
                display: 'inline-block'
              }}></span>
              Series 2 {selectedSeries2 && <span style={{ color: '#4dff4d', fontSize: '12px' }}>({selectedSeries2.description})</span>}
            </h4>
            {comparisonMode === 'different' && renderStudyDropdown(2)}
            {renderSeriesList(2)}
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
                ? 'rgba(30, 144, 255, 0.8)'
                : 'rgba(30, 144, 255, 0.3)',
              border: 'none',
              borderRadius: '6px',
              color: '#ffffff',
              cursor: selectedSeries1 && selectedSeries2 ? 'pointer' : 'not-allowed',
              fontWeight: 'bold',
              transition: 'all 0.2s',
            }}
            disabled={!selectedSeries1 || !selectedSeries2}
          >
            Load 3D Comparison
          </button>
        </div>
      </div>
    </div>
  );
};
