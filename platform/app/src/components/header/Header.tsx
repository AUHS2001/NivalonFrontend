import React from 'react';
import logo from '../../../assets/logo.png';
import { useNavigate } from 'react-router-dom';

export default function Header() {
    const userRole = localStorage.getItem('userRole');
    const navigate = useNavigate()
    return (
        <div className="d-flex justify-content-between align-items-center py-2 px-4"
            style={{
                color: 'white',
                minHeight: '60px',
                backgroundColor: "#0a0e17",
            }}>
            <div className="d-flex align-items-center">
                <div className="me-2 relative group">
                  <div className="absolute inset-0 rounded-lg bg-[rgba(52,140,253,0.08)] blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 scale-110" />
                  <img
                    src={logo}
                    alt="Logo"
                    width="250"
                    height="250"
                    className="relative drop-shadow-[0_0_12px_rgba(52,140,253,0.25)] transition-all duration-300 group-hover:drop-shadow-[0_0_20px_rgba(52,140,253,0.45)] group-hover:scale-[1.02]"
                  />
                </div>
            </div>
            {userRole === 'none' ? <button className="btn btn-primary me-2" onClick={() => {
              navigate(`/localWorklistUpload`);
            }}>
                <span className="me-1">→</span>
                     Upload
            </button>: <div></div>}
        </div>
    );
}
