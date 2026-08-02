import React, { useState } from 'react';
import { Shield, Save, Key, User } from 'lucide-react';
import { apiClient } from '../../api/client';

const AdminSettings = () => {
  const userStr = localStorage.getItem('user');
  const user = userStr ? JSON.parse(userStr) : {};

  const [name, setName] = useState(user.full_name || '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState({ msg: '', type: 'ok' });

  const showToast = (msg, type = 'ok') => {
    setToast({ msg, type });
    setTimeout(() => setToast({ msg: '', type: 'ok' }), 3500);
  };

  const handleSaveName = async () => {
    if (!name.trim()) return showToast('Name cannot be empty', 'error');
    setSaving(true);
    try {
      const updated = await apiClient.patch('/users/profile', { full_name: name });
      const stored = JSON.parse(localStorage.getItem('user') || '{}');
      localStorage.setItem('user', JSON.stringify({ ...stored, full_name: updated.full_name }));
      showToast('Name updated successfully!');
    } catch (e) { showToast(e.message || 'Failed to update name', 'error'); }
    finally { setSaving(false); }
  };

  const handleChangePassword = async () => {
    if (!currentPassword || !newPassword) return showToast('Fill in all password fields', 'error');
    if (newPassword !== confirmPassword) return showToast('New passwords do not match', 'error');
    if (newPassword.length < 6) return showToast('Password must be at least 6 characters', 'error');
    setSaving(true);
    try {
      await apiClient.patch('/users/profile/password', { currentPassword, newPassword });
      showToast('Password changed successfully!');
      setCurrentPassword(''); setNewPassword(''); setConfirmPassword('');
    } catch (e) { showToast(e.message || 'Failed to change password', 'error'); }
    finally { setSaving(false); }
  };

  return (
    <div className="admin-page" style={{ maxWidth: 640 }}>
      {toast.msg && <div className={`admin-toast ${toast.type === 'error' ? 'error' : ''}`}>{toast.msg}</div>}

      <div className="admin-page-header">
        <div>
          <h1>Settings</h1>
          <p>Manage your admin profile and security settings.</p>
        </div>
      </div>

      {/* Profile Section */}
      <div className="admin-card" style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(124,58,237,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <User size={18} color="var(--color-admin-purple)" />
          </div>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>Profile Information</h3>
        </div>

        <div className="admin-form-group">
          <label className="admin-form-label">Full Name</label>
          <input className="admin-form-input" placeholder="Your full name" value={name} onChange={e => setName(e.target.value)} />
        </div>
        <div className="admin-form-group">
          <label className="admin-form-label">Email</label>
          <input className="admin-form-input" value={user.email || ''} disabled style={{ opacity: 0.5, cursor: 'not-allowed' }} />
        </div>
        <div className="admin-form-group">
          <label className="admin-form-label">Role</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', background: 'rgba(124,58,237,0.06)', border: '1px solid rgba(124,58,237,0.15)', borderRadius: 8 }}>
            <Shield size={14} color="var(--color-admin-purple)" />
            <span style={{ fontSize: 13.5, color: 'var(--color-admin-purple)', fontWeight: 600 }}>Super Administrator</span>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
          <button className="admin-btn admin-btn-primary" onClick={handleSaveName} disabled={saving}>
            <Save size={15} /> {saving ? 'Saving...' : 'Save Name'}
          </button>
        </div>
      </div>

      {/* Password Section */}
      <div className="admin-card">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(239,68,68,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Key size={18} color="var(--color-danger)" />
          </div>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>Change Password</h3>
        </div>

        <div className="admin-form-group">
          <label className="admin-form-label">Current Password</label>
          <input className="admin-form-input" type="password" placeholder="••••••••" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} />
        </div>
        <div className="admin-form-group">
          <label className="admin-form-label">New Password</label>
          <input className="admin-form-input" type="password" placeholder="Min 6 characters" value={newPassword} onChange={e => setNewPassword(e.target.value)} />
        </div>
        <div className="admin-form-group">
          <label className="admin-form-label">Confirm New Password</label>
          <input className="admin-form-input" type="password" placeholder="Repeat new password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} />
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
          <button className="admin-btn admin-btn-primary" onClick={handleChangePassword} disabled={saving}>
            <Key size={15} /> {saving ? 'Saving...' : 'Change Password'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default AdminSettings;
