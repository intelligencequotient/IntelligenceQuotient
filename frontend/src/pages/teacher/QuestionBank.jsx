import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Search, Plus, Edit, Copy, Trash2, X, Image as ImageIcon,
  ChevronLeft, ChevronRight, Loader2,
} from 'lucide-react';
import { apiClient } from '../../api/client';
import { useAppData } from '../../context/AppDataContext';
import MathText from '../../components/MathText';
import './QuestionBank.css';

const SUBJECTS = ['Mathematics', 'Physics', 'Chemistry', 'Biology'];
const DIFFICULTIES = ['easy', 'medium', 'hard'];
const PAGE_SIZE = 20;

const CHAPTERS = {
  Chemistry: [
    'Atomic Structure', 'Chemical Bonding', 'Chemical Equilibrium', 'Chemical Kinetics',
    'Colligative Properties of Solutions', 'Coordination Compounds', 'd-Block Elements',
    'Electrochemistry', 'Gaseous State', 'Hydrogen and s-Block Elements',
    'IOC and Hydrocarbons', 'Ionic Equilibrium', 'Metallurgy',
    'Nitrogen Containing Organic Compounds', 'Organic Halides and Organic Concepts',
    'Oxygen Containing Organic Compound-I', 'Oxygen Containing Organic Compound-II',
    'Oxygen Containing Organic Compounds-III', 'p-Block Element-II', 'p-Block Elements-I',
    'Qualitative Analysis', 'Solid State', 'Stoichiometry-I and II',
    'Surf., Bio., Practical Org. Chem. and Polymers', 'Thermodynamics and Thermochemistry',
  ],
  Physics: [
    'DC Circuits and Capacitors', 'Dynamics of a Particle', 'Each of the following Question has',
    'Electrostatics', 'EMI and AC Circuits', 'Energy and Momentum',
    'Gaseous State and Thermodynamics', 'Kinematics of a particle', 'Liquids',
    'Magnetic Effects of Current', 'Modern Physics', 'Paragraph for Q',
    'Properties of Matter', 'Ray Optics and Wave Optics', 'Rotation and Gravitation',
    'SHM', 'Thermodynamics', 'Wave Motion',
  ],
  Mathematics: [
    '84. MATCH THE FOLLOWING', 'Binomial Theorem', 'Circle', 'Complex Numbers',
    'Conic Sections', 'Differential Calculus-1', 'Differential Calculus-2',
    'Differential Equations', 'Each of the following Question has', 'For Questions',
    'Functions', 'Integral Calculus-1', 'Integral Calculus-2', 'M atrices and Determinants',
    'Permutation and Combination', 'Probability', 'Quadratic Equations',
    'Sequence and Series', 'Sets Relations Functions', 'Straight Line',
    'Three Dimensional Geometry', 'Trigonometry', 'Vectors',
  ],
  Biology: [],
};

const emptyQuestion = () => ({
  subject: 'Mathematics',
  topic: '',
  q_type: 'single_correct',
  difficulty: 'medium',
  question_text: '',
  options: ['', '', '', ''],
  correctIndex: 0,
  marks: 4,
  solution: '',
});

/**
 * Question Bank.
 *
 * Previously every action here mutated React state only, so an "added" or
 * "deleted" question reappeared on refresh. Everything now goes through the API,
 * and paging happens server-side so the page stays responsive with a large bank.
 */
