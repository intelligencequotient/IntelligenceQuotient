import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Search, Trash2, Upload, X, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { apiClient } from '../../api/client';

/* ── Chapter lists per subject ──────────────────────────────────────────────── */
const CHAPTERS = {
  Chemistry: [
    'Atomic Structure',
    'Chemical Bonding',
    'Chemical Equilibrium',
    'Chemical Kinetics',
    'Colligative Properties of Solutions',
    'Coordination Compounds',
    'd-Block Elements',
    'Electrochemistry',
    'Gaseous State',
    'Hydrogen and s-Block Elements',
    'IOC and Hydrocarbons',
    'Ionic Equilibrium',
    'Metallurgy',
    'Nitrogen Containing Organic Compounds',
    'Organic Halides and Organic Concepts',
    'Oxygen Containing Organic Compound-I',
    'Oxygen Containing Organic Compound-II',
    'Oxygen Containing Organic Compounds-III',
    'p-Block Element-II',
    'p-Block Elements-I',
    'Qualitative Analysis',
    'Solid State',
    'Stoichiometry-I and II',
    'Surf., Bio., Practical Org. Chem. and Polymers',
    'Thermodynamics and Thermochemistry',
  ],
  Physics: [
    'DC Circuits and Capacitors',
    'Dynamics of a Particle',
    'Each of the following Question has',
    'Electrostatics',
    'EMI and AC Circuits',
    'Energy and Momentum',
    'Gaseous State and Thermodynamics',
    'Kinematics of a particle',
    'Liquids',
    'Magnetic Effects of Current',
    'Modern Physics',
    'Paragraph for Q',
    'Properties of Matter',
    'Ray Optics and Wave Optics',
    'Rotation and Gravitation',
    'SHM',
    'Thermodynamics',
    'Wave Motion',
  ],
  Mathematics: [
    '84. MATCH THE FOLLOWING',
    'Binomial Theorem',
    'Circle',
    'Complex Numbers',
    'Conic Sections',
    'Differential Calculus-1',
    'Differential Calculus-2',
    'Differential Equations',
    'Each of the following Question has',
    'For Questions',
    'Functions',
    'Integral Calculus-1',
    'Integral Calculus-2',
    'M atrices and Determinants',
    'Permutation and Combination',
    'Probability',
    'Quadratic Equations',
    'Sequence and Series',
    'Sets Relations Functions',
    'Straight Line',
    'Three Dimensional Geometry',
    'Trigonometry',
    'Vectors',
  ],
  Biology: [],
};

/* ── Pagination helper ─────────────────────────────────────────────────────── */
function buildPages(current, total) {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages = [];
  pages.push(1);
  if (current > 4) pages.push('…');
  for (let p = Math.max(2, current - 1); p <= Math.min(total - 1, current + 1); p++) pages.push(p);
  if (current < total - 3) pages.push('…');
  pages.push(total);
  return pages;
}

