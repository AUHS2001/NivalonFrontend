import React, { useState } from 'react';
import logo from '../../assets/logo.png';
import { useNavigate } from 'react-router-dom';

const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Basic validation
    if (!email || !password) {
      setError('Please enter both email and password');
      return;
    }

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      setError('Please enter a valid email address');
      return;
    }

    setLoading(true);

    // Simulate API call
    try {
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Hardcoded users
      const validUsers = [
        { email: 'analyst@nivalon.com', password: '@Dmin123', role: 'analyst' },
        { email: 'signon@nivalon.com', password: '@Dmin123', role: 'signs' },
        { email: 'admin@nivalon.com', password: '@Dmin123', role: 'admin' }
      ];

      const user = validUsers.find(u => u.email === email && u.password === password);

      if (user) {
        // Save user role to local storage
        if(user.role === 'admin'){
          localStorage.setItem('userRole', user.role);
          navigate('/admin');
        } else {
          localStorage.setItem('userRole', user.role);
          navigate('/localWorklist'); 
        }
      } else {
        setError('Invalid email or password');
      }
    } catch (err) {
      setError('An error occurred during login');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      backgroundColor: "#0a0e17",
      minHeight: '100vh',
      color: 'white',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
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
        background: 'radial-gradient(circle, rgba(56, 182, 255, 0.2) 0%, transparent 70%)',
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
        background: 'radial-gradient(circle, rgba(124, 58, 237, 0.15) 0%, transparent 70%)',
        filter: 'blur(50px)',
        zIndex: 0
      }}></div>

      {/* Logo Header */}
      <div style={{
        marginBottom: '2rem',
        textAlign: 'center',
        zIndex: 1
      }}>
        <img src={logo} alt="Logo" style={{
          height: '80px',
          marginBottom: '1rem',
          filter: 'drop-shadow(0 4px 6px rgba(0, 0, 0, 0.3))'
        }} />
      </div>

      {/* Login Form */}
      <div style={{
        backgroundColor: 'rgba(15, 23, 42, 0.7)',
        borderRadius: '16px',
        padding: '2.5rem',
        boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.3)',
        backdropFilter: 'blur(12px)',
        border: '1px solid rgba(255, 255, 255, 0.05)',
        animation: 'fadeInUp 0.6s ease-out',
        width: '100%',
        maxWidth: '500px',
        zIndex: 1
      }}>
        {error && (
          <div style={{
            backgroundColor: 'rgba(239, 68, 68, 0.15)',
            color: '#ef4444',
            padding: '0.8rem 1rem',
            borderRadius: '8px',
            marginBottom: '1.5rem',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            fontSize: '0.9rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem'
          }}>
            <svg style={{ flexShrink: 0 }} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleLogin}>
          <div style={{ marginBottom: '1.75rem' }}>
            <label htmlFor="email" style={{
              display: 'block',
              marginBottom: '0.75rem',
              color: '#e2e8f0',
              fontWeight: '500',
              fontSize: '0.95rem'
            }}>Email Address</label>
            <div style={{
              position: 'relative',
              borderRadius: '8px',
              overflow: 'hidden',
              boxShadow: '0 0 0 1px rgba(148, 163, 184, 0.2)',
              transition: 'box-shadow 0.2s'
            }}>
              <input
                type="email"
                id="email"
                placeholder="Enter your email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.9rem 1rem 0.9rem 2.75rem',
                  backgroundColor: 'rgba(2, 6, 23, 0.5)',
                  border: 'none',
                  color: '#f8fafc',
                  fontSize: '0.95rem',
                  outline: 'none'
                }}
                autoFocus
              />
              <div style={{
                position: 'absolute',
                left: '1rem',
                top: '50%',
                transform: 'translateY(-50%)',
                color: '#64748b'
              }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </div>
            </div>
          </div>

          <div style={{ marginBottom: '2.5rem' }}>
            <label htmlFor="password" style={{
              display: 'block',
              marginBottom: '0.75rem',
              color: '#e2e8f0',
              fontWeight: '500',
              fontSize: '0.95rem'
            }}>Password</label>
            <div style={{
              position: 'relative',
              borderRadius: '8px',
              overflow: 'hidden',
              boxShadow: '0 0 0 1px rgba(148, 163, 184, 0.2)',
              transition: 'box-shadow 0.2s'
            }}>
              <input
                type="password"
                id="password"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.9rem 1rem 0.9rem 2.75rem',
                  backgroundColor: 'rgba(2, 6, 23, 0.5)',
                  border: 'none',
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
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-4.42 0-8 1.79-8 4v1h16v-1c0-2.21-3.58-4-8-4z" />
                </svg>
              </div>
            </div>
          </div>

          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '1.5rem'
          }}>
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <input
                type="checkbox"
                id="rememberMe"
                style={{
                  marginRight: '0.5rem',
                  width: '1rem',
                  height: '1rem'
                }}
              />
              <label style={{ color: '#bdc3c7' }} htmlFor="rememberMe">Remember me</label>
            </div>
            <a href="#" style={{
              color: '#3498db',
              textDecoration: 'none',
              fontSize: '0.9rem'
            }}>Forgot password?</a>
          </div>

          <button
            type="submit"
            style={{
              width: '100%',
              padding: '0.5rem',
              backgroundColor: '#2563eb',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              fontSize: '1rem',
              fontWeight: '600',
              cursor: 'pointer',
              transition: 'all 0.2s',
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              gap: '0.5rem',
              boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.2)',
              marginBottom: '1.5rem'
            }}
            disabled={loading}
            onMouseOver={e => !loading && (e.currentTarget.style.backgroundColor = '#1d4ed8')}
            onMouseOut={e => !loading && (e.currentTarget.style.backgroundColor = '#2563eb')}
          >
            {loading ? (
              <>
                <span style={{
                  display: 'inline-block',
                  width: '15px',
                  height: '15px',
                  border: '2px solid rgba(255, 255, 255, 0.3)',
                  borderTopColor: 'white',
                  borderRadius: '50%',
                  animation: 'spin 1s linear infinite'
                }}></span>
                Signing In...
              </>
            ) : (
              <>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
                </svg>
                Sign In
              </>
            )}
          </button>
        </form>

        <div style={{ textAlign: 'center' }}>
          <p style={{ color: '#bdc3c7', margin: 0 }}>
            Don't have an account?{' '}
            <a href="#" style={{
              color: '#3498db',
              textDecoration: 'none',
              fontWeight: '500'
            }}>Sign up</a>
          </p>
        </div>
      </div>

      {/* Animation styles */}
      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        input:focus {
          box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.5) !important;
        }
      `}</style>
    </div>
  );
}

export default LoginPage;
