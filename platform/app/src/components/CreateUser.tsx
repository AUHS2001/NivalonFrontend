// components/AddUser.tsx
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';

interface UserFormData {
  name: string;
  email: string;
  role: 'Admin' | 'Analyst' | 'Viewer' | 'Approver' | 'Editor';
  permissions: ('view' | 'approve' | 'edit')[];
  dateOfJoining: string;
  department?: string;
  phone?: string;
  status: 'Active' | 'Inactive' | 'Pending';
}

interface AddUserProps {
  onCreateUser: (userData: UserFormData) => Promise<void> | void;
  onCancel?: () => void;
}

const AddUser: React.FC<AddUserProps> = ({ onPageChange }) => {
  const navigate = useNavigate();
  const [formData, setFormData] = useState<UserFormData>({
    name: '',
    email: '',
    role: 'Viewer',
    permissions: ['view'],
    dateOfJoining: new Date().toISOString().split('T')[0],
    department: '',
    phone: '',
    status: 'Active',
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<Partial<UserFormData>>({});

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));

    // Clear error for this field
    if (errors[name as keyof UserFormData]) {
      setErrors(prev => ({
        ...prev,
        [name]: undefined
      }));
    }
  };

  const handlePermissionToggle = (permission: 'view' | 'approve' | 'edit') => {
    setFormData(prev => {
      const newPermissions = prev.permissions.includes(permission)
        ? prev.permissions.filter(p => p !== permission)
        : [...prev.permissions, permission];
      
      // If no permissions selected, add 'view' automatically
      if (newPermissions.length === 0) {
        return { ...prev, permissions: ['view'] };
      }
      
      return { ...prev, permissions: newPermissions };
    });
  };

  const handleRoleChange = (role: UserFormData['role']) => {
    setFormData(prev => {
      let permissions = [...prev.permissions];
      
      // Set default permissions based on role
      switch (role) {
        case 'Admin':
          permissions = ['view', 'approve', 'edit'];
          break;
        case 'Analyst':
          permissions = ['view', 'edit'];
          break;
        case 'Approver':
          permissions = ['view', 'approve'];
          break;
        case 'Editor':
          permissions = ['view', 'edit'];
          break;
        case 'Viewer':
          permissions = ['view'];
          break;
      }
      
      return { ...prev, role, permissions };
    });
  };

  const validateForm = (): boolean => {
    const newErrors: Partial<UserFormData> = {};

    if (!formData.name.trim()) newErrors.name = 'Full name is required';
    if (!formData.email.trim()) {
      newErrors.email = 'Email is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = 'Invalid email format';
    }
    if (!formData.role) newErrors.role = 'Role is required';
    if (!formData.dateOfJoining) newErrors.dateOfJoining = 'Date of joining is required';
    if (formData.permissions.length === 0) {
      // This shouldn't happen with our logic, but just in case
      setFormData(prev => ({ ...prev, permissions: ['view'] }));
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) {
      return;
    }

    setIsSubmitting(true);

    try {
      // Call the onCreateUser function passed as prop
    //   await onCreateUser(formData);
      
      // Show success message
      alert(`User created successfully! Role: ${formData.role}`);
      
      // Navigate back to users list
      navigate('/dashboard/users');
      
    } catch (error) {
      console.error('Error creating user:', error);
      alert('Failed to create user. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancel = () => {
    if (onCancel) {
      onCancel();
    } else {
      navigate('/dashboard/users');
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

  const departments = [
    'Administration',
    'Medical Records',
    'Radiology',
    'Laboratory',
    'Pharmacy',
    'Billing',
    'IT Support',
    'Human Resources',
    'Quality Assurance'
  ];

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
          <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: '600' }}>Add New User</h2>
          <p style={{ margin: '0.5rem 0 0 0', color: '#64748b', fontSize: '0.95rem' }}>
            Create a new user account with specific permissions
          </p>
        </div>
        <button 
          onClick={() => { onPageChange('users') }}
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

      {/* Main Form */}
      <form onSubmit={handleSubmit}>
        <div style={{
          backgroundColor: 'rgba(15, 23, 42, 0.7)',
          borderRadius: '16px',
          padding: '2rem',
          boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.3)',
          backdropFilter: 'blur(12px)',
          border: '1px solid rgba(255, 255, 255, 0.05)',
          marginBottom: '2rem'
        }}>
          <h3 style={{
            margin: '0 0 1.5rem 0',
            fontSize: '1.25rem',
            fontWeight: '600',
            color: '#e2e8f0'
          }}>
            User Information
          </h3>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
            gap: '1.5rem',
            marginBottom: '2rem'
          }}>
            <div>
              <label style={{
                display: 'block',
                marginBottom: '0.75rem',
                color: '#e2e8f0',
                fontSize: '0.875rem',
                fontWeight: '500'
              }}>
                Full Name *
              </label>
              <input
                type="text"
                name="name"
                value={formData.name}
                onChange={handleChange}
                placeholder="Enter full name"
                style={{
                  width: '100%',
                  padding: '0.875rem 1rem',
                  backgroundColor: 'rgba(2, 6, 23, 0.5)',
                  border: errors.name ? '1px solid #ef4444' : '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: '8px',
                  color: '#f8fafc',
                  fontSize: '0.95rem',
                  outline: 'none',
                  transition: 'border-color 0.2s'
                }}
              />
              {errors.name && (
                <p style={{ margin: '0.5rem 0 0 0', color: '#ef4444', fontSize: '0.875rem' }}>
                  {errors.name}
                </p>
              )}
            </div>

            <div>
              <label style={{
                display: 'block',
                marginBottom: '0.75rem',
                color: '#e2e8f0',
                fontSize: '0.875rem',
                fontWeight: '500'
              }}>
                Email Address *
              </label>
              <input
                type="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                placeholder="user@nivalon.com"
                style={{
                  width: '100%',
                  padding: '0.875rem 1rem',
                  backgroundColor: 'rgba(2, 6, 23, 0.5)',
                  border: errors.email ? '1px solid #ef4444' : '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: '8px',
                  color: '#f8fafc',
                  fontSize: '0.95rem',
                  outline: 'none',
                  transition: 'border-color 0.2s'
                }}
              />
              {errors.email && (
                <p style={{ margin: '0.5rem 0 0 0', color: '#ef4444', fontSize: '0.875rem' }}>
                  {errors.email}
                </p>
              )}
            </div>

            <div>
              <label style={{
                display: 'block',
                marginBottom: '0.75rem',
                color: '#e2e8f0',
                fontSize: '0.875rem',
                fontWeight: '500'
              }}>
                Phone Number
              </label>
              <input
                type="tel"
                name="phone"
                value={formData.phone}
                onChange={handleChange}
                placeholder="+1 (555) 123-4567"
                style={{
                  width: '100%',
                  padding: '0.875rem 1rem',
                  backgroundColor: 'rgba(2, 6, 23, 0.5)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: '8px',
                  color: '#f8fafc',
                  fontSize: '0.95rem',
                  outline: 'none'
                }}
              />
            </div>

            <div>
              <label style={{
                display: 'block',
                marginBottom: '0.75rem',
                color: '#e2e8f0',
                fontSize: '0.875rem',
                fontWeight: '500'
              }}>
                Department
              </label>
              <select
                name="department"
                value={formData.department}
                onChange={handleChange}
                style={{
                  width: '100%',
                  padding: '0.875rem 1rem',
                  backgroundColor: 'rgba(2, 6, 23, 0.5)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: '8px',
                  color: '#f8fafc',
                  fontSize: '0.95rem',
                  outline: 'none',
                  cursor: 'pointer'
                }}
              >
                <option value="">Select Department</option>
                {departments.map(dept => (
                  <option key={dept} value={dept}>{dept}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Role and Permissions */}
          <h3 style={{
            margin: '0 0 1.5rem 0',
            fontSize: '1.25rem',
            fontWeight: '600',
            color: '#e2e8f0',
            paddingTop: '1rem',
            borderTop: '1px solid rgba(255, 255, 255, 0.05)'
          }}>
            Role & Permissions
          </h3>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
            gap: '1.5rem',
            marginBottom: '2rem'
          }}>
            <div>
              <label style={{
                display: 'block',
                marginBottom: '0.75rem',
                color: '#e2e8f0',
                fontSize: '0.875rem',
                fontWeight: '500'
              }}>
                Role *
              </label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {(['Admin', 'Analyst', 'Approver', 'Editor', 'Viewer'] as const).map(role => (
                  <div key={role} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <input
                      type="radio"
                      id={`role-${role}`}
                      name="role"
                      checked={formData.role === role}
                      onChange={() => handleRoleChange(role)}
                      style={{
                        width: '1.125rem',
                        height: '1.125rem',
                        accentColor: getRoleColor(role),
                        cursor: 'pointer'
                      }}
                    />
                    <label 
                      htmlFor={`role-${role}`}
                      style={{
                        color: '#e2e8f0',
                        cursor: 'pointer',
                        fontSize: '0.95rem',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem'
                      }}
                    >
                      <span style={{
                        display: 'inline-block',
                        width: '10px',
                        height: '10px',
                        borderRadius: '50%',
                        backgroundColor: getRoleColor(role)
                      }}></span>
                      {role}
                    </label>
                  </div>
                ))}
              </div>
              {errors.role && (
                <p style={{ margin: '0.5rem 0 0 0', color: '#ef4444', fontSize: '0.875rem' }}>
                  {errors.role}
                </p>
              )}
            </div>

            <div>
              <label style={{
                display: 'block',
                marginBottom: '0.75rem',
                color: '#e2e8f0',
                fontSize: '0.875rem',
                fontWeight: '500'
              }}>
                Permissions
              </label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {(['view', 'edit', 'approve'] as const).map(permission => (
                  <div key={permission} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <input
                      type="checkbox"
                      id={`permission-${permission}`}
                      checked={formData.permissions.includes(permission)}
                      onChange={() => handlePermissionToggle(permission)}
                      style={{
                        width: '1.125rem',
                        height: '1.125rem',
                        accentColor: getPermissionColor(permission),
                        cursor: 'pointer'
                      }}
                    />
                    <label 
                      htmlFor={`permission-${permission}`}
                      style={{
                        color: '#e2e8f0',
                        cursor: 'pointer',
                        fontSize: '0.95rem',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem'
                      }}
                    >
                      <span style={{
                        display: 'inline-block',
                        width: '10px',
                        height: '10px',
                        borderRadius: '2px',
                        backgroundColor: getPermissionColor(permission)
                      }}></span>
                      {getPermissionLabel(permission)}
                    </label>
                  </div>
                ))}
              </div>
              <p style={{
                margin: '0.75rem 0 0 0',
                color: '#94a3b8',
                fontSize: '0.75rem',
                fontStyle: 'italic'
              }}>
                Permissions are auto-set based on role selection
              </p>
            </div>
          </div>

          {/* Employment Details */}
          <h3 style={{
            margin: '0 0 1.5rem 0',
            fontSize: '1.25rem',
            fontWeight: '600',
            color: '#e2e8f0',
            paddingTop: '1rem',
            borderTop: '1px solid rgba(255, 255, 255, 0.05)'
          }}>
            Employment Details
          </h3>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
            gap: '1.5rem',
            marginBottom: '1rem'
          }}>
            <div>
              <label style={{
                display: 'block',
                marginBottom: '0.75rem',
                color: '#e2e8f0',
                fontSize: '0.875rem',
                fontWeight: '500'
              }}>
                Date of Joining *
              </label>
              <input
                type="date"
                name="dateOfJoining"
                value={formData.dateOfJoining}
                onChange={handleChange}
                max={new Date().toISOString().split('T')[0]}
                style={{
                  width: '100%',
                  padding: '0.875rem 1rem',
                  backgroundColor: 'rgba(2, 6, 23, 0.5)',
                  border: errors.dateOfJoining ? '1px solid #ef4444' : '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: '8px',
                  color: '#f8fafc',
                  fontSize: '0.95rem',
                  outline: 'none',
                  transition: 'border-color 0.2s'
                }}
              />
              {errors.dateOfJoining && (
                <p style={{ margin: '0.5rem 0 0 0', color: '#ef4444', fontSize: '0.875rem' }}>
                  {errors.dateOfJoining}
                </p>
              )}
            </div>

            <div>
              <label style={{
                display: 'block',
                marginBottom: '0.75rem',
                color: '#e2e8f0',
                fontSize: '0.875rem',
                fontWeight: '500'
              }}>
                Status
              </label>
              <div style={{ display: 'flex', gap: '1rem' }}>
                {(['Active', 'Inactive', 'Pending'] as const).map(status => (
                  <div key={status} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <input
                      type="radio"
                      id={`status-${status}`}
                      name="status"
                      checked={formData.status === status}
                      onChange={() => setFormData(prev => ({ ...prev, status }))}
                      style={{
                        width: '1rem',
                        height: '1rem',
                        accentColor: status === 'Active' ? '#10b981' : 
                                     status === 'Pending' ? '#f59e0b' : '#64748b',
                        cursor: 'pointer'
                      }}
                    />
                    <label 
                      htmlFor={`status-${status}`}
                      style={{
                        color: '#e2e8f0',
                        cursor: 'pointer',
                        fontSize: '0.875rem'
                      }}
                    >
                      {status}
                    </label>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Role Descriptions */}
          <div style={{
            marginTop: '2rem',
            padding: '1.5rem',
            backgroundColor: 'rgba(2, 6, 23, 0.3)',
            borderRadius: '8px',
            border: '1px solid rgba(255, 255, 255, 0.05)'
          }}>
            <h4 style={{ margin: '0 0 0.75rem 0', fontSize: '0.95rem', color: '#e2e8f0' }}>
              Role Descriptions:
            </h4>
            <ul style={{
              margin: 0,
              paddingLeft: '1.25rem',
              color: '#94a3b8',
              fontSize: '0.85rem',
              lineHeight: '1.6'
            }}>
              <li><strong style={{ color: getRoleColor('Admin') }}>Admin</strong>: Full system access, can manage users and settings</li>
              <li><strong style={{ color: getRoleColor('Analyst') }}>Analyst</strong>: Can view and edit data, generate reports</li>
              <li><strong style={{ color: getRoleColor('Approver') }}>Approver</strong>: Can view and approve/reject submissions</li>
              <li><strong style={{ color: getRoleColor('Editor') }}>Editor</strong>: Can view and edit data, but not approve</li>
              <li><strong style={{ color: getRoleColor('Viewer') }}>Viewer</strong>: Read-only access to view data</li>
            </ul>
          </div>
        </div>

        {/* Form Actions */}
        <div style={{
          display: 'flex',
          justifyContent: 'flex-end',
          gap: '1rem',
          paddingTop: '1rem',
          borderTop: '1px solid rgba(255, 255, 255, 0.05)'
        }}>
          <button
            type="button"
            onClick={() => { onPageChange('users') }}
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
            type="submit"
            disabled={isSubmitting}
            style={{
              padding: '0.875rem 2rem',
              backgroundColor: '#2563eb',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              cursor: isSubmitting ? 'not-allowed' : 'pointer',
              fontSize: '0.95rem',
              fontWeight: '500',
              transition: 'all 0.2s',
              opacity: isSubmitting ? 0.7 : 1,
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem'
            }}
            onMouseOver={(e) => !isSubmitting && (e.currentTarget.style.backgroundColor = '#7c3aed')}
            onMouseOut={(e) => !isSubmitting && (e.currentTarget.style.backgroundColor = '#8b5cf6')}
          >
            {isSubmitting ? (
              <>
                <span style={{
                  display: 'inline-block',
                  width: '16px',
                  height: '16px',
                  border: '2px solid rgba(255, 255, 255, 0.3)',
                  borderTopColor: 'white',
                  borderRadius: '50%',
                  animation: 'spin 1s linear infinite'
                }}></span>
                Creating User...
              </>
            ) : (
              'Create User'
            )}
          </button>
        </div>
      </form>

      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        
        input:focus, select:focus {
          border-color: #3b82f6 !important;
          box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
        }
        
        input::placeholder {
          color: #64748b;
        }
      `}</style>
    </div>
  );
};

export default AddUser;