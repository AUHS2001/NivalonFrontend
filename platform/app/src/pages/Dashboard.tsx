// Dashboard.tsx
import React, { useState, useEffect } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom'; // Changed imports
import logo from '../../assets/logo.png';
import PatientList from '../components/PatientList';
import UserAccess from '../components/userAccessList';
import CreatePatient from '../components/CreatePatient';
import AddUser from '../components/CreateUser';

interface DashboardProps {
  children?: React.ReactNode;
}

const Dashboard: React.FC<DashboardProps> = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [userRole, setUserRole] = useState<string>('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [page, setPage] = useState<string>('patients');

  useEffect(() => {
    const role = localStorage.getItem('userRole');
    if (!role) {
      navigate('/');
    } else {
      setUserRole(role);
    }
  }, [navigate]);

  const handleLogout = () => {
    localStorage.removeItem('userRole');
    navigate('/');
  };

  // Update paths to be relative to dashboard
  const menuItems = [
    { id: 'patients', label: 'Patient List', path: '/patients', icon: '👥' },
    { id: 'users', label: 'User Access', path: '/users', icon: '👤' }
  ];

  return (
    <div style={{
      backgroundColor: "#0a0e17",
      minHeight: '100vh',
      color: 'white',
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
        top: 0,
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
            Role: <span style={{ color: '#38bdf8' }}>{userRole}</span>
          </div>
        </div>

        {/* Navigation */}
        <nav style={{ padding: '0 1rem' }}>
          {menuItems.map((item) => {
            const isActive = location.pathname === item.path;
            return (
              <button
                key={item.id}
                onClick={() => {
                    setPage(item.id)
                }}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.75rem',
                  padding: '0.875rem 1rem',
                  backgroundColor: isActive ? 'rgba(56, 182, 255, 0.15)' : 'transparent',
                  color: isActive ? '#38bdf8' : '#cbd5e1',
                  border: 'none',
                  borderRadius: '8px',
                  marginBottom: '0.5rem',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  fontSize: '0.95rem',
                  fontWeight: isActive ? '600' : '400',
                  borderLeft: isActive ? '3px solid #38bdf8' : '3px solid transparent'
                }}
                onMouseOver={(e) => !isActive && (e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.05)')}
                onMouseOut={(e) => !isActive && (e.currentTarget.style.backgroundColor = 'transparent')}
              >
                <span style={{ fontSize: '1.1rem' }}>{item.icon}</span>
                {item.label}
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
                {userRole.charAt(0).toUpperCase()}
              </div>
              <div style={{ textAlign: 'left' }}>
                <div style={{ fontSize: '0.875rem', fontWeight: '600' }}>
                  {userRole.charAt(0).toUpperCase() + userRole.slice(1)}
                </div>
                <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                  {userRole === 'analyst' ? 'Data Analyst' : 'Signing Officer'}
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
                right: 0,
                marginTop: '0.5rem',
                width: '200px',
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
                      {userRole}@nivalon.com
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
          {page === 'patients' ? <PatientList onPageChange={setPage}/> : (page === 'users' ? <UserAccess onPageChange={setPage}/> : (page === 'addPatient' ? <CreatePatient onPageChange={setPage}/> : <AddUser onPageChange={setPage}/>))}
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