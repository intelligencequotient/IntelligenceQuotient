import React, { useState, useEffect, useCallback } from 'react';
import { Search, Plus, Edit, Copy, Trash2, X, Loader2, ChevronLeft, ChevronRight } from 'lucide-react';
import { apiClient } from '../../api/client';
import { useAppData } from '../../context/AppDataContext';
import './QuestionBank.css';

const SUBJECTS = ['Physics', 'Chemistry', 'Mathematics', 'Biology'];

const DIFFICULTIES = [
  { value: 'easy', label: 'Easy' },
  { value: 'medium', label: 'Medium' },
  { value: 'hard', label: 'Hard' },
];

const Q_TYPES = [
  { value: 'single_correct', label: 'Single Choice' },
  { value: 'multi_correct', label: 'Multiple Choice' },
  { value: 'numerical', label: 'Numerical' },
];

const PAGE_SIZE = 20;

const emptyForm = {
  subject: 'Physics',
  topic: '',
  difficulty: 'medium',
  q_type: 'single_correct',
  question_text: '',
  options: ['', '', '', ''],
  correctIndex: 0,
  marks: 4,
};

/** Turn a DB row into the shape the edit form expects. */
const rowToForm = (q) => ({
  subject: q.subject || 'Physics',
  topic: q.topic || '',
  difficulty: (q.difficulty || 'medium').toLowerCase(),
  q_type: q.q_type || 'single_correct',
  question_text: q.question_text || '',
  options: Array.isArray(q.options) && q.options.length
    ? [...q.options, '', '', '', ''].slice(0, 4)
    : ['', '', '', ''],
  correctIndex: q.correct_answer?.index ?? 0,
  marks: q.marks ?? 4,
});

/** Turn the form back into a DB payload. */
const formToPayload = (form) => ({
  subject: form.subject,
  topic: form.topic || null,
  difficulty: form.difficulty,
  q_type: form.q_type,
  question_text: form.question_text.trim(),
  options: form.options,
  correct_answer: { index: form.correctIndex },
  marks: Number(form.marks) || 4,
});

const prettyDifficulty = (d) =>
  d ? d.charAt(0).toUpperCase() + d.slice(1).toLowerCase() : 'Medium';

const prettyType = (t) => Q_TYPES.find((x) => x.value === t)?.label || t || '—';

