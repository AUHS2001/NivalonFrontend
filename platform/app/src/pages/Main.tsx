declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: { client_id: string; callback: (response: { credential: string }) => void; error_callback?: (error: { type: string; message?: string }) => void }) => void;
          renderButton: (element: HTMLElement, config: Record<string, unknown>) => void;
        };
      };
    };
  }
}

import React, { useState, useEffect, useRef } from 'react';
import logo from '../../assets/logo.png';
import { useNavigate } from 'react-router-dom';
import loginImage from '../../assets/login-image1.jpg';
import { SERVER_URL } from '../../../../config/server';
import DevelopmentBanner from '../components/DevelopmentBanner';

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';

const MainPage: React.FC = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const googleButtonRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let signInSucceeded = false;
    let pollTimer: ReturnType<typeof setInterval> | null = null;

    // Intercept window.open to detect when Google's popup closes
    const originalOpen = window.open;
    window.open = function (...args: Parameters<typeof window.open>) {
      const popup = originalOpen.apply(this, args);
      const url = args[0]?.toString() || '';
      if (url.includes('accounts.google.com')) {
        pollTimer = setInterval(() => {
          if (popup && popup.closed) {
            if (pollTimer) clearInterval(pollTimer);
            pollTimer = null;
            if (!signInSucceeded) {
              setError('You can only sign in with your official Nivalon email address only.');
            }
          }
        }, 500);
      }
      return popup;
    };

    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => {
      if (window.google && googleButtonRef.current) {
        window.google.accounts.id.initialize({
          client_id: GOOGLE_CLIENT_ID,
          callback: (response: { credential: string }) => {
            signInSucceeded = true;
            handleGoogleResponse(response);
          },
        });
        window.google.accounts.id.renderButton(googleButtonRef.current, {
          theme: 'outline',
          size: 'large',
          width: 400,
          text: 'signin_with',
          shape: 'rectangular',
        });
      }
    };
    document.head.appendChild(script);

    return () => {
      window.open = originalOpen;
      if (pollTimer) clearInterval(pollTimer);
      document.head.removeChild(script);
    };
  }, []);

  const handleGoogleResponse = (response: { credential: string }) => {
    console.log('Google Sign-In Response:', response);
    try {
      const payload = JSON.parse(atob(response.credential.split('.')[1]));
      const email: string = payload.email || '';

      if (!email.endsWith('@nivalonmedical.com')) {
        setError('You can only sign in with your official Nivalon email address only.');
        return;
      }

      localStorage.setItem('token', response.credential);
      navigate('/login');
    } catch {
      setError('Failed to verify Google sign-in. Please try again.');
    }
  };

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      minHeight: '100vh',
      fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif"
    }}>
      <DevelopmentBanner />

      {/* Main Content */}
      <div style={{
        display: 'flex',
        flex: 1,
      }}>
      {/* Left Side - Login */}
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
              marginLeft: '3rem',
              filter: 'drop-shadow(0 4px 6px rgba(0, 0, 0, 0.3))'
            }} />
          </div>

          {/* Login Card */}
          <div style={{
            backgroundColor: 'rgba(15, 23, 42, 0.7)',
            borderRadius: '16px',
            padding: '2.5rem',
            boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.3)',
            backdropFilter: 'blur(12px)',
            border: '1px solid rgba(255, 255, 255, 0.05)',
            animation: 'fadeInUp 0.6s ease-out',
            textAlign: 'center'
          }}>
            <h2 style={{
              color: '#f8fafc',
              fontWeight: '600',
              fontSize: '1.5rem',
              margin: '0 0 0.5rem 0',
              letterSpacing: '-0.025em'
            }}>Welcome</h2>
            <p style={{
              color: '#94a3b8',
              marginTop: '0',
              marginBottom: '2rem',
              fontSize: '0.95rem',
              lineHeight: '1.5'
            }}>Sign in with your official Nivalon email to access the platform.</p>

            {/* Error message */}
            {error && (
              <div style={{
                backgroundColor: 'rgba(239, 68, 68, 0.15)',
                color: '#ef4444',
                padding: '0.8rem 1rem',
                borderRadius: '8px',
                marginBottom: '1rem',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                fontSize: '0.9rem',
                textAlign: 'left'
              }}>
                {error}
              </div>
            )}

            {/* Google Sign-In Button */}
            {loading ? (
              <div style={{
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                gap: '0.75rem',
                padding: '0.85rem',
                color: '#94a3b8'
              }}>
                <span style={{
                  display: 'inline-block',
                  width: '18px',
                  height: '18px',
                  border: '2px solid #dadce0',
                  borderTopColor: '#4285f4',
                  borderRadius: '50%',
                  animation: 'spin 1s linear infinite'
                }}></span>
                Signing in...
              </div>
            ) : (
              <div
                ref={googleButtonRef}
                style={{
                  display: 'flex',
                  justifyContent: 'center',
                  width: '100%'
                }}
              ></div>
            )}

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
          <p>&copy; {new Date().getFullYear()} Nivalon Systems. All rights reserved.</p>
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
            color: '#ffffff',
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
              color: '#2DB5EA',
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
              color: '#2DB5EA',
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
            marginTop: '10px',
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              color: '#2DB5EA',
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
              color: '#2DB5EA',
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
      `}</style>
    </div>
  );
}

export default MainPage;
