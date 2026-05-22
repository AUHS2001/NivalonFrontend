// PatientList.tsx
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { SERVER_URL } from '../../../../config/server';

interface Patient {
  id: number;
  name: string;
  email: string;
  role: {
    slug: string;
    name: string;
  };
  permissions: string[];
  status: string;
}

const PatientList: React.FC = ({ onPageChange }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<string>('All');
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    const fetchPatients = async () => {
      try {
        const token = localStorage.getItem('token');
        const response = await fetch(`${SERVER_URL}/auth/admin/users`, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        });
        if (!response.ok) throw new Error('Failed to fetch patients');
        const data = await response.json();
        const allUsers: Patient[] = data.users || data || [];
        setPatients(allUsers.filter(u => u.role?.slug === 'patient'));
      } catch (err: any) {
        setError(err.message || 'Failed to load patients');
      } finally {
        setLoading(false);
      }
    };
    fetchPatients();
  }, []);

  const filteredPatients = patients.filter(patient => {
    const matchesSearch =
      (patient.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (patient.email || '').toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = selectedStatus === 'All' || patient.status?.toLowerCase() === selectedStatus.toLowerCase();
    return matchesSearch && matchesStatus;
  });

  const PERMISSION_COLORS: Record<string, string> = {
    'case:view': '#3b82f6',
    'case:edit': '#8b5cf6',
    'case:approve': '#10b981',
    'case:create': '#f59e0b',
    'case:manage': '#ef4444',
    'users:view': '#06b6d4',
    'users:edit': '#a855f7',
    'users:create': '#f97316',
    'users:manage': '#e11d48',
    'users:approve': '#14b8a6',
  };

  const getPermissionColor = (permission: string) => {
    if (PERMISSION_COLORS[permission]) return PERMISSION_COLORS[permission];
    let hash = 0;
    for (let i = 0; i < permission.length; i++) {
      hash = permission.charCodeAt(i) + ((hash << 5) - hash);
    }
    const hue = Math.abs(hash) % 360;
    return `hsl(${hue}, 70%, 55%)`;
  };

  const getStatusColor = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'active': return '#10b981';
      case 'inactive': return '#64748b';
      case 'pending': return '#f59e0b';
      default: return '#64748b';
    }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '300px', color: '#94a3b8' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{
            width: '40px', height: '40px', border: '3px solid rgba(56, 182, 255, 0.2)',
            borderTopColor: '#38bdf8', borderRadius: '50%', animation: 'spin 1s linear infinite',
            margin: '0 auto 1rem'
          }} />
          Loading patients...
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{
        backgroundColor: 'rgba(239, 68, 68, 0.15)', color: '#ef4444', padding: '1rem',
        borderRadius: '8px', border: '1px solid rgba(239, 68, 68, 0.3)', textAlign: 'center'
      }}>
        {error}
      </div>
    );
  }

  return (
    <div style={{ animation: 'fadeIn 0.5s ease-out' }}>
      {/* Header */}
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
              placeholder="Search patients by name or email..."
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
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
          <option value="pending">Pending</option>
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
          gridTemplateColumns: '0.5fr 1.2fr 1.8fr 0.8fr 2.5fr 0.8fr 0.8fr',
          backgroundColor: 'rgba(2, 6, 23, 0.5)',
          padding: '1rem',
          borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
          fontWeight: '600',
          color: '#94a3b8',
          fontSize: '0.875rem'
        }}>
          <div style={{ textAlign: 'center' }}>#</div>
          <div>Name</div>
          <div>Email</div>
          <div>Role</div>
          <div>Permissions</div>
          <div>Status</div>
          <div>Actions</div>
        </div>

        {filteredPatients.length === 0 ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: '#64748b' }}>
            No patients found
          </div>
        ) : (
          filteredPatients.map((patient, index) => (
            <div
              key={patient.id}
              style={{
                display: 'grid',
                gridTemplateColumns: '0.5fr 1.2fr 1.8fr 0.8fr 2.5fr 0.8fr 0.8fr',
                padding: '1rem',
                backgroundColor: index % 2 === 0 ? 'rgba(2, 6, 23, 0.2)' : 'rgba(2, 6, 23, 0.3)',
                borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
                alignItems: 'center',
                transition: 'all 0.2s'
              }}
              onMouseOver={(e) => e.currentTarget.style.backgroundColor = 'rgba(56, 182, 255, 0.1)'}
              onMouseOut={(e) => e.currentTarget.style.backgroundColor = index % 2 === 0 ? 'rgba(2, 6, 23, 0.2)' : 'rgba(2, 6, 23, 0.3)'}
            >
              <div style={{ textAlign: 'center', color: '#94a3b8', fontWeight: '500' }}>
                {index + 1}
              </div>
              <div style={{ fontWeight: '500', color: patient.name ? 'inherit' : '#64748b' }}>{patient.name || 'No name'}</div>
              <div style={{ color: patient.email ? '#38bdf8' : '#64748b', wordBreak: 'break-all' }}>{patient.email || 'No email'}</div>
              <div>
                <span style={{
                  display: 'inline-block',
                  padding: '0.25rem 0.75rem',
                  backgroundColor: 'rgba(16, 185, 129, 0.15)',
                  color: '#10b981',
                  borderRadius: '20px',
                  fontSize: '0.75rem',
                  fontWeight: '500',
                  border: '1px solid rgba(16, 185, 129, 0.3)'
                }}>
                  {patient.role?.name || patient.role?.slug || 'Patient'}
                </span>
              </div>
              <div>
                <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                  {(patient.permissions || []).map((permission, i) => (
                    <React.Fragment key={typeof permission === 'string' ? permission : String(i)}>
                      {i > 0 && i % 4 === 0 && <div style={{ flexBasis: '100%', height: 0 }} />}
                      <span style={{
                        padding: '0.15rem 0.5rem',
                        backgroundColor: `${getPermissionColor(typeof permission === 'string' ? permission : (permission as any)?.slug || String(permission))}20`,
                        color: getPermissionColor(typeof permission === 'string' ? permission : (permission as any)?.slug || String(permission)),
                        borderRadius: '20px',
                        fontSize: '0.75rem',
                        fontWeight: '500',
                        border: `1px solid ${getPermissionColor(typeof permission === 'string' ? permission : (permission as any)?.slug || String(permission))}40`
                      }}>
                        {typeof permission === 'string' ? permission : (permission as any)?.slug || String(permission)}
                      </span>
                    </React.Fragment>
                  ))}
                  {(!patient.permissions || patient.permissions.length === 0) && (
                    <span style={{
                      padding: '0.15rem 0.5rem',
                      backgroundColor: `${getPermissionColor('case:view')}20`,
                      color: getPermissionColor('case:view'),
                      borderRadius: '20px',
                      fontSize: '0.75rem',
                      fontWeight: '500',
                      border: `1px solid ${getPermissionColor('case:view')}40`
                    }}>
                      case:view
                    </span>
                  )}
                </div>
              </div>
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
                  {patient.status || 'Active'}
                </span>
              </div>
              <div>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
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
                  onClick={() => navigate('/localWorklist')}
                  onMouseOver={(e) => e.currentTarget.style.backgroundColor = 'rgba(124, 58, 237, 0.2)'}
                  onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'rgba(124, 58, 237, 0.1)'}
                  >
                    Studies
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
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
              width: '48px', height: '48px', borderRadius: '12px',
              backgroundColor: 'rgba(56, 182, 255, 0.2)',
              display: 'flex', alignItems: 'center', justifyContent: 'center'
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
              width: '48px', height: '48px', borderRadius: '12px',
              backgroundColor: 'rgba(34, 197, 94, 0.2)',
              display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}>
              <span style={{ fontSize: '1.5rem' }}>✅</span>
            </div>
            <div>
              <div style={{ fontSize: '0.875rem', color: '#94a3b8' }}>Active</div>
              <div style={{ fontSize: '1.5rem', fontWeight: '700' }}>
                {patients.filter(p => p.status?.toLowerCase() === 'active').length}
              </div>
            </div>
          </div>
        </div>

        <div style={{
          backgroundColor: 'rgba(2, 6, 23, 0.5)',
          borderRadius: '12px',
          padding: '1.5rem',
          border: '1px solid rgba(245, 158, 11, 0.1)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <div style={{
              width: '48px', height: '48px', borderRadius: '12px',
              backgroundColor: 'rgba(245, 158, 11, 0.2)',
              display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}>
              <span style={{ fontSize: '1.5rem' }}>⏳</span>
            </div>
            <div>
              <div style={{ fontSize: '0.875rem', color: '#94a3b8' }}>Pending</div>
              <div style={{ fontSize: '1.5rem', fontWeight: '700' }}>
                {patients.filter(p => p.status?.toLowerCase() === 'pending').length}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default PatientList;
