import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Trash2, Users, X, ChevronDown, ChevronUp, UserMinus, UserPlus } from 'lucide-react';
import { apiClient, toList } from '../../api/client';

const AdminBatchManagement = () => {
  const [batches, setBatches] = useState([]);
  const [allStudents, setAllStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(null);
  const [batchStudents, setBatchStudents] = useState({});
  const [toast, setToast] = useState({ msg: '', type: 'ok' });
  const [saving, setSaving] = useState(false);

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showAddStudentModal, setShowAddStudentModal] = useState(null);
  const [newBatch, setNewBatch] = useState({ name: '', subject_focus: '' });
  const [addStudentId, setAddStudentId] = useState('');

  const showToast = (msg, type = 'ok') => {
    setToast({ msg, type });
    setTimeout(() => setToast({ msg: '', type: 'ok' }), 3500);
  };

  const fetchBatches = useCallback(async () => {
    setLoading(true);
    try {
      const [b, s] = await Promise.allSettled([
        apiClient.get('/batches'),
        apiClient.get('/users/students'),
      ]);
      setBatches(b.status === 'fulfilled' ? toList(b.value) : []);
      setAllStudents(s.status === 'fulfilled' ? toList(s.value) : []);
    } catch { showToast('Failed to load batches', 'error'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchBatches(); }, [fetchBatches]);

  const loadBatchStudents = async (batchId) => {
    try {
      const data = await apiClient.get(`/batches/${batchId}/students`);
      setBatchStudents(prev => ({ ...prev, [batchId]: data || [] }));
    } catch {}
  };

  const toggleExpand = (batchId) => {
    if (expanded === batchId) { setExpanded(null); return; }
    setExpanded(batchId);
    if (!batchStudents[batchId]) loadBatchStudents(batchId);
  };

  const handleCreate = async () => {
    if (!newBatch.name.trim()) return showToast('Batch name is required', 'error');
    setSaving(true);
    try {
      await apiClient.post('/batches', newBatch);
      showToast('Batch created!');
      setShowCreateModal(false);
      setNewBatch({ name: '', subject_focus: '' });
      fetchBatches();
    } catch (e) { showToast(e.message || 'Failed to create batch', 'error'); }
    finally { setSaving(false); }
  };

  const handleDeleteBatch = async (batch) => {
    if (!window.confirm(`Delete batch "${batch.name}"?`)) return;
    try {
      await apiClient.delete(`/batches/${batch.id}`);
      showToast(`Batch "${batch.name}" deleted`);
      fetchBatches();
    } catch (e) { showToast(e.message || 'Failed to delete', 'error'); }
  };

  const handleAddStudent = async () => {
    if (!addStudentId) return showToast('Select a student', 'error');
    setSaving(true);
    try {
      await apiClient.post(`/batches/${showAddStudentModal.id}/students`, { student_id: addStudentId });
      showToast('Student added to batch!');
      setShowAddStudentModal(null);
      setAddStudentId('');
      loadBatchStudents(showAddStudentModal.id);
    } catch (e) { showToast(e.message || 'Failed to add student', 'error'); }
    finally { setSaving(false); }
  };

  const handleRemoveStudent = async (batchId, studentId, studentName) => {
    if (!window.confirm(`Remove ${studentName} from this batch?`)) return;
    try {
      await apiClient.delete(`/batches/${batchId}/students/${studentId}`);
      showToast(`${studentName} removed`);
      loadBatchStudents(batchId);
    } catch (e) { showToast(e.message || 'Failed', 'error'); }
  };

  const studentsInBatch = expanded ? (batchStudents[expanded] || []) : [];
  const availableStudents = allStudents.filter(s => !studentsInBatch.some(bs => bs.id === s.id));

  return (
    <div className="admin-page">
      {toast.msg && <div className={`admin-toast ${toast.type === 'error' ? 'error' : ''}`}>{toast.msg}</div>}

      <div className="admin-page-header">
        <div>
          <h1>Batch Management</h1>
          <p>Create and manage student batches across the platform.</p>
        </div>
        <button className="admin-btn admin-btn-primary" onClick={() => setShowCreateModal(true)}>
          <Plus size={16} /> New Batch
        </button>
      </div>

      {loading ? (
        <p style={{ color: 'var(--text-secondary)' }}>Loading...</p>
      ) : batches.length === 0 ? (
        <div className="admin-empty"><Users size={40} /><p>No batches yet. Create one!</p></div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {batches.map(b => {
            const isOpen = expanded === b.id;
            return (
              <div key={b.id} className="admin-card" style={{ padding: 0, overflow: 'hidden' }}>
                <div
                  style={{ padding: '14px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}
                  onClick={() => toggleExpand(b.id)}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 38, height: 38, borderRadius: 10, background: 'rgba(124,58,237,0.10)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Users size={18} color="#7c3aed" />
                    </div>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-primary)' }}>{b.name}</div>
                      {b.subject_focus && <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{b.subject_focus}</div>}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <button
                      className="admin-btn admin-btn-ghost"
                      style={{ padding: '5px 10px', fontSize: 12 }}
                      onClick={e => { e.stopPropagation(); setShowAddStudentModal(b); }}
                    >
                      <UserPlus size={13} /> Add Student
                    </button>
                    <button
                      className="admin-btn admin-btn-danger"
                      style={{ padding: '5px 10px', fontSize: 12 }}
                      onClick={e => { e.stopPropagation(); handleDeleteBatch(b); }}
                    >
                      <Trash2 size={13} />
                    </button>
                    {isOpen ? <ChevronUp size={16} color="var(--text-secondary)" /> : <ChevronDown size={16} color="var(--text-secondary)" />}
                  </div>
                </div>

                {isOpen && (
                  <div style={{ borderTop: '1px solid var(--border-color)', padding: '0 20px 16px' }}>
                    <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.07em', margin: '14px 0 10px' }}>
                      Students ({studentsInBatch.length})
                    </p>
                    {studentsInBatch.length === 0 ? (
                      <p style={{ color: 'var(--text-secondary)', fontSize: 13 }}>No students yet.</p>
                    ) : studentsInBatch.map(s => (
                      <div key={s.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: 'var(--bg-color)', borderRadius: 8, marginBottom: 6 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'rgba(59,130,246,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: '#2563eb' }}>
                            {(s.full_name || s.email || 'S')[0].toUpperCase()}
                          </div>
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{s.full_name}</div>
                            <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{s.email}</div>
                          </div>
                        </div>
                        <button className="admin-btn admin-btn-danger" style={{ padding: '4px 8px', fontSize: 11 }} onClick={() => handleRemoveStudent(b.id, s.id, s.full_name)}>
                          <UserMinus size={12} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Create Batch Modal */}
      {showCreateModal && (
        <div className="admin-modal-overlay" onClick={() => setShowCreateModal(false)}>
          <div className="admin-modal" style={{ maxWidth: 420 }} onClick={e => e.stopPropagation()}>
            <div className="admin-modal-header">
              <h2 className="admin-modal-title">Create New Batch</h2>
              <button className="admin-modal-close" onClick={() => setShowCreateModal(false)}><X size={18} /></button>
            </div>
            <div className="admin-form-group">
              <label className="admin-form-label">Batch Name</label>
              <input className="admin-form-input" placeholder="e.g. JEE 2026 Batch A" value={newBatch.name} onChange={e => setNewBatch({ ...newBatch, name: e.target.value })} />
            </div>
            <div className="admin-form-group">
              <label className="admin-form-label">Subject Focus (optional)</label>
              <input className="admin-form-input" placeholder="e.g. Physics, Mathematics..." value={newBatch.subject_focus} onChange={e => setNewBatch({ ...newBatch, subject_focus: e.target.value })} />
            </div>
            <div className="admin-modal-footer">
              <button className="admin-btn admin-btn-ghost" onClick={() => setShowCreateModal(false)}>Cancel</button>
              <button className="admin-btn admin-btn-primary" onClick={handleCreate} disabled={saving}>{saving ? 'Creating...' : 'Create Batch'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Add Student Modal */}
      {showAddStudentModal && (
        <div className="admin-modal-overlay" onClick={() => setShowAddStudentModal(null)}>
          <div className="admin-modal" style={{ maxWidth: 420 }} onClick={e => e.stopPropagation()}>
            <div className="admin-modal-header">
              <h2 className="admin-modal-title">Add Student to {showAddStudentModal.name}</h2>
              <button className="admin-modal-close" onClick={() => setShowAddStudentModal(null)}><X size={18} /></button>
            </div>
            <div className="admin-form-group">
              <label className="admin-form-label">Select Student</label>
              <select className="admin-form-select" value={addStudentId} onChange={e => setAddStudentId(e.target.value)}>
                <option value="">— Choose a student —</option>
                {availableStudents.map(s => (
                  <option key={s.id} value={s.id}>{s.full_name} ({s.email})</option>
                ))}
              </select>
            </div>
            <div className="admin-modal-footer">
              <button className="admin-btn admin-btn-ghost" onClick={() => setShowAddStudentModal(null)}>Cancel</button>
              <button className="admin-btn admin-btn-primary" onClick={handleAddStudent} disabled={saving}>{saving ? 'Adding...' : 'Add to Batch'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminBatchManagement;
