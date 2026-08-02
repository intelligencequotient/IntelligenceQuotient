import React, { useState, useEffect, useCallback } from 'react';
import { CheckCircle, XCircle, Save, ClipboardCheck, ChevronLeft, ChevronRight } from 'lucide-react';
import { apiClient } from '../../api/client';
import MathText from '../../components/MathText';
import './ReviewQueue.css';

const SUBJECTS = ['Physics', 'Chemistry', 'Mathematics', 'Biology'];
const PAGE_SIZE = 10;

/**
 * Manual QA gate for AI-extracted questions.
 *
 * The PDF pipeline infers text, topic and answer keys, so nothing it produces is
 * usable in a live test until a teacher confirms it. Questions land here with
 * review_status = 'pending' and only reach the Question Bank once approved.
 */
const ReviewQueue = () => {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [subject, setSubject] = useState('');
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState([]);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState({ msg: '', type: 'ok' });

  // question id -> { question_text, topic, correct_answer } while being corrected
  const [edits, setEdits] = useState({});

  const showToast = (msg, type = 'ok') => {
    setToast({ msg, type });
    setTimeout(() => setToast({ msg: '', type: 'ok' }), 3500);
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
      if (subject) params.set('subject', subject);

      const res = await apiClient.get(`/questions/review-queue?${params}`);
      setItems(res.data || []);
      setTotal(res.total || 0);
      setSelected([]);
      setEdits({});
    } catch (e) {
      showToast(e.message || 'Failed to load review queue', 'error');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [page, subject]);

  useEffect(() => { load(); }, [load]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const editFor = (q) => edits[q.id] ?? {
    question_text: q.question_text || '',
    topic: q.topic || '',
    correctIndex: q.correct_answer?.index ?? 0,
  };

  const setEdit = (id, patch) =>
    setEdits((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));

  /** Sends only the fields the reviewer actually changed. */
  const buildCorrections = (q) => {
    const edit = edits[q.id];
    if (!edit) return undefined;

    const corrections = {};
    if (edit.question_text !== undefined && edit.question_text !== q.question_text) {
      corrections.question_text = edit.question_text;
    }
    if (edit.topic !== undefined && edit.topic !== (q.topic || '')) {
      corrections.topic = edit.topic;
    }
    if (edit.correctIndex !== undefined && edit.correctIndex !== (q.correct_answer?.index ?? 0)) {
      corrections.correct_answer = { index: Number(edit.correctIndex) };
    }
    return Object.keys(corrections).length ? corrections : undefined;
  };

  const approve = async (q) => {
    setBusy(true);
    try {
      await apiClient.patch(`/questions/${q.id}/approve`, { corrections: buildCorrections(q) });
      setItems((prev) => prev.filter((x) => x.id !== q.id));
      setTotal((t) => Math.max(0, t - 1));
      showToast('Question approved.');
    } catch (e) {
      showToast(e.message || 'Approve failed', 'error');
    } finally {
      setBusy(false);
    }
  };

  const reject = async (q) => {
    if (!window.confirm('Reject this question? It will be hidden from the bank.')) return;
    setBusy(true);
    try {
      await apiClient.patch(`/questions/${q.id}/reject`, {});
      setItems((prev) => prev.filter((x) => x.id !== q.id));
      setTotal((t) => Math.max(0, t - 1));
      showToast('Question rejected.');
    } catch (e) {
      showToast(e.message || 'Reject failed', 'error');
    } finally {
      setBusy(false);
    }
  };

  const bulkApprove = async () => {
    if (!selected.length) return;
    setBusy(true);
    try {
      const res = await apiClient.post('/questions/bulk-approve', { ids: selected });
      showToast(`Approved ${res.approved} question(s).`);
      load();
    } catch (e) {
      showToast(e.message || 'Bulk approve failed', 'error');
    } finally {
      setBusy(false);
    }
  };

  const toggle = (id) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const allSelected = items.length > 0 && selected.length === items.length;

  return (
    <div className="rq-page">
      {toast.msg && <div className={`rq-toast ${toast.type}`}>{toast.msg}</div>}

      <header className="rq-header">
        <div>
          <h1>Review Queue</h1>
          <p className="rq-muted">
            AI-extracted questions awaiting verification. Nothing here is usable in a test until approved.
          </p>
        </div>
        <div className="rq-count">{total} pending</div>
      </header>

      <div className="rq-toolbar">
        <div className="rq-chips">
          <button className={subject === '' ? 'active' : ''} onClick={() => { setSubject(''); setPage(1); }}>
            All
          </button>
          {SUBJECTS.map((s) => (
            <button key={s} className={subject === s ? 'active' : ''} onClick={() => { setSubject(s); setPage(1); }}>
              {s}
            </button>
          ))}
        </div>

        {items.length > 0 && (
          <div className="rq-bulk">
            <label className="rq-checkbox">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={(e) => setSelected(e.target.checked ? items.map((q) => q.id) : [])}
              />
              Select all on page
            </label>
            <button className="rq-btn primary" disabled={!selected.length || busy} onClick={bulkApprove}>
              <CheckCircle size={15} /> Approve {selected.length || ''}
            </button>
          </div>
        )}
      </div>

      {loading ? (
        <p className="rq-muted">Loading…</p>
      ) : items.length === 0 ? (
        <div className="rq-empty">
          <ClipboardCheck size={40} />
          <p>Nothing to review{subject ? ` in ${subject}` : ''}. Everything extracted so far has been checked.</p>
        </div>
      ) : (
        <div className="rq-list">
          {items.map((q) => {
            const edit = editFor(q);
            const dirty = !!buildCorrections(q);

            return (
              <article key={q.id} className={`rq-card ${selected.includes(q.id) ? 'selected' : ''}`}>
                <div className="rq-card-head">
                  <label className="rq-checkbox">
                    <input type="checkbox" checked={selected.includes(q.id)} onChange={() => toggle(q.id)} />
                    <span className="rq-subject">{q.subject || 'Unclassified'}</span>
                  </label>
                  <div className="rq-tags">
                    <span className="rq-tag">{q.difficulty || 'medium'}</span>
                    <span className="rq-tag source">{q.source || 'pdf'}</span>
                    {dirty && <span className="rq-tag edited">edited</span>}
                  </div>
                </div>

                {q.image_url && (
                  <img className="rq-image" src={q.image_url} alt="Extracted question" loading="lazy" />
                )}

                <label className="rq-label">Question text</label>
                <textarea
                  className="rq-input"
                  rows={3}
                  value={edit.question_text}
                  onChange={(e) => setEdit(q.id, { question_text: e.target.value })}
                />
                {edit.question_text && (
                  <div className="rq-preview">
                    <span className="rq-preview-label">Preview</span>
                    <MathText text={edit.question_text} />
                  </div>
                )}

                <div className="rq-row">
                  <div>
                    <label className="rq-label">Topic</label>
                    <input
                      className="rq-input"
                      value={edit.topic}
                      placeholder="e.g. Rotational Motion"
                      onChange={(e) => setEdit(q.id, { topic: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="rq-label">Correct answer</label>
                    <select
                      className="rq-input"
                      value={edit.correctIndex}
                      onChange={(e) => setEdit(q.id, { correctIndex: Number(e.target.value) })}
                    >
                      {['A', 'B', 'C', 'D'].map((opt, i) => (
                        <option key={opt} value={i}>
                          {opt}{Array.isArray(q.options) && q.options[i] ? ` — ${String(q.options[i]).slice(0, 40)}` : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="rq-actions">
                  <button className="rq-btn danger" disabled={busy} onClick={() => reject(q)}>
                    <XCircle size={15} /> Reject
                  </button>
                  <button className="rq-btn primary" disabled={busy} onClick={() => approve(q)}>
                    {dirty ? <><Save size={15} /> Save & Approve</> : <><CheckCircle size={15} /> Approve</>}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {totalPages > 1 && (
        <div className="rq-pager">
          <button className="rq-btn" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            <ChevronLeft size={15} /> Previous
          </button>
          <span className="rq-muted">Page {page} of {totalPages}</span>
          <button className="rq-btn" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
            Next <ChevronRight size={15} />
          </button>
        </div>
      )}
    </div>
  );
};

export default ReviewQueue;