const QuestionBank = () => {
  const { setQuestions: setGlobalQuestions } = useAppData();

  // Read the logged-in user once; teachers are locked to their subject
  const currentUser = JSON.parse(localStorage.getItem('user') || '{}');
  const isTeacher = currentUser.role === 'teacher';
  const teacherSubject = isTeacher ? (currentUser.subject || '') : '';

  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  // Teachers are auto-locked to their own subject; admins/all can pick freely
  const [subjectFilter, setSubjectFilter] = useState(teacherSubject);
  const [chapterFilter, setChapterFilter] = useState('');
  const [topicInput, setTopicInput] = useState('');
  const [topicFilter, setTopicFilter] = useState('');
  const [qTypeFilter, setQTypeFilter] = useState('');

  const [selected, setSelected] = useState([]);
  const [toast, setToast] = useState('');
  const [enlargedImage, setEnlargedImage] = useState(null);
  const [busy, setBusy] = useState(false);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [draft, setDraft] = useState(emptyQuestion());

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  };

  // Debounce the search box so typing does not fire a request per keystroke.
  const debounceRef = useRef(null);
  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setSearch(searchInput);
      setTopicFilter(topicInput);
      setPage(1);
    }, 350);
    return () => clearTimeout(debounceRef.current);
  }, [searchInput, topicInput]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // Teachers see all questions in their subject (pending + approved).
      // The backend SBAC already restricts the response to their subject server-side.
      const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE), review_status: 'all' });
      if (search) params.set('search', search);
      if (subjectFilter) params.set('subject', subjectFilter);
      // chapter dropdown takes priority over free-text topic filter
      const effectiveTopic = chapterFilter || topicFilter;
      if (effectiveTopic) params.set('topic', effectiveTopic);
      if (qTypeFilter) params.set('q_type', qTypeFilter);

      const res = await apiClient.get(`/questions?${params}`);
      setRows(res.data || []);
      setTotal(res.total || 0);
      setSelected([]);
    } catch (e) {
      showToast(e.message || 'Failed to load questions');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [page, search, subjectFilter, chapterFilter, topicFilter, qTypeFilter]);

  useEffect(() => { load(); }, [load]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // ── Mutations ─────────────────────────────────────────────────────────────

  const openCreate = () => {
    setEditingId(null);
    setDraft(emptyQuestion());
    setModalOpen(true);
  };

  const openEdit = (q) => {
    setEditingId(q.id);
    // Normalise legacy 'integer' type — backend only accepts the 4 canonical types
    const rawType = q.q_type || 'single_correct';
    const safeType = rawType === 'integer' ? 'numerical' : rawType;
    setDraft({
      subject: q.subject || 'Mathematics',
      topic: q.topic || '',
      q_type: safeType,
      difficulty: (q.difficulty || 'medium').toLowerCase(),
      question_text: q.question_text || '',
      image_url: q.image_url || '',
      options: Array.isArray(q.options) && q.options.length === 4 ? [...q.options] : ['', '', '', ''],
      correctIndex: q.correct_answer?.index ?? 0,
      marks: q.marks ?? 4,
      solution: q.solution || '',
    });
    setModalOpen(true);
  };

  const [modalError, setModalError] = useState('');

  const handleSave = async () => {
    setModalError('');
    // For image-based questions question_text may legitimately be blank
    const payload = {
      subject: draft.subject,
      topic: draft.topic.trim() || null,
      q_type: draft.q_type,
      difficulty: draft.difficulty,
      marks: Number(draft.marks) || 4,
    };
    // Only include question_text when the teacher typed something
    if (draft.question_text.trim()) payload.question_text = draft.question_text.trim();
    // Only include options + correct_answer for MCQ types
    if (draft.q_type === 'single_correct' || draft.q_type === 'multi_correct') {
      payload.options = draft.options;
      payload.correct_answer = { index: Number(draft.correctIndex) };
    } else if (draft.q_type === 'numerical') {
      // Numerical value answer — keep existing correct_answer, don't overwrite
    }

    setBusy(true);
    try {
      if (editingId) {
        await apiClient.patch(`/questions/${editingId}`, payload);
        showToast('Question updated.');
      } else {
        if (!draft.question_text.trim()) { setModalError('Please enter the question text.'); setBusy(false); return; }
        await apiClient.post('/questions', payload);
        showToast('Question added.');
      }
      setModalOpen(false);
      setModalError('');
      load();
    } catch (e) {
      const msg = e.message || 'Save failed — please try again.';
      setModalError(msg);
      showToast(msg);
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (q) => {
    if (!window.confirm('Delete this question? It will be removed from the bank.')) return;
    setBusy(true);
    try {
      await apiClient.delete(`/questions/${q.id}`);
      showToast('Question deleted.');
      load();
    } catch (e) {
      showToast(e.message || 'Delete failed');
    } finally {
      setBusy(false);
    }
  };

  const handleDuplicate = async (q) => {
    setBusy(true);
    try {
      await apiClient.post(`/questions/${q.id}/duplicate`, {});
      showToast('Question duplicated.');
      load();
    } catch (e) {
      showToast(e.message || 'Duplicate failed');
    } finally {
      setBusy(false);
    }
  };

  const handleBulkDelete = async () => {
    if (!selected.length) return;
    if (!window.confirm(`Delete ${selected.length} selected question(s)?`)) return;
    setBusy(true);
    try {
      const res = await apiClient.post('/questions/bulk-delete', { ids: selected });
      showToast(`Deleted ${res.deleted} question(s).`);
      load();
    } catch (e) {
      showToast(e.message || 'Bulk delete failed');
    } finally {
      setBusy(false);
    }
  };

  // Keep the shared context roughly in sync for pages that still read from it.
  useEffect(() => { if (rows.length) setGlobalQuestions(rows); }, [rows, setGlobalQuestions]);

  const toggleRow = (id) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const allSelected = rows.length > 0 && selected.length === rows.length;

  const answerLabel = (q) => {
    if (q.correct_answer?.value !== undefined) return String(q.correct_answer.value);
    const idx = q.correct_answer?.index;
    if (idx === undefined || !Array.isArray(q.options)) return 'N/A';
    return q.options[idx] ?? `Option ${['A', 'B', 'C', 'D'][idx] ?? idx}`;
  };

  return (
    <div className="question-bank">
      <header className="page-header d-flex justify-between align-center">
        <div>
          <h1>Question Bank{teacherSubject ? ` — ${teacherSubject}` : ''}</h1>
          <p>{isTeacher && teacherSubject ? `Showing your ${teacherSubject} questions only.` : 'Manage and organize your assessment items.'}</p>
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
          {/* Subject: locked for teachers, selectable for admins */}
          {isTeacher ? (
            <div className="filter-select" style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(99,102,241,0.08)', color: '#6366f1', fontWeight: 600, border: '1.5px solid #6366f1', cursor: 'default' }}>
              <span style={{ fontSize: 11, opacity: 0.7 }}>🔒</span> {teacherSubject || 'No subject assigned'}
            </div>
          ) : (
            <select
              className="filter-select"
              value={subjectFilter}
              onChange={(e) => { setSubjectFilter(e.target.value); setChapterFilter(''); setPage(1); }}
            >
              <option value="">All Subjects</option>
              {SUBJECTS.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          )}

          {/* Chapter dropdown — dynamic per subject */}
          {subjectFilter && (CHAPTERS[subjectFilter] || []).length > 0 && (
            <select
              className="filter-select"
              value={chapterFilter}
              onChange={(e) => { setChapterFilter(e.target.value); setPage(1); }}
              style={{ minWidth: 180 }}
            >
              <option value="">All Chapters</option>
              {(CHAPTERS[subjectFilter] || []).map(ch => (
                <option key={ch} value={ch}>{ch}</option>
              ))}
            </select>
          )}

          <select
            className="filter-select"
            value={qTypeFilter}
            onChange={(e) => { setQTypeFilter(e.target.value); setPage(1); }}
          >
            <option value="">All Types</option>
            <option value="single_correct">Single MCQ</option>
            <option value="multi_correct">Multi MCQ</option>
            <option value="numerical">Numerical</option>
          </select>
        </div>
      </div>

      {selected.length > 0 && (
        <div className="qb-bulk-bar">
          <span>{selected.length} selected</span>
          <button className="qb-bulk-danger" onClick={handleBulkDelete} disabled={busy}>
            <Trash2 size={15} /> Delete selected
          </button>
          <button className="qb-bulk-ghost" onClick={() => setSelected([])}>Clear</button>
        </div>
      )}

      <div className="table-container">
        <table className="bank-table">
          <thead>
            <tr>
              <th className="qb-check-col">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={(e) => setSelected(e.target.checked ? rows.map((q) => q.id) : [])}
                  aria-label="Select all questions on this page"
                />
              </th>
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
                <td colSpan="8" className="qb-state">
                  <Loader2 size={18} className="qb-spin" /> Loading questions…
                </td>
              </tr>
            )}

            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan="8" className="qb-state">No questions match your filters.</td>
              </tr>
            )}

            {!loading && rows.map((q) => (
              <tr key={q.id} className={selected.includes(q.id) ? 'qb-row-selected' : ''}>
                <td className="qb-check-col">
                  <input
                    type="checkbox"
                    checked={selected.includes(q.id)}
                    onChange={() => toggleRow(q.id)}
                    aria-label="Select question"
                  />
                </td>
                <td className="preview-col">
                  {q.image_url ? (
                    <img
                      src={q.image_url}
                      alt="Question preview"
                      loading="lazy"
                      onClick={() => setEnlargedImage(q.image_url)}
                      className="qb-thumb"
                    />
                  ) : (
                    <MathText
                      as="p"
                      className="q-preview-text"
                      text={q.question_text || 'No content provided.'}
                    />
                  )}
                </td>
                <td>{q.subject}</td>
                <td>{q.topic || 'General'}</td>
                <td>{q.q_type || '—'}</td>
                <td>
                  <span className={`diff-badge ${(q.difficulty || 'medium').toLowerCase()}`}>
                    {q.difficulty || 'medium'}
                  </span>
                </td>
                <td><strong className="qb-answer"><MathText text={answerLabel(q)} /></strong></td>
                <td className="actions-col">
                  <div className="row-actions">
                    <button className="action-btn" title="Edit" onClick={() => openEdit(q)}>
                      <Edit size={16} />
                    </button>
                    <button className="action-btn" title="Duplicate" disabled={busy} onClick={() => handleDuplicate(q)}>
                      <Copy size={16} />
                    </button>
                    <button className="action-btn danger" title="Delete" disabled={busy} onClick={() => handleDelete(q)}>
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
            {total === 0
              ? 'No results'
              : `Showing ${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, total)} of ${total}`}
          </span>
          <div className="pagination">
            <button
              className={`page-btn ${page <= 1 ? 'disabled' : ''}`}
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              <ChevronLeft size={15} />
            </button>
            <span className="qb-page-label">{page} / {totalPages}</span>
            <button
              className={`page-btn ${page >= totalPages ? 'disabled' : ''}`}
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              <ChevronRight size={15} />
            </button>
          </div>
        </div>
      </div>

      {modalOpen && (
        <div className="modal-overlay">
          <div className="modal-content large">
            <div className="modal-header">
              <h2>{editingId ? 'Edit Question' : 'Add New Question'}</h2>
              <button className="close-btn" onClick={() => setModalOpen(false)}><X size={20} /></button>
            </div>

            <div className="modal-body">
              <div className="form-row">
                <div className="form-group flex-1">
                  <label>Subject</label>
                  <select value={draft.subject} onChange={(e) => setDraft({ ...draft, subject: e.target.value })}>
                    {SUBJECTS.map((s) => <option key={s}>{s}</option>)}
                  </select>
                </div>
                <div className="form-group flex-1">
                  <label>Topic</label>
                  <input
                    type="text"
                    placeholder="e.g. Kinematics"
                    value={draft.topic}
                    onChange={(e) => setDraft({ ...draft, topic: e.target.value })}
                  />
                </div>
                <div className="form-group flex-1">
                  <label>Type</label>
                  <select value={draft.q_type} onChange={(e) => setDraft({ ...draft, q_type: e.target.value })}>
                    <option value="single_correct">Single MCQ</option>
                    <option value="multi_correct">Multi MCQ</option>
                    <option value="numerical">Numerical</option>
                  </select>
                </div>
                <div className="form-group flex-1">
                  <label>Difficulty</label>
                  <select value={draft.difficulty} onChange={(e) => setDraft({ ...draft, difficulty: e.target.value })}>
                    {DIFFICULTIES.map((d) => (
                      <option key={d} value={d}>{d[0].toUpperCase() + d.slice(1)}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group flex-1">
                  <label>Marks</label>
                  <input
                    type="number" min={1} max={20}
                    value={draft.marks}
                    onChange={(e) => setDraft({ ...draft, marks: e.target.value })}
                  />
                </div>
              </div>

              <div className="form-group">
                <label>Question Content</label>
                {draft.image_url ? (
                  <div style={{ background: '#f8fafc', padding: 12, borderRadius: 8, border: '1px solid var(--border-color)', textAlign: 'center' }}>
                    <img src={draft.image_url} alt="Question" style={{ maxWidth: '100%', maxHeight: 300, objectFit: 'contain', borderRadius: 4 }} />
                  </div>
                ) : (
                  <>
                    <div className="rich-editor">
                      <div className="editor-toolbar">
                        <span className="qb-latex-hint">
                          <ImageIcon size={14} /> LaTeX supported — wrap maths in $…$ or $$…$$
                        </span>
                      </div>
                      <textarea
                        className="editor-textarea"
                        placeholder="Type your question here. e.g. Find $\int_0^1 x^2\,dx$"
                        value={draft.question_text}
                        onChange={(e) => setDraft({ ...draft, question_text: e.target.value })}
                      />
                    </div>
                    {draft.question_text && (
                      <div className="qb-preview">
                        <span className="qb-preview-label">Preview</span>
                        <MathText text={draft.question_text} />
                      </div>
                    )}
                  </>
                )}
              </div>

              <div className="options-section">
                <label>Options (mark the correct answer)</label>
                {['A', 'B', 'C', 'D'].map((opt, idx) => (
                  <div key={opt} className="option-row">
                    <input
                      type="radio"
                      name="correct-opt"
                      className="correct-radio"
                      checked={Number(draft.correctIndex) === idx}
                      onChange={() => setDraft({ ...draft, correctIndex: idx })}
                    />
                    <span className="opt-label">{opt}</span>
                    <input
                      type="text"
                      className="opt-input"
                      placeholder={`Option ${opt}`}
                      value={draft.options[idx]}
                      onChange={(e) => {
                        const options = [...draft.options];
                        options[idx] = e.target.value;
                        setDraft({ ...draft, options });
                      }}
                    />
                  </div>
                ))}
              </div>
            </div>

            <div className="modal-footer">
              {modalError && (
                <div style={{ color: '#dc2626', fontSize: 13, fontWeight: 500, flex: 1, textAlign: 'left' }}>⚠ {modalError}</div>
              )}
              <button className="btn-outline" onClick={() => { setModalOpen(false); setModalError(''); }}>Cancel</button>
              <button className="btn-primary" onClick={handleSave} disabled={busy}>
                {busy ? 'Saving…' : editingId ? 'Save Changes' : 'Save Question'}
              </button>
            </div>
          </div>
        </div>
      )}

      {enlargedImage && (
        <div className="qb-lightbox" onClick={() => setEnlargedImage(null)}>
          <img src={enlargedImage} alt="Enlarged question" onClick={(e) => e.stopPropagation()} />
          <button className="qb-lightbox-close" onClick={() => setEnlargedImage(null)}>
            <X size={34} />
          </button>
        </div>
      )}
    </div>
  );
};

export default QuestionBank;
