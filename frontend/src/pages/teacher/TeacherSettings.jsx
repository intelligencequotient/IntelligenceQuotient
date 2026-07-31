import React, { useState, useEffect } from 'react';
import { SlidersHorizontal, Loader2 } from 'lucide-react';
import { apiClient } from '../../api/client';
import './TeacherSettings.css';

const initialsOf = (name = '') =>
  name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() || '').join('') || '?';

const TeacherSettings = () => {
  const [activeTab, setActiveTab] = useState('account');
  const [toast, setToast] = useState('');

  const [profile, setProfile] = useState(null);
  const [fullName, setFullName] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Local-only until there's somewhere on the server to persist them
  const [prefs, setPrefs] = useState({
    newDoubtAlerts: true,
    dailyDigest: false,
    systemUpdates: true,
    weeklyReport: true,
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

  const handleUpdateProfile = async () => {
    if (!fullName.trim()) {
      showToast('Name cannot be empty.');
      return;
    }
    setSaving(true);
    try {
      const updated = await apiClient.patch('/users/profile', { full_name: fullName.trim() });
      setProfile(updated);

      try {
        const cached = JSON.parse(localStorage.getItem('user') || '{}');
        localStorage.setItem('user', JSON.stringify({ ...cached, full_name: fullName.trim() }));
        window.dispatchEvent(new Event('storage'));
      } catch {
        /* best effort */
      }

      showToast('Profile updated successfully!');
    } catch (err) {
      showToast(err.message || 'Failed to update profile.');
    } finally {
      setSaving(false);
    }
  };

  const handlePrefChange = (key) => {
    setPrefs((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <div className="teacher-settings">
      <header className="page-header">
        <h1>Settings</h1>
        <p>Manage your account preferences and portal settings.</p>
      </header>

      {toast && <div className="toast-notification">{toast}</div>}
      {error && <div className="error-alert" style={{ color: '#dc2626', margin: '12px 0' }}>{error}</div>}

      <div className="settings-tabs">
        <button className={`tab-btn ${activeTab === 'account' ? 'active' : ''}`} onClick={() => setActiveTab('account')}>
          Account
        </button>
        <button className={`tab-btn ${activeTab === 'notifications' ? 'active' : ''}`} onClick={() => setActiveTab('notifications')}>
          Notifications
        </button>
        <button className={`tab-btn ${activeTab === 'password' ? 'active' : ''}`} onClick={() => setActiveTab('password')}>
          Password
        </button>
      </div>

      <div className="settings-content">
        {activeTab === 'account' && (
          <div className="settings-panel account-panel fade-in">
            <div className="panel-main">
              <h2>Profile Information</h2>

              {loading ? (
                <p style={{ color: 'var(--text-secondary)' }}>
                  <Loader2 size={16} style={{ verticalAlign: 'middle', marginRight: '6px' }} />
                  Loading profile…
                </p>
              ) : (
                <>
                  <div className="profile-edit-grid">
                    <div className="avatar-section">
                      <div
                        className="avatar-preview"
                        style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: '2rem', fontWeight: 700, background: '#e2e8f0', color: '#475569',
                        }}
                      >
                        {initialsOf(fullName)}
                      </div>
                    </div>

                    <div className="form-fields">
                      <div className="form-group">
                        <label>Full Name</label>
                        <input
                          type="text"
                          value={fullName}
                          onChange={(e) => setFullName(e.target.value)}
                        />
                      </div>
                      <div className="form-group">
                        <label>Email Address</label>
                        <input type="email" value={profile?.email || ''} disabled readOnly />
                        <span className="field-hint">
                          Email is managed by your account provider and can't be changed here.
                        </span>
                      </div>
                      <div className="form-group">
                        <label>Role</label>
                        <input type="text" value={profile?.role || ''} disabled readOnly />
                      </div>
                    </div>
                  </div>

                  <div className="panel-footer">
                    <button
                      className="btn-outline"
                      onClick={() => setFullName(profile?.full_name || '')}
                      disabled={saving}
                    >
                      Cancel
                    </button>
                    <button className="btn-primary" onClick={handleUpdateProfile} disabled={saving}>
                      {saving ? 'Saving…' : 'Update Profile'}
                    </button>
                  </div>
                </>
              )}
            </div>

            <div className="quick-preferences">
              <div className="pref-header">
                <h3>Quick Preferences</h3>
                <SlidersHorizontal size={18} />
              </div>
              <div className="pref-list">
                {[
                  ['newDoubtAlerts', 'New Doubt Alerts', 'Instant push notifications'],
                  ['dailyDigest', 'Daily Digest', 'Batch performance summary'],
                  ['systemUpdates', 'System Updates', 'Maintenance & new features'],
                ].map(([key, title, desc]) => (
                  <div className="pref-item" key={key}>
                    <div className="pref-info">
                      <h4>{title}</h4>
                      <p>{desc}</p>
                    </div>
                    <label className="switch">
                      <input type="checkbox" checked={prefs[key]} onChange={() => handlePrefChange(key)} />
                      <span className="slider round"></span>
                    </label>
                  </div>
                ))}
              </div>
              <button className="btn-link" onClick={() => setActiveTab('notifications')}>
                Manage all notifications
              </button>
            </div>
          </div>
        )}

        {activeTab === 'notifications' && (
          <div className="settings-panel fade-in">
            <h2>Notification Preferences</h2>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '16px' }}>
              These apply to this browser only — server-side delivery isn't wired up yet.
            </p>
            <div className="pref-list large">
              {[
                ['newDoubtAlerts', 'New Doubt Alerts', 'Get notified immediately when a student asks a question in your batch.'],
                ['dailyDigest', 'Daily Batch Performance Digest', "Receive a morning email summarizing the previous day's cohort activity."],
                ['weeklyReport', 'Weekly Cohort Report', 'Comprehensive weekly analytics report for all assigned batches.'],
              ].map(([key, title, desc]) => (
                <div className="pref-item" key={key}>
                  <div className="pref-info">
                    <h4>{title}</h4>
                    <p>{desc}</p>
                  </div>
                  <label className="switch">
                    <input type="checkbox" checked={prefs[key]} onChange={() => handlePrefChange(key)} />
                    <span className="slider round"></span>
                  </label>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'password' && (
          <div className="settings-panel fade-in" style={{ maxWidth: '600px' }}>
            <h2>Change Password</h2>
            <p style={{ color: 'var(--text-secondary)' }}>
              Password changes aren't available yet — this needs a backend endpoint that
              re-authenticates the user against Supabase Auth before updating the credential.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default TeacherSettings;
