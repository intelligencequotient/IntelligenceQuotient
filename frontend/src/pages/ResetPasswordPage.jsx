import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { BookOpen, Eye, EyeOff, CheckCircle } from 'lucide-react';
import { apiClient, clearSession } from '../api/client';
import './LoginPage.css';

/**
 * Completes a password reset.
 *
 * Supabase appends the recovery token to the URL *fragment*
 * (#access_token=…&type=recovery). A fragment is never sent to a server, which
 * is exactly why it is used — we read it here and hand it to our API, which
 * verifies the signature before trusting it.
 */
const ResetPasswordPage = () => {
  const navigate = useNavigate();

  const [accessToken, setAccessToken] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const hash = window.location.hash.startsWith('#') ? window.location.hash.slice(1) : '';
    const params = new URLSearchParams(hash);
    const token = params.get('access_token');

    if (token) {
      setAccessToken(token);
      // Strip the token from the address bar so it does not linger in history.
      window.history.replaceState(null, '', window.location.pathname);
    } else {
      setError('This reset link is missing its token. Request a new one.');
    }

    // Any half-finished session must not survive a password reset.
    clearSession();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (password.length < 6) return setError('Password must be at least 6 characters.');
    if (password !== confirm) return setError('The two passwords do not match.');
    if (!accessToken) return setError('This reset link is invalid. Request a new one.');

    setLoading(true);
    try {
      await apiClient.post('/auth/reset-password', { accessToken, newPassword: password });
      setDone(true);
      setTimeout(() => navigate('/'), 2500);
    } catch (err) {
      setError(err.message || 'Could not reset your password. The link may have expired.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-branding">
        <div className="brand-content">
          <div className="brand-logo">
            <BookOpen size={36} />
            <span>EduCommand</span>
          </div>
          <h1>Choose a new password.</h1>
          <p>Pick something you haven't used before. You'll be signed out everywhere else.</p>
        </div>
      </div>

      <div className="login-form-panel">
        <div className="login-form-card">
          {done ? (
            <>
              <CheckCircle size={44} style={{ color: '#059669', marginBottom: '12px' }} />
              <h2>Password updated</h2>
              <p className="login-subtitle">Taking you to the sign-in page…</p>
            </>
          ) : (
            <>
              <h2>Set a new password</h2>
              <p className="login-subtitle">Minimum 6 characters.</p>

              <form onSubmit={handleSubmit} className="login-form">
                <div className="form-group">
                  <label>New Password</label>
                  <div className="password-wrapper">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      placeholder="Enter a new password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                    />
                    <button type="button" className="toggle-password" onClick={() => setShowPassword(!showPassword)}>
                      {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </div>

                <div className="form-group">
                  <label>Confirm Password</label>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Repeat the password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    required
                  />
                </div>

                {error && <div className="error-msg">{error}</div>}

                <button type="submit" className="login-btn" disabled={loading || !accessToken}>
                  {loading ? <span className="spinner"></span> : 'Update Password'}
                </button>
              </form>

              <Link
                to="/forgot-password"
                style={{ display: 'inline-block', marginTop: '18px', fontSize: '0.88rem', color: '#64748b', textDecoration: 'none' }}
              >
                Request a new link
              </Link>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default ResetPasswordPage;
