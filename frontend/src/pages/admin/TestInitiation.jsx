import React, { useState, useEffect, useCallback } from 'react';
import { Plus, ClipboardList, Trash2, X, CheckCircle, Clock } from 'lucide-react';
import { apiClient } from '../../api/client';

const TestInitiation = () => {
  const [tests, setTests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState({ msg: '', type: 'ok' });

  const [form, setForm] = useState({ title: '', subject: 'Mathematics', duration_minutes: 60, instructions: '' });

  const showToast = (msg, type = 'ok') => {
    setToast({ msg, type });
    setTimeout(() => setToast({ msg: '', type: 'ok' }), 3500);
  };

  const fetchTests = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiClient.get('/tests');
      setTests(data || []);
    } catch { showToast('Failed to load tests', 'error'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchTests(); }, [fetchTests]);

  const handleCreate = async () => {
    if (!form.title.trim()) return showToast('Test title is required', 'error');
    setSaving(true);
    try {
      await apiClient.post('/tests', {
        title: form.title, subject: form.subject,
        duration_minutes: Number(form.duration_minutes),
        instructions: form.instructions, status: 'draft',
      });
      showToast('Test shell created! Teachers can now add questions.');
      setShowModal(false);
      setForm({ title: '', subject: 'Mathematics', duration_minutes: 60, instructions: '' });
      fetchTests();
    } catch (e) { showToast(e.message || 'Failed to create test', 'error'); }
    finally { setSaving(false); }
  };

  const handleDelete = async (test) => {
    if (!window.confirm(`Delete test "${test.title}"?`)) return;
    try {
      await apiClient.delete(`/tests/${test.id}`);
      showToast(`"${test.title}" deleted`);
      fetchTests();
    } catch (e) { showToast(e.message || 'Failed', 'error'); }
  };

  return (
    <div className="admin-page">
      {toast.msg && <div className={`admin-toast ${toast.type === 'error' ? 'error' : ''}`}>{toast.msg}</div>}

      <div className="admin-page-header">
        <div>
          <h1>Test Initiation</h1>
          <p>Create test shells that teachers can pick up and add questions to.</p>
        </div>
        <button className="admin-btn admin-btn-primary" onClick={() => setShowModal(true)}>
          <Plus size={16} /> Initiate Test
        </button>
      </div>

      {/* Info Banner */}
      <div className="admin-info-banner">
        <ClipboardList size={18} />
        <div>
          <div className="admin-info-banner-title">How this works</div>
          <div className="admin-info-banner-body">
            Admin creates a test shell with title, subject, duration and instructions. Teachers then open it in their <strong>Test Constructor</strong>, add questions from the question bank, and publish for students.
          </div>
        </div>
      </div>

      {loading ? (
        <p style={{ color: 'var(--text-secondary)' }}>Loading tests...</p>
      ) : tests.length === 0 ? (
        <div className="admin-empty"><ClipboardList size={40} /><p>No tests yet. Initiate your first one!</p></div>
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Title</th><th>Subject</th><th>Duration</th><th>Status</th><th>Questions</th><th>Created</th><th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {tests.map(t => (
                <tr key={t.id}>
                  <td style={{ fontWeight: 600 }}>{t.title}</td>
                  <td>{t.subject || '—'}</td>
                  <td>{t.duration_minutes ? `${t.duration_minutes} min` : '—'}</td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      {t.status === 'published'
                        ? <CheckCircle size={13} color="#059669" />
                        : <Clock size={13} color="#d97706" />
                      }
                      <span className={`admin-badge admin-badge-${t.status === 'published' ? 'published' : 'draft'}`}>
                        {t.status || 'draft'}
                      </span>
                    </div>
                  </td>
                  <td style={{ color: 'var(--text-secondary)' }}>{t.question_count ?? (t.test_questions?.length ?? '—')}</td>
                  <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                    {t.created_at ? new Date(t.created_at).toLocaleDateString() : '—'}
                  </td>
                  <td>
                    <button className="admin-btn admin-btn-danger" style={{ padding: '6px 10px' }} onClick={() => handleDelete(t)}>
                      <Trash2 size={13} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ padding: '10px 16px', borderTop: '1px solid var(--border-color)', fontSize: 12, color: 'var(--text-secondary)' }}>
            {tests.length} test{tests.length !== 1 ? 's' : ''} total
          </div>
        </div>
      )}

      {/* Create Modal */}
      {showModal && (
        <div className="admin-modal-overlay" onClick={() => setShowModal(false)}>
          <div className="admin-modal" style={{ maxWidth: 520 }} onClick={e => e.stopPropagation()}>
            <div className="admin-modal-header">
              <h2 className="admin-modal-title">Initiate New Test</h2>
              <button className="admin-modal-close" onClick={() => setShowModal(false)}><X size={18} /></button>
            </div>
            <div className="admin-form-group">
              <label className="admin-form-label">Test Title *</label>
              <input className="admin-form-input" placeholder="e.g. JEE Mock Test 1 — Chapter 5" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <div className="admin-form-group">
                <label className="admin-form-label">Subject</label>
                <select className="admin-form-select" value={form.subject} onChange={e => setForm({ ...form, subject: e.target.value })}>
                  <option>Mathematics</option><option>Physics</option><option>Chemistry</option><option>Biology</option><option>Mixed</option>
                </select>
              </div>
              <div className="admin-form-group">
                <label className="admin-form-label">Duration (minutes)</label>
                <input className="admin-form-input" type="number" min={10} max={300} value={form.duration_minutes} onChange={e => setForm({ ...form, duration_minutes: e.target.value })} />
              </div>
            </div>
            <div className="admin-form-group">
              <label className="admin-form-label">Instructions (optional)</label>
              <textarea className="admin-form-input" placeholder="Any special instructions..." value={form.instructions} onChange={e => setForm({ ...form, instructions: e.target.value })} rows={3} style={{ resize: 'vertical' }} />
            </div>
            <div className="admin-modal-footer">
              <button className="admin-btn admin-btn-ghost" onClick={() => setShowModal(false)}>Cancel</button>
              <button className="admin-btn admin-btn-primary" onClick={handleCreate} disabled={saving}>{saving ? 'Creating...' : 'Create Test Shell'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TestInitiation;
