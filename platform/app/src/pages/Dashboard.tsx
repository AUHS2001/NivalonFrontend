// Dashboard.tsx
import React, { useState, useEffect } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom'; // Changed imports
import logo from '../../assets/logo.png';
import PatientList from '../components/PatientList';
import UserAccess from '../components/userAccessList';
import CreatePatient from '../components/CreatePatient';
import AddUser from '../components/CreateUser';
import EditUserPermissions from '../components/EditUserPermissions';
import Registeries from '../components/Registeries';
import CreateRegistry from '../components/CreateRegistry';
import DevelopmentBanner from '../components/DevelopmentBanner';

interface DashboardProps {
  children?: React.ReactNode;
}

const Dashboard: React.FC<DashboardProps> = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [userRole, setUserRole] = useState<string>('');
  const [userName, setUserName] = useState<string>('');
  const [userEmail, setUserEmail] = useState<string>('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const initialRole = localStorage.getItem('userRole') || '';
  const [page, setPage] = useState<string>(initialRole === 'registry_admin' ? 'registeries' : 'users');
  const [selectedUser, setSelectedUser] = useState<any>(null);

  const handlePageChange = (newPage: string, data?: any) => {
    if (newPage === 'editUser' && data) {
      setSelectedUser(data);
    } else if (newPage !== 'editUser') {
      setSelectedUser(null);
    }
    setPage(newPage);
    window.history.pushState({ page: newPage }, '');
  };

  useEffect(() => {
    const onPopState = (e: PopStateEvent) => {
      const prevPage = e.state?.page || 'patients';
      setSelectedUser(null);
      setPage(prevPage);
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  useEffect(() => {
    const role = localStorage.getItem('userRole');
    if (!role) {
      navigate('/');
    } else {
      setUserRole(role);
      setUserName(localStorage.getItem('userName') || '');
      setUserEmail(localStorage.getItem('userEmail') || '');
    }
  }, [navigate]);

  const getRoleLabel = (slug: string) => {
    switch (slug) {
      case 'super_admin': return 'Super Admin';
      case 'admin': return 'Admin';
      case 'registry_admin': return 'Registry Admin';
      case 'user_admin': return 'User Admin';
      case 'analyst': return 'Analyst';
      case 'patient': return 'Patient';
      case 'signer': return 'Signer';
      default: return slug;
    }
  };

  const isTabLocked = (tabId: string) => {
    if (userRole === 'admin' || userRole === 'super_admin') return false;
    if (userRole === 'registry_admin') return tabId !== 'registeries';
    if (userRole === 'user_admin') return tabId !== 'users';
    return false;
  };

  const handleLogout = () => {
    localStorage.removeItem('userRole');
    localStorage.removeItem('userName');
    localStorage.removeItem('userEmail');
    localStorage.removeItem('token');
    localStorage.removeItem('userPermissions');
    navigate('/');
  };

  // Update paths to be relative to dashboard
  const menuItems = [
    { id: 'users', label: 'User Access', path: '/users', icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" /><circle cx="12" cy="7" r="4" />
      </svg>
    )},
    { id: 'patients', label: 'Patient List', path: '/patients', icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 00-3-3.87" /><path d="M16 3.13a4 4 0 010 7.75" />
      </svg>
    )},
    { id: 'registeries', label: 'Registeries', path: '/registeries', icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2" /><rect x="9" y="3" width="6" height="4" rx="1" /><path d="M9 12h6" /><path d="M9 16h6" />
      </svg>
    )}
  ];

  return (
    <div style={{
      backgroundColor: "#0a0e17",
      minHeight: '100vh',
      color: 'white',
      fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
      position: 'relative',
      overflowX: 'hidden'
    }}>
      <div style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 50 }}>
        <DevelopmentBanner />
      </div>
      {/* Animated Background Elements */}
      <div style={{
        position: 'absolute',
        top: '10%',
        left: '10%',
        width: '300px',
        height: '300px',
        borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(56, 182, 255, 0.1) 0%, transparent 70%)',
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
        background: 'radial-gradient(circle, rgba(124, 58, 237, 0.08) 0%, transparent 70%)',
        filter: 'blur(50px)',
        zIndex: 0
      }}></div>

      {/* Sidebar */}
      <div style={{
        position: 'fixed',
        left: 0,
        top: '2rem',
        bottom: 0,
        width: '250px',
        backgroundColor: 'rgba(15, 23, 42, 0.8)',
        backdropFilter: 'blur(12px)',
        borderRight: '1px solid rgba(255, 255, 255, 0.05)',
        padding: '1.5rem 0',
        zIndex: 10,
        boxShadow: '4px 0 10px -5px rgba(0, 0, 0, 0.3)'
      }}>
        {/* Logo */}
        <div style={{
          padding: '0 1.5rem 2rem 1.5rem',
          borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
          marginBottom: '1.5rem'
        }}>
          <img src={logo} alt="Logo" style={{
            height: '40px',
            filter: 'drop-shadow(0 4px 6px rgba(0, 0, 0, 0.3))'
          }} />
          <div style={{
            fontSize: '0.875rem',
            color: '#64748b',
            marginTop: '0.5rem'
          }}>
            Role: <span style={{ color: '#38bdf8' }}>{getRoleLabel(userRole)}</span>
          </div>
        </div>

        {/* Navigation */}
        <nav style={{ padding: '0 1rem' }}>
          {menuItems.map((item) => {
            const isActive = page === item.id;
            const locked = isTabLocked(item.id);
            return (
              <button
                key={item.id}
                onClick={() => {
                    if (!locked) handlePageChange(item.id)
                }}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.75rem',
                  padding: '0.875rem 1rem',
                  backgroundColor: isActive ? 'rgba(56, 182, 255, 0.15)' : 'transparent',
                  color: locked ? '#475569' : isActive ? '#38bdf8' : '#cbd5e1',
                  border: 'none',
                  borderRadius: '8px',
                  marginBottom: '0.5rem',
                  cursor: locked ? 'not-allowed' : 'pointer',
                  transition: 'all 0.2s',
                  fontSize: '0.95rem',
                  fontWeight: isActive ? '600' : '400',
                  borderLeft: isActive ? '3px solid #38bdf8' : '3px solid transparent',
                  opacity: locked ? 0.5 : 1
                }}
                onMouseOver={(e) => !isActive && !locked && (e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.05)')}
                onMouseOut={(e) => !isActive && !locked && (e.currentTarget.style.backgroundColor = 'transparent')}
              >
                <span style={{ display: 'flex', alignItems: 'center' }}>{item.icon}</span>
                {item.label}
                {locked && (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginLeft: 'auto' }}>
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0110 0v4" />
                  </svg>
                )}
              </button>
            );
          })}
        </nav>

        {/* Logout Button */}
        <div style={{
          position: 'absolute',
          bottom: '2rem',
          left: '1.5rem',
          right: '1.5rem'
        }}>
          <button
            onClick={handleLogout}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.75rem',
              padding: '0.875rem 1rem',
              backgroundColor: 'rgba(239, 68, 68, 0.1)',
              color: '#ef4444',
              border: '1px solid rgba(239, 68, 68, 0.2)',
              borderRadius: '8px',
              cursor: 'pointer',
              transition: 'all 0.2s',
              fontSize: '0.95rem',
              fontWeight: '500'
            }}
            onMouseOver={(e) => e.currentTarget.style.backgroundColor = 'rgba(239, 68, 68, 0.2)'}
            onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'rgba(239, 68, 68, 0.1)'}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            Logout
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div style={{
        marginLeft: '250px',
        padding: '2rem',
        paddingTop: '3.5rem',
        position: 'relative',
        zIndex: 1
      }}>
        {/* Header */}
        <header style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '2rem',
          paddingBottom: '1rem',
          borderBottom: '1px solid rgba(255, 255, 255, 0.05)'
        }}>
          <div>
            <h1 style={{
              fontSize: '1.875rem',
              fontWeight: '700',
              margin: 0,
              background: 'linear-gradient(90deg, #38bdf8, #818cf8)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent'
            }}>
              {location.pathname.includes('patients') ? 'Patient List' : 
               location.pathname.includes('studies') ? 'Studies' : 'Dashboard'}
            </h1>
            <p style={{
              color: '#64748b',
              margin: '0.5rem 0 0 0',
              fontSize: '0.95rem'
            }}>
              {location.pathname.includes('patients') 
                ? 'Manage and view all patient records' 
                : location.pathname.includes('studies')
                ? 'Review and analyze study data'
                : 'Medical dashboard overview'}
            </p>
          </div>

          {/* User Profile */}
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => setIsDropdownOpen(!isDropdownOpen)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                backgroundColor: 'rgba(15, 23, 42, 0.7)',
                border: '1px solid rgba(255, 255, 255, 0.05)',
                borderRadius: '8px',
                padding: '0.5rem 1rem',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
              onMouseOver={(e) => e.currentTarget.style.backgroundColor = 'rgba(30, 41, 59, 0.7)'}
              onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'rgba(15, 23, 42, 0.7)'}
            >
              <div style={{
                width: '36px',
                height: '36px',
                borderRadius: '50%',
                background: 'linear-gradient(135deg, #38bdf8, #818cf8)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: '600',
                fontSize: '0.875rem'
              }}>
                {(userName || userEmail || 'U').charAt(0).toUpperCase()}
              </div>
              <div style={{ textAlign: 'left' }}>
                <div style={{ fontSize: '0.875rem', fontWeight: '600' }}>
                  {userName || 'User'}
                </div>
                <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                  {getRoleLabel(userRole)}
                </div>
              </div>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {/* Dropdown Menu */}
            {isDropdownOpen && (
              <div style={{
                position: 'absolute',
                top: '100%',
                right: '-0.5rem',
                marginTop: '0.5rem',
                width: '220px',
                backgroundColor: 'rgba(15, 23, 42, 0.95)',
                backdropFilter: 'blur(12px)',
                border: '1px solid rgba(255, 255, 255, 0.05)',
                borderRadius: '8px',
                boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.3)',
                zIndex: 20,
                animation: 'slideDown 0.2s ease-out'
              }}>
                <div style={{ padding: '0.5rem 0' }}>
                  <div style={{
                    padding: '0.75rem 1rem',
                    color: '#64748b',
                    fontSize: '0.75rem',
                    borderBottom: '1px solid rgba(255, 255, 255, 0.05)'
                  }}>
                    Signed in as
                    <div style={{ color: '#e2e8f0', fontSize: '0.875rem', marginTop: '0.25rem' }}>
                      {userEmail || userName || 'User'}
                    </div>
                  </div>
                  <button
                    onClick={handleLogout}
                    style={{
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.75rem',
                      padding: '0.75rem 1rem',
                      backgroundColor: 'transparent',
                      color: '#ef4444',
                      border: 'none',
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                      fontSize: '0.875rem'
                    }}
                    onMouseOver={(e) => e.currentTarget.style.backgroundColor = 'rgba(239, 68, 68, 0.1)'}
                    onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                    </svg>
                    Sign out
                  </button>
                </div>
              </div>
            )}
          </div>
        </header>

        {/* Page Content - Using Outlet for nested routes */}
        <div style={{
          backgroundColor: 'rgba(15, 23, 42, 0.7)',
          borderRadius: '16px',
          padding: '1.5rem',
          boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.3)',
          backdropFilter: 'blur(12px)',
          border: '1px solid rgba(255, 255, 255, 0.05)',
          minHeight: 'calc(100vh - 200px)'
        }}>
          {/* This will render PatientList or Studies based on the route */}
          {page === 'patients' ? <PatientList onPageChange={handlePageChange}/> :
           page === 'users' ? <UserAccess onPageChange={handlePageChange}/> :
           page === 'registeries' ? <Registeries onPageChange={handlePageChange}/> :
           page === 'addRegistry' ? <CreateRegistry onPageChange={handlePageChange}/> :
           page === 'addPatient' ? <CreatePatient onPageChange={handlePageChange}/> :
           page === 'editUser' && selectedUser ? <EditUserPermissions user={selectedUser} onPageChange={handlePageChange}/> :
           <AddUser onPageChange={handlePageChange}/>}
        </div>
      </div>

      {/* Animation styles */}
      <style>{`
        @keyframes slideDown {
          from { opacity: 0; transform: translateY(-10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
      `}</style>
    </div>
  );
}

export default Dashboard;