const QuestionBank = () => {
  const { setQuestions: setGlobalQuestions } = useAppData();

  // Server-driven list state
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  // Filters
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [subjectFilter, setSubjectFilter] = useState('');
  const [difficultyFilter, setDifficultyFilter] = useState('');

  // Modal / form
  const [modalMode, setModalMode] = useState(null); // 'create' | 'edit' | null
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const [busyRowId, setBusyRowId] = useState(null);
  const [toast, setToast] = useState('');
  const [enlargedImage, setEnlargedImage] = useState(null);

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  };

  // Debounce the search box so we don't hammer the API on every keystroke
  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
    }, 400);
    return () => clearTimeout(t);
  }, [searchInput]);

  const fetchQuestions = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
      if (search) params.set('search', search);
      if (subjectFilter) params.set('subject', subjectFilter);
      if (difficultyFilter) params.set('difficulty', difficultyFilter);

      const res = await apiClient.get(`/questions?${params.toString()}`);
      const data = res?.data || [];
      setRows(data);
      setTotal(res?.total ?? data.length);
      // Keep the shared context roughly in sync for other pages
      setGlobalQuestions(data);
    } catch (err) {
      setLoadError(err.message || 'Failed to load questions');
      setRows([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [page, search, subjectFilter, difficultyFilter, setGlobalQuestions]);

  useEffect(() => {
    fetchQuestions();
  }, [fetchQuestions]);

  // ─── Mutations ────────────────────────────────────────────────────────────

  const openCreate = () => {
    setForm(emptyForm);
    setEditingId(null);
    setFormError('');
    setModalMode('create');
  };

  const openEdit = (q) => {
    setForm(rowToForm(q));
    setEditingId(q.id);
    setFormError('');
    setModalMode('edit');
  };

  const closeModal = () => {
    setModalMode(null);
    setEditingId(null);
    setFormError('');
  };

  const handleSave = async () => {
    if (!form.question_text.trim()) {
      setFormError('Question content is required.');
      return;
    }
    setSaving(true);
    setFormError('');
    try {
      const payload = formToPayload(form);
      if (modalMode === 'edit') {
        await apiClient.patch(`/questions/${editingId}`, payload);
        showToast('Question updated.');
      } else {
        await apiClient.post('/questions', payload);
        showToast('Question added.');
      }
      closeModal();
      await fetchQuestions();
    } catch (err) {
      setFormError(err.message || 'Failed to save question.');
    } finally {
      setSaving(false);
    }
  };

  const handleDuplicate = async (q) => {
    setBusyRowId(q.id);
    try {
      await apiClient.post(`/questions/${q.id}/duplicate`);
      showToast('Question duplicated.');
      await fetchQuestions();
    } catch (err) {
      showToast(err.message || 'Failed to duplicate.');
    } finally {
      setBusyRowId(null);
    }
  };

  const handleDelete = async (q) => {
    if (!window.confirm('Delete this question? It will be removed from the bank.')) return;
    setBusyRowId(q.id);
    try {
      await apiClient.delete(`/questions/${q.id}`);
      showToast('Question deleted.');
      // If we just emptied the last page, step back one
      if (rows.length === 1 && page > 1) setPage((p) => p - 1);
      else await fetchQuestions();
    } catch (err) {
      showToast(err.message || 'Failed to delete.');
    } finally {
      setBusyRowId(null);
    }
  };

  // ─── Derived ──────────────────────────────────────────────────────────────

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const rangeStart = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(page * PAGE_SIZE, total);

  const renderAnswer = (q) => {
    if (q.correct_answer?.value !== undefined) return q.correct_answer.value;
    const idx = q.correct_answer?.index;
    if (idx === undefined || idx === null) return 'N/A';
    const opt = Array.isArray(q.options) ? q.options[idx] : undefined;
    return opt || ['A', 'B', 'C', 'D'][idx] || 'N/A';
  };

  return (
    <div className="question-bank">
      <header className="page-header d-flex justify-between align-center">
        <div>
          <h1>Question Bank</h1>
          <p>Manage and organize your assessment items.</p>
        </div>
        <button className="btn-primary" onClick={openCreate}>
          <Plus size={18} /> Add New Question
        </button>
      </header>

      {toast && <div className="toast-notification">{toast}</div>}

      <div className="bank-controls">
        <div className="search-bar">
          <Search size={20} className="search-icon" />
          <input
            type="text"
            placeholder="Search questions..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
        </div>
        <div className="filters">
          <select
            className="filter-select"
            value={subjectFilter}
            onChange={(e) => { setSubjectFilter(e.target.value); setPage(1); }}
          >
            <option value="">All Subjects</option>
            {SUBJECTS.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <select
            className="filter-select"
            value={difficultyFilter}
            onChange={(e) => { setDifficultyFilter(e.target.value); setPage(1); }}
          >
            <option value="">All Difficulties</option>
            {DIFFICULTIES.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
          </select>
        </div>
      </div>

      {loadError && (
        <div className="error-alert" style={{ color: '#dc2626', margin: '12px 0' }}>{loadError}</div>
      )}

      <div className="table-container">
        <table className="bank-table">
          <thead>
            <tr>
              <th className="preview-col">Question Preview</th>
              <th>Subject</th>
              <th>Topic</th>
              <th>Type</th>
              <th>Difficulty</th>
              <th>Answer</th>
              <th className="actions-col">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan="7" style={{ textAlign: 'center', padding: '32px', color: 'var(--text-secondary)' }}>
                  <Loader2 size={20} style={{ verticalAlign: 'middle', marginRight: '8px' }} /> Loading questions…
                </td>
              </tr>
            )}

            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan="7" style={{ textAlign: 'center', padding: '24px', color: 'var(--text-secondary)' }}>
                  No questions match your filters.
                </td>
              </tr>
            )}

            {!loading && rows.map((q) => (
              <tr key={q.id} style={{ opacity: busyRowId === q.id ? 0.5 : 1 }}>
                <td className="preview-col">
                  {q.image_url ? (
                    <img
                      src={q.image_url}
                      alt="Question Preview"
                      onClick={() => setEnlargedImage(q.image_url)}
                      style={{ width: '100%', maxWidth: '500px', maxHeight: '350px', objectFit: 'contain', display: 'block', margin: '8px 0', borderRadius: '6px', border: '1px solid #e2e8f0', backgroundColor: '#fff', padding: '4px', cursor: 'zoom-in' }}
                    />
                  ) : (
                    <p className="q-preview-text" style={{ fontSize: '0.85rem', maxWidth: '400px' }}>
                      {q.question_text || 'No content provided.'}
                    </p>
                  )}
                </td>
                <td>{q.subject}</td>
                <td>{q.topic || 'General'}</td>
                <td>{prettyType(q.q_type)}</td>
                <td><span className={`diff-badge ${(q.difficulty || 'medium').toLowerCase()}`}>{prettyDifficulty(q.difficulty)}</span></td>
                <td>
                  <strong style={{ color: 'var(--primary-color)' }}>{renderAnswer(q)}</strong>
                </td>
                <td className="actions-col">
                  <div className="row-actions">
                    <button className="action-btn" title="Edit" disabled={busyRowId === q.id} onClick={() => openEdit(q)}>
                      <Edit size={16} />
                    </button>
                    <button className="action-btn" title="Duplicate" disabled={busyRowId === q.id} onClick={() => handleDuplicate(q)}>
                      <Copy size={16} />
                    </button>
                    <button className="action-btn danger" title="Delete" disabled={busyRowId === q.id} onClick={() => handleDelete(q)}>
                      <Trash2 size={16} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="table-footer">
          <span>
            {total === 0 ? 'No results' : `Showing ${rangeStart}–${rangeEnd} of ${total}`}
          </span>
          <div className="pagination">
            <button
              className={`page-btn ${page <= 1 ? 'disabled' : ''}`}
              disabled={page <= 1 || loading}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              <ChevronLeft size={16} />
            </button>
            <span style={{ padding: '0 10px', alignSelf: 'center' }}>Page {page} of {totalPages}</span>
            <button
              className={`page-btn ${page >= totalPages ? 'disabled' : ''}`}
              disabled={page >= totalPages || loading}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </div>

      {modalMode && (
        <div className="modal-overlay">
          <div className="modal-content large">
            <div className="modal-header">
              <h2>{modalMode === 'edit' ? 'Edit Question' : 'Add New Question'}</h2>
              <button className="close-btn" onClick={closeModal}><X size={20} /></button>
            </div>

            <div className="modal-body">
              {formError && (
                <div className="error-alert" style={{ color: '#dc2626', marginBottom: '12px' }}>{formError}</div>
              )}

              <div className="form-row">
                <div className="form-group flex-1">
                  <label>Subject</label>
                  <select value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })}>
                    {SUBJECTS.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div className="form-group flex-1">
                  <label>Topic</label>
                  <input
                    type="text"
                    placeholder="e.g. Thermodynamics"
                    value={form.topic}
                    onChange={(e) => setForm({ ...form, topic: e.target.value })}
                  />
                </div>
                <div className="form-group flex-1">
                  <label>Type</label>
                  <select value={form.q_type} onChange={(e) => setForm({ ...form, q_type: e.target.value })}>
                    {Q_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
              </div>

              <div className="form-row">
                <div className="form-group flex-1">
                  <label>Difficulty</label>
                  <select value={form.difficulty} onChange={(e) => setForm({ ...form, difficulty: e.target.value })}>
                    {DIFFICULTIES.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
                  </select>
                </div>
                <div className="form-group flex-1">
                  <label>Marks</label>
                  <input
                    type="number"
                    min="0"
                    step="0.5"
                    value={form.marks}
                    onChange={(e) => setForm({ ...form, marks: e.target.value })}
                  />
                </div>
              </div>

              <div className="form-group">
                <label>Question Content</label>
                <textarea
                  className="editor-textarea"
                  placeholder="Type your question here..."
                  value={form.question_text}
                  onChange={(e) => setForm({ ...form, question_text: e.target.value })}
                />
              </div>

              <div className="options-section">
                <label>Options (select the correct answer)</label>
                {['A', 'B', 'C', 'D'].map((opt, idx) => (
                  <div key={opt} className="option-row">
                    <input
                      type="radio"
                      name="correct-opt"
                      className="correct-radio"
                      checked={form.correctIndex === idx}
                      onChange={() => setForm({ ...form, correctIndex: idx })}
                    />
                    <span className="opt-label">{opt}</span>
                    <input
                      type="text"
                      className="opt-input"
                      placeholder={`Option ${opt}`}
                      value={form.options[idx]}
                      onChange={(e) => {
                        const updated = [...form.options];
                        updated[idx] = e.target.value;
                        setForm({ ...form, options: updated });
                      }}
                    />
                  </div>
                ))}
              </div>
            </div>

            <div className="modal-footer">
              <button className="btn-outline" onClick={closeModal} disabled={saving}>Cancel</button>
              <button className="btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? 'Saving…' : modalMode === 'edit' ? 'Save Changes' : 'Save Question'}
              </button>
            </div>
          </div>
        </div>
      )}

      {enlargedImage && (
        <div
          className="modal-overlay"
          style={{ zIndex: 9999, backgroundColor: 'rgba(0,0,0,0.85)', cursor: 'zoom-out', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => setEnlargedImage(null)}
        >
          <img
            src={enlargedImage}
            alt="Enlarged Question"
            style={{ maxWidth: '90vw', maxHeight: '90vh', objectFit: 'contain', backgroundColor: 'white', padding: '16px', borderRadius: '8px' }}
            onClick={(e) => e.stopPropagation()}
          />
          <button
            className="close-btn"
            style={{ position: 'absolute', top: '24px', right: '32px', color: 'white', background: 'transparent', border: 'none', cursor: 'pointer' }}
            onClick={() => setEnlargedImage(null)}
          >
            <X size={36} />
          </button>
        </div>
      )}
    </div>
  );
};

export default QuestionBank;
