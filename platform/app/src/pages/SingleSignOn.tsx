import React, { useState, useContext } from 'react';
import logo from '../../assets/logo.png';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { MODULE_TYPES } from '@ohif/core';
import filesToStudies from '../routes/Local/filesToStudies';
import { extensionManager } from '../App';
import { SERVER_URL, fetchFile } from '../../../../config/server';
import { StlInstanceContext } from '../context/StlInstanceContext';
import { StlInstanceListDataContext } from '../context/StlInstanceListDataContext';
import { ParentStudyIdContext } from '../context/parentStudyIdContext';

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

const SingleSignOnPage: React.FC = () => {
  const navigate = useNavigate();
  const [ssoId, setSsoId] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Get STL contexts
  const stlContext = useContext(StlInstanceContext);
  const stlListContext = useContext(StlInstanceListDataContext);
  const parentStudyContext = useContext(ParentStudyIdContext);

  const handleSSOLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Basic validation
    if (!ssoId) {
      setError('Please enter your SSO ID');
      return;
    }

    setLoading(true);

    try {
      // Fetch all studies from the API
      const response = await axios.get<{ data: Study[] }>(`${SERVER_URL}/imaging/studies`, {
        headers: {
          Authorization: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIzIiwicm9sZSI6ImFuYWx5c3QiLCJleHAiOjE3OTYyMDMxNDF9.cLkGlpxslfYOe_ZKuseyCiuP7jsr3m8XXZyyrUU5B1Y',
          'Content-Type': 'application/json'
        },
        withCredentials: true
      });
      const studies = response.data?.data || [];

      // Filter studies by SSO ID (matching patient_id or study_instance_uid)
      const matchingStudy = studies.find(
        (study: Study) =>
          study.patient_id === ssoId ||
          study.study_instance_uid === ssoId ||
          study.patient_id?.toLowerCase() === ssoId.toLowerCase()
      );

      if (!matchingStudy) {
        setError('No study found for the provided SSO ID');
        setLoading(false);
        return;
      }

      // Save SSO info to localStorage
      localStorage.setItem('userRole', 'signer');
      localStorage.setItem('ssoId', ssoId);
      // Store token so SingleSpinalCord can use it for STL data fetch
      localStorage.setItem('token', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIzIiwicm9sZSI6ImFuYWx5c3QiLCJleHAiOjE3OTYyMDMxNDF9.cLkGlpxslfYOe_ZKuseyCiuP7jsr3m8XXZyyrUU5B1Y');

      // Set STL context data
      if (stlListContext) {
        stlListContext.updateStlInstanceListData(studies);
      }

      if (stlContext && matchingStudy.series?.length > 0) {
        stlContext.updateStlInstanceId(matchingStudy.series[0].series_instance_uid);
        stlContext.updateSeriesName(matchingStudy.series[0].description);
        stlContext.updateSeriesList(matchingStudy.series);
      }

      if (parentStudyContext) {
        parentStudyContext.updateParentStudyId(matchingStudy.study_instance_uid);
      }

      // Load the study into the signon viewer
      await loadStudyIntoViewer(matchingStudy);

    } catch (err: any) {
      console.error('SSO Login error:', err);
      setError(err.message || 'An error occurred during SSO login');
      setLoading(false);
    }
  };

  const loadStudyIntoViewer = async (selectedStudy: Study) => {
    try {
      // Collect instance URLs from the selected study
      const allInstanceUrls = selectedStudy.series.flatMap(series =>
        series.instance_urls || []
      );

      console.log("Processing study:", selectedStudy.study_instance_uid);
      console.log("Instance URLs to fetch:", allInstanceUrls.length);

      if (allInstanceUrls.length === 0) {
        throw new Error("No instance URLs found for the selected study");
      }

      // Fetch DICOM files in parallel with retry logic
      const fetchedFiles = await Promise.all(
        allInstanceUrls.map(async (url, idx) => {
          let retries = 0;
          while (retries < 3) {
            try {
              const res = await fetchFile(url);
              if (!res.ok) throw new Error(`HTTP error! Status: ${res.status}`);
              const blob = await res.blob();
              const fileName = url.split('/').pop();
              return new File([blob], fileName || `dicom-${idx}.dcm`, {
                type: blob.type || 'application/dicom',
              });
            } catch (error) {
              retries++;
              console.error(`[SSO] Attempt ${retries}/3 failed for ${url}:`, error);
              if (retries === 3) {
                return null;
              }
              await new Promise((resolve) => setTimeout(resolve, 1000 * retries));
            }
          }
          return null;
        })
      );

      // Filter out failed file fetches
      const validFiles = fetchedFiles.filter((file): file is File => file !== null);

      if (validFiles.length === 0) {
        throw new Error("No valid DICOM files were fetched");
      }

      // Use signon viewer mode
      const modePath = "signons/dicomlocal";

      // Initialize the dicom local dataSource
      const dataSourceModules = extensionManager.modules[MODULE_TYPES.DATA_SOURCE];
      const localDataSources = dataSourceModules.reduce((acc, curr) => {
        const mods = [];
        curr.module.forEach(mod => {
          if (mod.type === 'localApi') {
            mods.push(mod);
          }
        });
        return acc.concat(mods);
      }, []);

      const firstLocalDataSource = localDataSources[0];
      const dataSource = firstLocalDataSource.createDataSource({});

      // Convert files to studies
      await filesToStudies([], dataSource); // Clear previous
      const studies = await filesToStudies(validFiles, dataSource);

      const query = new URLSearchParams();

      // Add the study to the query
      studies.forEach(id => query.append('StudyInstanceUIDs', id));
      query.append('datasources', 'dicomlocal');
      query.append('t', Date.now().toString());

      console.log("Navigating to signon viewer with study:", studies[0]);

      // Navigate to the signon viewer
      navigate(`/${modePath}?${decodeURIComponent(query.toString())}`);

    } catch (err) {
      console.error("Failed to load study:", err);
      throw err;
    }
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

      {/* Logo Header */}
      <div style={{
        marginBottom: '2rem',
        textAlign: 'center',
        zIndex: 1
      }}>
        <div style={{ position: 'relative', display: 'inline-block' }}
          className="group"
        >
          <div className="absolute inset-0 rounded-lg bg-[rgba(52,140,253,0.08)] blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 scale-110" />
          <img src={logo} alt="Logo" style={{
            height: '80px',
            marginBottom: '1rem',
          }}
          className="relative drop-shadow-[0_0_12px_rgba(52,140,253,0.25)] transition-all duration-300 group-hover:drop-shadow-[0_0_20px_rgba(52,140,253,0.45)] group-hover:scale-[1.02]"
          />
        </div>
      </div>

      {/* SSO Form */}
      <div style={{
        backgroundColor: 'rgba(15, 23, 42, 0.7)',
        borderRadius: '16px',
        padding: '2.5rem',
        boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.3)',
        backdropFilter: 'blur(12px)',
        border: '1px solid rgba(255, 255, 255, 0.05)',
        animation: 'fadeInUp 0.6s ease-out',
        width: '100%',
        maxWidth: '500px',
        zIndex: 1
      }}>
        <h2 style={{
          textAlign: 'center',
          marginBottom: '1.5rem',
          color: '#e2e8f0',
          fontWeight: '600',
          fontSize: '1.5rem'
        }}>Single Sign-On</h2>

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

        <form onSubmit={handleSSOLogin}>
          <div style={{ marginBottom: '2rem' }}>
            <label htmlFor="ssoId" style={{
              display: 'block',
              marginBottom: '0.75rem',
              color: '#e2e8f0',
              fontWeight: '500',
              fontSize: '0.95rem'
            }}>SSO ID</label>
            <div style={{
              position: 'relative',
              borderRadius: '8px',
              overflow: 'hidden',
              boxShadow: '0 0 0 1px rgba(148, 163, 184, 0.2)',
              transition: 'box-shadow 0.2s'
            }}>
              <input
                type="text"
                id="ssoId"
                placeholder="Enter your SSO ID"
                value={ssoId}
                onChange={(e) => setSsoId(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.9rem 1rem 0.9rem 2.75rem',
                  backgroundColor: 'rgba(2, 6, 23, 0.5)',
                  border: 'none',
                  color: '#f8fafc',
                  fontSize: '0.95rem',
                  outline: 'none'
                }}
                autoFocus
              />
              <div style={{
                position: 'absolute',
                left: '1rem',
                top: '50%',
                transform: 'translateY(-50%)',
                color: '#64748b'
              }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                </svg>
              </div>
            </div>
          </div>

          <button
            type="submit"
            style={{
              width: '100%',
              padding: '0.5rem',
              backgroundColor: '#2563eb',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              fontSize: '1rem',
              fontWeight: '600',
              cursor: 'pointer',
              transition: 'all 0.2s',
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              gap: '0.5rem',
              boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.2)',
              marginBottom: '1.5rem'
            }}
            disabled={loading}
            onMouseOver={e => !loading && (e.currentTarget.style.backgroundColor = '#1d4ed8')}
            onMouseOut={e => !loading && (e.currentTarget.style.backgroundColor = '#2563eb')}
          >
            {loading ? (
              <>
                <span style={{
                  display: 'inline-block',
                  width: '15px',
                  height: '15px',
                  border: '2px solid rgba(255, 255, 255, 0.3)',
                  borderTopColor: 'white',
                  borderRadius: '50%',
                  animation: 'spin 1s linear infinite'
                }}></span>
                Loading Study...
              </>
            ) : (
              <>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
                </svg>
                Single Sign-On
              </>
            )}
          </button>
        </form>

        <div style={{ textAlign: 'center' }}>
          <span
            onClick={() => navigate('/')}
            style={{
              color: '#3498db',
              textDecoration: 'none',
              fontWeight: '500',
              cursor: 'pointer',
              fontSize: '0.95rem'
            }}
            onMouseOver={e => e.currentTarget.style.textDecoration = 'underline'}
            onMouseOut={e => e.currentTarget.style.textDecoration = 'none'}
          >
            Back to Login
          </span>
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
        input:focus {
          box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.5) !important;
        }
      `}</style>
    </div>
  );
}

export default SingleSignOnPage;
