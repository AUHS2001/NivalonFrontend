import React, { useState, useEffect, useRef } from 'react';
import { SERVER_URL } from '../../../../config/server';

interface User {
  id: number;
  name: string;
  email: string;
  role: {
    slug: string;
    name: string;
  };
  permissions: any[];
  status: string;
}

interface EditUserPermissionsProps {
  user: User;
  onPageChange: (page: string) => void;
}

// Normalize a permission value (string or object) to a slug string
const toSlug = (p: any): string => {
  if (typeof p === 'string') return p;
  if (p && typeof p === 'object') return p.slug || p.name || String(p);
  return String(p);
};

const EditUserPermissions: React.FC<EditUserPermissionsProps> = ({ user, onPageChange }) => {
  const [allPermissions, setAllPermissions] = useState<string[]>([]);
  const initialPerms = (user.permissions || []).map(toSlug);
  const [currentPermissions, setCurrentPermissions] = useState<string[]>(initialPerms);
  const savedPermissionsRef = useRef<string[]>(initialPerms);
  const [loadingPermissions, setLoadingPermissions] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [dropdownOpen, setDropdownOpen] = useState(false);

  useEffect(() => {
    const fetchPermissions = async () => {
      try {
        const token = localStorage.getItem('token');
        const response = await fetch(`${SERVER_URL}/auth/admin/permissions`, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          credentials: 'include',
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        console.log('Permissions API response:', data);
        const raw = data.permissions || data.data || data || [];
        const perms = Array.isArray(raw) ? raw.map(toSlug) : [];
        console.log('Parsed permissions:', perms);
        setAllPermissions(perms);
      } catch (err: any) {
        console.error('Failed to load permissions:', err);
        setSubmitError(`Failed to load permissions: ${err.message}`);
      } finally {
        setLoadingPermissions(false);
      }
    };
    fetchPermissions();
  }, []);

  const availablePermissions = allPermissions.filter(p => !currentPermissions.includes(p));

  const getDisplayLabel = (permission: string) => {
    return permission;
  };

  const addPermission = (permission: string) => {
    setCurrentPermissions(prev => [...prev, permission]);
    setDropdownOpen(false);
    setSuccessMessage('');
  };

  const removePermission = (permission: string) => {
    setCurrentPermissions(prev => prev.filter(p => p !== permission));
    setSuccessMessage('');
  };

  const handleSave = async () => {
    setSubmitError('');
    setSuccessMessage('');
    const saved = savedPermissionsRef.current;
    const addPermissions = currentPermissions.filter(p => !saved.includes(p));
    const removePermissions = saved.filter(p => !currentPermissions.includes(p));
    if (addPermissions.length === 0 && removePermissions.length === 0) {
      setSubmitError('No changes to save');
      return;
    }
    setIsSaving(true);
    try {
      const token = localStorage.getItem('token');
      const url = `${SERVER_URL}/auth/admin/users/${user.id}/permissions`;
      const headers = {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      };

      // Send add and remove as separate requests to avoid backend conflicts
      if (addPermissions.length > 0) {
        const addBody = { add_permissions: addPermissions, remove_permissions: [] };
        console.log('PATCH add:', JSON.stringify(addBody));
        const res = await fetch(url, { method: 'PATCH', headers, credentials: 'include' as RequestCredentials, body: JSON.stringify(addBody) });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.message || data.error || data.detail || `HTTP ${res.status}`);
      }

      if (removePermissions.length > 0) {
        const removeBody = { add_permissions: [], remove_permissions: removePermissions };
        console.log('PATCH remove:', JSON.stringify(removeBody));
        const res = await fetch(url, { method: 'PATCH', headers, credentials: 'include' as RequestCredentials, body: JSON.stringify(removeBody) });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.message || data.error || data.detail || `HTTP ${res.status}`);
      }

      savedPermissionsRef.current = [...currentPermissions];
      setSuccessMessage('Permissions updated successfully');
    } catch (err: any) {
      setSubmitError(err.message || 'Failed to update permissions');
    } finally {
      setIsSaving(false);
    }
  };

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
    // Generate a consistent hex color so ${color}20 and ${color}40 alpha suffixes work
    let hash = 0;
    for (let i = 0; i < permission.length; i++) {
      hash = permission.charCodeAt(i) + ((hash << 5) - hash);
    }
    const h = Math.abs(hash) % 360;
    const s = 70, l = 55;
    const a = s * Math.min(l, 100 - l) / 100;
    const f = (n: number) => {
      const k = (n + h / 30) % 12;
      const c = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
      return Math.round(c * 2.55).toString(16).padStart(2, '0');
    };
    return `#${f(0)}${f(8)}${f(4)}`;
  };

  const getRoleColor = (slug: string) => {
    switch (slug) {
      case 'super_admin': return '#f59e0b';
      case 'admin': return '#ef4444';
      case 'analyst': return '#3b82f6';
      default: return '#64748b';
    }
  };

  const inputStyle = {
    width: '100%',
    padding: '0.875rem 1rem',
    backgroundColor: 'rgba(2, 6, 23, 0.5)',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    borderRadius: '8px',
    color: '#f8fafc',
    fontSize: '0.95rem',
    outline: 'none',
    transition: 'border-color 0.2s'
  };

  const labelStyle = {
    display: 'block' as const,
    marginBottom: '0.75rem',
    color: '#e2e8f0',
    fontSize: '0.875rem',
    fontWeight: '500' as const
  };

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
          <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: '600' }}>Edit User Permissions</h2>
          <p style={{ margin: '0.5rem 0 0 0', color: '#64748b', fontSize: '0.95rem' }}>
            Manage permissions for {user.name || user.email}
          </p>
        </div>
        <button
          onClick={() => onPageChange('users')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            backgroundColor: 'rgba(255, 255, 255, 0.1)',
            color: '#cbd5e1',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: '8px',
            padding: '0.75rem 1.5rem',
            cursor: 'pointer',
            fontSize: '0.95rem',
            fontWeight: '500',
            transition: 'all 0.2s'
          }}
          onMouseOver={(e) => e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.15)'}
          onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.1)'}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          Back to Users
        </button>
      </div>

      {/* Error Message */}
      {submitError && (
        <div style={{
          backgroundColor: 'rgba(239, 68, 68, 0.15)', color: '#ef4444', padding: '1rem',
          borderRadius: '8px', border: '1px solid rgba(239, 68, 68, 0.3)', marginBottom: '1.5rem'
        }}>
          {submitError}
        </div>
      )}

      {/* Success Message */}
      {successMessage && (
        <div style={{
          backgroundColor: 'rgba(34, 197, 94, 0.15)', color: '#10b981', padding: '1rem',
          borderRadius: '8px', border: '1px solid rgba(34, 197, 94, 0.3)', marginBottom: '1.5rem'
        }}>
          {successMessage}
        </div>
      )}

      {/* User Info Card */}
      <div style={{
        backgroundColor: 'rgba(15, 23, 42, 0.7)',
        borderRadius: '16px',
        padding: '2rem',
        boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.3)',
        backdropFilter: 'blur(12px)',
        border: '1px solid rgba(255, 255, 255, 0.05)',
        marginBottom: '1.5rem'
      }}>
        <h3 style={{ margin: '0 0 1.5rem 0', fontSize: '1.1rem', fontWeight: '600', color: '#e2e8f0' }}>
          User Information
        </h3>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '1.5rem'
        }}>
          <div>
            <label style={labelStyle}>Name</label>
            <div style={{ ...inputStyle, backgroundColor: 'rgba(2, 6, 23, 0.3)', color: '#94a3b8', cursor: 'not-allowed' }}>
              {user.name || 'N/A'}
            </div>
          </div>
          <div>
            <label style={labelStyle}>Email</label>
            <div style={{ ...inputStyle, backgroundColor: 'rgba(2, 6, 23, 0.3)', color: '#38bdf8', cursor: 'not-allowed' }}>
              {user.email || 'N/A'}
            </div>
          </div>
          <div>
            <label style={labelStyle}>Role</label>
            <div style={{ ...inputStyle, backgroundColor: 'rgba(2, 6, 23, 0.3)', cursor: 'not-allowed', display: 'flex', alignItems: 'center' }}>
              <span style={{
                display: 'inline-block',
                padding: '0.25rem 0.75rem',
                backgroundColor: `${getRoleColor(user.role?.slug)}20`,
                color: getRoleColor(user.role?.slug),
                borderRadius: '20px',
                fontSize: '0.85rem',
                fontWeight: '500',
                border: `1px solid ${getRoleColor(user.role?.slug)}40`
              }}>
                {user.role?.name || user.role?.slug || 'N/A'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Permissions Card */}
      <div style={{
        backgroundColor: 'rgba(15, 23, 42, 0.7)',
        borderRadius: '16px',
        padding: '2rem',
        boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.3)',
        backdropFilter: 'blur(12px)',
        border: '1px solid rgba(255, 255, 255, 0.05)',
        marginBottom: '2rem'
      }}>
        <h3 style={{ margin: '0 0 1.5rem 0', fontSize: '1.1rem', fontWeight: '600', color: '#e2e8f0' }}>
          Permissions
        </h3>

        {/* Add Permission Dropdown */}
        <div style={{ marginBottom: '1.5rem', position: 'relative' }}>
          <label style={labelStyle}>Add Permission</label>
          <button
            onClick={() => setDropdownOpen(!dropdownOpen)}
            disabled={loadingPermissions || availablePermissions.length === 0}
            style={{
              ...inputStyle,
              cursor: loadingPermissions || availablePermissions.length === 0 ? 'not-allowed' : 'pointer',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              opacity: loadingPermissions || availablePermissions.length === 0 ? 0.6 : 1,
              textAlign: 'left' as const,
            }}
          >
            <span style={{ color: '#64748b' }}>
              {loadingPermissions
                ? 'Loading permissions...'
                : availablePermissions.length === 0
                  ? 'All permissions assigned'
                  : 'Select a permission to add'}
            </span>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#64748b">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {dropdownOpen && availablePermissions.length > 0 && (
            <div style={{
              position: 'absolute',
              top: '100%',
              left: 0,
              right: 0,
              marginTop: '0.25rem',
              backgroundColor: 'rgba(15, 23, 42, 0.95)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: '8px',
              maxHeight: '200px',
              overflowY: 'auto',
              zIndex: 20,
              boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.5)'
            }}>
              {availablePermissions.map(perm => (
                <button
                  key={perm}
                  onClick={() => addPermission(perm)}
                  style={{
                    width: '100%',
                    padding: '0.75rem 1rem',
                    backgroundColor: 'transparent',
                    color: '#e2e8f0',
                    border: 'none',
                    borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
                    cursor: 'pointer',
                    textAlign: 'left',
                    fontSize: '0.9rem',
                    transition: 'background-color 0.15s',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.75rem'
                  }}
                  onMouseOver={(e) => e.currentTarget.style.backgroundColor = 'rgba(56, 182, 255, 0.1)'}
                  onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                >
                  <span style={{
                    padding: '0.15rem 0.5rem',
                    backgroundColor: `${getPermissionColor(perm)}20`,
                    color: getPermissionColor(perm),
                    borderRadius: '20px',
                    fontSize: '0.75rem',
                    fontWeight: '500',
                    border: `1px solid ${getPermissionColor(perm)}40`
                  }}>
                    {getDisplayLabel(perm)}
                  </span>
                  <span style={{ color: '#64748b', fontSize: '0.8rem' }}>{perm}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Current Permissions Pills */}
        <div>
          <label style={labelStyle}>Current Permissions</label>
          <div style={{
            display: 'flex',
            gap: '0.5rem',
            flexWrap: 'wrap',
            padding: '1rem',
            backgroundColor: 'rgba(2, 6, 23, 0.3)',
            borderRadius: '8px',
            border: '1px solid rgba(255, 255, 255, 0.05)',
            minHeight: '50px'
          }}>
            {currentPermissions.length === 0 ? (
              <span style={{ color: '#64748b', fontSize: '0.875rem' }}>No permissions assigned</span>
            ) : (
              currentPermissions.map(perm => (
                <span
                  key={perm}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    padding: '0.35rem 0.75rem',
                    backgroundColor: `${getPermissionColor(perm)}20`,
                    color: getPermissionColor(perm),
                    borderRadius: '20px',
                    fontSize: '0.8rem',
                    fontWeight: '500',
                    border: `1px solid ${getPermissionColor(perm)}40`
                  }}
                >
                  {getDisplayLabel(perm)}
                  <button
                    onClick={() => removePermission(perm)}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: getPermissionColor(perm),
                      cursor: 'pointer',
                      padding: '0',
                      display: 'flex',
                      alignItems: 'center',
                      opacity: 0.7,
                      transition: 'opacity 0.15s'
                    }}
                    onMouseOver={(e) => e.currentTarget.style.opacity = '1'}
                    onMouseOut={(e) => e.currentTarget.style.opacity = '0.7'}
                    title={`Remove ${perm}`}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </span>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Actions */}
      <div style={{
        display: 'flex',
        justifyContent: 'flex-end',
        gap: '1rem'
      }}>
        <button
          type="button"
          onClick={() => onPageChange('users')}
          style={{
            padding: '0.875rem 2rem',
            backgroundColor: 'rgba(255, 255, 255, 0.1)',
            color: '#cbd5e1',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: '8px',
            cursor: 'pointer',
            fontSize: '0.95rem',
            fontWeight: '500',
            transition: 'all 0.2s'
          }}
          onMouseOver={(e) => e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.15)'}
          onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.1)'}
        >
          Cancel
        </button>

        <button
          onClick={handleSave}
          disabled={isSaving}
          style={{
            padding: '0.875rem 2rem',
            backgroundColor: '#2563eb',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            cursor: isSaving ? 'not-allowed' : 'pointer',
            fontSize: '0.95rem',
            fontWeight: '500',
            transition: 'all 0.2s',
            opacity: isSaving ? 0.7 : 1,
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem'
          }}
          onMouseOver={(e) => !isSaving && (e.currentTarget.style.backgroundColor = '#1d4ed8')}
          onMouseOut={(e) => !isSaving && (e.currentTarget.style.backgroundColor = '#2563eb')}
        >
          {isSaving ? (
            <>
              <span style={{
                display: 'inline-block', width: '16px', height: '16px',
                border: '2px solid rgba(255, 255, 255, 0.3)', borderTopColor: 'white',
                borderRadius: '50%', animation: 'spin 1s linear infinite'
              }} />
              Saving...
            </>
          ) : 'Save Permissions'}
        </button>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
      `}</style>
    </div>
  );
};

export default EditUserPermissions;
