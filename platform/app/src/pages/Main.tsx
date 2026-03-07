import React, { useState } from 'react';
import logo from '../../assets/logo.png';
import { useNavigate } from 'react-router-dom';
import loginImage from '../../assets/login-image1.jpg'; // You'll need to add this image
import { SERVER_URL } from '../../../../config/server';

const MainPage: React.FC = () => {
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

    try {
      const response = await fetch(`${SERVER_URL}/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password }),
      });

      if (!response.ok) {
        throw new Error('Invalid email or password');
      }

      const data = await response.json();

      // Save token in local storage
      localStorage.setItem('token', data.access_token || data.token);

      // (Optional) if backend sends user role/info, save it too
      if (data.role) {
        localStorage.setItem('role', data.role);
      }

      // Navigate to dashboard (or wherever after login)
      navigate('/login');
    } catch (err: any) {
      setError(err.message || 'An error occurred during login');
    } finally {
      setLoading(false);
    }
  };


  return (
    <div style={{
      display: 'flex',
      minHeight: '100vh',
      fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif"
    }}>
      {/* Left Side - Login Form */}
      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        padding: '2rem',
        backgroundColor: '#0a0e17',
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

        <div style={{
          position: 'relative',
          zIndex: 1,
          maxWidth: '460px',
          width: '100%',
          margin: '0 auto'
        }}>
          {/* Logo Header */}
          <div style={{
            marginBottom: '3rem',
            textAlign: 'center',
            animation: 'fadeInDown 0.6s ease-out'
          }}>
            <img src={logo} alt="Logo" style={{
              height: '80px',
              marginBottom: '1rem',
              marginLeft:'3rem',
              filter: 'drop-shadow(0 4px 6px rgba(0, 0, 0, 0.3))'
            }} />
            {/* <h1 style={{
              color: '#f8fafc',
              fontWeight: '600',
              fontSize: '2rem',
              margin: 0,
              letterSpacing: '-0.025em'
            }}>Welcome Back</h1> */}
            {/* <p style={{
              color: '#94a3b8',
              marginTop: '0.5rem',
              fontSize: '1rem'
            }}>Sign in to access your dashboard</p> */}
          </div>

          {/* Login Card */}
          <div style={{
            backgroundColor: 'rgba(15, 23, 42, 0.7)',
            borderRadius: '16px',
            padding: '2.5rem',
            boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.3)',
            backdropFilter: 'blur(12px)',
            border: '1px solid rgba(255, 255, 255, 0.05)',
            animation: 'fadeInUp 0.6s ease-out'
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
                  boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.2)'
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

            <div style={{ textAlign: 'center', marginTop: '1.5rem' }}>
              <span
                onClick={() => navigate('/sso')}
                style={{
                  color: '#3498db',
                  textDecoration: 'none',
                  fontWeight: '500',
                  cursor: 'pointer',
                  fontSize: '0.95rem'
                }}
                onMouseOver={e => e.currentTarget.style.textDecoration = 'underline'}
                onMouseOut={e => e.currentTarget.style.textDecoration = 'none'}
              >
                Single Sign-On
              </span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{
          position: 'absolute',
          bottom: '1.5rem',
          left: 0,
          right: 0,
          color: '#64748b',
          fontSize: '0.85rem',
          textAlign: 'center',
          width: '100%',
          padding: '0 2rem'
        }}>
          <p>© {new Date().getFullYear()} Nivalon Systems. All rights reserved.</p>
        </div>
      </div>

      {/* Right Side - Image */}
      <div style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#00000',
        backgroundImage: `url(${loginImage})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        position: 'relative',
        overflow: 'hidden'
      }}>
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.75)',
          backdropFilter: 'blur(0.5px)'
        }}></div>
        <div style={{
          position: 'relative',
          zIndex: 1,
          padding: '2rem',
          color: 'white',
          textAlign: 'center',
          maxWidth: '600px'
        }}>
          <h2 style={{
            fontSize: '2.5rem',
            fontWeight: '700',
            marginBottom: '1.5rem',
            lineHeight: '1.2',
            marginTop: '20px',
            animation: 'fadeInUp 0.6s ease-out'
          }}>We are Patient Driven</h2>
          <p style={{
            fontSize: '1.125rem',
            lineHeight: '1.4',
            color:'#ffffff',
            opacity: 1.8,
            animation: 'fadeInUp 0.6s ease-out'
          }}>Focusing on each patient to provide personalized care and achieve the best possible outcomes.</p>
          <div style={{
            display: 'flex',
            gap: '1rem',
            justifyContent: 'center'
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              color:'#2DB5EA',
              // fontWeight: 'bold',
              animation: 'fadeInUp 0.6s ease-out',
              fontSize: '1.125rem',
            }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
              <span>AI-Driven Precision Planning</span>
            </div>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              color:'#2DB5EA',
              // fontWeight: 'bold',
              animation: 'fadeInUp 0.6s ease-out',
              fontSize: '1.125rem',
            }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
              <span>Holistic Spinal Care</span>
            </div>
          </div>
          <div style={{
            display: 'flex',
            gap: '1rem',
            justifyContent: 'center',
            marginTop:'10px',
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              color:'#2DB5EA',
              // fontWeight: 'bold',
              animation: 'fadeInUp 0.6s ease-out',
              fontSize: '1.125rem',
            }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
              <span>Devices Unique to You</span>
            </div>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              color:'#2DB5EA',
              // fontWeight: 'bold',
              animation: 'fadeInUp 0.6s ease-out',
              fontSize: '1.125rem',
            }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
              <span>Customized Spinal Treatment</span>
            </div>
          </div>
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
        @keyframes fadeInDown {
          from { opacity: 0; transform: translateY(-20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        input:focus {
          box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.5) !important;
        }
      `}</style>
    </div>
  );
}

export default MainPage;
