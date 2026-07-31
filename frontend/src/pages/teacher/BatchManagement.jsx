import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Users as UsersIcon, Search, X, ChevronRight, ChevronDown, Trash2, Loader2 } from 'lucide-react';
import { apiClient } from '../../api/client';
import './BatchManagement.css';

const SUBJECTS = ['Physics', 'Chemistry', 'Mathematics', 'Biology', 'Mixed'];

const countOf = (batch) => {
  // Supabase returns aggregate counts as [{ count: n }]
  const c = batch.batch_students;
  if (Array.isArray(c)) return c[0]?.count ?? c.length ?? 0;
  return 0;
};

const BatchManagement = () => {
  const [batches, setBatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [expandedBatch, setExpandedBatch] = useState(null);
  const [members, setMembers] = useState([]);        // students in the expanded batch
  const [membersLoading, setMembersLoading] = useState(false);
  const [allStudents, setAllStudents] = useState([]);
  const [studentSearch, setStudentSearch] = useState('');
  const [addSearch, setAddSearch] = useState('');
  const [busy, setBusy] = useState(false);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newBatch, setNewBatch] = useState({ name: '', subject_focus: 'Physics' });
  const [toast, setToast] = useState('');

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  };

  const fetchBatches = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setBatches((await apiClient.get('/batches')) || []);
    } catch (err) {
      setError(err.message || 'Could not load batches.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchBatches(); }, [fetchBatches]);

  useEffect(() => {
    (async () => {
      try {
        setAllStudents((await apiClient.get('/users/students')) || []);
      } catch {
        /* the add-student picker just stays empty */
      }
    })();
  }, []);

  const loadMembers = async (batchId) => {
    setMembersLoading(true);
    try {
      setMembers((await apiClient.get(`/batches/${batchId}/students`)) || []);
    } catch (err) {
      showToast(err.message || 'Could not load batch members.');
      setMembers([]);
    } finally {
      setMembersLoading(false);
    }
  };

  const toggleExpand = async (id) => {
    setStudentSearch('');
    setAddSearch('');
    if (expandedBatch === id) {
      setExpandedBatch(null);
      setMembers([]);
      return;
    }
    setExpandedBatch(id);
    await loadMembers(id);
  };

  const handleCreateBatch = async (e) => {
    e.preventDefault();
    if (!newBatch.name.trim()) return;
    setBusy(true);
    try {
      await apiClient.post('/batches', {
        name: newBatch.name.trim(),
        subject_focus: newBatch.subject_focus,
      });
      setIsModalOpen(false);
      setNewBatch({ name: '', subject_focus: 'Physics' });
      showToast('Batch created.');
      await fetchBatches();
    } catch (err) {
      showToast(err.message || 'Failed to create batch.');
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteBatch = async (batch) => {
    if (!window.confirm(`Delete "${batch.name}"? Students will be unassigned.`)) return;
    setBusy(true);
    try {
      await apiClient.delete(`/batches/${batch.id}`);
      if (expandedBatch === batch.id) { setExpandedBatch(null); setMembers([]); }
      showToast('Batch deleted.');
      await fetchBatches();
    } catch (err) {
      showToast(err.message || 'Failed to delete batch.');
    } finally {
      setBusy(false);
    }
  };

  const handleAddStudent = async (batchId, studentId) => {
    setBusy(true);
    try {
      await apiClient.post(`/batches/${batchId}/students`, { student_id: studentId });
      await loadMembers(batchId);
      await fetchBatches();
      showToast('Student added to batch.');
    } catch (err) {
      showToast(err.message || 'Failed to add student.');
    } finally {
      setBusy(false);
    }
  };

  const handleRemoveStudent = async (batchId, studentId) => {
    setBusy(true);
    try {
      await apiClient.delete(`/batches/${batchId}/students/${studentId}`);
      await loadMembers(batchId);
      await fetchBatches();
      showToast('Student removed from batch.');
    } catch (err) {
      showToast(err.message || 'Failed to remove student.');
    } finally {
      setBusy(false);
    }
  };

  const memberIds = new Set(members.map((m) => m.student_id));
  const visibleMembers = members.filter((m) =>
    (m.users?.full_name || '').toLowerCase().includes(studentSearch.toLowerCase()),
  );
  const addableStudents = allStudents
    .filter((s) => !memberIds.has(s.id))
    .filter((s) => (s.full_name || '').toLowerCase().includes(addSearch.toLowerCase()))
    .slice(0, 8);

  return (
    <div className="batch-management">
      <header className="page-header d-flex justify-between align-center">
        <div>
          <h1>Batch Management</h1>
          <p>Organize and manage your student cohorts.</p>
        </div>
        <button className="btn-primary" onClick={() => setIsModalOpen(true)}>
          <Plus size={18} /> Create New Batch
        </button>
      </header>

      {toast && <div className="toast-notification">{toast}</div>}
      {error && <div className="error-alert" style={{ color: '#dc2626', margin: '12px 0' }}>{error}</div>}

      {loading ? (
        <div style={{ padding: '60px', textAlign: 'center', color: 'var(--text-secondary)' }}>
          <Loader2 size={20} style={{ verticalAlign: 'middle', marginRight: '8px' }} />
          Loading batches…
        </div>
      ) : batches.length === 0 ? (
        <div style={{ padding: '48px', textAlign: 'center', color: 'var(--text-secondary)' }}>
          No batches yet. Create one to start grouping students.
        </div>
      ) : (
        <div className="batch-grid">
          {batches.map((batch) => (
            <div key={batch.id} className="batch-card">
              <div className="batch-card-header">
                <span className="batch-status-badge active">
                  <span className="dot"></span>{batch.subject_focus || 'General'}
                </span>
                <button
                  className="icon-btn"
                  title="Delete batch"
                  disabled={busy}
                  onClick={() => handleDeleteBatch(batch)}
                >
                  <Trash2 size={16} />
                </button>
              </div>

              <h2 className="batch-name">{batch.name}</h2>

              <div className="batch-meta">
                <div className="meta-item">
                  <UsersIcon size={16} />
                  <span>{countOf(batch)} Students</span>
                </div>
              </div>

              <div className="batch-actions">
                <button className="manage-students-btn" onClick={() => toggleExpand(batch.id)}>
                  <span>Manage Students</span>
                  {expandedBatch === batch.id ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                </button>
              </div>

              {expandedBatch === batch.id && (
                <div className="expanded-student-manager">
                  <div className="manager-search">
                    <Search size={16} />
                    <input
                      type="text"
                      placeholder="Search enrolled students..."
                      value={studentSearch}
                      onChange={(e) => setStudentSearch(e.target.value)}
                    />
                  </div>

                  {membersLoading ? (
                    <p style={{ color: 'var(--text-secondary)', padding: '8px 0' }}>Loading…</p>
                  ) : (
                    <ul className="enrolled-students">
                      {visibleMembers.length === 0 && (
                        <li style={{ color: 'var(--text-secondary)', padding: '8px 0' }}>
                          No students enrolled.
                        </li>
                      )}
                      {visibleMembers.map((m) => (
                        <li key={m.student_id}>
                          <span>{m.users?.full_name || m.student_id}</span>
                          <button
                            className="remove-btn"
                            disabled={busy}
                            onClick={() => handleRemoveStudent(batch.id, m.student_id)}
                          >
                            <X size={14} />
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}

                  <div className="manager-search" style={{ marginTop: '12px' }}>
                    <Plus size={16} />
                    <input
                      type="text"
                      placeholder="Add a student by name..."
                      value={addSearch}
                      onChange={(e) => setAddSearch(e.target.value)}
                    />
                  </div>

                  {addSearch && (
                    <ul className="enrolled-students">
                      {addableStudents.length === 0 && (
                        <li style={{ color: 'var(--text-secondary)', padding: '8px 0' }}>
                          No matching students.
                        </li>
                      )}
                      {addableStudents.map((s) => (
                        <li key={s.id}>
                          <span>{s.full_name}</span>
                          <button
                            className="manage-students-btn"
                            style={{ padding: '2px 10px', fontSize: '0.8rem' }}
                            disabled={busy}
                            onClick={() => handleAddStudent(batch.id, s.id)}
                          >
                            Add
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {isModalOpen && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h2>Create New Batch</h2>
              <button className="close-btn" onClick={() => setIsModalOpen(false)}><X size={20} /></button>
            </div>
            <form className="batch-form" onSubmit={handleCreateBatch}>
              <div className="form-group">
                <label>Batch Name</label>
                <input
                  type="text"
                  placeholder="e.g. Grade 12 Physics - Batch A"
                  value={newBatch.name}
                  onChange={(e) => setNewBatch({ ...newBatch, name: e.target.value })}
                  required
                />
              </div>
              <div className="form-group">
                <label>Subject Focus</label>
                <select
                  value={newBatch.subject_focus}
                  onChange={(e) => setNewBatch({ ...newBatch, subject_focus: e.target.value })}
                >
                  {SUBJECTS.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn-outline" onClick={() => setIsModalOpen(false)}>Cancel</button>
                <button type="submit" className="btn-primary" disabled={busy}>
                  {busy ? 'Creating…' : 'Create Batch'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default BatchManagement;
