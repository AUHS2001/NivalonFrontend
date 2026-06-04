// Registeries.tsx
import React, { useState, useEffect } from 'react';
import { SERVER_URL } from '../../../../config/server';

interface Registry {
  id: number;
  name: string;
  email: string;
  date_of_procedure: string;
  serial_number: string;
}

const Registeries: React.FC<{ onPageChange: (page: string) => void }> = ({ onPageChange }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [registeries, setRegisteries] = useState<Registry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState<number | null>(null);

  useEffect(() => {
    const fetchRegisteries = async () => {
      try {
        const token = localStorage.getItem('token');
        const response = await fetch(`${SERVER_URL}/registry/`, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          credentials: 'include',
        });
        if (!response.ok) throw new Error('Failed to fetch registeries');
        const data = await response.json();
        const records = data.registries || data.data || data || [];
        setRegisteries(Array.isArray(records) ? records : []);
      } catch (err: any) {
        setError(err.message || 'Failed to load registeries');
      } finally {
        setLoading(false);
      }
    };
    fetchRegisteries();
  }, []);

  const handleDelete = async (id: number) => {
    setDeleting(id);
    try {
      const token = localStorage.getItem('token');
      console.log(`[Delete Registry] DELETE ${SERVER_URL}/registry/${id}`);
      const response = await fetch(`${SERVER_URL}/registry/${id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
        credentials: 'include',
      });
      console.log(`[Delete Registry] Status: ${response.status} ${response.statusText}`);
      const data = await response.json().catch(() => ({}));
      console.log('[Delete Registry] Response:', data);
      if (!response.ok) {
        throw new Error(data.message || data.error || data.detail || 'Failed to delete registry');
      }
      setRegisteries(prev => prev.filter(r => r.id !== id));
    } catch (err: any) {
      console.error('[Delete Registry] Error:', err);
      setError(err.message || 'Failed to delete registry');
    } finally {
      setDeleting(null);
      setDeleteConfirmId(null);
    }
  };

  const filteredRegisteries = registeries.filter(item => {
    const matchesSearch =
      (item.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (item.email || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (item.serial_number || '').toLowerCase().includes(searchTerm.toLowerCase());
    return matchesSearch;
  });

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
          <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: '600' }}>Registeries</h2>
          <p style={{ margin: '0.5rem 0 0 0', color: '#64748b', fontSize: '0.95rem' }}>
            {filteredRegisteries.length} records found
          </p>
        </div>
        <button
          onClick={() => onPageChange('addRegistry')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            padding: '0.75rem 1.5rem',
            backgroundColor: '#2563eb',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            cursor: 'pointer',
            fontSize: '0.95rem',
            fontWeight: '500',
            transition: 'all 0.2s'
          }}
          onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#1d4ed8'}
          onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#2563eb'}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
          </svg>
          New Registry
        </button>
      </div>

      {/* Error Message */}
      {error && (
        <div style={{
          backgroundColor: 'rgba(239, 68, 68, 0.15)', color: '#ef4444', padding: '1rem',
          borderRadius: '8px', border: '1px solid rgba(239, 68, 68, 0.3)', marginBottom: '1.5rem'
        }}>
          {error}
        </div>
      )}

      {/* Search */}
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
              placeholder="Search by name, email or serial number..."
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
      </div>

      {/* Table */}
      <div style={{
        overflow: 'hidden',
        borderRadius: '12px',
        border: '1px solid rgba(255, 255, 255, 0.05)'
      }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: '0.5fr 1.2fr 1.5fr 2fr 1.5fr 0.7fr',
          backgroundColor: 'rgba(2, 6, 23, 0.5)',
          padding: '1rem',
          borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
          fontWeight: '600',
          color: '#94a3b8',
          fontSize: '0.875rem'
        }}>
          <div style={{ textAlign: 'center' }}>#</div>
          <div>Serial Number</div>
          <div>Name</div>
          <div>Email</div>
          <div>Date of Procedure</div>
          <div style={{ textAlign: 'center' }}>Actions</div>
        </div>

        {loading ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: '#64748b' }}>
            <span style={{
              display: 'inline-block', width: '20px', height: '20px',
              border: '2px solid rgba(255, 255, 255, 0.2)', borderTopColor: '#38bdf8',
              borderRadius: '50%', animation: 'spin 1s linear infinite',
              marginRight: '0.5rem', verticalAlign: 'middle'
            }} />
            Loading registeries...
          </div>
        ) : filteredRegisteries.length === 0 ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: '#64748b' }}>
            No registeries found
          </div>
        ) : (
          filteredRegisteries.map((item, index) => (
            <div
              key={item.id}
              style={{
                display: 'grid',
                gridTemplateColumns: '0.5fr 1.2fr 1.5fr 2fr 1.5fr 0.7fr',
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
              <div style={{ color: '#cbd5e1', fontWeight: '500', fontFamily: 'monospace' }}>
                {item.serial_number || '-'}
              </div>
              <div style={{ fontWeight: '500', color: item.name ? 'inherit' : '#64748b' }}>
                {item.name || 'No name'}
              </div>
              <div style={{ color: item.email ? '#38bdf8' : '#64748b', wordBreak: 'break-all' }}>
                {item.email || 'No email'}
              </div>
              <div style={{ color: '#cbd5e1' }}>
                {item.date_of_procedure
                  ? new Date(item.date_of_procedure).toLocaleDateString('en-US', {
                      year: 'numeric', month: 'short', day: 'numeric'
                    })
                  : '-'}
              </div>
              <div style={{ textAlign: 'center' }}>
                {deleteConfirmId === item.id ? (
                  <div style={{ display: 'flex', gap: '0.25rem', justifyContent: 'center' }}>
                    <button
                      onClick={() => handleDelete(item.id)}
                      disabled={deleting === item.id}
                      style={{
                        padding: '0.3rem 0.6rem',
                        backgroundColor: 'rgba(239, 68, 68, 0.2)',
                        color: '#ef4444',
                        border: '1px solid rgba(239, 68, 68, 0.3)',
                        borderRadius: '6px',
                        cursor: deleting === item.id ? 'not-allowed' : 'pointer',
                        fontSize: '0.75rem',
                        fontWeight: '500',
                        transition: 'all 0.2s'
                      }}
                    >
                      {deleting === item.id ? '...' : 'Yes'}
                    </button>
                    <button
                      onClick={() => setDeleteConfirmId(null)}
                      style={{
                        padding: '0.3rem 0.6rem',
                        backgroundColor: 'rgba(255, 255, 255, 0.1)',
                        color: '#94a3b8',
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        fontSize: '0.75rem',
                        fontWeight: '500',
                        transition: 'all 0.2s'
                      }}
                    >
                      No
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setDeleteConfirmId(item.id)}
                    title="Delete registry"
                    style={{
                      padding: '0.4rem',
                      backgroundColor: 'transparent',
                      color: '#64748b',
                      border: 'none',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}
                    onMouseOver={(e) => { e.currentTarget.style.color = '#ef4444'; e.currentTarget.style.backgroundColor = 'rgba(239, 68, 68, 0.1)'; }}
                    onMouseOut={(e) => { e.currentTarget.style.color = '#64748b'; e.currentTarget.style.backgroundColor = 'transparent'; }}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M3 6h18" /><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" /><line x1="10" y1="11" x2="10" y2="17" /><line x1="14" y1="11" x2="14" y2="17" />
                    </svg>
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Stats Card */}
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
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <div>
              <div style={{ fontSize: '0.875rem', color: '#94a3b8' }}>Total Records</div>
              <div style={{ fontSize: '1.5rem', fontWeight: '700' }}>{registeries.length}</div>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}

export default Registeries;
