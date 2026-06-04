// components/UserAccess.tsx
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { SERVER_URL } from '../../../../config/server';

interface User {
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

const ALLOWED_SLUGS = ['admin', 'super_admin', 'analyst', 'registry_admin', 'user_admin'];

const UserAccess: React.FC = ({ onPageChange }) => {
  const navigate = useNavigate();
  const userPermissions: string[] = JSON.parse(localStorage.getItem('userPermissions') || '[]');
  const canEdit = userPermissions.includes('users:edit');
  const canCreate = userPermissions.includes('users:create');

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedRole, setSelectedRole] = useState<string>('All');
  const [selectedStatus, setSelectedStatus] = useState<string>('All');
  const [selectedPermission, setSelectedPermission] = useState<string>('All');
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const token = localStorage.getItem('token');
        const response = await fetch(`${SERVER_URL}/auth/admin/users`, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          credentials: 'include',
        });
        if (!response.ok) throw new Error('Failed to fetch users');
        const data = await response.json();
        const allUsers: User[] = data.users || data || [];
        setUsers(allUsers.filter(u => ALLOWED_SLUGS.includes(u.role?.slug)));
      } catch (err: any) {
        setError(err.message || 'Failed to load users');
      } finally {
        setLoading(false);
      }
    };
    fetchUsers();
  }, []);

  // Collect unique permission labels from all users for the filter dropdown
  const allPermissions = Array.from(new Set(
    users.flatMap(u => u.permissions || [])
  )).filter(Boolean) as string[];

  const filteredUsers = users.filter(user => {
    const matchesSearch =
      (user.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (user.email || '').toLowerCase().includes(searchTerm.toLowerCase());

    const matchesRole = selectedRole === 'All' || user.role?.slug === selectedRole;
    const matchesStatus = selectedStatus === 'All' || user.status?.toLowerCase() === selectedStatus.toLowerCase();
    const matchesPermission = selectedPermission === 'All' ||
      (user.permissions || []).some(p => p === selectedPermission);

    return matchesSearch && matchesRole && matchesStatus && matchesPermission;
  });

  const getRoleColor = (slug: string) => {
    switch (slug) {
      case 'super_admin': return '#f59e0b';
      case 'admin': return '#ef4444';
      case 'registry_admin': return '#a855f7';
      case 'user_admin': return '#06b6d4';
      case 'analyst': return '#3b82f6';
      default: return '#64748b';
    }
  };

  const getRoleLabel = (slug: string) => {
    switch (slug) {
      case 'super_admin': return 'Super Admin';
      case 'admin': return 'Admin';
      case 'registry_admin': return 'Registry Admin';
      case 'user_admin': return 'User Admin';
      case 'analyst': return 'Analyst';
      default: return slug;
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

  const getStatusColor = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'active': return '#10b981';
      case 'inactive': return '#64748b';
      case 'pending': return '#f59e0b';
      default: return '#64748b';
    }
  };

  const totalUsers = users.length;
  const adminUsers = users.filter(u => u.role?.slug === 'admin' || u.role?.slug === 'super_admin').length;
  const analystUsers = users.filter(u => u.role?.slug === 'analyst').length;

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '300px', color: '#94a3b8' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{
            width: '40px', height: '40px', border: '3px solid rgba(56, 182, 255, 0.2)',
            borderTopColor: '#38bdf8', borderRadius: '50%', animation: 'spin 1s linear infinite',
            margin: '0 auto 1rem'
          }} />
          Loading users...
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
      {/* Header with Stats */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '2rem'
      }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: '600' }}>User Access Management</h2>
          <p style={{ margin: '0.5rem 0 0 0', color: '#64748b', fontSize: '0.95rem' }}>
            {filteredUsers.length} users found
          </p>
        </div>
        <button
          onClick={() => canCreate && onPageChange('addUser')}
          disabled={!canCreate}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            backgroundColor: canCreate ? '#2563eb' : '#1e3a5f',
            color: canCreate ? 'white' : '#64748b',
            border: 'none',
            borderRadius: '8px',
            padding: '0.75rem 1.5rem',
            cursor: canCreate ? 'pointer' : 'not-allowed',
            fontSize: '0.95rem',
            fontWeight: '500',
            transition: 'all 0.2s',
            opacity: canCreate ? 1 : 0.6
          }}
          onMouseOver={(e) => canCreate && (e.currentTarget.style.backgroundColor = '#1d4ed8')}
          onMouseOut={(e) => canCreate && (e.currentTarget.style.backgroundColor = '#2563eb')}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
          </svg>
          Add New User
        </button>
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
              placeholder="Search users by name or email..."
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

        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <select
            value={selectedRole}
            onChange={(e) => setSelectedRole(e.target.value)}
            style={{
              padding: '0.875rem 1rem',
              backgroundColor: 'rgba(2, 6, 23, 0.5)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: '8px',
              color: '#f8fafc',
              fontSize: '0.95rem',
              minWidth: '140px',
              outline: 'none',
              cursor: 'pointer'
            }}
          >
            <option value="All">All Roles</option>
            <option value="admin">Admin</option>
            <option value="registry_admin">Registry Admin</option>
            <option value="user_admin">User Admin</option>
            <option value="analyst">Analyst</option>
          </select>

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
              minWidth: '140px',
              outline: 'none',
              cursor: 'pointer'
            }}
          >
            <option value="All">All Status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="pending">Pending</option>
          </select>

          <select
            value={selectedPermission}
            onChange={(e) => setSelectedPermission(e.target.value)}
            style={{
              padding: '0.875rem 1rem',
              backgroundColor: 'rgba(2, 6, 23, 0.5)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: '8px',
              color: '#f8fafc',
              fontSize: '0.95rem',
              minWidth: '160px',
              outline: 'none',
              cursor: 'pointer'
            }}
          >
            <option value="All">All Permissions</option>
            {allPermissions.map(p => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Users Table */}
      <div style={{
        overflow: 'hidden',
        borderRadius: '12px',
        border: '1px solid rgba(255, 255, 255, 0.05)',
        marginBottom: '2rem'
      }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: '0.5fr 1.2fr 1.8fr 0.8fr 3fr 0.8fr 1fr',          backgroundColor: 'rgba(2, 6, 23, 0.5)',
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

        {filteredUsers.length === 0 ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: '#64748b' }}>
            No users found
          </div>
        ) : (
          filteredUsers.map((user, index) => (
            <div
              key={user.id}
              style={{
                display: 'grid',
                gridTemplateColumns: '0.5fr 1.2fr 1.8fr 0.8fr 3fr 0.8fr 1fr',                padding: '1rem',
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
              <div style={{ fontWeight: '500', color: user.name ? 'inherit' : '#64748b' }}>{user.name || 'No name'}</div>
              <div style={{ color: user.email ? '#38bdf8' : '#64748b', wordBreak: 'break-all' }}>{user.email || 'No email'}</div>
              <div>
                <span style={{
                  display: 'inline-block',
                  padding: '0.25rem 0.75rem',
                  backgroundColor: `${getRoleColor(user.role?.slug)}20`,
                  color: getRoleColor(user.role?.slug),
                  borderRadius: '20px',
                  fontSize: '0.75rem',
                  fontWeight: '500',
                  border: `1px solid ${getRoleColor(user.role?.slug)}40`
                }}>
                  {getRoleLabel(user.role?.slug)}
                </span>
              </div>
              <div>
                <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                  {(user.permissions || []).map((permission, i) => (
                    <React.Fragment key={permission}>
                      {i > 0 && i % 4 === 0 && <div style={{ flexBasis: '100%', height: 0 }} />}
                      <span
                        style={{
                          padding: '0.15rem 0.5rem',
                          backgroundColor: `${getPermissionColor(permission)}20`,
                          color: getPermissionColor(permission),
                          borderRadius: '20px',
                          fontSize: '0.75rem',
                          fontWeight: '500',
                          border: `1px solid ${getPermissionColor(permission)}40`
                        }}
                      >
                        {permission}
                      </span>
                    </React.Fragment>
                  ))}
                  {(!user.permissions || user.permissions.length === 0) && (
                    <span style={{ color: '#64748b', fontSize: '0.75rem' }}>-</span>
                  )}
                </div>
              </div>
              <div>
                <span style={{
                  display: 'inline-block',
                  padding: '0.25rem 0.75rem',
                  backgroundColor: `${getStatusColor(user.status)}20`,
                  color: getStatusColor(user.status),
                  borderRadius: '20px',
                  fontSize: '0.75rem',
                  fontWeight: '500',
                  border: `1px solid ${getStatusColor(user.status)}40`
                }}>
                  {user.status || 'Active'}
                </span>
              </div>
              <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                <button
                  onClick={() => canEdit && onPageChange('editUser', user)}
                  disabled={!canEdit}
                  style={{
                    padding: '0.375rem 0.75rem',
                    backgroundColor: canEdit ? 'rgba(56, 182, 255, 0.1)' : 'rgba(100, 116, 139, 0.1)',
                    color: canEdit ? '#38bdf8' : '#64748b',
                    border: canEdit ? '1px solid rgba(56, 182, 255, 0.2)' : '1px solid rgba(100, 116, 139, 0.2)',
                    borderRadius: '6px',
                    cursor: canEdit ? 'pointer' : 'not-allowed',
                    fontSize: '0.75rem',
                    transition: 'all 0.2s',
                    opacity: canEdit ? 1 : 0.6
                  }}
                  onMouseOver={(e) => canEdit && (e.currentTarget.style.backgroundColor = 'rgba(56, 182, 255, 0.2)')}
                  onMouseOut={(e) => canEdit && (e.currentTarget.style.backgroundColor = 'rgba(56, 182, 255, 0.1)')}
                >
                  Edit
                </button>
                {(() => {
                  const isAnalyst = user.role?.slug === 'analyst';
                  return (
                    <button
                      onClick={() => isAnalyst && window.open('/localWorklist', '_blank')}
                      disabled={!isAnalyst}
                      style={{
                        padding: '0.375rem 0.75rem',
                        backgroundColor: isAnalyst ? 'rgba(16, 185, 129, 0.1)' : 'rgba(100, 116, 139, 0.1)',
                        color: isAnalyst ? '#10b981' : '#64748b',
                        border: isAnalyst ? '1px solid rgba(16, 185, 129, 0.2)' : '1px solid rgba(100, 116, 139, 0.2)',
                        borderRadius: '6px',
                        cursor: isAnalyst ? 'pointer' : 'not-allowed',
                        fontSize: '0.75rem',
                        transition: 'all 0.2s',
                        opacity: isAnalyst ? 1 : 0.4
                      }}
                      onMouseOver={(e) => isAnalyst && (e.currentTarget.style.backgroundColor = 'rgba(16, 185, 129, 0.2)')}
                      onMouseOut={(e) => isAnalyst && (e.currentTarget.style.backgroundColor = 'rgba(16, 185, 129, 0.1)')}
                    >
                      Studies
                    </button>
                  );
                })()}
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
        marginBottom: '2rem'
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
              <div style={{ fontSize: '0.875rem', color: '#94a3b8' }}>Total Users</div>
              <div style={{ fontSize: '1.5rem', fontWeight: '700' }}>{totalUsers}</div>
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
              width: '48px', height: '48px', borderRadius: '12px',
              backgroundColor: 'rgba(239, 68, 68, 0.2)',
              display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}>
              <span style={{ fontSize: '1.5rem' }}>👑</span>
            </div>
            <div>
              <div style={{ fontSize: '0.875rem', color: '#94a3b8' }}>Admin Users</div>
              <div style={{ fontSize: '1.5rem', fontWeight: '700' }}>{adminUsers}</div>
            </div>
          </div>
        </div>

        <div style={{
          backgroundColor: 'rgba(2, 6, 23, 0.5)',
          borderRadius: '12px',
          padding: '1.5rem',
          border: '1px solid rgba(59, 130, 246, 0.1)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <div style={{
              width: '48px', height: '48px', borderRadius: '12px',
              backgroundColor: 'rgba(59, 130, 246, 0.2)',
              display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}>
              <span style={{ fontSize: '1.5rem' }}>📊</span>
            </div>
            <div>
              <div style={{ fontSize: '0.875rem', color: '#94a3b8' }}>Analyst Users</div>
              <div style={{ fontSize: '1.5rem', fontWeight: '700' }}>{analystUsers}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Role Distribution */}
      <div style={{
        backgroundColor: 'rgba(2, 6, 23, 0.5)',
        borderRadius: '12px',
        padding: '1.5rem',
        border: '1px solid rgba(255, 255, 255, 0.05)'
      }}>
        <h3 style={{ margin: '0 0 1rem 0', fontSize: '1.125rem', fontWeight: '600' }}>
          Role Distribution
        </h3>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
          gap: '1rem'
        }}>
          {ALLOWED_SLUGS.map(slug => {
            const count = users.filter(u => u.role?.slug === slug).length;
            const percentage = totalUsers > 0 ? Math.round((count / totalUsers) * 100) : 0;
            return (
              <div key={slug} style={{
                padding: '1rem',
                backgroundColor: 'rgba(2, 6, 23, 0.3)',
                borderRadius: '8px',
                textAlign: 'center',
                border: `1px solid ${getRoleColor(slug)}30`
              }}>
                <div style={{
                  fontSize: '0.875rem',
                  color: getRoleColor(slug),
                  fontWeight: '600',
                  marginBottom: '0.5rem'
                }}>
                  {getRoleLabel(slug)}
                </div>
                <div style={{ fontSize: '1.5rem', fontWeight: '700' }}>{count}</div>
                <div style={{
                  fontSize: '0.75rem',
                  color: '#94a3b8',
                  marginTop: '0.25rem'
                }}>
                  {percentage}% of total
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default UserAccess;