// components/AddUser.tsx
import React, { useState, useEffect } from 'react';
import { SERVER_URL } from '../../../../config/server';

interface Role {
  slug: string;
  name: string;
  description?: string;
}

const AddUser: React.FC = ({ onPageChange }) => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [selectedRole, setSelectedRole] = useState('');
  const [roles, setRoles] = useState<Role[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loadingRoles, setLoadingRoles] = useState(true);
  const [errors, setErrors] = useState<{ name?: string; email?: string; role?: string }>({});
  const [submitError, setSubmitError] = useState('');
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [tempPassword, setTempPassword] = useState('');
  const [createdEmail, setCreatedEmail] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const fetchRoles = async () => {
      try {
        const token = localStorage.getItem('token');
        const response = await fetch(`${SERVER_URL}/auth/admin/roles`, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        });
        if (!response.ok) throw new Error('Failed to fetch roles');
        const data = await response.json();
        const rawRoles = data.roles || data || [];
        // Handle both object array [{slug, name}] and string array ["admin", "patient"]
        const parsed = rawRoles.map((r: any) =>
          typeof r === 'string' ? { slug: r, name: r } : r
        );
        setRoles(parsed);
      } catch (err: any) {
        console.error('Failed to load roles:', err);
      } finally {
        setLoadingRoles(false);
      }
    };
    fetchRoles();
  }, []);

  const validateForm = (): boolean => {
    const newErrors: { name?: string; email?: string; role?: string } = {};
    if (!name.trim()) newErrors.name = 'Name is required';
    if (!email.trim()) {
      newErrors.email = 'Email is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      newErrors.email = 'Invalid email format';
    }
    if (!selectedRole) newErrors.role = 'Role is required';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError('');

    if (!validateForm()) return;

    setIsSubmitting(true);
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${SERVER_URL}/auth/admin/create-user`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name, email, role: selectedRole }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.message || data.error || 'Failed to create user');
      }

      setCreatedEmail(email);
      setTempPassword(data.temporary_password || data.temp_password || data.password || '');
      setShowSuccessModal(true);
      setName('');
      setEmail('');
      setSelectedRole('');
    } catch (err: any) {
      setSubmitError(err.message || 'Failed to create user');
    } finally {
      setIsSubmitting(false);
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
          <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: '600' }}>Add New User</h2>
          <p style={{ margin: '0.5rem 0 0 0', color: '#64748b', fontSize: '0.95rem' }}>
            Create a new user account
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

      {/* Form */}
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
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
            gap: '1.5rem'
          }}>
            {/* Name */}
            <div>
              <label style={labelStyle}>Full Name *</label>
              <input
                type="text"
                value={name}
                onChange={(e) => { setName(e.target.value); setErrors(p => ({ ...p, name: undefined })); }}
                placeholder="Enter full name"
                style={{ ...inputStyle, border: errors.name ? '1px solid #ef4444' : inputStyle.border }}
              />
              {errors.name && <p style={{ margin: '0.5rem 0 0 0', color: '#ef4444', fontSize: '0.875rem' }}>{errors.name}</p>}
            </div>

            {/* Email */}
            <div>
              <label style={labelStyle}>Email Address *</label>
              <input
                type="email"
                value={email}
                onChange={(e) => { setEmail(e.target.value); setErrors(p => ({ ...p, email: undefined })); }}
                placeholder="user@example.com"
                style={{ ...inputStyle, border: errors.email ? '1px solid #ef4444' : inputStyle.border }}
              />
              {errors.email && <p style={{ margin: '0.5rem 0 0 0', color: '#ef4444', fontSize: '0.875rem' }}>{errors.email}</p>}
            </div>

            {/* Role */}
            <div>
              <label style={labelStyle}>Role *</label>
              <select
                value={selectedRole}
                onChange={(e) => { setSelectedRole(e.target.value); setErrors(p => ({ ...p, role: undefined })); }}
                style={{
                  ...inputStyle,
                  cursor: 'pointer',
                  border: errors.role ? '1px solid #ef4444' : inputStyle.border
                }}
              >
                <option value="">{loadingRoles ? 'Loading roles...' : 'Select a role'}</option>
                {roles.filter(r => r.slug !== 'super_admin' && r.slug !== 'patient').map(role => (
                  <option key={role.slug} value={role.slug}>{role.name || role.slug}</option>
                ))}
              </select>
              {errors.role && <p style={{ margin: '0.5rem 0 0 0', color: '#ef4444', fontSize: '0.875rem' }}>{errors.role}</p>}
            </div>
          </div>

          {/* Role Descriptions */}
          <div style={{
            marginTop: '1.5rem',
            padding: '1.5rem',
            backgroundColor: 'rgba(2, 6, 23, 0.3)',
            borderRadius: '8px',
            border: '1px solid rgba(255, 255, 255, 0.05)'
          }}>
            <h4 style={{ margin: '0 0 0.75rem 0', fontSize: '0.95rem', color: '#e2e8f0' }}>
              Role Descriptions (Default Permissions)
            </h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <div style={{ color: '#94a3b8', fontSize: '0.85rem' }}>
                <strong style={{ color: '#f59e0b' }}>Super Admin</strong>{': create, edit, manage, view, approve'}
              </div>
              <div style={{ color: '#94a3b8', fontSize: '0.85rem' }}>
                <strong style={{ color: '#ef4444' }}>Admin</strong>{': create, edit, manage, view'}
              </div>
              <div style={{ color: '#94a3b8', fontSize: '0.85rem' }}>
                <strong style={{ color: '#3b82f6' }}>Analyst</strong>{': view'}
              </div>
              <div style={{ color: '#94a3b8', fontSize: '0.85rem' }}>
                <strong style={{ color: '#a855f7' }}>Registry Admin</strong>{': create, edit, manage, view'}
              </div>
              <div style={{ color: '#94a3b8', fontSize: '0.85rem' }}>
                <strong style={{ color: '#06b6d4' }}>User Admin</strong>{': create, edit, manage, view'}
              </div>
              <div style={{ color: '#94a3b8', fontSize: '0.85rem' }}>
                <strong style={{ color: '#10b981' }}>Patient</strong>{': view'}
              </div>
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
            onMouseOver={(e) => !isSubmitting && (e.currentTarget.style.backgroundColor = '#1d4ed8')}
            onMouseOut={(e) => !isSubmitting && (e.currentTarget.style.backgroundColor = '#2563eb')}
          >
            {isSubmitting ? (
              <>
                <span style={{
                  display: 'inline-block', width: '16px', height: '16px',
                  border: '2px solid rgba(255, 255, 255, 0.3)', borderTopColor: 'white',
                  borderRadius: '50%', animation: 'spin 1s linear infinite'
                }} />
                Creating...
              </>
            ) : 'Create User'}
          </button>
        </div>
      </form>

      {/* Success Modal */}
      {showSuccessModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.7)', display: 'flex',
          alignItems: 'center', justifyContent: 'center', zIndex: 1000,
          backdropFilter: 'blur(4px)'
        }}>
          <div style={{
            backgroundColor: 'rgba(15, 23, 42, 0.95)', borderRadius: '16px',
            padding: '2rem', width: '90%', maxWidth: '450px',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)',
            animation: 'slideDown 0.3s ease-out'
          }}>
            {/* Success Icon */}
            <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
              <div style={{
                width: '56px', height: '56px', borderRadius: '50%',
                backgroundColor: 'rgba(34, 197, 94, 0.2)', display: 'flex',
                alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem'
              }}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: '600', color: '#e2e8f0' }}>
                User Created Successfully!
              </h3>
              <p style={{ margin: '0.5rem 0 0', color: '#94a3b8', fontSize: '0.875rem' }}>
                Account created for <span style={{ color: '#38bdf8' }}>{createdEmail}</span>
              </p>
            </div>

            {/* Temporary Password */}
            {tempPassword && (
              <div style={{
                backgroundColor: 'rgba(2, 6, 23, 0.5)', borderRadius: '8px',
                padding: '1rem', border: '1px solid rgba(245, 158, 11, 0.3)', marginBottom: '1.5rem'
              }}>
                <div style={{ fontSize: '0.75rem', color: '#f59e0b', fontWeight: '600', marginBottom: '0.5rem' }}>
                  TEMPORARY PASSWORD
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <code style={{
                    flex: 1, padding: '0.625rem 0.75rem', backgroundColor: 'rgba(0,0,0,0.3)',
                    borderRadius: '6px', color: '#f8fafc', fontSize: '1rem', fontFamily: 'monospace',
                    letterSpacing: '0.05em', border: '1px solid rgba(255,255,255,0.1)'
                  }}>
                    {tempPassword}
                  </code>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(tempPassword);
                      setCopied(true);
                      setTimeout(() => setCopied(false), 2000);
                    }}
                    style={{
                      padding: '0.625rem 1rem', backgroundColor: copied ? 'rgba(34, 197, 94, 0.2)' : 'rgba(56, 182, 255, 0.1)',
                      color: copied ? '#10b981' : '#38bdf8',
                      border: copied ? '1px solid rgba(34, 197, 94, 0.3)' : '1px solid rgba(56, 182, 255, 0.2)',
                      borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem',
                      fontWeight: '500', transition: 'all 0.2s', whiteSpace: 'nowrap'
                    }}
                  >
                    {copied ? 'Copied!' : 'Copy'}
                  </button>
                </div>
                <p style={{ margin: '0.5rem 0 0', color: '#94a3b8', fontSize: '0.75rem' }}>
                  Share this password with the user. They will be prompted to change it on first login.
                </p>
              </div>
            )}

            {/* Close Button */}
            <button
              onClick={() => { setShowSuccessModal(false); onPageChange('users'); }}
              style={{
                width: '100%', padding: '0.75rem', backgroundColor: '#2563eb',
                color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer',
                fontSize: '0.95rem', fontWeight: '500', transition: 'all 0.2s'
              }}
              onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#1d4ed8'}
              onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#2563eb'}
            >
              Done
            </button>
          </div>
        </div>
      )}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes slideDown { from { opacity: 0; transform: translateY(-20px); } to { opacity: 1; transform: translateY(0); } }
        input:focus, select:focus { border-color: #3b82f6 !important; box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1); }
        input::placeholder { color: #64748b; }
      `}</style>
    </div>
  );
};

export default AddUser;
