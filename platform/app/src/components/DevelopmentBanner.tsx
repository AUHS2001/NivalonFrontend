import React from 'react';

const DevelopmentBanner: React.FC = () => (
  <div style={{
    width: '100%',
    zIndex: 50,
    display: 'flex',
    justifyContent: 'center',
    padding: '0.5rem 1rem',
    backgroundColor: 'rgba(15, 23, 42, 0.95)',
    borderBottom: '1px solid rgba(56, 182, 255, 0.2)',
  }}>
    <p style={{
      margin: 0,
      color: '#94a3b8',
      fontSize: '0.85rem',
      textAlign: 'center',
      lineHeight: '1.5',
    }}>
      <span style={{ color: '#2DB5EA', fontWeight: 600 }}>Nivalon Medical</span>{' '}
      is currently in active development. You may experience occasional errors or incomplete features. We appreciate your understanding and patience as we work toward a stable release.
    </p>
  </div>
);

export default DevelopmentBanner;
