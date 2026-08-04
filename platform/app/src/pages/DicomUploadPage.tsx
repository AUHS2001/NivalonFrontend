import React, { useState } from 'react';
import logo from '../../assets/logo.png';
import { useNavigate } from 'react-router-dom';
import { SERVER_URL } from '../../../../config/server';

interface SeriesEntry {
  series_instance_uid: string;
}

interface StudyEntry {
  study_instance_uid: string;
  series: SeriesEntry[];
}

const DicomUploadPage: React.FC = () => {
  const navigate = useNavigate();
  const userToken = localStorage.getItem('token');

  const [externalPatientId, setExternalPatientId] = useState<string>('');
  const [studies, setStudies] = useState<StudyEntry[]>([
    { study_instance_uid: '', series: [{ series_instance_uid: '' }] }
  ]);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [successMessage, setSuccessMessage] = useState<string>('');

  const API_URL = `${SERVER_URL}/patient/helical/ingest_from_s3`;

  const addStudy = () => {
    setStudies([...studies, { study_instance_uid: '', series: [{ series_instance_uid: '' }] }]);
  };

  const removeStudy = (studyIndex: number) => {
    if (studies.length <= 1) return;
    setStudies(studies.filter((_, i) => i !== studyIndex));
  };

  const updateStudyUid = (studyIndex: number, uid: string) => {
    const updated = [...studies];
    updated[studyIndex].study_instance_uid = uid;
    setStudies(updated);
  };

  const addSeries = (studyIndex: number) => {
    const updated = [...studies];
    updated[studyIndex].series.push({ series_instance_uid: '' });
    setStudies(updated);
  };

  const removeSeries = (studyIndex: number, seriesIndex: number) => {
    const updated = [...studies];
    if (updated[studyIndex].series.length <= 1) return;
    updated[studyIndex].series = updated[studyIndex].series.filter((_, i) => i !== seriesIndex);
    setStudies(updated);
  };

  const updateSeriesUid = (studyIndex: number, seriesIndex: number, uid: string) => {
    const updated = [...studies];
    updated[studyIndex].series[seriesIndex].series_instance_uid = uid;
    setStudies(updated);
  };

  const validate = (): boolean => {
    if (!externalPatientId.trim()) {
      setError('External Patient ID is required');
      return false;
    }

    for (let i = 0; i < studies.length; i++) {
      if (!studies[i].study_instance_uid.trim()) {
        setError(`Study ${i + 1}: Study Instance UID is required`);
        return false;
      }
      for (let j = 0; j < studies[i].series.length; j++) {
        if (!studies[i].series[j].series_instance_uid.trim()) {
          setError(`Study ${i + 1}, Series ${j + 1}: Series Instance UID is required`);
          return false;
        }
      }
    }

    return true;
  };

  const handleSubmit = async () => {
    setError('');
    setSuccessMessage('');

    if (!validate()) return;

    setIsSubmitting(true);

    try {
      const payload = {
        external_patient_id: externalPatientId.trim(),
        studies: studies.map(study => ({
          study_instance_uid: study.study_instance_uid.trim(),
          series: study.series.map(s => ({
            series_instance_uid: s.series_instance_uid.trim(),
          })),
        })),
      };

      const response = await fetch(API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${userToken}`,
        },
        credentials: 'include',
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || `Server responded with ${response.status}`);
      }

      const data = await response.json();
      const jobCount = data.jobs?.length || 0;
      setSuccessMessage(
        `Ingest accepted! Patient ID: ${data.patient_id}, Studies: ${data.study_ids?.length || 0}, Jobs queued: ${jobCount}`
      );

      // Reset form after success
      setTimeout(() => {
        setExternalPatientId('');
        setStudies([{ study_instance_uid: '', series: [{ series_instance_uid: '' }] }]);
        setSuccessMessage('');
      }, 4000);
    } catch (err: any) {
      setError(err.message || 'Failed to submit ingestion request');
    } finally {
      setIsSubmitting(false);
    }
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '0.9rem 1rem',
    backgroundColor: 'rgba(2, 6, 23, 0.5)',
    border: '1px solid rgba(148, 163, 184, 0.2)',
    borderRadius: '8px',
    color: '#f8fafc',
    fontSize: '0.95rem',
    outline: 'none',
  };

  const labelStyle: React.CSSProperties = {
    display: 'block',
    marginBottom: '0.5rem',
    color: '#e2e8f0',
    fontWeight: '500',
    fontSize: '0.9rem',
  };

  const smallButtonStyle: React.CSSProperties = {
    padding: '0.4rem 0.8rem',
    borderRadius: '6px',
    fontSize: '0.8rem',
    fontWeight: '500',
    cursor: 'pointer',
    border: 'none',
    transition: 'all 0.2s',
  };

  return (
    <div style={{
      backgroundColor: "#0a0e17",
      minHeight: '100vh',
      color: 'white',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
      position: 'relative',
      overflow: 'hidden'
    }}>
      {/* Animated Background Elements */}
      <div style={{
        position: 'absolute',
        top: '10%',
        left: '10%',
        width: '300px',
        height: '300px',
        borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(56, 182, 255, 0.2) 0%, transparent 70%)',
        filter: 'blur(40px)',
        zIndex: 0
      }}></div>

      <div style={{
        position: 'absolute',
        bottom: '15%',
        right: '10%',
        width: '400px',
        height: '400px',
        borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(124, 58, 237, 0.15) 0%, transparent 70%)',
        filter: 'blur(50px)',
        zIndex: 0
      }}></div>

      {/* Header */}
      <div className="d-flex justify-content-between align-items-center py-2 px-4"
        style={{
          backgroundColor: "#0a0e17",
          color: 'white',
          minHeight: '60px',
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          zIndex: 100
        }}>
        <div className="d-flex align-items-center">
          <div className="me-2 relative group">
            <div className="absolute inset-0 rounded-lg bg-[rgba(52,140,253,0.08)] blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 scale-110" />
            <img
              src={logo}
              alt="Company Logo"
              width="250"
              height="250"
              className="relative drop-shadow-[0_0_12px_rgba(52,140,253,0.25)] transition-all duration-300 group-hover:drop-shadow-[0_0_20px_rgba(52,140,253,0.45)] group-hover:scale-[1.02]"
            />
          </div>
        </div>
      </div>

      {/* Ingest Form */}
      <div style={{
        backgroundColor: 'rgba(15, 23, 42, 0.7)',
        borderRadius: '16px',
        padding: '2.5rem',
        boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.3)',
        backdropFilter: 'blur(12px)',
        border: '1px solid rgba(255, 255, 255, 0.05)',
        animation: 'fadeInUp 0.6s ease-out',
        width: '100%',
        maxWidth: '800px',
        margin: '80px auto',
        zIndex: 1,
        maxHeight: 'calc(100vh - 120px)',
        overflowY: 'auto',
      }}>
        <div className="text-center mb-4">
          <h2 style={{ color: "#ffffff" }}>DICOM S3 Ingestion</h2>
          <p style={{ color: '#bdc3c7' }}>Submit study and series UIDs to trigger segmentation from S3</p>
        </div>

        {/* Error Message */}
        {error && (
          <div style={{
            backgroundColor: 'rgba(239, 68, 68, 0.15)',
            color: '#ef4444',
            padding: '0.8rem 1rem',
            borderRadius: '8px',
            marginBottom: '1.5rem',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            fontSize: '0.9rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem'
          }}>
            <svg style={{ flexShrink: 0 }} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>{error}</span>
          </div>
        )}

        {/* Success Message */}
        {successMessage && (
          <div style={{
            backgroundColor: 'rgba(74, 222, 128, 0.15)',
            color: '#22c55e',
            padding: '0.8rem 1rem',
            borderRadius: '8px',
            marginBottom: '1.5rem',
            border: '1px solid rgba(74, 222, 128, 0.3)',
            fontSize: '0.9rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem'
          }}>
            <svg style={{ flexShrink: 0 }} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
            </svg>
            <span>{successMessage}</span>
          </div>
        )}

        {/* External Patient ID */}
        <div style={{ marginBottom: '1.5rem' }}>
          <label style={labelStyle}>External Patient ID</label>
          <input
            type="text"
            value={externalPatientId}
            onChange={e => { setExternalPatientId(e.target.value); setError(''); }}
            placeholder="e.g., PAT-001"
            style={inputStyle}
            disabled={isSubmitting}
          />
        </div>

        {/* Studies */}
        {studies.map((study, studyIndex) => (
          <div key={studyIndex} style={{
            marginBottom: '1.5rem',
            padding: '1.25rem',
            border: '1px solid rgba(148, 163, 184, 0.15)',
            borderRadius: '12px',
            backgroundColor: 'rgba(2, 6, 23, 0.3)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h4 style={{ margin: 0, color: '#60a5fa', fontSize: '0.95rem' }}>Study {studyIndex + 1}</h4>
              {studies.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeStudy(studyIndex)}
                  disabled={isSubmitting}
                  style={{ ...smallButtonStyle, backgroundColor: 'rgba(239, 68, 68, 0.2)', color: '#ef4444' }}
                >
                  Remove Study
                </button>
              )}
            </div>

            <div style={{ marginBottom: '1rem' }}>
              <label style={labelStyle}>Study Instance UID</label>
              <input
                type="text"
                value={study.study_instance_uid}
                onChange={e => { updateStudyUid(studyIndex, e.target.value); setError(''); }}
                placeholder="e.g., 1.2.840.113619.2.55.3..."
                style={inputStyle}
                disabled={isSubmitting}
              />
            </div>

            {/* Series within this study */}
            {study.series.map((series, seriesIndex) => (
              <div key={seriesIndex} style={{
                display: 'flex',
                gap: '0.5rem',
                alignItems: 'flex-end',
                marginBottom: '0.75rem',
              }}>
                <div style={{ flex: 1 }}>
                  <label style={{ ...labelStyle, fontSize: '0.85rem', color: '#94a3b8' }}>
                    Series {seriesIndex + 1} Instance UID
                  </label>
                  <input
                    type="text"
                    value={series.series_instance_uid}
                    onChange={e => { updateSeriesUid(studyIndex, seriesIndex, e.target.value); setError(''); }}
                    placeholder="e.g., 1.2.840.113619.2.55.3..."
                    style={inputStyle}
                    disabled={isSubmitting}
                  />
                </div>
                {study.series.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeSeries(studyIndex, seriesIndex)}
                    disabled={isSubmitting}
                    style={{
                      ...smallButtonStyle,
                      backgroundColor: 'rgba(239, 68, 68, 0.15)',
                      color: '#f87171',
                      marginBottom: '2px',
                      height: '42px',
                    }}
                  >
                    X
                  </button>
                )}
              </div>
            ))}

            <button
              type="button"
              onClick={() => addSeries(studyIndex)}
              disabled={isSubmitting}
              style={{
                ...smallButtonStyle,
                backgroundColor: 'rgba(96, 165, 250, 0.15)',
                color: '#60a5fa',
                marginTop: '0.25rem',
              }}
            >
              + Add Series
            </button>
          </div>
        ))}

        <button
          type="button"
          onClick={addStudy}
          disabled={isSubmitting}
          style={{
            width: '100%',
            padding: '0.75rem',
            backgroundColor: 'rgba(96, 165, 250, 0.1)',
            color: '#60a5fa',
            border: '1px dashed rgba(96, 165, 250, 0.3)',
            borderRadius: '8px',
            fontSize: '0.9rem',
            fontWeight: '500',
            cursor: 'pointer',
            transition: 'all 0.2s',
            marginBottom: '1.5rem',
          }}
        >
          + Add Another Study
        </button>

        {/* Action Buttons */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitting}
            style={{
              width: '100%',
              padding: '1rem',
              backgroundColor: '#2563eb',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              fontSize: '1rem',
              fontWeight: '600',
              cursor: isSubmitting ? 'not-allowed' : 'pointer',
              transition: 'all 0.2s',
              opacity: isSubmitting ? 0.7 : 1,
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              gap: '0.5rem'
            }}
            onMouseOver={e => !isSubmitting && (e.currentTarget.style.backgroundColor = '#1d4ed8')}
            onMouseOut={e => !isSubmitting && (e.currentTarget.style.backgroundColor = '#2563eb')}
          >
            {isSubmitting ? (
              <>
                <span style={{
                  display: 'inline-block',
                  width: '1rem',
                  height: '1rem',
                  border: '2px solid rgba(255, 255, 255, 0.3)',
                  borderTopColor: 'white',
                  borderRadius: '50%',
                  animation: 'spin 1s linear infinite'
                }}></span>
                Submitting...
              </>
            ) : (
              <>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
                Submit Ingestion
              </>
            )}
          </button>

          <button
            type="button"
            onClick={() => navigate(-1)}
            disabled={isSubmitting}
            style={{
              width: '100%',
              padding: '1rem',
              backgroundColor: 'transparent',
              color: '#94a3b8',
              border: '1px solid rgba(148, 163, 184, 0.3)',
              borderRadius: '8px',
              fontSize: '1rem',
              fontWeight: '600',
              cursor: isSubmitting ? 'not-allowed' : 'pointer',
              transition: 'all 0.2s',
              opacity: isSubmitting ? 0.7 : 1
            }}
          >
            Back to Previous Page
          </button>
        </div>
      </div>

      {/* Animation styles */}
      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
};

export default DicomUploadPage;
