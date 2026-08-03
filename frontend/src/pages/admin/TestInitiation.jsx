import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Plus, ClipboardList, Trash2, X, CheckCircle, Clock, ChevronRight,
         Settings, Zap, Trophy, UserCheck, Users, Search, Check, Send, Calendar } from 'lucide-react';
import { apiClient } from '../../api/client';

/* ─── JEE preset definitions ─────────────────────────────────────────── */
const JEE_MAIN_PRESET = {
  label: 'JEE Main', duration_minutes: 180, totalQuestions: 90, totalMarks: 300, negativeMarking: true,
  subjects: [
    { name: 'Physics',    sections: [{ label: 'Section A — Single MCQ', q_type: 'single_correct', count: 20, marks: 4, negative: -1 }, { label: 'Section B — Integer', q_type: 'integer', count: 10, marks: 4, negative: 0 }] },
    { name: 'Chemistry',  sections: [{ label: 'Section A — Single MCQ', q_type: 'single_correct', count: 20, marks: 4, negative: -1 }, { label: 'Section B — Integer', q_type: 'integer', count: 10, marks: 4, negative: 0 }] },
    { name: 'Mathematics',sections: [{ label: 'Section A — Single MCQ', q_type: 'single_correct', count: 20, marks: 4, negative: -1 }, { label: 'Section B — Integer', q_type: 'integer', count: 10, marks: 4, negative: 0 }] },
  ],
};
const JEE_ADVANCED_PRESET = {
  label: 'JEE Advanced', duration_minutes: 180, totalQuestions: 54, totalMarks: 186, negativeMarking: true,
  subjects: [
    { name: 'Physics',    sections: [{ label: 'Section 1 — Single MCQ', q_type: 'single_correct', count: 6, marks: 3, negative: -1 }, { label: 'Section 2 — Multi MCQ', q_type: 'multi_correct', count: 6, marks: 4, negative: -2 }, { label: 'Section 3 — Integer', q_type: 'integer', count: 6, marks: 4, negative: 0 }] },
    { name: 'Chemistry',  sections: [{ label: 'Section 1 — Single MCQ', q_type: 'single_correct', count: 6, marks: 3, negative: -1 }, { label: 'Section 2 — Multi MCQ', q_type: 'multi_correct', count: 6, marks: 4, negative: -2 }, { label: 'Section 3 — Integer', q_type: 'integer', count: 6, marks: 4, negative: 0 }] },
    { name: 'Mathematics',sections: [{ label: 'Section 1 — Single MCQ', q_type: 'single_correct', count: 6, marks: 3, negative: -1 }, { label: 'Section 2 — Multi MCQ', q_type: 'multi_correct', count: 6, marks: 4, negative: -2 }, { label: 'Section 3 — Integer', q_type: 'integer', count: 6, marks: 4, negative: 0 }] },
  ],
};

const SUBJECTS = ['Physics', 'Chemistry', 'Mathematics', 'Biology'];
const Q_TYPES  = ['single_correct', 'multi_correct', 'integer', 'mixed'];
const defaultCustomSection = () => ({ subject: 'Physics', q_type: 'single_correct', count: 20, marks: 4, negative: -1 });

function presetInstructions(preset) {
  return [
    `Pattern: ${preset.label}`,
    `Duration: ${preset.duration_minutes} minutes`,
    `Total Questions: ${preset.totalQuestions}  |  Total Marks: ${preset.totalMarks}`,
    '',
    ...preset.subjects.flatMap(sub => [
      `${sub.name}:`,
      ...sub.sections.map(s => `  • ${s.label} — ${s.count}Q × ${s.marks}m${s.negative < 0 ? ` (${s.negative} per wrong)` : ' (no negative)'}`),
    ]),
  ].join('\n');
}

