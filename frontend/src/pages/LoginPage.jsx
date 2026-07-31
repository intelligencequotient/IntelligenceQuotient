import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BookOpen, GraduationCap, Eye, EyeOff } from 'lucide-react';
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
    student: { email: import.meta.env.VITE_DEMO_STUDENT_EMAIL || 'student@edu.com', password: import.meta.env.VITE_DEMO_STUDENT_PASSWORD || 'student123' },
    teacher: { email: import.meta.env.VITE_DEMO_TEACHER_EMAIL || 'teacher@edu.com', password: import.meta.env.VITE_DEMO_TEACHER_PASSWORD || 'teacher123' },
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      // Use the apiClient to hit our NestJS backend
      const { apiClient } = await import('../api/client');
      const data = await apiClient.post('/auth/login', { email, password });
      
      // Store token and user details
      localStorage.setItem('access_token', data.accessToken);
      localStorage.setItem('user', JSON.stringify(data.user));
      
      // Navigate based on actual role from database
      navigate(data.user.role === 'teacher' || data.user.role === 'admin' ? '/teacher' : '/student');
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
          </div>

          <form onSubmit={handleLogin} className="login-form">
            <div className="form-group">
              <label>Email Address</label>
              <input
                type="email"
                placeholder={`e.g. ${MOCK_CREDENTIALS[role].email}`}
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

            <button type="submit" className="login-btn" disabled={loading}>
              {loading ? <span className="spinner"></span> : `Sign In as ${role === 'student' ? 'Student' : 'Teacher'}`}
            </button>
          </form>

          {/* Demo Credentials */}
          <div className="demo-creds">
            <p>Demo credentials for <strong>{role}</strong>:</p>
            <code>{MOCK_CREDENTIALS[role].email} / {MOCK_CREDENTIALS[role].password}</code>
            <button className="autofill-btn" onClick={() => {
              setEmail(MOCK_CREDENTIALS[role].email);
              setPassword(MOCK_CREDENTIALS[role].password);
            }}>
              Auto-fill
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
