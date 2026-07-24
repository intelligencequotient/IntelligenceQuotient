import React, { useState } from 'react';
import { User, Bell, Shield, Palette } from 'lucide-react';
import './Settings.css';

const Settings = () => {
  const tokenString = localStorage.getItem('mock_token');
  const initialUser = tokenString ? JSON.parse(tokenString) : { name: 'Alex Carter', email: 'alex.carter@example.com', role: 'student' };
  
  const [profile, setProfile] = useState({
    firstName: initialUser.name?.split(' ')[0] || '',
    lastName: initialUser.name?.split(' ')[1] || '',
    email: initialUser.email || '',
    phone: '+1 (555) 000-0000',
    grade: '12'
  });

  const [activeTab, setActiveTab] = useState('profile');
  const [notifications, setNotifications] = useState({
    email: true,
    sms: false,
    app: true,
    marketing: false
  });

  const toggleNotification = (key) => {
    setNotifications(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const [toast, setToast] = useState('');
  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  };

  const handleProfileChange = (e) => {
    setProfile({ ...profile, [e.target.name]: e.target.value });
  };

  const handleSaveProfile = () => {
    const fullName = `${profile.firstName} ${profile.lastName}`.trim();
    const updatedUser = { ...initialUser, name: fullName, email: profile.email };
    localStorage.setItem('mock_token', JSON.stringify(updatedUser));
    showToast('Profile updated successfully!');
    // trigger a reload to update sidebar or we can just rely on state
    window.dispatchEvent(new Event('storage'));
  };

  return (
    <div className="settings-container">
      {toast && <div className="toast-notification">{toast}</div>}
      <div className="settings-header">
        <h1>Settings</h1>
        <p>Manage your account preferences and personal information.</p>
      </div>

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
            <>
              <div className="settings-section-title">Profile Information</div>
              
              <div className="profile-avatar-section">
                <div className="avatar-large">{profile.firstName[0]}{profile.lastName[0]}</div>
                <div className="avatar-actions">
                  <button className="btn btn-outline-primary">Change Picture</button>
                  <button className="btn" style={{ color: 'var(--text-secondary)' }}>Remove</button>
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">First Name</label>
                  <input type="text" className="form-control" name="firstName" value={profile.firstName} onChange={handleProfileChange} />
                </div>
                <div className="form-group">
                  <label className="form-label">Last Name</label>
                  <input type="text" className="form-control" name="lastName" value={profile.lastName} onChange={handleProfileChange} />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Email Address</label>
                <input type="email" className="form-control" name="email" value={profile.email} onChange={handleProfileChange} />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Phone Number</label>
                  <input type="tel" className="form-control" name="phone" value={profile.phone} onChange={handleProfileChange} />
                </div>
                <div className="form-group">
                  <label className="form-label">Grade / Class</label>
                  <select className="form-control" name="grade" value={profile.grade} onChange={handleProfileChange}>
                    <option value="11">Class 11</option>
                    <option value="12">Class 12</option>
                    <option value="dropper">Dropper</option>
                  </select>
                </div>
              </div>

              <div className="settings-footer">
                <button className="btn btn-outline-primary" onClick={() => {
                  setProfile({
                    firstName: initialUser.name?.split(' ')[0] || '',
                    lastName: initialUser.name?.split(' ')[1] || '',
                    email: initialUser.email || '',
                    phone: '+1 (555) 000-0000',
                    grade: '12'
                  });
                }}>Discard Changes</button>
                <button className="btn btn-primary" onClick={handleSaveProfile}>Save Changes</button>
              </div>
            </>
          )}

          {activeTab === 'notifications' && (
            <>
              <div className="settings-section-title">Notification Preferences</div>
              
              <div className="toggle-row">
                <div className="toggle-info">
                  <h4>Email Notifications</h4>
                  <p>Receive updates about your test scores and reports via email.</p>
                </div>
                <div className={`toggle-switch ${notifications.email ? 'active' : ''}`} onClick={() => toggleNotification('email')}>
                  <div className="toggle-knob"></div>
                </div>
              </div>

              <div className="toggle-row">
                <div className="toggle-info">
                  <h4>Push Notifications</h4>
                  <p>Get real-time alerts when a teacher answers your live doubt.</p>
                </div>
                <div className={`toggle-switch ${notifications.app ? 'active' : ''}`} onClick={() => toggleNotification('app')}>
                  <div className="toggle-knob"></div>
                </div>
              </div>

              <div className="toggle-row">
                <div className="toggle-info">
                  <h4>SMS Alerts</h4>
                  <p>Receive text messages for upcoming scheduled exams.</p>
                </div>
                <div className={`toggle-switch ${notifications.sms ? 'active' : ''}`} onClick={() => toggleNotification('sms')}>
                  <div className="toggle-knob"></div>
                </div>
              </div>

              <div className="toggle-row">
                <div className="toggle-info">
                  <h4>Marketing Updates</h4>
                  <p>Receive news about new features, courses, and offers.</p>
                </div>
                <div className={`toggle-switch ${notifications.marketing ? 'active' : ''}`} onClick={() => toggleNotification('marketing')}>
                  <div className="toggle-knob"></div>
                </div>
              </div>

              <div className="settings-footer">
                <button className="btn btn-primary" onClick={() => showToast('Preferences Saved!')}>Save Preferences</button>
              </div>
            </>
          )}

          {(activeTab === 'security' || activeTab === 'appearance') && (
            <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-secondary)' }}>
              <h3>Coming Soon</h3>
              <p>This section is under development.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Settings;
