import React, { useState, useEffect } from 'react';
import { User, Bell, Shield, Palette, Loader2 } from 'lucide-react';
import { apiClient } from '../api/client';
import './Settings.css';

const Settings = () => {
  const [activeTab, setActiveTab] = useState('profile');
  const [profile, setProfile] = useState(null);
  const [fullName, setFullName] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');

  // Notification prefs are local-only until the backend grows a place to store them
  const [notifications, setNotifications] = useState({
    email: true, sms: false, app: true, marketing: false,
  });

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const me = await apiClient.get('/users/profile');
        if (cancelled) return;
        setProfile(me);
        setFullName(me.full_name || '');
      } catch (err) {
        if (!cancelled) setError(err.message || 'Could not load your profile.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const handleSaveProfile = async () => {
    if (!fullName.trim()) {
      showToast('Name cannot be empty.');
      return;
    }
    setSaving(true);
    try {
      const updated = await apiClient.patch('/users/profile', { full_name: fullName.trim() });
      setProfile(updated);

      // Keep the cached user in sync so the sidebar/header update too
      try {
        const cached = JSON.parse(localStorage.getItem('user') || '{}');
        localStorage.setItem('user', JSON.stringify({ ...cached, full_name: fullName.trim() }));
        window.dispatchEvent(new Event('storage'));
      } catch {
        /* cache refresh is best-effort */
      }

      showToast('Profile updated successfully!');
    } catch (err) {
      showToast(err.message || 'Failed to update profile.');
    } finally {
      setSaving(false);
    }
  };

  const toggleNotification = (key) => {
    setNotifications((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <div className="settings-container">
      {toast && <div className="toast-notification">{toast}</div>}
      <div className="settings-header">
        <h1>Settings</h1>
        <p>Manage your account preferences and personal information.</p>
      </div>

      {error && <div className="error-alert" style={{ color: '#dc2626', margin: '12px 0' }}>{error}</div>}

      <div className="settings-content">
        <div className="settings-sidebar">
          <div className={`settings-tab ${activeTab === 'profile' ? 'active' : ''}`} onClick={() => setActiveTab('profile')}>
            <User size={18} /> My Profile
          </div>
          <div className={`settings-tab ${activeTab === 'notifications' ? 'active' : ''}`} onClick={() => setActiveTab('notifications')}>
            <Bell size={18} /> Notifications
          </div>
          <div className={`settings-tab ${activeTab === 'security' ? 'active' : ''}`} onClick={() => setActiveTab('security')}>
            <Shield size={18} /> Security
          </div>
          <div className={`settings-tab ${activeTab === 'appearance' ? 'active' : ''}`} onClick={() => setActiveTab('appearance')}>
            <Palette size={18} /> Appearance
          </div>
        </div>

        <div className="settings-main">
          {activeTab === 'profile' && (
            loading ? (
              <p style={{ color: 'var(--text-secondary)' }}>
                <Loader2 size={16} style={{ verticalAlign: 'middle', marginRight: '6px' }} />
                Loading profile…
              </p>
            ) : (
              <>
                <div className="settings-section-title">Profile Information</div>

                <div className="profile-avatar-section">
                  <div className="avatar-large">
                    {(fullName || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('')}
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Full Name</label>
                  <input
                    type="text"
                    className="form-control"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Email Address</label>
                  <input type="email" className="form-control" value={profile?.email || ''} disabled readOnly />
                  <small style={{ color: 'var(--text-secondary)' }}>
                    Email is managed by your account provider and can't be changed here.
                  </small>
                </div>

                <div className="form-group">
                  <label className="form-label">Role</label>
                  <input type="text" className="form-control" value={profile?.role || ''} disabled readOnly />
                </div>

                <div className="settings-footer">
                  <button
                    className="btn btn-outline-primary"
                    onClick={() => setFullName(profile?.full_name || '')}
                    disabled={saving}
                  >
                    Discard Changes
                  </button>
                  <button className="btn btn-primary" onClick={handleSaveProfile} disabled={saving}>
                    {saving ? 'Saving…' : 'Save Changes'}
                  </button>
                </div>
              </>
            )
          )}

          {activeTab === 'notifications' && (
            <>
              <div className="settings-section-title">Notification Preferences</div>
              <p style={{ color: 'var(--text-secondary)', marginBottom: '16px' }}>
                These preferences apply to this browser only — server-side delivery isn't wired up yet.
              </p>

              {[
                ['email', 'Email Notifications', 'Receive updates about your test scores and reports via email.'],
                ['app', 'Push Notifications', 'Get real-time alerts when a teacher answers your live doubt.'],
                ['sms', 'SMS Alerts', 'Receive text messages for upcoming scheduled exams.'],
                ['marketing', 'Marketing Updates', 'Receive news about new features, courses, and offers.'],
              ].map(([key, title, desc]) => (
                <div className="toggle-row" key={key}>
                  <div className="toggle-info">
                    <h4>{title}</h4>
                    <p>{desc}</p>
                  </div>
                  <div
                    className={`toggle-switch ${notifications[key] ? 'active' : ''}`}
                    onClick={() => toggleNotification(key)}
                  >
                    <div className="toggle-knob"></div>
                  </div>
                </div>
              ))}
            </>
          )}

          {(activeTab === 'security' || activeTab === 'appearance') && (
            <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-secondary)' }}>
              <h3>Not available yet</h3>
              <p>
                {activeTab === 'security'
                  ? 'Password changes need a backend endpoint that does not exist yet.'
                  : 'Theme options are still in development.'}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Settings;
