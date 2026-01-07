// components/CreatePatient.tsx
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';

interface PatientFormData {
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  age: string;
  gender: 'Male' | 'Female' | 'Other' | 'Prefer not to say';
  email: string;
  phone: string;
  address: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
  bloodGroup: 'A+' | 'A-' | 'B+' | 'B-' | 'O+' | 'O-' | 'AB+' | 'AB-';
  medicalHistory: string;
  allergies: string;
  currentMedications: string;
  insuranceProvider: string;
  insuranceId: string;
  referredBy: string;
  primaryDoctor: string;
  department: string;
}

const CreatePatient: React.FC = ( { onPageChange } ) => {
  const navigate = useNavigate();
  const [formData, setFormData] = useState<PatientFormData>({
    firstName: '',
    lastName: '',
    dateOfBirth: '',
    age: '',
    gender: 'Male',
    email: '',
    phone: '',
    address: '',
    emergencyContactName: '',
    emergencyContactPhone: '',
    bloodGroup: 'O+',
    medicalHistory: '',
    allergies: '',
    currentMedications: '',
    insuranceProvider: '',
    insuranceId: '',
    referredBy: '',
    primaryDoctor: '',
    department: '',
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<Partial<PatientFormData>>({});

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    
    // Calculate age if date of birth changes
    if (name === 'dateOfBirth' && value) {
      const birthDate = new Date(value);
      const today = new Date();
      let calculatedAge = today.getFullYear() - birthDate.getFullYear();
      const monthDiff = today.getMonth() - birthDate.getMonth();
      
      if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
        calculatedAge--;
      }
      
      setFormData(prev => ({
        ...prev,
        [name]: value,
        age: calculatedAge.toString()
      }));
    } else {
      setFormData(prev => ({
        ...prev,
        [name]: value
      }));
    }

    // Clear error for this field
    if (errors[name as keyof PatientFormData]) {
      setErrors(prev => ({
        ...prev,
        [name]: undefined
      }));
    }
  };

  const validateForm = (): boolean => {
    const newErrors: Partial<PatientFormData> = {};

    if (!formData.firstName.trim()) newErrors.firstName = 'First name is required';
    if (!formData.lastName.trim()) newErrors.lastName = 'Last name is required';
    if (!formData.dateOfBirth) newErrors.dateOfBirth = 'Date of birth is required';
    if (!formData.gender) newErrors.gender = 'Gender is required';
    if (formData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = 'Invalid email format';
    }
    if (!formData.phone.trim()) newErrors.phone = 'Phone number is required';
    if (!formData.address.trim()) newErrors.address = 'Address is required';

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
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      // Generate MRN (Medical Record Number)
      const mrn = `MRN${Date.now().toString().slice(-6)}`;
      
      // Here you would typically send the data to your backend
      console.log('Patient data to submit:', {
        ...formData,
        mrn,
        status: 'Active',
        admissionDate: new Date().toISOString().split('T')[0],
      });

      // Show success message and redirect
      alert(`Patient created successfully! MRN: ${mrn}`);
      navigate('/dashboard/patients');
      
    } catch (error) {
      console.error('Error creating patient:', error);
      alert('Failed to create patient. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const departments = [
    'General Medicine',
    'Cardiology',
    'Neurology',
    'Orthopedics',
    'Pediatrics',
    'Oncology',
    'Maternity',
    'Dermatology',
    'Psychiatry',
    'ENT',
    'Ophthalmology',
    'Dental',
    'Emergency',
    'ICU'
  ];

  const doctors = [
    'Dr. Williams',
    'Dr. Chen',
    'Dr. Rodriguez',
    'Dr. Kim',
    'Dr. Patel',
    'Dr. Smith',
    'Dr. Johnson',
    'Dr. Brown'
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
          <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: '600' }}>Create New Patient</h2>
          <p style={{ margin: '0.5rem 0 0 0', color: '#64748b', fontSize: '0.95rem' }}>
            Add a new patient to the system
          </p>
        </div>
        <button 
          onClick={() => onPageChange('patients')}
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
          Back to Patients
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
            Patient Information
          </h3>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
            gap: '1.5rem',
            marginBottom: '2rem'
          }}>
            {/* Personal Information */}
            <div>
              <label style={{
                display: 'block',
                marginBottom: '0.75rem',
                color: '#e2e8f0',
                fontSize: '0.875rem',
                fontWeight: '500'
              }}>
                First Name *
              </label>
              <input
                type="text"
                name="firstName"
                value={formData.firstName}
                onChange={handleChange}
                placeholder="Enter first name"
                style={{
                  width: '100%',
                  padding: '0.875rem 1rem',
                  backgroundColor: 'rgba(2, 6, 23, 0.5)',
                  border: errors.firstName ? '1px solid #ef4444' : '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: '8px',
                  color: '#f8fafc',
                  fontSize: '0.95rem',
                  outline: 'none',
                  transition: 'border-color 0.2s'
                }}
              />
              {errors.firstName && (
                <p style={{ margin: '0.5rem 0 0 0', color: '#ef4444', fontSize: '0.875rem' }}>
                  {errors.firstName}
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
                Last Name *
              </label>
              <input
                type="text"
                name="lastName"
                value={formData.lastName}
                onChange={handleChange}
                placeholder="Enter last name"
                style={{
                  width: '100%',
                  padding: '0.875rem 1rem',
                  backgroundColor: 'rgba(2, 6, 23, 0.5)',
                  border: errors.lastName ? '1px solid #ef4444' : '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: '8px',
                  color: '#f8fafc',
                  fontSize: '0.95rem',
                  outline: 'none',
                  transition: 'border-color 0.2s'
                }}
              />
              {errors.lastName && (
                <p style={{ margin: '0.5rem 0 0 0', color: '#ef4444', fontSize: '0.875rem' }}>
                  {errors.lastName}
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
                Date of Birth *
              </label>
              <input
                type="date"
                name="dateOfBirth"
                value={formData.dateOfBirth}
                onChange={handleChange}
                max={new Date().toISOString().split('T')[0]}
                style={{
                  width: '100%',
                  padding: '0.875rem 1rem',
                  backgroundColor: 'rgba(2, 6, 23, 0.5)',
                  border: errors.dateOfBirth ? '1px solid #ef4444' : '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: '8px',
                  color: '#f8fafc',
                  fontSize: '0.95rem',
                  outline: 'none',
                  transition: 'border-color 0.2s'
                }}
              />
              {errors.dateOfBirth && (
                <p style={{ margin: '0.5rem 0 0 0', color: '#ef4444', fontSize: '0.875rem' }}>
                  {errors.dateOfBirth}
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
                Age
              </label>
              <input
                type="text"
                name="age"
                value={formData.age}
                readOnly
                style={{
                  width: '100%',
                  padding: '0.875rem 1rem',
                  backgroundColor: 'rgba(2, 6, 23, 0.3)',
                  border: '1px solid rgba(255, 255, 255, 0.05)',
                  borderRadius: '8px',
                  color: '#94a3b8',
                  fontSize: '0.95rem',
                  outline: 'none',
                  cursor: 'not-allowed'
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
                Gender *
              </label>
              <select
                name="gender"
                value={formData.gender}
                onChange={handleChange}
                style={{
                  width: '100%',
                  padding: '0.875rem 1rem',
                  backgroundColor: 'rgba(2, 6, 23, 0.5)',
                  border: errors.gender ? '1px solid #ef4444' : '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: '8px',
                  color: '#f8fafc',
                  fontSize: '0.95rem',
                  outline: 'none',
                  cursor: 'pointer'
                }}
              >
                <option value="Male">Male</option>
                <option value="Female">Female</option>
                <option value="Other">Other</option>
                <option value="Prefer not to say">Prefer not to say</option>
              </select>
              {errors.gender && (
                <p style={{ margin: '0.5rem 0 0 0', color: '#ef4444', fontSize: '0.875rem' }}>
                  {errors.gender}
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
                Blood Group
              </label>
              <select
                name="bloodGroup"
                value={formData.bloodGroup}
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
                <option value="A+">A+</option>
                <option value="A-">A-</option>
                <option value="B+">B+</option>
                <option value="B-">B-</option>
                <option value="O+">O+</option>
                <option value="O-">O-</option>
                <option value="AB+">AB+</option>
                <option value="AB-">AB-</option>
              </select>
            </div>
          </div>

          {/* Contact Information */}
          <h3 style={{
            margin: '0 0 1.5rem 0',
            fontSize: '1.25rem',
            fontWeight: '600',
            color: '#e2e8f0',
            paddingTop: '1rem',
            borderTop: '1px solid rgba(255, 255, 255, 0.05)'
          }}>
            Contact Information
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
                Email Address
              </label>
              <input
                type="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                placeholder="patient@example.com"
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
                Phone Number *
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
                  border: errors.phone ? '1px solid #ef4444' : '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: '8px',
                  color: '#f8fafc',
                  fontSize: '0.95rem',
                  outline: 'none',
                  transition: 'border-color 0.2s'
                }}
              />
              {errors.phone && (
                <p style={{ margin: '0.5rem 0 0 0', color: '#ef4444', fontSize: '0.875rem' }}>
                  {errors.phone}
                </p>
              )}
            </div>

            <div style={{ gridColumn: '1 / -1' }}>
              <label style={{
                display: 'block',
                marginBottom: '0.75rem',
                color: '#e2e8f0',
                fontSize: '0.875rem',
                fontWeight: '500'
              }}>
                Address *
              </label>
              <input
                type="text"
                name="address"
                value={formData.address}
                onChange={handleChange}
                placeholder="Enter full address"
                style={{
                  width: '100%',
                  padding: '0.875rem 1rem',
                  backgroundColor: 'rgba(2, 6, 23, 0.5)',
                  border: errors.address ? '1px solid #ef4444' : '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: '8px',
                  color: '#f8fafc',
                  fontSize: '0.95rem',
                  outline: 'none',
                  transition: 'border-color 0.2s'
                }}
              />
              {errors.address && (
                <p style={{ margin: '0.5rem 0 0 0', color: '#ef4444', fontSize: '0.875rem' }}>
                  {errors.address}
                </p>
              )}
            </div>
          </div>

          {/* Emergency Contact */}
          <h3 style={{
            margin: '0 0 1.5rem 0',
            fontSize: '1.25rem',
            fontWeight: '600',
            color: '#e2e8f0',
            paddingTop: '1rem',
            borderTop: '1px solid rgba(255, 255, 255, 0.05)'
          }}>
            Emergency Contact
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
                Contact Name
              </label>
              <input
                type="text"
                name="emergencyContactName"
                value={formData.emergencyContactName}
                onChange={handleChange}
                placeholder="Enter emergency contact name"
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
                Contact Phone
              </label>
              <input
                type="tel"
                name="emergencyContactPhone"
                value={formData.emergencyContactPhone}
                onChange={handleChange}
                placeholder="+1 (555) 987-6543"
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
          </div>
        </div>

        {/* Medical Information */}
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
            Medical Information
          </h3>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
            gap: '1.5rem',
            marginBottom: '2rem'
          }}>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={{
                display: 'block',
                marginBottom: '0.75rem',
                color: '#e2e8f0',
                fontSize: '0.875rem',
                fontWeight: '500'
              }}>
                Medical History
              </label>
              <textarea
                name="medicalHistory"
                value={formData.medicalHistory}
                onChange={handleChange}
                placeholder="Previous conditions, surgeries, chronic illnesses..."
                rows={4}
                style={{
                  width: '100%',
                  padding: '0.875rem 1rem',
                  backgroundColor: 'rgba(2, 6, 23, 0.5)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: '8px',
                  color: '#f8fafc',
                  fontSize: '0.95rem',
                  outline: 'none',
                  resize: 'vertical',
                  minHeight: '120px',
                  fontFamily: 'inherit'
                }}
              />
            </div>

            <div style={{ gridColumn: '1 / -1' }}>
              <label style={{
                display: 'block',
                marginBottom: '0.75rem',
                color: '#e2e8f0',
                fontSize: '0.875rem',
                fontWeight: '500'
              }}>
                Allergies
              </label>
              <textarea
                name="allergies"
                value={formData.allergies}
                onChange={handleChange}
                placeholder="List any allergies (drug, food, environmental)..."
                rows={3}
                style={{
                  width: '100%',
                  padding: '0.875rem 1rem',
                  backgroundColor: 'rgba(2, 6, 23, 0.5)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: '8px',
                  color: '#f8fafc',
                  fontSize: '0.95rem',
                  outline: 'none',
                  resize: 'vertical',
                  minHeight: '100px',
                  fontFamily: 'inherit'
                }}
              />
            </div>

            <div style={{ gridColumn: '1 / -1' }}>
              <label style={{
                display: 'block',
                marginBottom: '0.75rem',
                color: '#e2e8f0',
                fontSize: '0.875rem',
                fontWeight: '500'
              }}>
                Current Medications
              </label>
              <textarea
                name="currentMedications"
                value={formData.currentMedications}
                onChange={handleChange}
                placeholder="List current medications with dosages..."
                rows={3}
                style={{
                  width: '100%',
                  padding: '0.875rem 1rem',
                  backgroundColor: 'rgba(2, 6, 23, 0.5)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: '8px',
                  color: '#f8fafc',
                  fontSize: '0.95rem',
                  outline: 'none',
                  resize: 'vertical',
                  minHeight: '100px',
                  fontFamily: 'inherit'
                }}
              />
            </div>
          </div>
        </div>

        {/* Administrative Information */}
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
            Administrative Information
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
                Insurance Provider
              </label>
              <input
                type="text"
                name="insuranceProvider"
                value={formData.insuranceProvider}
                onChange={handleChange}
                placeholder="Insurance company name"
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
                Insurance ID
              </label>
              <input
                type="text"
                name="insuranceId"
                value={formData.insuranceId}
                onChange={handleChange}
                placeholder="Insurance policy number"
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

            <div>
              <label style={{
                display: 'block',
                marginBottom: '0.75rem',
                color: '#e2e8f0',
                fontSize: '0.875rem',
                fontWeight: '500'
              }}>
                Primary Doctor
              </label>
              <select
                name="primaryDoctor"
                value={formData.primaryDoctor}
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
                <option value="">Select Doctor</option>
                {doctors.map(doctor => (
                  <option key={doctor} value={doctor}>{doctor}</option>
                ))}
              </select>
            </div>

            <div>
              <label style={{
                display: 'block',
                marginBottom: '0.75rem',
                color: '#e2e8f0',
                fontSize: '0.875rem',
                fontWeight: '500'
              }}>
                Referred By
              </label>
              <input
                type="text"
                name="referredBy"
                value={formData.referredBy}
                onChange={handleChange}
                placeholder="Referring doctor or clinic"
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
            onClick={() => onPageChange('patients')}
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
                  display: 'inline-block',
                  width: '16px',
                  height: '16px',
                  border: '2px solid rgba(255, 255, 255, 0.3)',
                  borderTopColor: 'white',
                  borderRadius: '50%',
                  animation: 'spin 1s linear infinite'
                }}></span>
                Creating...
              </>
            ) : (
              'Create Patient'
            )}
          </button>
        </div>
      </form>

      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        
        input:focus, select:focus, textarea:focus {
          border-color: #3b82f6 !important;
          box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
        }
        
        input::placeholder, textarea::placeholder {
          color: #64748b;
        }
      `}</style>
    </div>
  );
};

export default CreatePatient;