// PatientList.tsx
import React, { useState } from 'react';

import { Outlet, useNavigate, useLocation } from 'react-router-dom';

interface Patient {
  id: number;
  name: string;
  age: number;
  gender: 'Male' | 'Female';
  mrn: string;
  admissionDate: string;
  status: 'Active' | 'Discharged' | 'Critical';
  lastStudy: string;
}

const PatientList: React.FC = ({ onPageChange }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<string>('All');
  const [patients] = useState<Patient[]>([
    { id: 1, name: 'John Smith', age: 45, gender: 'Male', mrn: 'MRN001234', admissionDate: '2024-01-15', status: 'Active', lastStudy: 'CT Scan' },
    { id: 2, name: 'Emma Johnson', age: 32, gender: 'Female', mrn: 'MRN001235', admissionDate: '2024-01-14', status: 'Discharged', lastStudy: 'MRI' },
    { id: 3, name: 'Robert Brown', age: 67, gender: 'Male', mrn: 'MRN001236', admissionDate: '2024-01-10', status: 'Critical', lastStudy: 'X-Ray' },
    { id: 4, name: 'Sarah Wilson', age: 28, gender: 'Female', mrn: 'MRN001237', admissionDate: '2024-01-12', status: 'Active', lastStudy: 'Ultrasound' },
    { id: 5, name: 'Michael Davis', age: 52, gender: 'Male', mrn: 'MRN001238', admissionDate: '2024-01-08', status: 'Active', lastStudy: 'CT Scan' },
    { id: 6, name: 'Lisa Anderson', age: 38, gender: 'Female', mrn: 'MRN001239', admissionDate: '2024-01-05', status: 'Discharged', lastStudy: 'MRI' },
  ]);

  const filteredPatients = patients.filter(patient => {
    const matchesSearch = patient.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         patient.mrn.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = selectedStatus === 'All' || patient.status === selectedStatus;
    return matchesSearch && matchesStatus;
  });

  const navigate = useNavigate();

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Active': return '#10b981';
      case 'Discharged': return '#64748b';
      case 'Critical': return '#ef4444';
      default: return '#64748b';
    }
  };

  return (
    <div style={{ animation: 'fadeIn 0.5s ease-out' }}>
      {/* Header with Stats */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '2rem'
      }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: '600' }}>Patient Records</h2>
          <p style={{ margin: '0.5rem 0 0 0', color: '#64748b', fontSize: '0.95rem' }}>
            {filteredPatients.length} patients found
          </p>
        </div>
      </div>

      {/* Filters */}
      <div style={{
        display: 'flex',
        gap: '1rem',
        marginBottom: '1.5rem',
        flexWrap: 'wrap'
      }}>
        <div style={{ flex: 1, minWidth: '300px' }}>
          <div style={{ position: 'relative' }}>
            <input
              type="text"
              placeholder="Search patients by name or MRN..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{
                width: '100%',
                padding: '0.875rem 1rem 0.875rem 2.75rem',
                backgroundColor: 'rgba(2, 6, 23, 0.5)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: '8px',
                color: '#f8fafc',
                fontSize: '0.95rem',
                outline: 'none'
              }}
            />
            <div style={{
              position: 'absolute',
              left: '1rem',
              top: '50%',
              transform: 'translateY(-50%)',
              color: '#64748b'
            }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
          </div>
        </div>
        
        <select
          value={selectedStatus}
          onChange={(e) => setSelectedStatus(e.target.value)}
          style={{
            padding: '0.875rem 1rem',
            backgroundColor: 'rgba(2, 6, 23, 0.5)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: '8px',
            color: '#f8fafc',
            fontSize: '0.95rem',
            minWidth: '150px',
            outline: 'none',
            cursor: 'pointer'
          }}
        >
          <option value="All">All Status</option>
          <option value="Active">Active</option>
          <option value="Discharged">Discharged</option>
          <option value="Critical">Critical</option>
        </select>
      </div>

      {/* Patient Table */}
      <div style={{
        overflow: 'hidden',
        borderRadius: '12px',
        border: '1px solid rgba(255, 255, 255, 0.05)'
      }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(8, 1fr)',
          backgroundColor: 'rgba(2, 6, 23, 0.5)',
          padding: '1rem',
          borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
          fontWeight: '600',
          color: '#94a3b8',
          fontSize: '0.875rem'
        }}>
          <div>ID</div>
          <div>Patient Name</div>
          <div>Age</div>
          <div>Gender</div>
          <div>MRN</div>
          <div>Admission Date</div>
          <div>Status</div>
          <div>Actions</div>
        </div>

        {filteredPatients.map((patient, index) => (
          <div
            key={patient.id}
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(8, 1fr)',
              padding: '1rem',
              backgroundColor: index % 2 === 0 ? 'rgba(2, 6, 23, 0.2)' : 'rgba(2, 6, 23, 0.3)',
              borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
              alignItems: 'center',
              transition: 'all 0.2s'
            }}
            onMouseOver={(e) => e.currentTarget.style.backgroundColor = 'rgba(56, 182, 255, 0.1)'}
            onMouseOut={(e) => e.currentTarget.style.backgroundColor = index % 2 === 0 ? 'rgba(2, 6, 23, 0.2)' : 'rgba(2, 6, 23, 0.3)'}
          >
            <div style={{ color: '#94a3b8' }}>#{patient.id}</div>
            <div>
              <div style={{ fontWeight: '500' }}>{patient.name}</div>
            </div>
            <div>{patient.age}</div>
            <div>{patient.gender}</div>
            <div style={{ fontFamily: 'monospace', color: '#38bdf8' }}>{patient.mrn}</div>
            <div>{patient.admissionDate}</div>
            <div>
              <span style={{
                display: 'inline-block',
                padding: '0.25rem 0.75rem',
                backgroundColor: `${getStatusColor(patient.status)}20`,
                color: getStatusColor(patient.status),
                borderRadius: '20px',
                fontSize: '0.75rem',
                fontWeight: '500',
                border: `1px solid ${getStatusColor(patient.status)}40`
              }}>
                {patient.status}
              </span>
            </div>
            <div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button style={{
                  padding: '0.375rem 0.75rem',
                  backgroundColor: 'rgba(56, 182, 255, 0.1)',
                  color: '#38bdf8',
                  border: '1px solid rgba(56, 182, 255, 0.2)',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '0.75rem',
                  transition: 'all 0.2s'
                }}
                onMouseOver={(e) => e.currentTarget.style.backgroundColor = 'rgba(56, 182, 255, 0.2)'}
                onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'rgba(56, 182, 255, 0.1)'}
                >
                  View
                </button>
                <button style={{
                  padding: '0.375rem 0.75rem',
                  backgroundColor: 'rgba(124, 58, 237, 0.1)',
                  color: '#8b5cf6',
                  border: '1px solid rgba(124, 58, 237, 0.2)',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '0.75rem',
                  transition: 'all 0.2s'
                }}
                onClick={() => {
                  navigate('/localWorklist');
                }}
                onMouseOver={(e) => e.currentTarget.style.backgroundColor = 'rgba(124, 58, 237, 0.2)'}
                onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'rgba(124, 58, 237, 0.1)'}
                >
                  Studies
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Stats Cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: '1rem',
        marginTop: '2rem'
      }}>
        <div style={{
          backgroundColor: 'rgba(2, 6, 23, 0.5)',
          borderRadius: '12px',
          padding: '1.5rem',
          border: '1px solid rgba(56, 182, 255, 0.1)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <div style={{
              width: '48px',
              height: '48px',
              borderRadius: '12px',
              backgroundColor: 'rgba(56, 182, 255, 0.2)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <span style={{ fontSize: '1.5rem' }}>👥</span>
            </div>
            <div>
              <div style={{ fontSize: '0.875rem', color: '#94a3b8' }}>Total Patients</div>
              <div style={{ fontSize: '1.5rem', fontWeight: '700' }}>{patients.length}</div>
            </div>
          </div>
        </div>

        <div style={{
          backgroundColor: 'rgba(2, 6, 23, 0.5)',
          borderRadius: '12px',
          padding: '1.5rem',
          border: '1px solid rgba(34, 197, 94, 0.1)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <div style={{
              width: '48px',
              height: '48px',
              borderRadius: '12px',
              backgroundColor: 'rgba(34, 197, 94, 0.2)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <span style={{ fontSize: '1.5rem' }}>✅</span>
            </div>
            <div>
              <div style={{ fontSize: '0.875rem', color: '#94a3b8' }}>Active</div>
              <div style={{ fontSize: '1.5rem', fontWeight: '700' }}>
                {patients.filter(p => p.status === 'Active').length}
              </div>
            </div>
          </div>
        </div>

        <div style={{
          backgroundColor: 'rgba(2, 6, 23, 0.5)',
          borderRadius: '12px',
          padding: '1.5rem',
          border: '1px solid rgba(239, 68, 68, 0.1)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <div style={{
              width: '48px',
              height: '48px',
              borderRadius: '12px',
              backgroundColor: 'rgba(239, 68, 68, 0.2)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <span style={{ fontSize: '1.5rem' }}>⚠️</span>
            </div>
            <div>
              <div style={{ fontSize: '0.875rem', color: '#94a3b8' }}>Critical</div>
              <div style={{ fontSize: '1.5rem', fontWeight: '700' }}>
                {patients.filter(p => p.status === 'Critical').length}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default PatientList;