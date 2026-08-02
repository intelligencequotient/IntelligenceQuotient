import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { BookOpen, ArrowLeft, MailCheck } from 'lucide-react';
import { apiClient } from '../api/client';
import './LoginPage.css';

/**
 * Requests a password-recovery email.
 *
 * The API deliberately returns the same response whether or not the address is
 * registered, so this screen shows the same confirmation either way — telling a
 * stranger which emails exist would let them enumerate the user base.
 */
const ForgotPasswordPage = () => {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await apiClient.post('/auth/forgot-password', { email });
      setSent(true);
    } catch (err) {
      setError(err.message || 'Could not send the reset email. Please try again.');
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
          <h1>Locked out?</h1>
          <p>Enter the email address on your account and we'll send you a link to set a new password.</p>
        </div>
      </div>

      <div className="login-form-panel">
        <div className="login-form-card">
          {sent ? (
            <>
              <MailCheck size={44} style={{ color: '#059669', marginBottom: '12px' }} />
              <h2>Check your inbox</h2>
              <p className="login-subtitle">
                If an account exists for <strong>{email}</strong>, a reset link is on its way.
                It expires in about an hour.
              </p>
              <Link to="/" className="login-btn" style={{ display: 'block', textAlign: 'center', textDecoration: 'none', marginTop: '20px' }}>
                Back to Sign In
              </Link>
            </>
          ) : (
            <>
              <h2>Reset your password</h2>
              <p className="login-subtitle">We'll email you a secure link.</p>

              <form onSubmit={handleSubmit} className="login-form">
                <div className="form-group">
                  <label>Email Address</label>
                  <input
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoFocus
                  />
                </div>

                {error && <div className="error-msg">{error}</div>}

                <button type="submit" className="login-btn" disabled={loading}>
                  {loading ? <span className="spinner"></span> : 'Send Reset Link'}
                </button>
              </form>

              <Link
                to="/"
                style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', marginTop: '18px', fontSize: '0.88rem', color: '#64748b', textDecoration: 'none' }}
              >
                <ArrowLeft size={15} /> Back to Sign In
              </Link>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default ForgotPasswordPage;
