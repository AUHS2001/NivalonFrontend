// components/UserAccess.tsx
import React, { useState } from 'react';

interface User {
  id: number;
  name: string;
  email: string;
  role: 'Admin' | 'Analyst' | 'Viewer' | 'Approver' | 'Editor';
  permissions: ('view' | 'approve' | 'edit')[];
  dateOfJoining: string;
  lastActive: string;
  status: 'Active' | 'Inactive' | 'Pending';
}

const UserAccess: React.FC = ({ onPageChange }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedRole, setSelectedRole] = useState<string>('All');
  const [selectedStatus, setSelectedStatus] = useState<string>('All');
  const [selectedPermission, setSelectedPermission] = useState<string>('All');
  
  const [users] = useState<User[]>([
    { id: 1, name: 'John Anderson', email: 'john.anderson@nivalon.com', role: 'Admin', permissions: ['view', 'approve', 'edit'], dateOfJoining: '2023-01-15', lastActive: '2024-01-15', status: 'Active' },
    { id: 2, name: 'Sarah Williams', email: 'sarah.williams@nivalon.com', role: 'Analyst', permissions: ['view', 'edit'], dateOfJoining: '2023-03-22', lastActive: '2024-01-14', status: 'Active' },
    { id: 3, name: 'Robert Chen', email: 'robert.chen@nivalon.com', role: 'Approver', permissions: ['view', 'approve'], dateOfJoining: '2023-05-10', lastActive: '2024-01-13', status: 'Active' },
    { id: 4, name: 'Emma Davis', email: 'emma.davis@nivalon.com', role: 'Viewer', permissions: ['view'], dateOfJoining: '2023-07-18', lastActive: '2024-01-12', status: 'Active' },
    { id: 5, name: 'Michael Brown', email: 'michael.brown@nivalon.com', role: 'Editor', permissions: ['view', 'edit'], dateOfJoining: '2023-09-05', lastActive: '2024-01-11', status: 'Inactive' },
    { id: 6, name: 'Lisa Garcia', email: 'lisa.garcia@nivalon.com', role: 'Analyst', permissions: ['view', 'edit'], dateOfJoining: '2023-11-30', lastActive: '2024-01-10', status: 'Active' },
    { id: 7, name: 'David Wilson', email: 'david.wilson@nivalon.com', role: 'Viewer', permissions: ['view'], dateOfJoining: '2024-01-02', lastActive: '2024-01-09', status: 'Pending' },
    { id: 8, name: 'Maria Thompson', email: 'maria.thompson@nivalon.com', role: 'Approver', permissions: ['view', 'approve'], dateOfJoining: '2024-01-05', lastActive: '2024-01-08', status: 'Active' },
  ]);

  const [newUser, setNewUser] = useState({
    name: '',
    email: '',
    role: 'Viewer' as User['role'],
    permissions: [] as User['permissions'],
    dateOfJoining: new Date().toISOString().split('T')[0],
  });

  const [isAddUserModalOpen, setIsAddUserModalOpen] = useState(false);

  const filteredUsers = users.filter(user => {
    const matchesSearch = 
      user.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.email.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesRole = selectedRole === 'All' || user.role === selectedRole;
    const matchesStatus = selectedStatus === 'All' || user.status === selectedStatus;
    const matchesPermission = selectedPermission === 'All' || 
      user.permissions.includes(selectedPermission as any);
    
    return matchesSearch && matchesRole && matchesStatus && matchesPermission;
  });

  const getRoleColor = (role: string) => {
    switch (role) {
      case 'Admin': return '#ef4444';
      case 'Analyst': return '#3b82f6';
      case 'Approver': return '#10b981';
      case 'Editor': return '#8b5cf6';
      case 'Viewer': return '#64748b';
      default: return '#64748b';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Active': return '#10b981';
      case 'Inactive': return '#64748b';
      case 'Pending': return '#f59e0b';
      default: return '#64748b';
    }
  };

  const getPermissionColor = (permission: string) => {
    switch (permission) {
      case 'view': return '#3b82f6';
      case 'approve': return '#10b981';
      case 'edit': return '#8b5cf6';
      default: return '#64748b';
    }
  };

  const getPermissionLabel = (permission: string) => {
    switch (permission) {
      case 'view': return 'View Only';
      case 'approve': return 'Can Approve';
      case 'edit': return 'Can Edit';
      default: return permission;
    }
  };

  const handleAddUser = () => {
    // Here you would typically make an API call
    console.log('Adding new user:', newUser);
    setIsAddUserModalOpen(false);
    setNewUser({
      name: '',
      email: '',
      role: 'Viewer',
      permissions: [],
      dateOfJoining: new Date().toISOString().split('T')[0],
    });
  };

  const handlePermissionToggle = (permission: User['permissions'][0]) => {
    setNewUser(prev => ({
      ...prev,
      permissions: prev.permissions.includes(permission)
        ? prev.permissions.filter(p => p !== permission)
        : [...prev.permissions, permission]
    }));
  };

  const totalUsers = users.length;
  const activeUsers = users.filter(u => u.status === 'Active').length;
  const adminUsers = users.filter(u => u.role === 'Admin').length;
  const pendingUsers = users.filter(u => u.status === 'Pending').length;

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
            {filteredUsers.length} users found • Manage user roles and permissions
          </p>
        </div>
        <button 
          onClick={() => onPageChange('addUser')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            backgroundColor: '#2563eb',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            padding: '0.75rem 1.5rem',
            cursor: 'pointer',
            fontSize: '0.95rem',
            fontWeight: '500',
            transition: 'all 0.2s'
          }}
          onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#7c3aed'}
          onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#8b5cf6'}
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
            <option value="Admin">Admin</option>
            <option value="Analyst">Analyst</option>
            <option value="Approver">Approver</option>
            <option value="Editor">Editor</option>
            <option value="Viewer">Viewer</option>
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
            <option value="Active">Active</option>
            <option value="Inactive">Inactive</option>
            <option value="Pending">Pending</option>
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
            <option value="view">View Only</option>
            <option value="approve">Can Approve</option>
            <option value="edit">Can Edit</option>
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
          gridTemplateColumns: '0.5fr 1.5fr 1.5fr 1fr 1.5fr 1fr 1fr 1fr',
          backgroundColor: 'rgba(2, 6, 23, 0.5)',
          padding: '1rem',
          borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
          fontWeight: '600',
          color: '#94a3b8',
          fontSize: '0.875rem'
        }}>
          <div style={{ textAlign: 'center' }}>Serial</div>
          <div>Name</div>
          <div>Email</div>
          <div>Role</div>
          <div>Permissions</div>
          <div>Date of Joining</div>
          <div>Status</div>
          <div>Actions</div>
        </div>

        {filteredUsers.map((user, index) => (
          <div
            key={user.id}
            style={{
              display: 'grid',
              gridTemplateColumns: '0.5fr 1.5fr 1.5fr 1fr 1.5fr 1fr 1fr 1fr',
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
              {user.id}
            </div>
            <div>
              <div style={{ fontWeight: '500' }}>{user.name}</div>
              <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                Last active: {user.lastActive}
              </div>
            </div>
            <div style={{ color: '#38bdf8', wordBreak: 'break-all' }}>{user.email}</div>
            <div>
              <span style={{
                display: 'inline-block',
                padding: '0.25rem 0.75rem',
                backgroundColor: `${getRoleColor(user.role)}20`,
                color: getRoleColor(user.role),
                borderRadius: '20px',
                fontSize: '0.75rem',
                fontWeight: '500',
                border: `1px solid ${getRoleColor(user.role)}40`
              }}>
                {user.role}
              </span>
            </div>
            <div>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                {user.permissions.map(permission => (
                  <span
                    key={permission}
                    style={{
                      display: 'inline-block',
                      padding: '0.25rem 0.5rem',
                      backgroundColor: `${getPermissionColor(permission)}20`,
                      color: getPermissionColor(permission),
                      borderRadius: '6px',
                      fontSize: '0.7rem',
                      fontWeight: '500',
                      border: `1px solid ${getPermissionColor(permission)}40`
                    }}
                  >
                    {getPermissionLabel(permission)}
                  </span>
                ))}
              </div>
            </div>
            <div>
              <div>{user.dateOfJoining}</div>
              <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                {Math.floor((new Date().getTime() - new Date(user.dateOfJoining).getTime()) / (1000 * 60 * 60 * 24 * 30))} months
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
                {user.status}
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
                  Edit
                </button>
                <button style={{
                  padding: '0.375rem 0.75rem',
                  backgroundColor: user.status === 'Active' 
                    ? 'rgba(239, 68, 68, 0.1)' 
                    : 'rgba(34, 197, 94, 0.1)',
                  color: user.status === 'Active' ? '#ef4444' : '#10b981',
                  border: user.status === 'Active' 
                    ? '1px solid rgba(239, 68, 68, 0.2)' 
                    : '1px solid rgba(34, 197, 94, 0.2)',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '0.75rem',
                  transition: 'all 0.2s'
                }}
                onMouseOver={(e) => e.currentTarget.style.backgroundColor = user.status === 'Active' 
                  ? 'rgba(239, 68, 68, 0.2)' 
                  : 'rgba(34, 197, 94, 0.2)'}
                onMouseOut={(e) => e.currentTarget.style.backgroundColor = user.status === 'Active' 
                  ? 'rgba(239, 68, 68, 0.1)' 
                  : 'rgba(34, 197, 94, 0.1)'}
                >
                  {user.status === 'Active' ? 'Deactivate' : 'Activate'}
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
              <div style={{ fontSize: '0.875rem', color: '#94a3b8' }}>Total Users</div>
              <div style={{ fontSize: '1.5rem', fontWeight: '700' }}>{totalUsers}</div>
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
              <div style={{ fontSize: '0.875rem', color: '#94a3b8' }}>Active Users</div>
              <div style={{ fontSize: '1.5rem', fontWeight: '700' }}>{activeUsers}</div>
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
          border: '1px solid rgba(245, 158, 11, 0.1)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <div style={{
              width: '48px',
              height: '48px',
              borderRadius: '12px',
              backgroundColor: 'rgba(245, 158, 11, 0.2)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <span style={{ fontSize: '1.5rem' }}>⏳</span>
            </div>
            <div>
              <div style={{ fontSize: '0.875rem', color: '#94a3b8' }}>Pending Users</div>
              <div style={{ fontSize: '1.5rem', fontWeight: '700' }}>{pendingUsers}</div>
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
          {['Admin', 'Analyst', 'Approver', 'Editor', 'Viewer'].map(role => {
            const count = users.filter(u => u.role === role).length;
            const percentage = totalUsers > 0 ? Math.round((count / totalUsers) * 100) : 0;
            return (
              <div key={role} style={{
                padding: '1rem',
                backgroundColor: 'rgba(2, 6, 23, 0.3)',
                borderRadius: '8px',
                textAlign: 'center',
                border: `1px solid ${getRoleColor(role)}30`
              }}>
                <div style={{
                  fontSize: '0.875rem',
                  color: getRoleColor(role),
                  fontWeight: '600',
                  marginBottom: '0.5rem'
                }}>
                  {role}
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

      {/* Add User Modal */}
      {isAddUserModalOpen && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.7)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          backdropFilter: 'blur(4px)'
        }}>
          <div style={{
            backgroundColor: 'rgba(15, 23, 42, 0.95)',
            borderRadius: '16px',
            padding: '2rem',
            width: '90%',
            maxWidth: '500px',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)'
          }}>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '1.5rem'
            }}>
              <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: '600' }}>Add New User</h3>
              <button
                onClick={() => setIsAddUserModalOpen(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#94a3b8',
                  cursor: 'pointer',
                  fontSize: '1.25rem'
                }}
              >
                ×
              </button>
            </div>

            <div style={{ marginBottom: '1rem' }}>
              <label style={{
                display: 'block',
                marginBottom: '0.5rem',
                color: '#e2e8f0',
                fontSize: '0.875rem',
                fontWeight: '500'
              }}>
                Full Name
              </label>
              <input
                type="text"
                value={newUser.name}
                onChange={(e) => setNewUser({...newUser, name: e.target.value})}
                placeholder="Enter full name"
                style={{
                  width: '100%',
                  padding: '0.75rem 1rem',
                  backgroundColor: 'rgba(2, 6, 23, 0.5)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: '8px',
                  color: '#f8fafc',
                  fontSize: '0.95rem',
                  outline: 'none'
                }}
              />
            </div>

            <div style={{ marginBottom: '1rem' }}>
              <label style={{
                display: 'block',
                marginBottom: '0.5rem',
                color: '#e2e8f0',
                fontSize: '0.875rem',
                fontWeight: '500'
              }}>
                Email Address
              </label>
              <input
                type="email"
                value={newUser.email}
                onChange={(e) => setNewUser({...newUser, email: e.target.value})}
                placeholder="Enter email address"
                style={{
                  width: '100%',
                  padding: '0.75rem 1rem',
                  backgroundColor: 'rgba(2, 6, 23, 0.5)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: '8px',
                  color: '#f8fafc',
                  fontSize: '0.95rem',
                  outline: 'none'
                }}
              />
            </div>

            <div style={{ marginBottom: '1rem' }}>
              <label style={{
                display: 'block',
                marginBottom: '0.5rem',
                color: '#e2e8f0',
                fontSize: '0.875rem',
                fontWeight: '500'
              }}>
                Role
              </label>
              <select
                value={newUser.role}
                onChange={(e) => setNewUser({...newUser, role: e.target.value as User['role']})}
                style={{
                  width: '100%',
                  padding: '0.75rem 1rem',
                  backgroundColor: 'rgba(2, 6, 23, 0.5)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: '8px',
                  color: '#f8fafc',
                  fontSize: '0.95rem',
                  outline: 'none',
                  cursor: 'pointer'
                }}
              >
                <option value="Viewer">Viewer</option>
                <option value="Editor">Editor</option>
                <option value="Approver">Approver</option>
                <option value="Analyst">Analyst</option>
                <option value="Admin">Admin</option>
              </select>
            </div>

            <div style={{ marginBottom: '1rem' }}>
              <label style={{
                display: 'block',
                marginBottom: '0.5rem',
                color: '#e2e8f0',
                fontSize: '0.875rem',
                fontWeight: '500'
              }}>
                Permissions
              </label>
              <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                {(['view', 'edit', 'approve'] as const).map(permission => (
                  <button
                    key={permission}
                    type="button"
                    onClick={() => handlePermissionToggle(permission)}
                    style={{
                      padding: '0.5rem 1rem',
                      backgroundColor: newUser.permissions.includes(permission)
                        ? getPermissionColor(permission)
                        : 'rgba(2, 6, 23, 0.5)',
                      color: newUser.permissions.includes(permission)
                        ? 'white'
                        : '#cbd5e1',
                      border: '1px solid rgba(255, 255, 255, 0.1)',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      fontSize: '0.875rem',
                      transition: 'all 0.2s'
                    }}
                  >
                    {getPermissionLabel(permission)}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{
                display: 'block',
                marginBottom: '0.5rem',
                color: '#e2e8f0',
                fontSize: '0.875rem',
                fontWeight: '500'
              }}>
                Date of Joining
              </label>
              <input
                type="date"
                value={newUser.dateOfJoining}
                onChange={(e) => setNewUser({...newUser, dateOfJoining: e.target.value})}
                style={{
                  width: '100%',
                  padding: '0.75rem 1rem',
                  backgroundColor: 'rgba(2, 6, 23, 0.5)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: '8px',
                  color: '#f8fafc',
                  fontSize: '0.95rem',
                  outline: 'none'
                }}
              />
            </div>

            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
              <button
                onClick={() => onPageChange('users')}
                style={{
                  padding: '0.75rem 1.5rem',
                  backgroundColor: 'rgba(239, 68, 68, 0.1)',
                  color: '#ef4444',
                  border: '1px solid rgba(239, 68, 68, 0.2)',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontSize: '0.875rem',
                  fontWeight: '500',
                  transition: 'all 0.2s'
                }}
                onMouseOver={(e) => e.currentTarget.style.backgroundColor = 'rgba(239, 68, 68, 0.2)'}
                onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'rgba(239, 68, 68, 0.1)'}
              >
                Cancel
              </button>
              <button
                onClick={handleAddUser}
                disabled={!newUser.name || !newUser.email}
                style={{
                  padding: '0.75rem 1.5rem',
                  backgroundColor: '#8b5cf6',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: !newUser.name || !newUser.email ? 'not-allowed' : 'pointer',
                  fontSize: '0.875rem',
                  fontWeight: '500',
                  transition: 'all 0.2s',
                  opacity: !newUser.name || !newUser.email ? 0.5 : 1
                }}
                onMouseOver={(e) => {
                  if (newUser.name && newUser.email) {
                    e.currentTarget.style.backgroundColor = '#7c3aed';
                  }
                }}
                onMouseOut={(e) => {
                  if (newUser.name && newUser.email) {
                    e.currentTarget.style.backgroundColor = '#8b5cf6';
                  }
                }}
              >
                Add User
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default UserAccess;