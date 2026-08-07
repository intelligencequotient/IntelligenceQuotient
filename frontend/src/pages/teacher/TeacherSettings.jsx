import React, { useState, useEffect } from 'react';
import { User, Lock, LogOut } from 'lucide-react';
import { apiClient, getStoredUser, passwordProblem } from '../../api/client';
import './TeacherSettings.css';

/**
 * Teacher settings.
 *
 * Profile fields were hardcoded ("Dr. Robert Chen", "r.chen@educommand.edu") and
 * both save handlers just fired a toast without calling anything. Both now hit
 * the real endpoints.
 *
 * The Notifications tab was removed rather than left as decoration — there is no
 * notification system behind it, so a toggle there would be a lie.
 */
const TeacherSettings = () => {
  const [activeTab, setActiveTab] = useState('account');
  const [toast, setToast] = useState({ msg: '', type: 'ok' });

  const [profile, setProfile] = useState({ full_name: '', email: '', role: '', created_at: '' });
  const [loading, setLoading] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);

  const [password, setPassword] = useState({ current: '', newPass: '', confirm: '' });
  const [savingPassword, setSavingPassword] = useState(false);

  const showToast = (msg, type = 'ok') => {
    setToast({ msg, type });
    setTimeout(() => setToast({ msg: '', type: 'ok' }), 3500);
  };

  useEffect(() => {
    apiClient
      .get('/users/profile')
      .then((data) => setProfile(data || {}))
      .catch((e) => showToast(e.message || 'Could not load your profile', 'error'))
      .finally(() => setLoading(false));
  }, []);

  const handleUpdateProfile = async () => {
    if (!profile.full_name?.trim()) return showToast('Name cannot be empty', 'error');

    setSavingProfile(true);
    try {
      const updated = await apiClient.patch('/users/profile', {
        full_name: profile.full_name.trim(),
      });

      // Keep the cached session in step so the sidebar updates without a reload.
      const stored = getStoredUser();
      if (stored) {
        localStorage.setItem('user', JSON.stringify({ ...stored, full_name: updated.full_name }));
      }
      showToast('Profile updated.');
    } catch (e) {
      showToast(e.message || 'Could not update your profile', 'error');
    } finally {
      setSavingProfile(false);
    }
  };

  const handleUpdatePassword = async () => {
    const weak = passwordProblem(password.newPass);
    if (weak) return showToast(weak, 'error');
    if (password.newPass !== password.confirm) return showToast('The two passwords do not match', 'error');

    setSavingPassword(true);
    try {
      await apiClient.patch('/users/profile/password', {
        currentPassword: password.current,
        newPassword: password.newPass,
      });
      showToast('Password updated.');
      setPassword({ current: '', newPass: '', confirm: '' });
    } catch (e) {
      showToast(e.message || 'Could not update your password', 'error');
    } finally {
      setSavingPassword(false);
    }
  };

  return (
    <div className="teacher-settings">
      <header className="page-header">
        <h1>Settings</h1>
        <p>Manage your account and password.</p>
      </header>

      {toast.msg && (
        <div className={`toast-notification ${toast.type === 'error' ? 'ts-toast-error' : ''}`}>
          {toast.msg}
        </div>
      )}

      <div className="settings-tabs">
        <button
          className={`tab-btn ${activeTab === 'account' ? 'active' : ''}`}
          onClick={() => setActiveTab('account')}
        >
          <User size={16} /> Account
        </button>
        <button
          className={`tab-btn ${activeTab === 'password' ? 'active' : ''}`}
          onClick={() => setActiveTab('password')}
        >
          <Lock size={16} /> Password
        </button>
      </div>

      {loading ? (
        <p className="ts-muted">Loading…</p>
      ) : activeTab === 'account' ? (
        <div className="settings-panel">
          <h2>Account Details</h2>

          <div className="form-group">
            <label>Full Name</label>
            <input
              type="text"
              value={profile.full_name || ''}
              onChange={(e) => setProfile({ ...profile, full_name: e.target.value })}
            />
          </div>

          <div className="form-group">
            <label>Email</label>
            {/* Changing the login address is an admin action — read-only here. */}
            <input type="email" value={profile.email || ''} disabled />
            <span className="ts-hint">Contact an admin to change your email address.</span>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Role</label>
              <input type="text" value={profile.role || ''} disabled />
            </div>
            <div className="form-group">
              <label>Member Since</label>
              <input
                type="text"
                value={profile.created_at ? new Date(profile.created_at).toLocaleDateString() : '—'}
                disabled
              />
            </div>
          </div>

          <button className="btn-primary" onClick={handleUpdateProfile} disabled={savingProfile}>
            {savingProfile ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      ) : (
        <div className="settings-panel">
          <h2>Change Password</h2>

          <div className="form-group">
            <label>Current Password</label>
            <input
              type="password"
              value={password.current}
              onChange={(e) => setPassword({ ...password, current: e.target.value })}
              placeholder="Required to confirm it's you"
            />
          </div>

          <div className="form-group">
            <label>New Password</label>
            <input
              type="password"
              value={password.newPass}
              onChange={(e) => setPassword({ ...password, newPass: e.target.value })}
              placeholder="Minimum 6 characters"
            />
          </div>

          <div className="form-group">
            <label>Confirm New Password</label>
            <input
              type="password"
              value={password.confirm}
              onChange={(e) => setPassword({ ...password, confirm: e.target.value })}
            />
          </div>

          <button className="btn-primary" onClick={handleUpdatePassword} disabled={savingPassword}>
            {savingPassword ? 'Updating…' : 'Update Password'}
          </button>

          <div className="ts-signout">
            <button className="ts-signout-btn" onClick={() => apiClient.logout()}>
              <LogOut size={16} /> Sign out of this device
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default TeacherSettings;
