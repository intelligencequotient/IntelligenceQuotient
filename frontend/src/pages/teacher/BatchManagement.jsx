import React, { useState, useEffect, useCallback } from 'react';
import {
  Plus, Users as UsersIcon, Calendar, Search, X, ChevronRight, ChevronDown,
  Trash2, UserPlus, Pencil,
} from 'lucide-react';
import { apiClient } from '../../api/client';
import './BatchManagement.css';

const SUBJECTS = ['All', 'Physics', 'Chemistry', 'Mathematics', 'Biology'];

/**
 * Batch management.
 *
 * This page used to read `batch.status`, `batch.studentCount` and
 * `batch.startDate` — none of which the API returns — so it threw a TypeError as
 * soon as a real batch existed. Every handler was also local-state only.
 * It now uses the /batches endpoints and the fields they actually return.
 */
const BatchManagement = () => {
  const [batches, setBatches] = useState([]);
  const [allStudents, setAllStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState({ msg: '', type: 'ok' });

  const [expanded, setExpanded] = useState(null);
  const [roster, setRoster] = useState({});      // batchId -> student rows
  const [rosterLoading, setRosterLoading] = useState(false);
  const [studentSearch, setStudentSearch] = useState('');

  const [modal, setModal] = useState(null);      // null | 'create' | batch object
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: '', subject_focus: 'All' });

  const [addingTo, setAddingTo] = useState(null);
  const [addStudentId, setAddStudentId] = useState('');

  const showToast = (msg, type = 'ok') => {
    setToast({ msg, type });
    setTimeout(() => setToast({ msg: '', type: 'ok' }), 3500);
  };

  const load = useCallback(async () => {
    setLoading(true);
    const [batchRes, studentRes] = await Promise.allSettled([
      apiClient.get('/batches'),
      apiClient.get('/users/students'),
    ]);

    if (batchRes.status === 'fulfilled') setBatches(batchRes.value || []);
    else showToast(batchRes.reason?.message || 'Could not load batches', 'error');

    if (studentRes.status === 'fulfilled') setAllStudents(studentRes.value || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  /** Supabase returns the aggregate as `batch_students: [{ count: n }]`. */
  const studentCount = (batch) => {
    const agg = batch.batch_students;
    if (Array.isArray(agg)) return agg[0]?.count ?? agg.length ?? 0;
    return 0;
  };

  const toggleExpand = async (batchId) => {
    setStudentSearch('');

    if (expanded === batchId) {
      setExpanded(null);
      return;
    }
    setExpanded(batchId);

    if (roster[batchId]) return; // already fetched

    setRosterLoading(true);
    try {
      const rows = await apiClient.get(`/batches/${batchId}/students`);
      setRoster((prev) => ({ ...prev, [batchId]: rows || [] }));
    } catch (e) {
      showToast(e.message || 'Could not load students', 'error');
      setRoster((prev) => ({ ...prev, [batchId]: [] }));
    } finally {
      setRosterLoading(false);
    }
  };

  const openCreate = () => {
    setForm({ name: '', subject_focus: 'All' });
    setModal('create');
  };

  const openEdit = (batch) => {
    setForm({ name: batch.name, subject_focus: batch.subject_focus || 'All' });
    setModal(batch);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return showToast('Batch name is required', 'error');

    setSaving(true);
    try {
      if (modal === 'create') {
        await apiClient.post('/batches', {
          name: form.name.trim(),
          subject_focus: form.subject_focus,
        });
        showToast('Batch created.');
      } else {
        await apiClient.patch(`/batches/${modal.id}`, {
          name: form.name.trim(),
          subject_focus: form.subject_focus,
        });
        showToast('Batch updated.');
      }
      setModal(null);
      load();
    } catch (err) {
      showToast(err.message || 'Save failed', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteBatch = async (batch) => {
    if (!window.confirm(`Delete "${batch.name}"? Students will be unassigned.`)) return;
    try {
      await apiClient.delete(`/batches/${batch.id}`);
      showToast('Batch deleted.');
      setExpanded(null);
      load();
    } catch (e) {
      showToast(e.message || 'Delete failed', 'error');
    }
  };

  const handleAddStudent = async (batchId) => {
    if (!addStudentId) return;
    try {
      await apiClient.post(`/batches/${batchId}/students`, { student_id: addStudentId });
      const rows = await apiClient.get(`/batches/${batchId}/students`);
      setRoster((prev) => ({ ...prev, [batchId]: rows || [] }));
      setAddStudentId('');
      setAddingTo(null);
      showToast('Student added to batch.');
      load();
    } catch (e) {
      showToast(e.message || 'Could not add student', 'error');
    }
  };

  const handleRemoveStudent = async (batchId, studentId) => {
    try {
      await apiClient.delete(`/batches/${batchId}/students/${studentId}`);
      setRoster((prev) => ({
        ...prev,
        [batchId]: (prev[batchId] || []).filter((r) => r.student_id !== studentId),
      }));
      showToast('Student removed from batch.');
      load();
    } catch (e) {
      showToast(e.message || 'Could not remove student', 'error');
    }
  };

  /** Students not already in this batch, for the add dropdown. */
  const availableStudents = (batchId) => {
    const enrolled = new Set((roster[batchId] || []).map((r) => r.student_id));
    return allStudents.filter((s) => !enrolled.has(s.id));
  };

  return (
    <div className="batch-management">
      {toast.msg && <div className={`toast-notification ${toast.type === 'error' ? 'bm-toast-error' : ''}`}>{toast.msg}</div>}

      <header className="page-header d-flex justify-between align-center">
        <div>
          <h1>Batch Management</h1>
          <p>Organize and manage your student cohorts.</p>
        </div>
        <button className="btn-primary" onClick={openCreate}>
          <Plus size={18} /> Create New Batch
        </button>
      </header>

      {loading ? (
        <p className="bm-muted">Loading batches…</p>
      ) : batches.length === 0 ? (
        <div className="bm-empty">
          <UsersIcon size={38} />
          <p>No batches yet. Create one to start grouping students.</p>
        </div>
      ) : (
        <div className="batch-grid">
          {batches.map((batch) => (
            <div key={batch.id} className="batch-card">
              <div className="batch-card-header">
                <span className="batch-status-badge active">
                  <span className="dot" />{batch.subject_focus || 'All subjects'}
                </span>
                <div className="bm-card-actions">
                  <button className="icon-btn" title="Edit batch" onClick={() => openEdit(batch)}>
                    <Pencil size={16} />
                  </button>
                  <button className="icon-btn bm-danger" title="Delete batch" onClick={() => handleDeleteBatch(batch)}>
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>

              <h2 className="batch-name">{batch.name}</h2>

              <div className="batch-meta">
                <div className="meta-item">
                  <UsersIcon size={16} />
                  <span>{studentCount(batch)} Students</span>
                </div>
                <div className="meta-item">
                  <Calendar size={16} />
                  <span>Created {new Date(batch.created_at).toLocaleDateString()}</span>
                </div>
              </div>

              <div className="batch-actions">
                <button className="manage-students-btn" onClick={() => toggleExpand(batch.id)}>
                  <span>Manage Students</span>
                  {expanded === batch.id ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                </button>
              </div>

              {expanded === batch.id && (
                <div className="expanded-student-manager">
                  <div className="manager-search">
                    <Search size={16} />
                    <input
                      type="text"
                      placeholder="Search enrolled students…"
                      value={studentSearch}
                      onChange={(e) => setStudentSearch(e.target.value)}
                    />
                  </div>

                  {rosterLoading && !roster[batch.id] ? (
                    <p className="bm-muted bm-small">Loading…</p>
                  ) : (
                    <ul className="enrolled-students">
                      {(roster[batch.id] || [])
                        .filter((r) =>
                          (r.users?.full_name || '').toLowerCase().includes(studentSearch.toLowerCase()),
                        )
                        .map((r) => (
                          <li key={r.student_id}>
                            <span>
                              {r.users?.full_name || 'Unknown'}
                              <span className="bm-muted bm-small"> · {r.users?.email}</span>
                            </span>
                            <button
                              className="remove-btn"
                              title="Remove from batch"
                              onClick={() => handleRemoveStudent(batch.id, r.student_id)}
                            >
                              <X size={14} />
                            </button>
                          </li>
                        ))}
                      {(roster[batch.id] || []).length === 0 && (
                        <li className="bm-muted">No students in this batch yet.</li>
                      )}
                    </ul>
                  )}

                  {addingTo === batch.id ? (
                    <div className="bm-add-row">
                      <select value={addStudentId} onChange={(e) => setAddStudentId(e.target.value)}>
                        <option value="">Select a student…</option>
                        {availableStudents(batch.id).map((s) => (
                          <option key={s.id} value={s.id}>{s.full_name} — {s.email}</option>
                        ))}
                      </select>
                      <button className="btn-primary bm-sm" disabled={!addStudentId} onClick={() => handleAddStudent(batch.id)}>
                        Add
                      </button>
                      <button className="bm-ghost bm-sm" onClick={() => { setAddingTo(null); setAddStudentId(''); }}>
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button className="bm-ghost bm-add-btn" onClick={() => setAddingTo(batch.id)}>
                      <UserPlus size={15} /> Add student
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {modal && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{modal === 'create' ? 'Create New Batch' : 'Edit Batch'}</h2>
              <button className="close-btn" onClick={() => setModal(null)}><X size={20} /></button>
            </div>
            <form className="batch-form" onSubmit={handleSave}>
              <div className="form-group">
                <label>Batch Name</label>
                <input
                  type="text"
                  placeholder="e.g. Grade 12 Physics — Batch A"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  required
                  autoFocus
                />
              </div>
              <div className="form-group">
                <label>Subject Focus</label>
                <select
                  value={form.subject_focus}
                  onChange={(e) => setForm({ ...form, subject_focus: e.target.value })}
                >
                  {SUBJECTS.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn-outline" onClick={() => setModal(null)}>Cancel</button>
                <button type="submit" className="btn-primary" disabled={saving}>
                  {saving ? 'Saving…' : modal === 'create' ? 'Create Batch' : 'Save Changes'}
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
