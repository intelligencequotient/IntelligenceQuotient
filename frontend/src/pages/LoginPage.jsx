import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { BookOpen, GraduationCap, Eye, EyeOff, Shield } from 'lucide-react';
import './LoginPage.css';

const LoginPage = () => {
  const navigate = useNavigate();
  const [role, setRole] = useState('student');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const MOCK_CREDENTIALS = {
    student: [
      { label: 'Alex Johnson', email: 'student@edu.com', password: 'student123' },
    ],
    teacher: [
      { label: 'Dr. Robert Chen', email: 'teacher@edu.com', password: 'teacher123' },
      { label: 'Dr. Alan Physics', email: 'physics_teacher@edu.com', password: 'teacher123' },
      { label: 'Dr. Marie Chem', email: 'chemistry_teacher@edu.com', password: 'teacher123' },
      { label: 'Dr. Euler Maths', email: 'maths_teacher@edu.com', password: 'teacher123' },
    ],
    admin: [
      { label: 'Super Admin', email: 'admin@edu.com', password: 'admin123' },
    ],
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      // Use the apiClient to hit our NestJS backend
      const { apiClient } = await import('../api/client');
      const data = await apiClient.post('/auth/login', { email, password });
      
      // Store tokens and user details. The refresh token lets apiClient renew a
      // expired session silently instead of bouncing the user back to login.
      localStorage.setItem('access_token', data.accessToken);
      if (data.refreshToken) localStorage.setItem('refresh_token', data.refreshToken);
      localStorage.setItem('user', JSON.stringify(data.user));
      
      // Navigate based on actual role from database
      // Force full reload so AppDataContext fetches initial data
      if (data.user.role === 'admin') {
        window.location.href = '/admin';
      } else if (data.user.role === 'teacher') {
        window.location.href = '/teacher';
      } else {
        window.location.href = '/student';
      }
    } catch (err) {
      setError(err.message || 'Invalid email or password. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      {/* Left Panel */}
      <div className="login-branding">
        <div className="brand-content">
          <div className="brand-logo">
            <BookOpen size={36} />
            <span>EduCommand</span>
          </div>
          <h1>Unlock Your Potential.</h1>
          <p>The next-generation EdTech platform built for JEE, NEET, and competitive exam preparation. Adaptive learning powered by AI.</p>

          <div className="feature-list">
            <div className="feature-item">
              <span className="feature-dot"></span>
              <span>AI-powered predictive analytics</span>
            </div>
            <div className="feature-item">
              <span className="feature-dot"></span>
              <span>Live doubt resolution with teachers</span>
            </div>
            <div className="feature-item">
              <span className="feature-dot"></span>
              <span>Spaced repetition question engine</span>
            </div>
            <div className="feature-item">
              <span className="feature-dot"></span>
              <span>All-India leaderboard & rankings</span>
            </div>
          </div>

          <div className="brand-stats">
            <div className="brand-stat">
              <strong>10,000+</strong>
              <span>Students</span>
            </div>
            <div className="brand-stat">
              <strong>500+</strong>
              <span>Mock Tests</span>
            </div>
            <div className="brand-stat">
              <strong>98%</strong>
              <span>Satisfaction</span>
            </div>
          </div>
        </div>
      </div>

      {/* Right Panel */}
      <div className="login-form-panel">
        <div className="login-form-card">
          <h2>Welcome back 👋</h2>
          <p className="login-subtitle">Sign in to continue to your portal.</p>

          {/* Role Selector */}
          <div className="role-selector">
            <button
              className={`role-btn ${role === 'student' ? 'active' : ''}`}
              onClick={() => setRole('student')}
            >
              <GraduationCap size={20} />
              Student
            </button>
            <button
              className={`role-btn ${role === 'teacher' ? 'active' : ''}`}
              onClick={() => setRole('teacher')}
            >
              <BookOpen size={20} />
              Teacher
            </button>
            <button
              className={`role-btn ${role === 'admin' ? 'active' : ''}`}
              onClick={() => setRole('admin')}
              style={role === 'admin' ? { background: 'linear-gradient(135deg,#7c3aed,#4f46e5)', color: 'white', borderColor: '#7c3aed' } : {}}
            >
              <Shield size={20} />
              Admin
            </button>
          </div>

          <form onSubmit={handleLogin} className="login-form">
            <div className="form-group">
              <label>Email Address</label>
              <input
                type="email"
                placeholder={`e.g. ${(MOCK_CREDENTIALS[role] || MOCK_CREDENTIALS.student)[0].email}`}
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
              />
            </div>

            <div className="form-group">
              <label>Password</label>
              <div className="password-wrapper">
                <input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Enter your password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                />
                <button type="button" className="toggle-password" onClick={() => setShowPassword(!showPassword)}>
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            {error && <div className="error-msg">{error}</div>}

            <button type="submit" className="login-btn" disabled={loading} style={role === 'admin' ? { background: 'linear-gradient(135deg,#7c3aed,#4f46e5)' } : {}}>
              {loading ? <span className="spinner"></span> : `Sign In as ${role === 'student' ? 'Student' : role === 'teacher' ? 'Teacher' : 'Admin'}`}
            </button>

            <Link
              to="/forgot-password"
              style={{ display: 'block', textAlign: 'center', marginTop: '14px', fontSize: '0.87rem', color: '#64748b', textDecoration: 'none' }}
            >
              Forgot your password?
            </Link>
          </form>

          {/* Demo Credentials */}
          <div className="demo-creds">
            <p>Demo credentials for <strong>{role}</strong>:</p>
            {(MOCK_CREDENTIALS[role] || []).map((cred, i) => (
              <div key={i} className="demo-cred-row" style={{display:'flex',alignItems:'center',gap:'8px',marginBottom:'6px',flexWrap:'wrap'}}>
                <code style={{flex:1,minWidth:0,fontSize:'0.8rem'}}>{cred.label} — {cred.email} / {cred.password}</code>
                <button className="autofill-btn" style={role === 'admin' ? { background: 'linear-gradient(135deg,#7c3aed,#4f46e5)', color: 'white' } : {}} onClick={() => {
                  setEmail(cred.email);
                  setPassword(cred.password);
                }}>
                  Auto-fill
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
