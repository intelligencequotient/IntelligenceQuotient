import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, ChevronRight, ChevronLeft, Search, Trash2, FileText, Settings, ListChecks, Loader2 } from 'lucide-react';
import { apiClient } from '../../api/client';
import './TestConstructor.css';

const SUBJECTS = ['Physics', 'Chemistry', 'Mathematics', 'Biology'];

/** Combine a date input + time input into an ISO timestamp, or null. */
const toIso = (date, time) => {
  if (!date) return null;
  const dt = new Date(`${date}T${time || '00:00'}`);
  return Number.isNaN(dt.getTime()) ? null : dt.toISOString();
};

const TestConstructor = () => {
  const navigate = useNavigate();

  const [step, setStep] = useState(1);
  const [toast, setToast] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  // The draft's server-side id, set after the first save so we update instead of duplicating
  const [testId, setTestId] = useState(null);

  const [testData, setTestData] = useState({
    title: '',
    description: '',
    subject: 'Physics',
    duration_minutes: 60,
    startDate: '',
    startTime: '',
    endDate: '',
    endTime: '',
  });

  // Batches loaded from the server
  const [batches, setBatches] = useState([]);
  const [selectedBatchIds, setSelectedBatchIds] = useState([]);

  // Question picker
  const [questions, setQuestions] = useState([]);
  const [questionsLoading, setQuestionsLoading] = useState(false);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [filterBySubject, setFilterBySubject] = useState(true);
  const [selectedQuestions, setSelectedQuestions] = useState([]);

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3500);
  };

  // ─── Load batches once ────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const res = await apiClient.get('/batches');
        setBatches(res || []);
      } catch (err) {
        console.error('Failed to load batches', err);
      }
    })();
  }, []);

  // ─── Question search (debounced) ──────────────────────────────────────────
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput), 400);
    return () => clearTimeout(t);
  }, [searchInput]);

  const fetchQuestions = useCallback(async () => {
    setQuestionsLoading(true);
    try {
      const params = new URLSearchParams({ limit: '50', page: '1' });
      if (search) params.set('search', search);
      if (filterBySubject) params.set('subject', testData.subject);
      const res = await apiClient.get(`/questions?${params.toString()}`);
      setQuestions(res?.data || []);
    } catch (err) {
      console.error('Failed to load questions', err);
      setQuestions([]);
    } finally {
      setQuestionsLoading(false);
    }
  }, [search, filterBySubject, testData.subject]);

  useEffect(() => {
    if (step === 2) fetchQuestions();
  }, [step, fetchQuestions]);

  // ─── Persistence ──────────────────────────────────────────────────────────

  /** Create-or-update the draft and sync its question list. Returns the test id. */
  const persistDraft = async () => {
    if (!testData.title.trim()) {
      throw new Error('Please give the test a title before saving.');
    }

    const payload = {
      title: testData.title.trim(),
      description: testData.description?.trim() || null,
      duration_minutes: Number(testData.duration_minutes) || 60,
    };

    let id = testId;
    if (id) {
      await apiClient.patch(`/tests/${id}`, payload);
    } else {
      const created = await apiClient.post('/tests', payload);
      id = created.id;
      setTestId(id);
    }

    // Replaces the test's question set and recalculates total marks server-side
    await apiClient.post(`/tests/${id}/questions`, {
      question_ids: selectedQuestions.map((q) => q.id),
    });

    return id;
  };

  const handleSaveDraft = async () => {
    setSaving(true);
    setError('');
    try {
      await persistDraft();
      showToast('Draft saved.');
    } catch (err) {
      setError(err.message || 'Failed to save draft.');
    } finally {
      setSaving(false);
    }
  };

  const handlePublish = async () => {
    setSaving(true);
    setError('');
    try {
      if (selectedQuestions.length === 0) {
        throw new Error('Add at least one question before publishing.');
      }

      const id = await persistDraft();
      await apiClient.patch(`/tests/${id}/publish`);

      // Assigning is optional — a published test with no assignment is still a
      // valid draft-for-later, so we report assignment problems separately.
      const scheduledStart = toIso(testData.startDate, testData.startTime);
      const scheduledEnd = toIso(testData.endDate, testData.endTime);

      if (selectedBatchIds.length && scheduledStart && scheduledEnd) {
        try {
          const res = await apiClient.post(`/tests/${id}/assign`, {
            batch_ids: selectedBatchIds,
            scheduled_start: scheduledStart,
            scheduled_end: scheduledEnd,
          });
          showToast(`Test published. ${res.message || ''}`);
        } catch (assignErr) {
          setError(
            `Test was published, but assigning it failed: ${assignErr.message}. ` +
            'Check that the selected batches have students in them.'
          );
          setSaving(false);
          return;
        }
      } else {
        showToast('Test published. Set a schedule and batches to assign it to students.');
      }

      setTimeout(() => navigate('/teacher'), 1800);
    } catch (err) {
      setError(err.message || 'Failed to publish test.');
    } finally {
      setSaving(false);
    }
  };

  // ─── Helpers ──────────────────────────────────────────────────────────────

  const toggleQuestion = (q) => {
    setSelectedQuestions((prev) =>
      prev.find((sq) => sq.id === q.id) ? prev.filter((sq) => sq.id !== q.id) : [...prev, q]
    );
  };

  const toggleBatch = (batchId) => {
    setSelectedBatchIds((prev) =>
      prev.includes(batchId) ? prev.filter((b) => b !== batchId) : [...prev, batchId]
    );
  };

  const handleNext = () => setStep((p) => Math.min(p + 1, 3));
  const handlePrev = () => setStep((p) => Math.max(p - 1, 1));

  const totalMarks = selectedQuestions.reduce((sum, q) => sum + (Number(q.marks) || 4), 0);
  const selectedBatchNames = batches
    .filter((b) => selectedBatchIds.includes(b.id))
    .map((b) => b.name);

  const StepIndicator = () => (
    <div className="step-indicator">
      {[1, 2, 3].map((s) => (
        <React.Fragment key={s}>
          <div className={`step-circle ${step >= s ? 'active' : ''} ${step > s ? 'completed' : ''}`}>
            {step > s ? <Check size={16} /> : s}
          </div>
          {s < 3 && <div className={`step-line ${step > s ? 'active' : ''}`}></div>}
        </React.Fragment>
      ))}
    </div>
  );

  return (
    <div className="test-constructor">
      <header className="page-header d-flex justify-between align-center">
        <div>
          <h1>Test Constructor</h1>
          <p>Design, build, and publish new assessments.</p>
        </div>
        <div className="header-actions">
          <button className="btn-outline" onClick={handleSaveDraft} disabled={saving}>
            {saving ? 'Saving…' : 'Save Draft'}
          </button>
          {step < 3 ? (
            <button className="btn-primary" onClick={handleNext}>Next Step <ChevronRight size={18} /></button>
          ) : (
            <button className="btn-primary success-bg" onClick={handlePublish} disabled={saving}>
              {saving ? 'Publishing…' : 'Publish Test'}
            </button>
          )}
        </div>
      </header>

      {toast && <div className="toast-notification">{toast}</div>}
      {error && (
        <div className="error-alert" style={{ color: '#dc2626', margin: '12px 0', padding: '10px 14px', background: '#fef2f2', borderRadius: '8px' }}>
          {error}
        </div>
      )}

      <div className="constructor-container">
        <div className="constructor-sidebar">
          <StepIndicator />
          <div className="step-labels">
            <div className={`step-label ${step === 1 ? 'active' : ''}`}><Settings size={18} /> 1. Test Metadata</div>
            <div className={`step-label ${step === 2 ? 'active' : ''}`}><ListChecks size={18} /> 2. Add Questions</div>
            <div className={`step-label ${step === 3 ? 'active' : ''}`}><FileText size={18} /> 3. Review & Publish</div>
          </div>
          {testId && (
            <p style={{ marginTop: '16px', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
              Draft saved · #{String(testId).substring(0, 8)}
            </p>
          )}
        </div>

        <div className="constructor-content">
          {step === 1 && (
            <div className="step-pane step-1">
              <h2>Test Metadata</h2>

              <div className="form-group">
                <label>Test Title</label>
                <input
                  type="text"
                  placeholder="e.g. Weekly Mock Test #4"
                  value={testData.title}
                  onChange={(e) => setTestData({ ...testData, title: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label>Description (optional)</label>
                <input
                  type="text"
                  placeholder="Short note shown to students"
                  value={testData.description}
                  onChange={(e) => setTestData({ ...testData, description: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label>Subject focus</label>
                <div className="subject-chips">
                  {SUBJECTS.map((sub) => (
                    <button
                      key={sub}
                      className={`chip ${testData.subject === sub ? 'active' : ''}`}
                      onClick={() => setTestData({ ...testData, subject: sub })}
                    >
                      {sub}
                    </button>
                  ))}
                </div>
                <span className="help-text">Used to filter the question bank in the next step.</span>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Duration (mins)</label>
                  <input
                    type="number"
                    min="1"
                    value={testData.duration_minutes}
                    onChange={(e) => setTestData({ ...testData, duration_minutes: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label>Total Marks</label>
                  <input type="number" value={totalMarks} readOnly disabled />
                  <span className="help-text">Calculated from the questions you select.</span>
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Window opens</label>
                  <input type="date" value={testData.startDate} onChange={(e) => setTestData({ ...testData, startDate: e.target.value })} />
                </div>
                <div className="form-group">
                  <label>Time</label>
                  <input type="time" value={testData.startTime} onChange={(e) => setTestData({ ...testData, startTime: e.target.value })} />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Window closes</label>
                  <input type="date" value={testData.endDate} onChange={(e) => setTestData({ ...testData, endDate: e.target.value })} />
                </div>
                <div className="form-group">
                  <label>Time</label>
                  <input type="time" value={testData.endTime} onChange={(e) => setTestData({ ...testData, endTime: e.target.value })} />
                </div>
              </div>

              <div className="form-group">
                <label>Target Batches</label>
                {batches.length === 0 ? (
                  <p className="help-text">
                    No batches found. Create one in Batch Management before assigning this test.
                  </p>
                ) : (
                  <div className="subject-chips">
                    {batches.map((b) => (
                      <button
                        key={b.id}
                        className={`chip ${selectedBatchIds.includes(b.id) ? 'active' : ''}`}
                        onClick={() => toggleBatch(b.id)}
                      >
                        {b.name}
                      </button>
                    ))}
                  </div>
                )}
                <span className="help-text">
                  A test is only assigned to students if batches and both schedule times are set.
                </span>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="step-pane step-2">
              <h2>Select Questions</h2>
              <div className="question-builder">
                <div className="question-bank-panel">
                  <div className="search-bar">
                    <Search size={18} className="search-icon" />
                    <input
                      type="text"
                      placeholder="Search question bank..."
                      value={searchInput}
                      onChange={(e) => setSearchInput(e.target.value)}
                    />
                  </div>

                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: '10px 0', fontSize: '0.85rem' }}>
                    <input
                      type="checkbox"
                      checked={filterBySubject}
                      onChange={(e) => setFilterBySubject(e.target.checked)}
                    />
                    Only show {testData.subject}
                  </label>

                  <div className="question-list">
                    {questionsLoading && (
                      <p className="empty-state">
                        <Loader2 size={16} style={{ verticalAlign: 'middle', marginRight: '6px' }} />
                        Loading questions…
                      </p>
                    )}

                    {!questionsLoading && questions.length === 0 && (
                      <p className="empty-state">No questions found. Try clearing the filters.</p>
                    )}

                    {!questionsLoading && questions.map((q) => {
                      const isSelected = selectedQuestions.some((sq) => sq.id === q.id);
                      return (
                        <div key={q.id} className={`q-card ${isSelected ? 'selected' : ''}`}>
                          <div className="q-card-header">
                            <span className="q-subject">{q.subject}</span>
                            <span className={`q-diff ${(q.difficulty || 'medium').toLowerCase()}`}>
                              {q.difficulty || 'medium'}
                            </span>
                          </div>
                          {q.image_url ? (
                            <img
                              src={q.image_url}
                              alt="Question"
                              style={{ maxWidth: '100%', maxHeight: '140px', objectFit: 'contain', borderRadius: '6px', background: '#fff' }}
                            />
                          ) : (
                            <p className="q-text">{q.question_text || 'No content'}</p>
                          )}
                          <div className="q-card-footer">
                            <span className="q-marks">{q.marks ?? 4} Marks</span>
                            <button
                              className={`btn-sm ${isSelected ? 'btn-danger' : 'btn-primary'}`}
                              onClick={() => toggleQuestion(q)}
                            >
                              {isSelected ? 'Remove' : 'Add'}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="selected-questions-panel">
                  <h3>Selected ({selectedQuestions.length})</h3>
                  <div className="selected-list">
                    {selectedQuestions.length === 0 ? (
                      <p className="empty-state">No questions selected yet.</p>
                    ) : (
                      selectedQuestions.map((q, idx) => (
                        <div key={q.id} className="selected-q-item">
                          <span className="q-number">{idx + 1}.</span>
                          <span className="q-snippet">
                            {(q.question_text || `[Image question — ${q.topic || q.subject}]`).substring(0, 40)}…
                          </span>
                          <button className="icon-btn-danger" onClick={() => toggleQuestion(q)}>
                            <Trash2 size={16} />
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="step-pane step-3">
              <h2>Review Summary</h2>
              <div className="summary-card">
                <div className="summary-header">
                  <h3>{testData.title || 'Untitled Test'}</h3>
                  <span className="subject-badge">{testData.subject}</span>
                </div>

                <div className="summary-grid">
                  <div className="summary-item">
                    <span className="label">Duration</span>
                    <span className="value">{testData.duration_minutes} mins</span>
                  </div>
                  <div className="summary-item">
                    <span className="label">Total Marks</span>
                    <span className="value">{totalMarks}</span>
                  </div>
                  <div className="summary-item">
                    <span className="label">Questions</span>
                    <span className="value">{selectedQuestions.length}</span>
                  </div>
                  <div className="summary-item">
                    <span className="label">Opens</span>
                    <span className="value">
                      {testData.startDate ? `${testData.startDate} ${testData.startTime || ''}` : 'Not set'}
                    </span>
                  </div>
                  <div className="summary-item">
                    <span className="label">Closes</span>
                    <span className="value">
                      {testData.endDate ? `${testData.endDate} ${testData.endTime || ''}` : 'Not set'}
                    </span>
                  </div>
                </div>

                <div className="summary-section">
                  <h4>Target Batches</h4>
                  <div className="batches-list">
                    {selectedBatchNames.length === 0 ? (
                      <span className="help-text">None selected — the test will publish but won't be assigned.</span>
                    ) : (
                      selectedBatchNames.map((b) => <span key={b} className="batch-chip">{b}</span>)
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="step-navigation">
            {step > 1 ? (
              <button className="btn-outline" onClick={handlePrev}><ChevronLeft size={18} /> Previous</button>
            ) : <div></div>}
          </div>
        </div>
      </div>
    </div>
  );
};

export default TestConstructor;
