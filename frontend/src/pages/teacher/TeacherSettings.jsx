import React, { useState } from 'react';
import { User, Bell, Lock, Image as ImageIcon, SlidersHorizontal } from 'lucide-react';
import './TeacherSettings.css';

const TeacherSettings = () => {
  const [activeTab, setActiveTab] = useState('account');
  const [toast, setToast] = useState('');
  
  // Profile state
  const [profile, setProfile] = useState({
    name: 'Dr. Robert Chen',
    email: 'r.chen@educommand.edu',
    department: 'Advanced Sciences'
  });

  // Prefs state
  const [prefs, setPrefs] = useState({
    newDoubtAlerts: true,
    dailyDigest: false,
    systemUpdates: true,
    weeklyReport: true
  });

  // Password state
  const [password, setPassword] = useState({
    current: '',
    newPass: '',
    confirm: ''
  });

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  };

  const handleUpdateProfile = () => {
    showToast('Profile updated successfully!');
  };

  const handleUpdatePassword = () => {
    if(password.newPass.length < 8) {
      showToast("Password must be at least 8 characters long.");
      return;
    }
    if(password.newPass !== password.confirm) {
      showToast("Passwords do not match.");
      return;
    }
    showToast('Password updated successfully!');
    setPassword({current: '', newPass: '', confirm: ''});
  };

  const handlePrefChange = (key) => {
    setPrefs(prev => ({ ...prev, [key]: !prev[key] }));
    showToast('Preferences updated.');
  };

  return (
    <div className="teacher-settings">
      <header className="page-header">
        <h1>Settings</h1>
        <p>Manage your account preferences and portal settings.</p>
      </header>

      {toast && <div className="toast-notification">{toast}</div>}

      <div className="settings-tabs">
        <button 
          className={`tab-btn ${activeTab === 'account' ? 'active' : ''}`}
          onClick={() => setActiveTab('account')}
        >
          Account
        </button>
        <button 
          className={`tab-btn ${activeTab === 'notifications' ? 'active' : ''}`}
          onClick={() => setActiveTab('notifications')}
        >
          Notifications
        </button>
        <button 
          className={`tab-btn ${activeTab === 'password' ? 'active' : ''}`}
          onClick={() => setActiveTab('password')}
        >
          Password
        </button>
      </div>

      <div className="settings-content">
        {activeTab === 'account' && (
          <div className="settings-panel account-panel fade-in">
            <div className="panel-main">
              <h2>Profile Information</h2>
              <div className="profile-edit-grid">
                <div className="avatar-section">
                  <div className="avatar-preview">
                    <img src="https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=150&h=150&fit=crop" alt="Profile" />
                  </div>
                  <p className="avatar-hint">JPG, GIF or PNG. Max size of 800K</p>
                </div>
                
                <div className="form-fields">
                  <div className="form-group">
                    <label>Full Name</label>
                    <input type="text" value={profile.name} onChange={e => setProfile({...profile, name: e.target.value})} />
                  </div>
                  <div className="form-group">
                    <label>Email Address</label>
                    <input type="email" value={profile.email} onChange={e => setProfile({...profile, email: e.target.value})} />
                  </div>
                  <div className="form-group">
                    <label>Department</label>
                    <input type="text" value={profile.department} onChange={e => setProfile({...profile, department: e.target.value})} />
                    <span className="field-hint">Department changes require admin approval.</span>
                  </div>
                </div>
              </div>
              
              <div className="panel-footer">
                <button className="btn-outline">Cancel</button>
                <button className="btn-primary" onClick={handleUpdateProfile}>Update Profile</button>
              </div>
            </div>

            <div className="quick-preferences">
              <div className="pref-header">
                <h3>Quick Preferences</h3>
                <SlidersHorizontal size={18} />
              </div>
              <div className="pref-list">
                <div className="pref-item">
                  <div className="pref-info">
                    <h4>New Doubt Alerts</h4>
                    <p>Instant push notifications</p>
                  </div>
                  <label className="switch">
                    <input type="checkbox" checked={prefs.newDoubtAlerts} onChange={() => handlePrefChange('newDoubtAlerts')} />
                    <span className="slider round"></span>
                  </label>
                </div>
                <div className="pref-item">
                  <div className="pref-info">
                    <h4>Daily Digest</h4>
                    <p>Batch performance summary</p>
                  </div>
                  <label className="switch">
                    <input type="checkbox" checked={prefs.dailyDigest} onChange={() => handlePrefChange('dailyDigest')} />
                    <span className="slider round"></span>
                  </label>
                </div>
                <div className="pref-item">
                  <div className="pref-info">
                    <h4>System Updates</h4>
                    <p>Maintenance & new features</p>
                  </div>
                  <label className="switch">
                    <input type="checkbox" checked={prefs.systemUpdates} onChange={() => handlePrefChange('systemUpdates')} />
                    <span className="slider round"></span>
                  </label>
                </div>
              </div>
              <button className="btn-link" onClick={() => setActiveTab('notifications')}>Manage all notifications</button>
            </div>
          </div>
        )}

        {activeTab === 'notifications' && (
          <div className="settings-panel fade-in">
            <h2>Notification Preferences</h2>
            <div className="pref-list large">
              <div className="pref-item">
                <div className="pref-info">
                  <h4>New Doubt Alerts</h4>
                  <p>Get notified immediately when a student asks a question in your batch.</p>
                </div>
                <label className="switch">
                  <input type="checkbox" checked={prefs.newDoubtAlerts} onChange={() => handlePrefChange('newDoubtAlerts')} />
                  <span className="slider round"></span>
                </label>
              </div>
              <div className="pref-item">
                <div className="pref-info">
                  <h4>Daily Batch Performance Digest</h4>
                  <p>Receive a morning email summarizing the previous day's cohort activity.</p>
                </div>
                <label className="switch">
                  <input type="checkbox" checked={prefs.dailyDigest} onChange={() => handlePrefChange('dailyDigest')} />
                  <span className="slider round"></span>
                </label>
              </div>
              <div className="pref-item">
                <div className="pref-info">
                  <h4>Weekly Cohort Report</h4>
                  <p>Comprehensive weekly analytics report for all assigned batches.</p>
                </div>
                <label className="switch">
                  <input type="checkbox" checked={prefs.weeklyReport} onChange={() => handlePrefChange('weeklyReport')} />
                  <span className="slider round"></span>
                </label>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'password' && (
          <div className="settings-panel fade-in" style={{ maxWidth: '600px' }}>
            <h2>Change Password</h2>
            <div className="form-group">
              <label>Current Password</label>
              <input type="password" value={password.current} onChange={e => setPassword({...password, current: e.target.value})} />
            </div>
            <div className="form-group">
              <label>New Password</label>
              <input type="password" value={password.newPass} onChange={e => setPassword({...password, newPass: e.target.value})} />
            </div>
            <div className="form-group">
              <label>Confirm New Password</label>
              <input type="password" value={password.confirm} onChange={e => setPassword({...password, confirm: e.target.value})} />
            </div>
            <div className="panel-footer">
              <button className="btn-primary" onClick={handleUpdatePassword}>Update Password</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default TeacherSettings;