/* ─── Shared sub-components ──────────────────────────────────────────── */
const Avatar = ({ name = '?', size = 28 }) => {
  const initials = name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
  return (
    <div style={{ width: size, height: size, borderRadius: '50%', background: 'linear-gradient(135deg,#7c3aed,#4f46e5)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: size * 0.36, fontWeight: 700, flexShrink: 0 }}>
      {initials}
    </div>
  );
};

/* ─── Multi Teacher Picker ───────────────────────────────────────────── */
const MultiTeacherPicker = ({ teachers, selected, onChange, loading }) => {
  const [search, setSearch] = useState('');
  const [open, setOpen]     = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const toggle = (id) => {
    onChange(selected.includes(id) ? selected.filter(s => s !== id) : [...selected, id]);
  };

  const filtered = teachers.filter(t =>
    `${t.full_name} ${t.email}`.toLowerCase().includes(search.toLowerCase())
  );

  const selectedTeachers = teachers.filter(t => selected.includes(t.id));

  return (
    <div ref={ref} style={{ position: 'relative', zIndex: open ? 50 : 1 }}>
      {/* Selected chips */}
      {selectedTeachers.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
          {selectedTeachers.map(t => (
            <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px 4px 6px', background: 'var(--color-admin-purple-light)', border: '1px solid rgba(124,58,237,0.3)', borderRadius: 20, fontSize: 12, fontWeight: 500, color: 'var(--color-admin-purple)' }}>
              <Avatar name={t.full_name} size={20} />
              <span>{t.full_name}</span>
              <button onClick={() => toggle(t.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-admin-purple)', padding: 0, display: 'flex', alignItems: 'center', marginLeft: 2 }}>
                <X size={12} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Trigger button */}
      <button
        id="teacher-picker-trigger"
        onClick={() => setOpen(v => !v)}
        style={{ width: '100%', padding: '9px 14px', borderRadius: 8, border: `1.5px solid ${open ? 'var(--color-admin-purple)' : 'var(--border-color)'}`, background: 'var(--bg-card)', cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: selected.length ? 'var(--text-primary)' : 'var(--text-secondary)', fontSize: 13 }}
        disabled={loading}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Users size={15} color="var(--color-admin-purple)" />
          {loading ? 'Loading teachers...' : selected.length === 0 ? 'Click to select teachers…' : `${selected.length} teacher${selected.length > 1 ? 's' : ''} selected`}
        </div>
        <ChevronRight size={14} style={{ transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }} />
      </button>

      {/* Dropdown */}
      {open && (
        <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 200, background: '#ffffff', border: '1.5px solid var(--color-admin-purple)', borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.14)', overflow: 'hidden' }}>
          {/* Search */}
          <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Search size={14} color="var(--text-secondary)" />
            <input
              autoFocus
              placeholder="Search by name or email…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ border: 'none', outline: 'none', background: 'transparent', fontSize: 13, width: '100%', color: 'var(--text-primary)' }}
            />
            {selected.length > 0 && (
              <button onClick={() => onChange([])} style={{ fontSize: 11, color: '#dc2626', background: 'none', border: 'none', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                Clear all
              </button>
            )}
          </div>

          {/* List */}
          <div style={{ maxHeight: 220, overflowY: 'auto' }}>
            {filtered.length === 0 ? (
              <div style={{ padding: '16px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: 13 }}>No teachers found</div>
            ) : filtered.map(t => {
              const isSelected = selected.includes(t.id);
              return (
                <div
                  key={t.id}
                  onClick={() => toggle(t.id)}
                  style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', cursor: 'pointer', background: isSelected ? 'var(--color-admin-purple-light)' : 'transparent', transition: 'background 0.12s' }}
                  onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = 'var(--bg-surface)'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = isSelected ? 'var(--color-admin-purple-light)' : 'transparent'; }}
                >
                  <Avatar name={t.full_name} size={32} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{t.full_name}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{t.email}</div>
                  </div>
                  <div style={{ width: 20, height: 20, borderRadius: 5, border: `2px solid ${isSelected ? 'var(--color-admin-purple)' : 'var(--border-color)'}`, background: isSelected ? 'var(--color-admin-purple)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'all 0.12s' }}>
                    {isSelected && <Check size={12} color="#fff" strokeWidth={3} />}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Footer count */}
          <div style={{ padding: '8px 14px', borderTop: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, color: 'var(--text-secondary)' }}>
            <span>{selected.length} selected</span>
            <button onClick={() => setOpen(false)} style={{ padding: '4px 12px', borderRadius: 6, background: 'var(--color-admin-purple)', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>Done</button>
          </div>
        </div>
      )}
    </div>
  );
};

/* ─── TypeCard ──────────────────────────────────────────────────────── */
const TypeCard = ({ id, active, onClick, icon: Icon, title, subtitle, badge }) => (
  <button id={`test-type-${id}`} onClick={onClick} style={{ flex: 1, padding: '14px 16px', borderRadius: 12, border: `2px solid ${active ? 'var(--color-admin-purple)' : 'var(--border-color)'}`, background: active ? 'var(--color-admin-purple-light)' : 'var(--bg-card)', cursor: 'pointer', textAlign: 'left', transition: 'all 0.18s ease', position: 'relative', display: 'flex', flexDirection: 'column', gap: 6 }}>
    {badge && <span style={{ position: 'absolute', top: 8, right: 10, fontSize: 10, fontWeight: 700, background: badge.bg, color: badge.color, borderRadius: 4, padding: '2px 6px' }}>{badge.text}</span>}
    <Icon size={18} color={active ? 'var(--color-admin-purple)' : 'var(--text-secondary)'} />
    <div style={{ fontWeight: 700, fontSize: 14, color: active ? 'var(--color-admin-purple)' : 'var(--text-primary)' }}>{title}</div>
    <div style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.4 }}>{subtitle}</div>
  </button>
);

/* ─── Preset Preview ────────────────────────────────────────────────── */
const PresetPanel = ({ preset }) => (
  <div style={{ background: 'var(--bg-surface)', borderRadius: 10, padding: '14px 16px', border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: 10 }}>
    <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
      {[{ label: 'Duration', value: `${preset.duration_minutes} min` }, { label: 'Questions', value: preset.totalQuestions }, { label: 'Total Marks', value: preset.totalMarks }, { label: 'Negative', value: 'Yes' }].map(({ label, value }) => (
        <div key={label} style={{ flex: 1, minWidth: 80 }}>
          <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--color-admin-purple)', marginTop: 2 }}>{value}</div>
        </div>
      ))}
    </div>
    <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
      {preset.subjects.map(sub => (
        <div key={sub.name}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>{sub.name}</div>
          {sub.sections.map((s, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: 'var(--text-secondary)', marginBottom: 2 }}>
              <ChevronRight size={11} /><span>{s.label}</span>
              <span style={{ marginLeft: 'auto', fontWeight: 600, color: 'var(--text-primary)' }}>{s.count}Q · {s.marks}m</span>
            </div>
          ))}
        </div>
      ))}
    </div>
  </div>
);

/* ─── Custom section row ────────────────────────────────────────────── */
const CustomRow = ({ row, idx, onChange, onRemove }) => (
  <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1.1fr 60px 60px 70px 36px', gap: 8, alignItems: 'end' }}>
    {['Subject','Type',"Q's",'Marks','−ve',''].map((h, i) => idx === 0 && <div key={i} style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4, textTransform: 'uppercase' }}>{h || <>&nbsp;</>}</div>)}
    <select className="admin-form-select" style={{ fontSize: 12, gridRow: 2 }} value={row.subject} onChange={e => onChange(idx, 'subject', e.target.value)}>
      {SUBJECTS.map(s => <option key={s}>{s}</option>)}
    </select>
    <select className="admin-form-select" style={{ fontSize: 12, gridRow: 2 }} value={row.q_type} onChange={e => onChange(idx, 'q_type', e.target.value)}>
      {Q_TYPES.map(t => <option key={t} value={t}>{t === 'single_correct' ? 'Single MCQ' : t === 'multi_correct' ? 'Multi MCQ' : t === 'integer' ? 'Integer' : 'Mixed'}</option>)}
    </select>
    <input className="admin-form-input" style={{ fontSize: 12, padding: '6px 8px', gridRow: 2 }} type="number" min={1} max={100} value={row.count} onChange={e => onChange(idx, 'count', Number(e.target.value))} />
    <input className="admin-form-input" style={{ fontSize: 12, padding: '6px 8px', gridRow: 2 }} type="number" min={1} max={20} value={row.marks} onChange={e => onChange(idx, 'marks', Number(e.target.value))} />
    <input className="admin-form-input" style={{ fontSize: 12, padding: '6px 8px', gridRow: 2 }} type="number" min={-5} max={0} value={row.negative} onChange={e => onChange(idx, 'negative', Number(e.target.value))} />
    <button onClick={() => onRemove(idx)} style={{ gridRow: 2, width: 36, height: 36, borderRadius: 6, border: '1px solid #fca5a5', background: '#fef2f2', color: '#dc2626', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <X size={13} />
    </button>
  </div>
);

/* ═══════════════════════════════════════════════════════════════════════ */
const TestInitiation = () => {
  const [tests,   setTests]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal,  setShowModal]  = useState(false);
  const [saving,     setSaving]     = useState(false);
  const [toast,      setToast]      = useState({ msg: '', type: 'ok' });

  /* teachers */
  const [teachers, setTeachers] = useState([]);
  const [teachersLoading, setTeachersLoading] = useState(false);

  /* batches */
  const [batches, setBatches] = useState([]);

  /* create modal */
  const [testType,         setTestType]         = useState('jee_main');
  const [form,             setForm]             = useState({ title: '', instructions: '' });
  const [selectedTeachers, setSelectedTeachers] = useState([]);   // array of ids
  const [customDuration,   setCustomDuration]   = useState(60);
  const [customSections,   setCustomSections]   = useState([defaultCustomSection()]);

  /* assign modal (existing test) */
  const [assignTarget,   setAssignTarget]   = useState(null);
  const [assignSelected, setAssignSelected] = useState([]);
  const [assigning,      setAssigning]      = useState(false);

  /* batch assign modal */
  const [batchTarget, setBatchTarget] = useState(null);
  const [batchSelected, setBatchSelected] = useState([]);
  const [scheduleStart, setScheduleStart] = useState('');
  const [scheduleEnd, setScheduleEnd] = useState('');
  const [assigningBatches, setAssigningBatches] = useState(false);

  const handlePublish = async (test) => {
    if (!window.confirm(`Publish "${test.title}"? Students won't see it until you assign it to a batch.`)) return;
    try {
      await apiClient.patch(`/tests/${test.id}/publish`);
      showToast(`"${test.title}" is now published!`);
      fetchTests();
    } catch (e) { showToast(e.message || 'Failed to publish', 'error'); }
  };

  const handleAssignBatches = async () => {
    if (!batchTarget) return;
    if (batchSelected.length === 0) return showToast('Select at least one batch', 'error');
    if (!scheduleStart || !scheduleEnd) return showToast('Set start and end times', 'error');

    setAssigningBatches(true);
    try {
      await apiClient.post(`/tests/${batchTarget.id}/assign`, {
        batch_ids: batchSelected,
        scheduled_start: new Date(scheduleStart).toISOString(),
        scheduled_end: new Date(scheduleEnd).toISOString(),
      });
      showToast('Test successfully assigned to selected batches!');
      setBatchTarget(null);
    } catch (e) { showToast(e.message || 'Failed to assign', 'error'); }
    finally { setAssigningBatches(false); }
  };

  const preset = testType === 'jee_main' ? JEE_MAIN_PRESET : testType === 'jee_advanced' ? JEE_ADVANCED_PRESET : null;

  const showToast = (msg, type = 'ok') => {
    setToast({ msg, type });
    setTimeout(() => setToast({ msg: '', type: 'ok' }), 3500);
  };

  const fetchTests = useCallback(async () => {
    setLoading(true);
    try { setTests((await apiClient.get('/tests')) || []); }
    catch { showToast('Failed to load tests', 'error'); }
    finally { setLoading(false); }
  }, []);

  const fetchTeachers = useCallback(async () => {
    setTeachersLoading(true);
    try { setTeachers((await apiClient.get('/users/teachers')) || []); }
    catch { /* non-fatal */ }
    finally { setTeachersLoading(false); }
  }, []);

  const fetchBatches = useCallback(async () => {
    try { setBatches((await apiClient.get('/batches')) || []); }
    catch { /* non-fatal */ }
  }, []);

  useEffect(() => { fetchTests(); fetchTeachers(); fetchBatches(); }, [fetchTests, fetchTeachers, fetchBatches]);

  const updateSection = (idx, f, v) => setCustomSections(prev => prev.map((r, i) => i === idx ? { ...r, [f]: v } : r));
  const removeSection = (idx) => setCustomSections(prev => prev.filter((_, i) => i !== idx));
  const addSection    = () => setCustomSections(prev => [...prev, defaultCustomSection()]);

  const customTotalQ = customSections.reduce((s, r) => s + (Number(r.count) || 0), 0);
  const customTotalM = customSections.reduce((s, r) => s + (Number(r.count) || 0) * (Number(r.marks) || 0), 0);
  const hasNegative  = customSections.some(r => Number(r.negative) < 0);

  const resetModal = () => {
    setTestType('jee_main'); setForm({ title: '', instructions: '' });
    setSelectedTeachers([]); setCustomDuration(60); setCustomSections([defaultCustomSection()]);
  };

  /* ── Create ── */
  const handleCreate = async () => {
    if (!form.title.trim()) return showToast('Test title is required', 'error');
    if (testType === 'custom' && customSections.length === 0) return showToast('Add at least one section', 'error');

    const autoInstructions = preset ? presetInstructions(preset) : [
      'Pattern: Custom', `Duration: ${customDuration} minutes`,
      `Total Questions: ${customTotalQ}  |  Total Marks: ${customTotalM}`,
      ...(hasNegative ? ['Negative marking applies.'] : []),
    ].join('\n');

    const payload = {
      title: form.title,
      subject: preset ? 'Mixed' : (customSections.length === 1 ? customSections[0].subject : 'Mixed'),
      duration_minutes: preset ? preset.duration_minutes : Number(customDuration),
      instructions: form.instructions.trim() || autoInstructions,
      status: 'draft',
      total_marks: preset ? preset.totalMarks : customTotalM,
      negative_marking: preset ? preset.negativeMarking : hasNegative,
      negative_marks: (preset?.negativeMarking || hasNegative) ? 1 : 0,
      teacher_ids: selectedTeachers,   // backend strips this before DB insert, uses for test_teachers
    };

    setSaving(true);
    try {
      await apiClient.post('/tests', payload);
      showToast('Test shell created!');
      setShowModal(false); resetModal(); fetchTests();
    } catch (e) { showToast(e.message || 'Failed to create test', 'error'); }
    finally { setSaving(false); }
  };

  /* ── Assign teachers to existing test ── */
  const openAssignModal = (test) => {
    setAssignTarget(test);
    const existing = (test.test_teachers || []).map(tt => tt.teacher_id);
    setAssignSelected(existing);
  };

  const handleAssign = async () => {
    if (!assignTarget) return;
    setAssigning(true);
    try {
      await apiClient.patch(`/tests/${assignTarget.id}/assign-teacher`, { teacher_ids: assignSelected });
      const n = assignSelected.length;
      showToast(n === 0 ? 'All teachers removed.' : `${n} teacher${n > 1 ? 's' : ''} assigned!`);
      setAssignTarget(null); fetchTests();
    } catch (e) { showToast(e.message || 'Failed to assign teachers', 'error'); }
    finally { setAssigning(false); }
  };

  const handleDelete = async (test) => {
    if (!window.confirm(`Delete test "${test.title}"?`)) return;
    try { await apiClient.delete(`/tests/${test.id}`); showToast(`"${test.title}" deleted`); fetchTests(); }
    catch (e) { showToast(e.message || 'Failed', 'error'); }
  };

  /* helper: get list of assigned teachers for a row */
  const rowTeachers = (t) => (t.test_teachers || []).map(tt => tt.users).filter(Boolean);

  /* ═══════════════ RENDER ═══════════════ */
  return (
    <div className="admin-page">
      {toast.msg && <div className={`admin-toast ${toast.type === 'error' ? 'error' : ''}`}>{toast.msg}</div>}

      <div className="admin-page-header">
        <div>
          <h1>Test Initiation</h1>
          <p>Create test shells and assign teachers to add questions per subject.</p>
        </div>
        <button className="admin-btn admin-btn-primary" onClick={() => { resetModal(); setShowModal(true); }}>
          <Plus size={16} /> Initiate Test
        </button>
      </div>

      <div className="admin-info-banner">
        <ClipboardList size={18} />
        <div>
          <div className="admin-info-banner-title">How this works</div>
          <div className="admin-info-banner-body">
            Create a test shell (JEE Main / Advanced / Custom), then assign one or more teachers per subject. Assigned teachers see this test in their <strong>Test Constructor</strong>.
          </div>
        </div>
      </div>

      {loading ? (
        <p style={{ color: 'var(--text-secondary)' }}>Loading tests…</p>
      ) : tests.length === 0 ? (
        <div className="admin-empty"><ClipboardList size={40} /><p>No tests yet. Initiate your first one!</p></div>
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr><th>Title</th><th>Subject</th><th>Duration</th><th>Status</th><th>Assigned Teachers</th><th>Created</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {tests.map(t => {
                const assigned = rowTeachers(t);
                return (
                  <tr key={t.id}>
                    <td style={{ fontWeight: 600 }}>{t.title}</td>
                    <td>{t.subject || '—'}</td>
                    <td>{t.duration_minutes ? `${t.duration_minutes} min` : '—'}</td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        {t.status === 'published' ? <CheckCircle size={13} color="#059669" /> : <Clock size={13} color="#d97706" />}
                        <span className={`admin-badge admin-badge-${t.status === 'published' ? 'published' : 'draft'}`}>{t.status || 'draft'}</span>
                      </div>
                    </td>
                    <td>
                      {assigned.length === 0 ? (
                        <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontStyle: 'italic' }}>Unassigned</span>
                      ) : (
                        <div style={{ display: 'flex', alignItems: 'center', gap: -6 }}>
                          {assigned.slice(0, 4).map((teacher, i) => (
                            <div key={teacher.id} title={teacher.full_name} style={{ marginLeft: i === 0 ? 0 : -8, zIndex: assigned.length - i }}>
                              <Avatar name={teacher.full_name} size={28} />
                            </div>
                          ))}
                          {assigned.length > 4 && (
                            <div style={{ marginLeft: -8, width: 28, height: 28, borderRadius: '50%', background: 'var(--bg-surface)', border: '2px solid var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: 'var(--text-secondary)' }}>
                              +{assigned.length - 4}
                            </div>
                          )}
                          <span style={{ marginLeft: 10, fontSize: 12, color: 'var(--text-secondary)' }}>
                            {assigned.length === 1 ? assigned[0].full_name : `${assigned.length} teachers`}
                          </span>
                        </div>
                      )}
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{t.created_at ? new Date(t.created_at).toLocaleDateString() : '—'}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button id={`assign-btn-${t.id}`} className="admin-btn" style={{ padding: '6px 10px', fontSize: 12, background: 'var(--color-admin-purple-light)', color: 'var(--color-admin-purple)', border: '1px solid var(--color-admin-purple)', borderRadius: 6 }} onClick={() => openAssignModal(t)} title="Assign teachers">
                          <UserCheck size={13} />
                        </button>
                        {t.status === 'draft' && (
                          <button className="admin-btn" style={{ padding: '6px 10px', fontSize: 12, background: '#ecfdf5', color: '#059669', border: '1px solid #10b981', borderRadius: 6 }} onClick={() => handlePublish(t)} title="Publish Test">
                            <Send size={13} />
                          </button>
                        )}
                        {t.status === 'published' && (
                          <button className="admin-btn" style={{ padding: '6px 10px', fontSize: 12, background: '#eff6ff', color: '#2563eb', border: '1px solid #3b82f6', borderRadius: 6 }} onClick={() => { setBatchTarget(t); setBatchSelected([]); setScheduleStart(''); setScheduleEnd(''); }} title="Assign to Batches">
                            <Calendar size={13} />
                          </button>
                        )}
                        <button className="admin-btn admin-btn-danger" style={{ padding: '6px 10px' }} onClick={() => handleDelete(t)}>
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div style={{ padding: '10px 16px', borderTop: '1px solid var(--border-color)', fontSize: 12, color: 'var(--text-secondary)' }}>
            {tests.length} test{tests.length !== 1 ? 's' : ''} total
          </div>
        </div>
      )}

      {/* ══════════ CREATE MODAL ══════════ */}
      {showModal && (
        <div className="admin-modal-overlay" onClick={() => setShowModal(false)}>
          <div className="admin-modal" style={{ maxWidth: 660, maxHeight: '92vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
            <div className="admin-modal-header">
              <h2 className="admin-modal-title">Initiate New Test</h2>
              <button className="admin-modal-close" onClick={() => setShowModal(false)}><X size={18} /></button>
            </div>

            <div className="admin-form-group">
              <label className="admin-form-label">Test Format</label>
              <div style={{ display: 'flex', gap: 10 }}>
                <TypeCard id="jee_main"     active={testType === 'jee_main'}     onClick={() => setTestType('jee_main')}     icon={Zap}     title="JEE Main"     subtitle="180 min · 90 Q · 300 marks" badge={{ text: 'NTA Pattern', bg: '#dbeafe', color: '#1d4ed8' }} />
                <TypeCard id="jee_advanced" active={testType === 'jee_advanced'} onClick={() => setTestType('jee_advanced')} icon={Trophy}  title="JEE Advanced" subtitle="180 min · 54 Q · 186 marks" badge={{ text: 'IIT Pattern', bg: '#fef3c7', color: '#92400e' }} />
                <TypeCard id="custom"       active={testType === 'custom'}       onClick={() => setTestType('custom')}       icon={Settings} title="Custom"       subtitle="Set your own subjects, types & time" />
              </div>
            </div>

            <div className="admin-form-group">
              <label className="admin-form-label">Test Title *</label>
              <input id="test-title-input" className="admin-form-input" placeholder={preset ? `e.g. ${preset.label} Mock Test #1` : 'e.g. Chapter 5 Practice Test'} value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} />
            </div>

            {preset && (
              <div className="admin-form-group">
                <label className="admin-form-label">Pattern Preview</label>
                <PresetPanel preset={preset} />
              </div>
            )}

            {testType === 'custom' && (
              <>
                <div className="admin-form-group">
                  <label className="admin-form-label">Duration (minutes)</label>
                  <input id="custom-duration-input" className="admin-form-input" type="number" min={10} max={360} value={customDuration} onChange={e => setCustomDuration(e.target.value)} style={{ maxWidth: 140 }} />
                </div>
                <div className="admin-form-group">
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                    <label className="admin-form-label" style={{ marginBottom: 0 }}>Sections</label>
                    <button id="add-section-btn" onClick={addSection} style={{ fontSize: 12, color: 'var(--color-admin-purple)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}><Plus size={13} /> Add Section</button>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {customSections.map((row, idx) => <CustomRow key={idx} row={row} idx={idx} onChange={updateSection} onRemove={removeSection} />)}
                  </div>
                  <div style={{ marginTop: 12, padding: '10px 14px', background: 'var(--color-admin-purple-light)', borderRadius: 8, display: 'flex', gap: 24 }}>
                    {[{ label: 'Total Questions', value: customTotalQ }, { label: 'Total Marks', value: customTotalM }, { label: 'Duration', value: `${customDuration} min` }, { label: 'Negative Marking', value: hasNegative ? 'Yes' : 'No' }].map(({ label, value }) => (
                      <div key={label}><div style={{ fontSize: 10, fontWeight: 600, color: 'var(--color-admin-purple)', textTransform: 'uppercase' }}>{label}</div><div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>{value}</div></div>
                    ))}
                  </div>
                </div>
              </>
            )}

            {/* Multi teacher picker */}
            <div className="admin-form-group">
              <label className="admin-form-label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <UserCheck size={14} color="var(--color-admin-purple)" />
                Assign Teachers to Fill Questions
                <span style={{ fontWeight: 400, color: 'var(--text-secondary)', fontSize: 11 }}> — select any number</span>
              </label>
              <MultiTeacherPicker teachers={teachers} selected={selectedTeachers} onChange={setSelectedTeachers} loading={teachersLoading} />
            </div>

            <div className="admin-form-group">
              <label className="admin-form-label">Instructions <span style={{ fontWeight: 400, color: 'var(--text-secondary)' }}>(optional)</span></label>
              <textarea className="admin-form-input" placeholder="Any special instructions..." value={form.instructions} onChange={e => setForm({ ...form, instructions: e.target.value })} rows={3} style={{ resize: 'vertical' }} />
            </div>

            <div className="admin-modal-footer">
              <button className="admin-btn admin-btn-ghost" onClick={() => setShowModal(false)}>Cancel</button>
              <button id="create-test-btn" className="admin-btn admin-btn-primary" onClick={handleCreate} disabled={saving}>
                {saving ? 'Creating…' : 'Create Test Shell'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════ ASSIGN TEACHERS MODAL (existing test) ══════════ */}
      {assignTarget && (
        <div className="admin-modal-overlay" onClick={() => setAssignTarget(null)}>
          <div className="admin-modal" style={{ maxWidth: 500 }} onClick={e => e.stopPropagation()}>
            <div className="admin-modal-header">
              <h2 className="admin-modal-title">Assign Teachers</h2>
              <button className="admin-modal-close" onClick={() => setAssignTarget(null)}><X size={18} /></button>
            </div>

            {/* test strip */}
            <div style={{ padding: '12px 14px', background: 'var(--bg-surface)', borderRadius: 10, border: '1px solid var(--border-color)', marginBottom: 20 }}>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.05em' }}>Test</div>
              <div style={{ fontWeight: 700, fontSize: 15, marginTop: 2 }}>{assignTarget.title}</div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>{assignTarget.subject} · {assignTarget.duration_minutes} min · {assignTarget.total_marks} marks</div>
            </div>

            <div className="admin-form-group">
              <label className="admin-form-label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Users size={14} /> Select Teachers
                <span style={{ fontWeight: 400, fontSize: 11, color: 'var(--text-secondary)' }}> — one per subject or more</span>
              </label>
              <MultiTeacherPicker teachers={teachers} selected={assignSelected} onChange={setAssignSelected} loading={teachersLoading} />
            </div>

            {/* preview of selected */}
            {assignSelected.length > 0 && (
              <div style={{ marginTop: 4, marginBottom: 16, padding: '12px 14px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: '#15803d', marginBottom: 8, textTransform: 'uppercase' }}>
                  {assignSelected.length} teacher{assignSelected.length > 1 ? 's' : ''} will have access
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {teachers.filter(t => assignSelected.includes(t.id)).map(t => (
                    <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Avatar name={t.full_name} size={24} />
                      <span style={{ fontSize: 12, color: '#166534', fontWeight: 500 }}>{t.full_name}</span>
                      <span style={{ fontSize: 11, color: '#4ade80' }}>{t.email}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {assignSelected.length === 0 && assignTarget.test_teachers?.length > 0 && (
              <div style={{ padding: '10px 14px', background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 8, fontSize: 12, color: '#dc2626', marginBottom: 16 }}>
                All existing teachers will be removed from this test.
              </div>
            )}

            <div className="admin-modal-footer">
              <button className="admin-btn admin-btn-ghost" onClick={() => setAssignTarget(null)}>Cancel</button>
              <button id="confirm-assign-btn" className="admin-btn admin-btn-primary" onClick={handleAssign} disabled={assigning}>
                {assigning ? 'Saving…' : assignSelected.length === 0 ? 'Remove All Teachers' : `Assign ${assignSelected.length} Teacher${assignSelected.length > 1 ? 's' : ''}`}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* ══════════ ASSIGN TO BATCHES MODAL ══════════ */}
      {batchTarget && (
        <div className="admin-modal-overlay" onClick={() => setBatchTarget(null)}>
          <div className="admin-modal" style={{ maxWidth: 500 }} onClick={e => e.stopPropagation()}>
            <div className="admin-modal-header">
              <h2 className="admin-modal-title">Assign to Batches</h2>
              <button className="admin-modal-close" onClick={() => setBatchTarget(null)}><X size={18} /></button>
            </div>

            <div style={{ padding: '12px 14px', background: 'var(--bg-surface)', borderRadius: 10, border: '1px solid var(--border-color)', marginBottom: 20 }}>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.05em' }}>Published Test</div>
              <div style={{ fontWeight: 700, fontSize: 15, marginTop: 2 }}>{batchTarget.title}</div>
            </div>

            <div className="admin-form-group">
              <label className="admin-form-label">Select Batches</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 200, overflowY: 'auto', border: '1px solid var(--border-color)', borderRadius: 8, padding: 10 }}>
                {batches.length === 0 ? (
                  <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>No batches available</span>
                ) : batches.map(b => (
                  <label key={b.id} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, cursor: 'pointer' }}>
                    <input type="checkbox" checked={batchSelected.includes(b.id)} onChange={(e) => {
                      if (e.target.checked) setBatchSelected([...batchSelected, b.id]);
                      else setBatchSelected(batchSelected.filter(id => id !== b.id));
                    }} />
                    <span style={{ fontWeight: 600 }}>{b.name}</span>
                    {b.subject_focus && <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>({b.subject_focus})</span>}
                  </label>
                ))}
              </div>
            </div>

            <div className="admin-form-group" style={{ display: 'flex', gap: 16 }}>
              <div style={{ flex: 1 }}>
                <label className="admin-form-label">Scheduled Start</label>
                <input type="datetime-local" className="admin-form-input" value={scheduleStart} onChange={e => {
                  const val = e.target.value;
                  setScheduleStart(val);
                  if (val && batchTarget?.duration_minutes) {
                    const d = new Date(val);
                    d.setMinutes(d.getMinutes() + batchTarget.duration_minutes);
                    const pad = (n) => n.toString().padStart(2, '0');
                    setScheduleEnd(`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`);
                  }
                }} />
              </div>
              <div style={{ flex: 1 }}>
                <label className="admin-form-label">Scheduled End</label>
                <input type="datetime-local" className="admin-form-input" value={scheduleEnd} onChange={e => setScheduleEnd(e.target.value)} />
              </div>
            </div>

            <div className="admin-modal-footer">
              <button className="admin-btn admin-btn-ghost" onClick={() => setBatchTarget(null)}>Cancel</button>
              <button className="admin-btn admin-btn-primary" onClick={handleAssignBatches} disabled={assigningBatches}>
                {assigningBatches ? 'Assigning...' : `Assign to ${batchSelected.length} Batch${batchSelected.length !== 1 ? 'es' : ''}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TestInitiation;
