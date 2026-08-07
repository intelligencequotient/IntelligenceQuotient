import React, { useState, useEffect, useCallback } from 'react';
import { Video, Plus, Trash2, X, ExternalLink, Clock, BookOpen, Search } from 'lucide-react';
import { apiClient, getStoredUser } from '../api/client';
import './Lectures.css';

const SUBJECTS = ['Physics', 'Chemistry', 'Mathematics', 'Biology'];

/**
 * Lecture library. The backend module existed but had no UI at all.
 * Students get a filterable read-only view; teachers and admins can add
 * and remove entries, and see the syllabus outline per subject.
 */
const Lectures = () => {
  const user = getStoredUser() || {};
  const isStaff = user.role === 'teacher' || user.role === 'admin';

  const [lectures, setLectures] = useState([]);
  const [syllabus, setSyllabus] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState({ msg: '', type: 'ok' });

  const [subject, setSubject] = useState('');
  const [search, setSearch] = useState('');

  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    title: '', subject: 'Physics', topic: '', drive_url: '', duration_minutes: 45,
  });

  const showToast = (msg, type = 'ok') => {
    setToast({ msg, type });
    setTimeout(() => setToast({ msg: '', type: 'ok' }), 3500);
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const query = subject ? `?subject=${encodeURIComponent(subject)}` : '';
      setLectures(await apiClient.getList(`/lectures${query}`));
    } catch (e) {
      showToast(e.message || 'Could not load lectures', 'error');
      setLectures([]);
    } finally {
      setLoading(false);
    }
  }, [subject]);

  useEffect(() => { load(); }, [load]);

  // Syllabus is only meaningful once a subject is chosen.
  useEffect(() => {
    if (!subject) { setSyllabus([]); return; }
    let cancelled = false;
    apiClient
      .get(`/lectures/syllabus/${encodeURIComponent(subject)}`)
      .then((data) => { if (!cancelled) setSyllabus(data || []); })
      .catch(() => { if (!cancelled) setSyllabus([]); });
    return () => { cancelled = true; };
  }, [subject]);

  const handleCreate = async () => {
    if (!form.title.trim()) return showToast('Title is required', 'error');
    setSaving(true);
    try {
      await apiClient.post('/lectures', {
        title: form.title.trim(),
        subject: form.subject,
        topic: form.topic.trim() || null,
        drive_url: form.drive_url.trim(),
        duration_minutes: Number(form.duration_minutes) || null,
      });
      showToast('Lecture added.');
      setShowModal(false);
      setForm({ title: '', subject: 'Physics', topic: '', drive_url: '', duration_minutes: 45 });
      load();
    } catch (e) {
      showToast(e.message || 'Failed to add lecture', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (lecture) => {
    if (!window.confirm(`Delete "${lecture.title}"?`)) return;
    try {
      await apiClient.delete(`/lectures/${lecture.id}`);
      setLectures((prev) => prev.filter((l) => l.id !== lecture.id));
      showToast('Lecture deleted.');
    } catch (e) {
      showToast(e.message || 'Failed to delete', 'error');
    }
  };

  const visible = lectures.filter((l) => {
    const haystack = `${l.title} ${l.topic || ''}`.toLowerCase();
    return haystack.includes(search.toLowerCase());
  });

  return (
    <div className="lectures-page">
      {toast.msg && <div className={`lectures-toast ${toast.type}`}>{toast.msg}</div>}

      <header className="lectures-header">
        <div>
          <h1>Lecture Library</h1>
          <p className="lectures-muted">Recorded sessions and syllabus coverage by subject.</p>
        </div>
        {isStaff && (
          <button className="lectures-btn primary" onClick={() => setShowModal(true)}>
            <Plus size={16} /> Add Lecture
          </button>
        )}
      </header>

      <div className="lectures-filters">
        <div className="lectures-search">
          <Search size={15} />
          <input
            placeholder="Search lectures…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="lectures-chips">
          <button className={subject === '' ? 'active' : ''} onClick={() => setSubject('')}>All</button>
          {SUBJECTS.map((s) => (
            <button key={s} className={subject === s ? 'active' : ''} onClick={() => setSubject(s)}>
              {s}
            </button>
          ))}
        </div>
      </div>

      <div className="lectures-layout">
        <div>
          {loading ? (
            <p className="lectures-muted">Loading lectures…</p>
          ) : visible.length === 0 ? (
            <div className="lectures-empty">
              <Video size={38} />
              <p>{search || subject ? 'No lectures match these filters.' : 'No lectures uploaded yet.'}</p>
            </div>
          ) : (
            <div className="lectures-grid">
              {visible.map((lecture) => (
                <article key={lecture.id} className="lecture-card">
                  <div className="lecture-card-top">
                    <span className={`lecture-subject ${(lecture.subject || '').toLowerCase()}`}>
                      {lecture.subject}
                    </span>
                    {isStaff && (
                      <button
                        className="lecture-delete"
                        onClick={() => handleDelete(lecture)}
                        title="Delete lecture"
                      >
                        <Trash2 size={15} />
                      </button>
                    )}
                  </div>

                  <h3>{lecture.title}</h3>
                  {lecture.topic && <p className="lectures-muted lecture-topic">{lecture.topic}</p>}

                  <div className="lecture-meta">
                    {lecture.duration_minutes ? (
                      <span><Clock size={13} /> {lecture.duration_minutes} min</span>
                    ) : null}
                    <span>{new Date(lecture.created_at).toLocaleDateString()}</span>
                  </div>

                  {lecture.drive_url ? (
                    <a
                      className="lectures-btn watch"
                      href={lecture.drive_url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Watch <ExternalLink size={14} />
                    </a>
                  ) : (
                    <span className="lectures-muted lecture-nolink">No recording link</span>
                  )}
                </article>
              ))}
            </div>
          )}
        </div>

        {subject && (
          <aside className="syllabus-panel">
            <h2><BookOpen size={17} /> {subject} Syllabus</h2>
            {syllabus.length === 0 ? (
              <p className="lectures-muted lectures-small">No syllabus items recorded for {subject}.</p>
            ) : (
              <ol className="syllabus-list">
                {syllabus.map((item) => (
                  <li key={item.id}>
                    <span className="syllabus-topic">{item.topic}</span>
                    {item.subtopic && <span className="lectures-muted"> — {item.subtopic}</span>}
                  </li>
                ))}
              </ol>
            )}
          </aside>
        )}
      </div>

      {showModal && (
        <div className="lectures-modal-overlay" onClick={() => setShowModal(false)}>
          <div className="lectures-modal" onClick={(e) => e.stopPropagation()}>
            <div className="lectures-modal-header">
              <h2>Add Lecture</h2>
              <button onClick={() => setShowModal(false)}><X size={18} /></button>
            </div>

            <label>Title *</label>
            <input
              value={form.title}
              placeholder="e.g. Rotational Motion — Part 1"
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />

            <div className="lectures-modal-row">
              <div>
                <label>Subject</label>
                <select value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })}>
                  {SUBJECTS.map((s) => <option key={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label>Duration (min)</label>
                <input
                  type="number" min={1} max={600}
                  value={form.duration_minutes}
                  onChange={(e) => setForm({ ...form, duration_minutes: e.target.value })}
                />
              </div>
            </div>

            <label>Topic</label>
            <input
              value={form.topic}
              placeholder="e.g. Moment of Inertia"
              onChange={(e) => setForm({ ...form, topic: e.target.value })}
            />

            <label>Recording URL</label>
            <input
              value={form.drive_url}
              placeholder="https://drive.google.com/…"
              onChange={(e) => setForm({ ...form, drive_url: e.target.value })}
            />

            <div className="lectures-modal-footer">
              <button className="lectures-btn" onClick={() => setShowModal(false)}>Cancel</button>
              <button className="lectures-btn primary" onClick={handleCreate} disabled={saving}>
                {saving ? 'Saving…' : 'Add Lecture'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Lectures;
