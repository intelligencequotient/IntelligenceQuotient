import React, { useState, useEffect, useCallback } from 'react';
import { Search, Plus, Trash2, Key, X, RefreshCw } from 'lucide-react';
import { apiClient } from '../../api/client';

const UserManagement = () => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState('all');
  const [toast, setToast] = useState({ msg: '', type: 'ok' });

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showResetModal, setShowResetModal] = useState(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(null);
  const [saving, setSaving] = useState(false);

  const [newUser, setNewUser] = useState({ full_name: '', email: '', password: '', role: 'student' });
  const [newPassword, setNewPassword] = useState('');

  const showToast = (msg, type = 'ok') => {
    setToast({ msg, type });
    setTimeout(() => setToast({ msg: '', type: 'ok' }), 3500);
  };

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      const data = await apiClient.get(`/users/admin/all?${params.toString()}`);
      setUsers(data || []);
    } catch (e) {
      showToast(e.message || 'Failed to load users', 'error');
    } finally { setLoading(false); }
  }, [search]);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  const tabFilter = activeTab === 'all' ? users : users.filter(u => u.role === activeTab);

  const handleCreate = async () => {
    if (!newUser.full_name || !newUser.email || !newUser.password)
      return showToast('All fields are required', 'error');
    setSaving(true);
    try {
      await apiClient.post('/users/admin/create', newUser);
      showToast(`${newUser.role === 'student' ? 'Student' : 'Teacher'} created successfully!`);
      setShowCreateModal(false);
      setNewUser({ full_name: '', email: '', password: '', role: 'student' });
      fetchUsers();
    } catch (e) { showToast(e.message || 'Failed to create user', 'error'); }
    finally { setSaving(false); }
  };

  const handleResetPassword = async () => {
    if (!newPassword || newPassword.length < 6)
      return showToast('Password must be at least 6 characters', 'error');
    setSaving(true);
    try {
      await apiClient.patch(`/users/admin/${showResetModal.id}/password`, { newPassword });
      showToast(`Password reset for ${showResetModal.full_name}`);
      setShowResetModal(null);
      setNewPassword('');
    } catch (e) { showToast(e.message || 'Failed to reset password', 'error'); }
    finally { setSaving(false); }
  };

  const handleDelete = async () => {
    setSaving(true);
    try {
      await apiClient.delete(`/users/admin/${showDeleteConfirm.id}`);
      showToast(`${showDeleteConfirm.full_name} deleted`);
      setShowDeleteConfirm(null);
      fetchUsers();
    } catch (e) { showToast(e.message || 'Failed to delete user', 'error'); }
    finally { setSaving(false); }
  };

  const roleColor = { student: '#2563eb', teacher: '#059669', admin: '#7c3aed' };
  const roleBg    = { student: 'rgba(59,130,246,0.12)', teacher: 'rgba(16,185,129,0.12)', admin: 'rgba(124,58,237,0.12)' };

  return (
    <div className="admin-page">
      {toast.msg && <div className={`admin-toast ${toast.type === 'error' ? 'error' : ''}`}>{toast.msg}</div>}

      <div className="admin-page-header">
        <div>
          <h1>User Management</h1>
          <p>Create, search, and manage all students &amp; teachers.</p>
        </div>
        <button className="admin-btn admin-btn-primary" id="create-user-btn" onClick={() => setShowCreateModal(true)}>
          <Plus size={16} /> Create User
        </button>
      </div>

      {/* Tabs + Search */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <div className="admin-tabs" style={{ margin: 0 }}>
          {['all', 'student', 'teacher'].map(t => (
            <button key={t} className={`admin-tab ${activeTab === t ? 'active' : ''}`} onClick={() => setActiveTab(t)}>
              {t === 'all' ? 'All Users' : t === 'student' ? 'Students' : 'Teachers'}
            </button>
          ))}
        </div>
        <div className="admin-search-bar">
          <Search size={15} />
          <input id="user-search" placeholder="Search name or email..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <button className="admin-btn admin-btn-ghost" onClick={fetchUsers}>
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Name</th><th>Email</th><th>Role</th><th>Joined</th><th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan="5" style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: 32 }}>Loading...</td></tr>
            ) : tabFilter.length === 0 ? (
              <tr><td colSpan="5" style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: 32 }}>No users found.</td></tr>
            ) : tabFilter.map(u => (
              <tr key={u.id}>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{
                      width: 34, height: 34, borderRadius: '50%', flexShrink: 0,
                      background: roleBg[u.role] || roleBg.student,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontWeight: 700, fontSize: 13,
                      color: roleColor[u.role] || roleColor.student,
                    }}>
                      {(u.full_name || u.email || 'U')[0].toUpperCase()}
                    </div>
                    <span style={{ fontWeight: 600 }}>{u.full_name || '—'}</span>
                  </div>
                </td>
                <td style={{ color: 'var(--text-secondary)' }}>{u.email}</td>
                <td><span className={`admin-badge admin-badge-${u.role}`}>{u.role}</span></td>
                <td style={{ color: 'var(--text-secondary)', fontSize: 12 }}>
                  {u.created_at ? new Date(u.created_at).toLocaleDateString() : '—'}
                </td>
                <td>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button className="admin-btn admin-btn-ghost" style={{ padding: '6px 10px', fontSize: 12 }} onClick={() => setShowResetModal(u)}>
                      <Key size={13} /> Reset PW
                    </button>
                    <button className="admin-btn admin-btn-danger" style={{ padding: '6px 10px', fontSize: 12 }} onClick={() => setShowDeleteConfirm(u)}>
                      <Trash2 size={13} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{ padding: '10px 16px', borderTop: '1px solid var(--border-color)', fontSize: 12, color: 'var(--text-secondary)' }}>
          {tabFilter.length} user{tabFilter.length !== 1 ? 's' : ''}
        </div>
      </div>

      {/* Create User Modal */}
      {showCreateModal && (
        <div className="admin-modal-overlay" onClick={() => setShowCreateModal(false)}>
          <div className="admin-modal" onClick={e => e.stopPropagation()}>
            <div className="admin-modal-header">
              <h2 className="admin-modal-title">Create New User</h2>
              <button className="admin-modal-close" onClick={() => setShowCreateModal(false)}><X size={18} /></button>
            </div>
            <div className="admin-form-group">
              <label className="admin-form-label">Full Name</label>
              <input className="admin-form-input" placeholder="Full Name" value={newUser.full_name} onChange={e => setNewUser({ ...newUser, full_name: e.target.value })} />
            </div>
            <div className="admin-form-group">
              <label className="admin-form-label">Email</label>
              <input className="admin-form-input" type="email" placeholder="email@example.com" value={newUser.email} onChange={e => setNewUser({ ...newUser, email: e.target.value })} />
            </div>
            <div className="admin-form-group">
              <label className="admin-form-label">Password</label>
              <input className="admin-form-input" type="password" placeholder="Min 6 characters" value={newUser.password} onChange={e => setNewUser({ ...newUser, password: e.target.value })} />
            </div>
            <div className="admin-form-group">
              <label className="admin-form-label">Role</label>
              <select className="admin-form-select" value={newUser.role} onChange={e => setNewUser({ ...newUser, role: e.target.value })}>
                <option value="student">Student</option>
                <option value="teacher">Teacher</option>
              </select>
            </div>
            <div className="admin-modal-footer">
              <button className="admin-btn admin-btn-ghost" onClick={() => setShowCreateModal(false)}>Cancel</button>
              <button className="admin-btn admin-btn-primary" onClick={handleCreate} disabled={saving}>{saving ? 'Creating...' : 'Create User'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Reset Password Modal */}
      {showResetModal && (
        <div className="admin-modal-overlay" onClick={() => setShowResetModal(null)}>
          <div className="admin-modal" onClick={e => e.stopPropagation()}>
            <div className="admin-modal-header">
              <h2 className="admin-modal-title">Reset Password</h2>
              <button className="admin-modal-close" onClick={() => setShowResetModal(null)}><X size={18} /></button>
            </div>
            <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginBottom: 16 }}>
              Setting a new password for <strong style={{ color: 'var(--color-admin-purple)' }}>{showResetModal.full_name}</strong>.
            </p>
            <div className="admin-form-group">
              <label className="admin-form-label">New Password</label>
              <input className="admin-form-input" type="password" placeholder="Min 6 characters" value={newPassword} onChange={e => setNewPassword(e.target.value)} />
            </div>
            <div className="admin-modal-footer">
              <button className="admin-btn admin-btn-ghost" onClick={() => setShowResetModal(null)}>Cancel</button>
              <button className="admin-btn admin-btn-primary" onClick={handleResetPassword} disabled={saving}>{saving ? 'Saving...' : 'Reset Password'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirm */}
      {showDeleteConfirm && (
        <div className="admin-modal-overlay" onClick={() => setShowDeleteConfirm(null)}>
          <div className="admin-modal" style={{ maxWidth: 400 }} onClick={e => e.stopPropagation()}>
            <div className="admin-modal-header">
              <h2 className="admin-modal-title">Delete User</h2>
              <button className="admin-modal-close" onClick={() => setShowDeleteConfirm(null)}><X size={18} /></button>
            </div>
            <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginBottom: 16 }}>
              Are you sure you want to permanently delete <strong style={{ color: 'var(--color-danger)' }}>{showDeleteConfirm.full_name}</strong>? This cannot be undone.
            </p>
            <div className="admin-modal-footer">
              <button className="admin-btn admin-btn-ghost" onClick={() => setShowDeleteConfirm(null)}>Cancel</button>
              <button className="admin-btn admin-btn-danger" onClick={handleDelete} disabled={saving}>{saving ? 'Deleting...' : 'Delete User'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default UserManagement;
