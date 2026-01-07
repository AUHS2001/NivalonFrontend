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
                <div className="me-2">
                   <img src={logo} alt="Logo" width="250" height="250" />
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
