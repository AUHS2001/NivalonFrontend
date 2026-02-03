import React, { useState, useRef } from 'react';
import logo from '../../assets/logo.png';
import { useNavigate } from 'react-router-dom';

const DicomUploadPage: React.FC = () => {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [currentChunk, setCurrentChunk] = useState<number>(0);
  const [totalChunks, setTotalChunks] = useState<number>(0);
  const [uploadStatus, setUploadStatus] = useState<string>('');
  const userToken = localStorage.getItem('token');
  const [error, setError] = useState<string>('');

  const MAX_FILES_PER_REQUEST = 999;
  const API_URL = 'http://127.0.0.1:8000/patient/upload-images';

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files.length > 0) {
      const files = Array.from(event.target.files);

      // macOS-compatible file type checking
      const validFiles = files.filter(file => {
        const fileName = file.name.toLowerCase();
        const isDoc = fileName.endsWith('.doc') ||
                      fileName.endsWith('.docx') ||
                      file.type.includes('document') ||
                      file.type.includes('msword');
        const isDicom = fileName.endsWith('.dcm') ||
                         fileName.endsWith('.dicom');
        return isDoc || isDicom;
      });

      if (validFiles.length === 0) {
        setError('Please select only DICOM (.dcm) or Word (.doc, .docx) documents');
        return;
      }

      setSelectedFiles(validFiles);
      setCurrentChunk(0);
      setTotalChunks(Math.ceil(validFiles.length / MAX_FILES_PER_REQUEST));
      setError('');
      setUploadStatus('');
    }
  };

  const uploadChunk = async (files: File[], chunkIndex: number): Promise<void> => {
    const formData = new FormData();
    files.forEach(file => formData.append('files', file));

    try {
      const response = await fetch(API_URL, {
        method: 'POST',
        mode: 'cors',
        body: formData,
        headers: {
          Authorization: `Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI0Iiwicm9sZSI6InBhdGllbnQiLCJleHAiOjE3OTQ3MDEwNjV9.TYjld2d_E4Er7E0GjTwuJ_-BnRvV2ZiInVGzWklo3rw`
        },
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `Server responded with ${response.status}`);
      }

      const data = await response.json();
      console.log('Upload successful:', data);
    } catch (error) {
      console.error('Upload error:', error);
      throw error;
    }
  };

  const handleUpload = async () => {
    if (selectedFiles.length === 0) {
      setError('Please select at least one DICOM file');
      return;
    }

    setIsUploading(true);
    setUploadStatus('Initializing upload...');
    setUploadProgress(0);
    setError('');

    try {
      const totalFiles = selectedFiles.length;
      const chunks = Math.ceil(totalFiles / MAX_FILES_PER_REQUEST);

      for (let i = 0; i < chunks; i++) {
        const chunkNumber = i + 1;
        setCurrentChunk(chunkNumber);
        setUploadStatus(`Uploading batch ${chunkNumber} of ${chunks}...`);

        const start = i * MAX_FILES_PER_REQUEST;
        const end = start + MAX_FILES_PER_REQUEST;
        const chunkFiles = selectedFiles.slice(start, end);

        await uploadChunk(chunkFiles, i);

        const progress = Math.floor((chunkNumber / chunks) * 100);
        setUploadProgress(progress);
      }

      setUploadStatus('All files uploaded successfully!');
      setTimeout(() => {
        resetUploader();
      }, 2000);
    } catch (error) {
      setError(error.message || 'Failed to upload files');
      setUploadStatus('Upload failed');
      setIsUploading(false);
    }
  };

  const resetUploader = () => {
    setSelectedFiles([]);
    setIsUploading(false);
    setUploadProgress(0);
    setUploadStatus('');
    setCurrentChunk(0);
    setTotalChunks(0);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const triggerFileInput = () => {
    if (!isUploading) {
      fileInputRef.current?.click();
    }
  };

  const handleCancelUpload = () => {
    resetUploader();
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
          <div className="me-2">
            <img src={logo} alt="Company Logo" width="250" height="250" />
          </div>
        </div>
      </div>

      {/* Upload Form */}
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
        zIndex: 1
      }}>
        <div className="text-center mb-4">
          <h2 style={{ color: "#ffffff" }}>DICOM Upload</h2>
          <p style={{ color: '#bdc3c7' }}>Select DICOM files to upload</p>
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
        {uploadStatus && !error && uploadProgress === 100 && (
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
            <span>{uploadStatus}</span>
          </div>
        )}

        {/* File Selection */}
        <div style={{ marginBottom: '1.75rem' }}>
          <label style={{
            display: 'block',
            marginBottom: '0.75rem',
            color: '#e2e8f0',
            fontWeight: '500',
            fontSize: '0.95rem'
          }}>DICOM Files</label>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <input
              type="text"
              placeholder={selectedFiles.length > 0 ?
                `${selectedFiles.length} file${selectedFiles.length !== 1 ? 's' : ''} selected` :
                "No files chosen"}
              readOnly
              style={{
                flex: 1,
                padding: '0.9rem 1rem',
                backgroundColor: 'rgba(2, 6, 23, 0.5)',
                border: '1px solid rgba(148, 163, 184, 0.2)',
                borderRadius: '8px',
                color: '#f8fafc',
                fontSize: '0.95rem',
                outline: 'none'
              }}
            />
            <button
              type="button"
              onClick={triggerFileInput}
              disabled={isUploading}
              style={{
                padding: '0.9rem 1.5rem',
                backgroundColor: '#2563eb',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                fontSize: '0.95rem',
                fontWeight: '500',
                cursor: 'pointer',
                transition: 'all 0.2s',
                opacity: isUploading ? 0.7 : 1
              }}
              onMouseOver={e => !isUploading && (e.currentTarget.style.backgroundColor = '#1d4ed8')}
              onMouseOut={e => !isUploading && (e.currentTarget.style.backgroundColor = '#2563eb')}
            >
              {selectedFiles.length > 0 ? 'Change Files' : 'Select Files'}
            </button>
          </div>
          <div style={{
            color: '#94a3b8',
            fontSize: '0.85rem',
            marginTop: '0.5rem'
          }}>
            Maximum {MAX_FILES_PER_REQUEST} files per batch
          </div>
          <input
            type="file"
            ref={fileInputRef}
            multiple
            onChange={handleFileChange}
            accept=".dcm,.dicom,.doc,.docx,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            style={{ display: 'none' }}
            disabled={isUploading}
          />
        </div>

        {/* Files Preview */}
        {selectedFiles.length > 0 && (
          <div style={{
            marginBottom: '1.75rem',
            maxHeight: '300px',
            overflowY: 'auto',
            borderRadius: '8px',
            border: '1px solid rgba(148, 163, 184, 0.2)'
          }}>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '0.75rem 1rem',
              backgroundColor: 'rgba(2, 6, 23, 0.3)',
              borderBottom: '1px solid rgba(148, 163, 184, 0.2)'
            }}>
              <h5 style={{ color: '#e2e8f0', margin: 0, fontSize: '1rem' }}>Selected Files</h5>
              <span style={{
                backgroundColor: '#2563eb',
                color: 'white',
                padding: '0.25rem 0.75rem',
                borderRadius: '9999px',
                fontSize: '0.85rem'
              }}>
                {selectedFiles.length} file{selectedFiles.length !== 1 ? 's' : ''}
              </span>
            </div>
            <div style={{ backgroundColor: 'rgba(2, 6, 23, 0.2)' }}>
              {selectedFiles.slice(0, 5).map((file, index) => (
                <div
                  key={index}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '0.75rem 1rem',
                    borderBottom: '1px solid rgba(148, 163, 184, 0.1)'
                  }}
                >
                  <span style={{
                    color: '#e2e8f0',
                    fontSize: '0.9rem',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    maxWidth: '70%'
                  }}>
                    {file.name}
                  </span>
                  <span style={{
                    backgroundColor: '#334155',
                    color: '#e2e8f0',
                    padding: '0.25rem 0.75rem',
                    borderRadius: '9999px',
                    fontSize: '0.8rem'
                  }}>
                    {(file.size / 1024).toFixed(1)} KB
                  </span>
                </div>
              ))}
              {selectedFiles.length > 5 && (
                <div style={{
                  textAlign: 'center',
                  color: '#94a3b8',
                  padding: '0.75rem 1rem',
                  fontSize: '0.9rem'
                }}>
                  + {selectedFiles.length - 5} more file{selectedFiles.length - 5 !== 1 ? 's' : ''}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Upload Progress */}
        {isUploading && (
          <div style={{ marginBottom: '1.75rem' }}>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              marginBottom: '0.5rem'
            }}>
              <span style={{ color: '#e2e8f0', fontSize: '0.9rem' }}>{uploadStatus}</span>
              <span style={{ color: '#e2e8f0', fontSize: '0.9rem' }}>{uploadProgress}%</span>
            </div>
            <div style={{
              height: '8px',
              backgroundColor: 'rgba(2, 6, 23, 0.5)',
              borderRadius: '4px',
              overflow: 'hidden'
            }}>
              <div
                style={{
                  height: '100%',
                  width: `${uploadProgress}%`,
                  backgroundColor: '#2563eb',
                  transition: 'width 0.3s ease'
                }}
              ></div>
            </div>
            {totalChunks > 1 && (
              <div style={{
                textAlign: 'center',
                color: '#60a5fa',
                marginTop: '0.5rem',
                fontSize: '0.85rem'
              }}>
                Processing batch {currentChunk} of {totalChunks}
              </div>
            )}
          </div>
        )}

        {/* Action Buttons */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <button
            type="button"
            onClick={handleUpload}
            disabled={selectedFiles.length === 0 || isUploading}
            style={{
              width: '100%',
              padding: '1rem',
              backgroundColor: '#2563eb',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              fontSize: '1rem',
              fontWeight: '600',
              cursor: selectedFiles.length === 0 || isUploading ? 'not-allowed' : 'pointer',
              transition: 'all 0.2s',
              opacity: selectedFiles.length === 0 || isUploading ? 0.7 : 1,
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              gap: '0.5rem'
            }}
            onMouseOver={e => !(selectedFiles.length === 0 || isUploading) && (e.currentTarget.style.backgroundColor = '#1d4ed8')}
            onMouseOut={e => !(selectedFiles.length === 0 || isUploading) && (e.currentTarget.style.backgroundColor = '#2563eb')}
          >
            {isUploading ? (
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
                Uploading... ({uploadProgress}%)
              </>
            ) : (
              <>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
                Upload DICOM Files
              </>
            )}
          </button>

          {(selectedFiles.length > 0 && !isUploading) && (
            <button
              type="button"
              onClick={resetUploader}
              style={{
                width: '100%',
                padding: '1rem',
                backgroundColor: 'transparent',
                color: '#f87171',
                border: '1px solid rgba(248, 113, 113, 0.3)',
                borderRadius: '8px',
                fontSize: '1rem',
                fontWeight: '600',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
              onMouseOver={e => {
                e.currentTarget.backgroundColor = 'rgba(248, 113, 113, 0.1)';
                e.currentTarget.color = '#ef4444';
              }}
              onMouseOut={e => {
                e.currentTarget.backgroundColor = 'transparent';
                e.currentTarget.color = '#f87171';
              }}
            >
              Clear Selection
            </button>
          )}

          {isUploading && (
            <button
              type="button"
              onClick={handleCancelUpload}
              style={{
                width: '100%',
                padding: '1rem',
                backgroundColor: 'rgba(239, 68, 68, 0.1)',
                color: '#ef4444',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                borderRadius: '8px',
                fontSize: '1rem',
                fontWeight: '600',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
              onMouseOver={e => {
                e.currentTarget.backgroundColor = 'rgba(239, 68, 68, 0.2)';
                e.currentTarget.color = '#dc2626';
              }}
              onMouseOut={e => {
                e.currentTarget.backgroundColor = 'rgba(239, 68, 68, 0.1)';
                e.currentTarget.color = '#ef4444';
              }}
            >
              Cancel Upload
            </button>
          )}

          <button
            type="button"
            onClick={() => navigate(-1)}
            disabled={isUploading}
            style={{
              width: '100%',
              padding: '1rem',
              backgroundColor: 'transparent',
              color: '#94a3b8',
              border: '1px solid rgba(148, 163, 184, 0.3)',
              borderRadius: '8px',
              fontSize: '1rem',
              fontWeight: '600',
              cursor: isUploading ? 'not-allowed' : 'pointer',
              transition: 'all 0.2s',
              opacity: isUploading ? 0.7 : 1
            }}
            onMouseOver={e => !isUploading && (e.currentTarget.backgroundColor = 'rgba(148, 163, 184, 0.1)')}
            onMouseOut={e => !isUploading && (e.currentTarget.backgroundColor = 'transparent')}
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