const AdminQuestionBank = () => {
  const [rows, setRows]       = useState([]);
  const [total, setTotal]     = useState(0);
  const [page, setPage]       = useState(1);
  const [limit, setLimit]     = useState(10);
  const [loading, setLoading] = useState(true);

  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch]           = useState('');
  const [subjectFilter, setSubjectFilter] = useState('');
  const [chapterFilter, setChapterFilter] = useState('');
  const [topicInput, setTopicInput]   = useState('');
  const [topicFilter, setTopicFilter] = useState('');
  const [qTypeFilter, setQTypeFilter] = useState('');

  const [toast, setToast]             = useState({ msg: '', type: 'ok' });
  const [enlargedImage, setEnlargedImage] = useState(null);
  const [uploading, setUploading]     = useState(false);

  const showToast = (msg, type = 'ok') => {
    setToast({ msg, type });
    setTimeout(() => setToast({ msg: '', type: 'ok' }), 3500);
  };

  const commitSearch = () => {
    setSearch(searchInput);
    setTopicFilter(topicInput);
    setPage(1);
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(limit), review_status: 'all' });
      if (search)        params.set('search', search);
      if (subjectFilter) params.set('subject', subjectFilter);
      // chapter dropdown takes priority over free-text topic filter
      const effectiveTopic = chapterFilter || topicFilter;
      if (effectiveTopic)   params.set('topic', effectiveTopic);
      if (qTypeFilter)   params.set('q_type', qTypeFilter);

      const res = await apiClient.get(`/questions?${params}`);
      setRows(res.data || []);
      setTotal(res.total || 0);
    } catch (e) {
      showToast(e.message || 'Failed to load', 'error');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [page, limit, search, subjectFilter, chapterFilter, topicFilter, qTypeFilter]);

  useEffect(() => { load(); }, [load]);

  const totalPages = Math.max(1, Math.ceil(total / limit));

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this question?')) return;
    try { await apiClient.delete(`/questions/${id}`); showToast('Deleted.'); load(); }
    catch (e) { showToast(e.message || 'Failed', 'error'); }
  };

  const handlePdfUpload = async (e) => {
    const file = e.target.files[0]; if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData(); fd.append('file', file); fd.append('examType', 'jee');
      await apiClient.post('/questions/bulk-upload-pdf', fd);
      showToast('PDF processed — questions in Review Queue.'); load();
    } catch (err) { showToast(err.message || 'Upload failed', 'error'); }
    finally { setUploading(false); e.target.value = ''; }
  };

  const statusStyle = {
    approved: { bg: '#dcfce7', color: '#16a34a' },
    pending:  { bg: '#fef9c3', color: '#ca8a04' },
    rejected: { bg: '#fee2e2', color: '#dc2626' },
  };

  const subjectColor = (s) => ({
    Mathematics: '#6366f1', Physics: '#0ea5e9',
    Chemistry: '#f59e0b', Biology: '#10b981', Other: '#94a3b8',
  }[s] || '#8b5cf6');

  const PaginationBar = () => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      <button
        disabled={page <= 1} onClick={() => setPage(p => p - 1)}
        style={{ width: 34, height: 34, borderRadius: '50%', border: '1px solid var(--border-color)', background: 'var(--card-bg)', cursor: page <= 1 ? 'default' : 'pointer', opacity: page <= 1 ? 0.35 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      ><ChevronLeft size={14} /></button>

      {buildPages(page, totalPages).map((p, i) =>
        p === '…' ? (
          <span key={`e${i}`} style={{ width: 34, textAlign: 'center', color: 'var(--text-secondary)', fontSize: 13 }}>…</span>
        ) : (
          <button key={p} onClick={() => setPage(p)}
            style={{ width: 34, height: 34, borderRadius: '50%', border: p === page ? 'none' : '1px solid var(--border-color)', background: p === page ? '#6366f1' : 'var(--card-bg)', color: p === page ? '#fff' : 'var(--text-primary)', fontSize: 13, fontWeight: p === page ? 700 : 400, cursor: 'pointer' }}
          >{p}</button>
        )
      )}

      <button
        disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}
        style={{ width: 34, height: 34, borderRadius: '50%', border: '1px solid var(--border-color)', background: 'var(--card-bg)', cursor: page >= totalPages ? 'default' : 'pointer', opacity: page >= totalPages ? 0.35 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      ><ChevronRight size={14} /></button>
    </div>
  );

  return (
    <div style={{ padding: '0 0 40px' }}>
      {toast.msg && (
        <div style={{ position: 'fixed', top: 20, right: 20, zIndex: 10000, padding: '12px 20px', borderRadius: 8, background: toast.type === 'error' ? '#dc2626' : '#16a34a', color: '#fff', fontSize: 13, fontWeight: 600, boxShadow: '0 4px 20px rgba(0,0,0,0.2)' }}>
          {toast.msg}
        </div>
      )}

      {/* Page header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>Question Bank</h1>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '4px 0 0' }}>
            {total.toLocaleString()} total questions · all statuses
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {/* Subject */}
          <select value={subjectFilter} onChange={e => { setSubjectFilter(e.target.value); setChapterFilter(''); setPage(1); }}
            style={{ padding: '8px 12px', border: '1px solid var(--border-color)', borderRadius: 8, fontSize: 13, background: 'var(--card-bg)', color: 'var(--text-primary)', cursor: 'pointer' }}>
            <option value="">All Subjects</option>
            <option>Mathematics</option><option>Physics</option><option>Chemistry</option><option>Biology</option>
          </select>

          {/* Chapter — only shown when a subject is selected */}
          {subjectFilter && (CHAPTERS[subjectFilter] || []).length > 0 && (
            <select value={chapterFilter} onChange={e => { setChapterFilter(e.target.value); setPage(1); }}
              style={{ padding: '8px 12px', border: '1px solid var(--border-color)', borderRadius: 8, fontSize: 13, background: 'var(--card-bg)', color: 'var(--text-primary)', cursor: 'pointer', minWidth: 220 }}>
              <option value="">All Chapters</option>
              {(CHAPTERS[subjectFilter] || []).map(ch => (
                <option key={ch} value={ch}>{ch}</option>
              ))}
            </select>
          )}

          {/* Type */}
          <select value={qTypeFilter} onChange={e => { setQTypeFilter(e.target.value); setPage(1); }}
            style={{ padding: '8px 12px', border: '1px solid var(--border-color)', borderRadius: 8, fontSize: 13, background: 'var(--card-bg)', color: 'var(--text-primary)', cursor: 'pointer' }}>
            <option value="">All Types</option>
            <option value="single_correct">Single MCQ</option>
            <option value="multi_correct">Multi MCQ</option>
            <option value="numerical">Numerical</option>
          </select>

          {/* Upload */}
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', background: '#6366f1', color: '#fff', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            <Upload size={14} /> {uploading ? 'Uploading…' : 'Upload PDF'}
            <input type="file" accept=".pdf" style={{ display: 'none' }} onChange={handlePdfUpload} disabled={uploading} />
          </label>
        </div>
      </div>

      {/* Search + Rows-per-page + Pagination */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16, flexWrap: 'wrap' }}>
        {/* Search */}
        <div style={{ display: 'flex', alignItems: 'center', border: '1px solid var(--border-color)', borderRadius: 8, overflow: 'hidden', background: 'var(--card-bg)', flex: '0 0 260px' }}>
          <Search size={15} style={{ color: 'var(--text-secondary)', margin: '0 10px' }} />
          <input
            placeholder="Search…"
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && commitSearch()}
            style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontSize: 13, color: 'var(--text-primary)', padding: '9px 0' }}
          />
          <button onClick={commitSearch} style={{ padding: '9px 12px', background: 'none', border: 'none', cursor: 'pointer', color: '#6366f1', display: 'flex', alignItems: 'center' }}>
            <ChevronRight size={15} />
          </button>
        </div>

        {/* Rows per page */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-secondary)' }}>
          <span>Rows per page</span>
          <select value={limit} onChange={e => { setLimit(Number(e.target.value)); setPage(1); }}
            style={{ padding: '6px 10px', border: '1px solid var(--border-color)', borderRadius: 6, fontSize: 13, background: 'var(--card-bg)', color: 'var(--text-primary)', cursor: 'pointer' }}>
            {[10, 20, 50, 100].map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>

        {/* Numbered pagination (top) */}
        <div style={{ marginLeft: 'auto' }}><PaginationBar /></div>
      </div>

      {/* Table */}
      <div style={{ background: 'var(--card-bg)', borderRadius: 12, border: '1px solid var(--border-color)', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border-color)', background: 'rgba(99,102,241,0.03)' }}>
              {['#', 'Question', 'Subject', 'Topic', 'Type', 'Difficulty', 'Status', ''].map((h, i) => (
                <th key={i} style={{ padding: '12px 14px', textAlign: 'left', fontWeight: 600, fontSize: 11, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan="8" style={{ textAlign: 'center', padding: 56, color: 'var(--text-secondary)' }}>
                <Loader2 size={22} style={{ animation: 'spin 1s linear infinite', display: 'block', margin: '0 auto 10px' }} />
                Loading questions…
              </td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan="8" style={{ textAlign: 'center', padding: 56, color: 'var(--text-secondary)' }}>No questions found.</td></tr>
            ) : rows.map((q, idx) => {
              const rowNum = (page - 1) * limit + idx + 1;
              const diff = (q.difficulty || 'medium').toLowerCase();
              const diffStyle = { easy: { bg: '#dcfce7', color: '#16a34a' }, medium: { bg: '#fef9c3', color: '#ca8a04' }, hard: { bg: '#fee2e2', color: '#dc2626' } }[diff] || { bg: '#fef9c3', color: '#ca8a04' };
              const sts = statusStyle[q.review_status] || statusStyle.pending;
              const sc = subjectColor(q.subject);
              return (
                <tr key={q.id}
                  style={{ borderBottom: '1px solid var(--border-color)', transition: 'background 0.1s' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(99,102,241,0.04)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <td style={{ padding: '12px 14px', color: 'var(--text-secondary)', fontWeight: 500, width: 44 }}>{rowNum}</td>

                  <td style={{ padding: '12px 14px', maxWidth: 340 }}>
                    {q.image_url ? (
                      <img src={q.image_url} alt="Q" onClick={() => setEnlargedImage(q.image_url)}
                        style={{ maxWidth: 230, maxHeight: 75, objectFit: 'contain', borderRadius: 6, border: '1px solid var(--border-color)', cursor: 'zoom-in', padding: 3, display: 'block' }} />
                    ) : (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ width: 36, height: 36, borderRadius: 8, background: sc, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 15, flexShrink: 0 }}>
                          {(q.subject || 'Q')[0]}
                        </div>
                        <p style={{ margin: 0, lineHeight: 1.45, color: 'var(--text-primary)', fontSize: 13, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                          {q.question_text || '—'}
                        </p>
                      </div>
                    )}
                  </td>

                  <td style={{ padding: '12px 14px', whiteSpace: 'nowrap' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 600, color: sc, fontSize: 12 }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: sc, flexShrink: 0 }} />
                      {q.subject || '—'}
                    </span>
                  </td>

                  <td style={{ padding: '12px 14px', color: 'var(--text-secondary)', maxWidth: 130, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 12 }}>
                    {q.topic || 'General'}
                  </td>

                  <td style={{ padding: '12px 14px', color: 'var(--text-secondary)', whiteSpace: 'nowrap', fontSize: 12 }}>{q.q_type || '—'}</td>

                  <td style={{ padding: '12px 14px' }}>
                    <span style={{ padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600, background: diffStyle.bg, color: diffStyle.color, textTransform: 'capitalize' }}>
                      {q.difficulty || 'medium'}
                    </span>
                  </td>

                  <td style={{ padding: '12px 14px' }}>
                    <span style={{ padding: '3px 10px', borderRadius: 20, fontSize: 10, fontWeight: 700, background: sts.bg, color: sts.color, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      {q.review_status || 'pending'}
                    </span>
                  </td>

                  <td style={{ padding: '12px 14px', textAlign: 'center' }}>
                    <button onClick={() => handleDelete(q.id)}
                      style={{ width: 30, height: 30, borderRadius: 6, border: '1px solid #fca5a5', background: '#fee2e2', color: '#dc2626', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Trash2 size={13} />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {/* Bottom bar */}
        {!loading && rows.length > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderTop: '1px solid var(--border-color)', fontSize: 13, color: 'var(--text-secondary)' }}>
            <span>Showing {(page - 1) * limit + 1}–{Math.min(page * limit, total)} of {total.toLocaleString()}</span>
            <PaginationBar />
          </div>
        )}
      </div>

      {/* Lightbox */}
      {enlargedImage && (
        <div onClick={() => setEnlargedImage(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.88)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
          <img src={enlargedImage} alt="Enlarged" style={{ maxWidth: '90vw', maxHeight: '90vh', objectFit: 'contain', background: '#fff', padding: 16, borderRadius: 10, boxShadow: '0 30px 80px rgba(0,0,0,0.6)' }} onClick={e => e.stopPropagation()} />
          <button onClick={() => setEnlargedImage(null)} style={{ position: 'absolute', top: 20, right: 28, background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: '50%', color: '#fff', cursor: 'pointer', width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)' }}>
            <X size={22} />
          </button>
        </div>
      )}
    </div>
  );
};

export default AdminQuestionBank;
