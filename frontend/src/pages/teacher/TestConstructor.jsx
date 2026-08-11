import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Check, ChevronRight, ChevronLeft, Search, Plus, Trash2, FileText, Settings, ListChecks } from 'lucide-react';
import { useAppData } from '../../context/AppDataContext';
import { apiClient } from '../../api/client';
import './TestConstructor.css';

const MCQ_TYPES = ['mcq', 'single_correct', 'single', 'scq', 'multi_correct', 'multiple_correct', 'multi', 'multiple', 'assertion'];
const NAT_TYPES = ['nat', 'integer', 'numerical', 'numeric', 'int'];

function getQuestionType(q) {
  const key = String(q.q_type || q.type || '').trim().toLowerCase();
  if (MCQ_TYPES.includes(key)) return 'mcq';
  if (NAT_TYPES.includes(key)) return 'nat';
  return Array.isArray(q.options) && q.options.length > 0 ? 'mcq' : 'nat';
}

const TestConstructor = () => {
  const navigate = useNavigate();
  const { testId } = useParams();
  const { questions, batches, refreshTests } = useAppData();
  const [step, setStep] = useState(1);
  const [selectedQuestions, setSelectedQuestions] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');

  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const userSubject = user.subject && user.subject !== 'All' ? user.subject : null;

  const [subjectFilter, setSubjectFilter] = useState(userSubject || '');

  // Safety check: if questions is undefined, default to []
  const safeQuestions = questions || [];

  // Toast State
  const [toast, setToast] = useState('');

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  };

  // Step 1 State
  const [testData, setTestData] = useState({
    title: '',
    subject: userSubject || 'Physics',
    duration: 60,
    totalMarks: 0,
    negativeMarking: true,
    negativeMarks: 1,
    date: '',
    time: '',
    targetBatches: [],
    t_type: 'quiz'
  });

  const [existingTest, setExistingTest] = useState(null);
  const isInitiator = !existingTest || existingTest.created_by === user.id;

  useEffect(() => {
    if (testId) {
      apiClient.get(`/tests/${testId}`).then(data => {
        setExistingTest(data);
        setTestData(prev => ({
          ...prev,
          title: data.title,
          subject: data.subject || prev.subject,
          t_type: data.paper_pattern || data.t_type || 'quiz',
          duration: data.duration_minutes,
          totalMarks: data.total_marks,
          // Read from the real columns, falling back to the old description
          // convention for tests created before the migration.
          negativeMarking: data.negative_marking ?? !!data.description?.includes('Negative Marking'),
          negativeMarks: data.negative_marks ?? prev.negativeMarks,
        }));
        if (data.test_questions) {
          const qs = data.test_questions.map(tq => ({ ...tq.questions, marks: tq.questions.marks || 4 }));
          setSelectedQuestions(qs);
        }
      }).catch(err => showToast('Failed to load test: ' + err.message));
    }
  }, [testId]);

  // Calculate total marks when questions change
  useEffect(() => {
    const newTotal = selectedQuestions.reduce((sum, q) => sum + (q.marks || 4), 0);
    setTestData(prev => ({ ...prev, totalMarks: newTotal }));
  }, [selectedQuestions]);

  const handleNext = () => setStep(prev => Math.min(prev + 1, 3));
  const handlePrev = () => setStep(prev => Math.max(prev - 1, 1));

  const saveToBackend = async (status) => {
    try {
      let scheduledStart = undefined;
      let scheduledEnd = undefined;

      if (testData.date && testData.time) {
        scheduledStart = new Date(`${testData.date}T${testData.time}`).toISOString();
      }

      // Default the close of the window to 7 days out when only a start is given,
      // so the backend's scheduled_end check has something meaningful to enforce.
      if (scheduledStart && !scheduledEnd) {
        scheduledEnd = new Date(
          new Date(scheduledStart).getTime() + 7 * 24 * 60 * 60 * 1000,
        ).toISOString();
      }

      const payload = {
        title: testData.title || 'Untitled Test',
        description: `Subject: ${testData.subject}`,
        subject: testData.subject,
        // May be a plain kind ('quiz') or a pattern ('jee_main'); the API accepts
        // either here and splits them server-side.
        t_type: testData.t_type,
        duration_minutes: parseInt(testData.duration, 10),
        total_marks: testData.totalMarks,
        status: status,
        // Real columns now — grading applies the penalty server-side.
        negative_marking: !!testData.negativeMarking,
        negative_marks: testData.negativeMarking ? Number(testData.negativeMarks) || 0 : 0,
        question_ids: selectedQuestions.map(q => q.id),
        batch_ids: testData.targetBatches,
        scheduled_start: scheduledStart,
        scheduled_end: scheduledEnd
      };

      if (testData.t_type === 'jee_main' && status === 'published') {
        const subjects = [...new Set(selectedQuestions.map(q => q.subject))];
        for (const sub of subjects) {
          const subQs = selectedQuestions.filter(q => q.subject === sub);
          const mcqCount = subQs.filter(q => getQuestionType(q) === 'mcq').length;
          const natCount = subQs.filter(q => getQuestionType(q) === 'nat').length;
          if (mcqCount !== 20 || natCount !== 10) {
            showToast(`Cannot publish: ${sub} has ${mcqCount}/20 MCQs and ${natCount}/10 Numericals.`);
            return;
          }
        }
      }

      if (testId) {
        if (isInitiator) {
          await apiClient.patch(`/tests/${testId}`, {
            title: payload.title,
            description: payload.description,
            subject: payload.subject,
            duration_minutes: payload.duration_minutes,
            total_marks: payload.total_marks,
            negative_marking: payload.negative_marking,
            negative_marks: payload.negative_marks
          });
          if (status === 'published' && existingTest.status === 'draft') {
            await apiClient.patch(`/tests/${testId}/publish`);
          }
          if (payload.batch_ids.length > 0 && scheduledStart) {
            await apiClient.post(`/tests/${testId}/assign`, {
              batch_ids: payload.batch_ids,
              scheduled_start: payload.scheduled_start,
              scheduled_end: payload.scheduled_end
            });
          }
        }
        await apiClient.post(`/tests/${testId}/questions`, { question_ids: payload.question_ids });
      } else {
        await apiClient.post('/tests/constructor', payload);
      }

      await refreshTests();

      showToast(`Test ${status === 'draft' ? 'saved as draft' : 'published'} successfully!`);
      setTimeout(() => navigate('/teacher/test-library'), 1500);
    } catch (err) {
      console.error(err);
      showToast(`Failed to ${status === 'draft' ? 'save draft' : 'publish'}: ` + err.message);
    }
  };

  const handleSaveDraft = () => saveToBackend('draft');
  const handlePublish = () => saveToBackend('published');

  const toggleQuestion = (q) => {
    if (userSubject && userSubject !== q.subject) {
      showToast(`You can only modify ${userSubject} questions.`);
      return;
    }

    const isJeeMain = testData.t_type === 'jee_main';
    const isSelected = selectedQuestions.find(sq => sq.id === q.id);

    if (isSelected) {
      setSelectedQuestions(selectedQuestions.filter(sq => sq.id !== q.id));
    } else {
      if (isJeeMain) {
        const subjectQuestions = selectedQuestions.filter(sq => sq.subject === q.subject);
        const qType = getQuestionType(q);
        const currentCount = subjectQuestions.filter(sq => getQuestionType(sq) === qType).length;
        const limit = qType === 'mcq' ? 20 : 10;

        if (currentCount >= limit) {
          showToast(`Cannot add more than ${limit} ${qType === 'mcq' ? 'MCQ' : 'Numerical'} questions for ${q.subject} in JEE Main pattern.`);
          return;
        }
      }
      setSelectedQuestions([...selectedQuestions, q]);
    }
  };

  const StepIndicator = () => (
    <div className="step-indicator">
      {[1, 2, 3].map(s => (
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
          {/* A teacher only ever reaches this page to fill in an assigned
              paper; building one from scratch is an admin action. */}
          <h1>{isInitiator ? 'Test Constructor' : 'Add Questions'}</h1>
          <p>
            {isInitiator
              ? 'Design, build, and publish new assessments.'
              : `Add the ${userSubject ? `${userSubject} ` : ''}questions for this paper.`}
          </p>
        </div>
        <div className="header-actions">
          <button className="btn-outline" onClick={handleSaveDraft}>
            {isInitiator ? 'Save Draft' : 'Save Questions'}
          </button>
          {step < 3 ? (
            <button className="btn-primary" onClick={handleNext}>Next Step <ChevronRight size={18} /></button>
          ) : (
            isInitiator ? (
              <button className="btn-primary success-bg" onClick={handlePublish}>Publish Test</button>
            ) : (
              <button className="btn-primary success-bg" onClick={handleSaveDraft}>Save Questions</button>
            )
          )}
        </div>
      </header>

      {toast && <div className="toast-notification">{toast}</div>}

      <div className="constructor-container">
        <div className="constructor-sidebar">
          <StepIndicator />
          <div className="step-labels">
            <div className={`step-label ${step === 1 ? 'active' : ''}`}><Settings size={18} /> 1. Test Metadata</div>
            <div className={`step-label ${step === 2 ? 'active' : ''}`}><ListChecks size={18} /> 2. Add Questions</div>
            <div className={`step-label ${step === 3 ? 'active' : ''}`}><FileText size={18} /> 3. Review & Publish</div>
          </div>
        </div>

        <div className="constructor-content">
          {step === 1 && (
            <div className="step-pane step-1">
              <h2>Test Metadata</h2>
              {!isInitiator && (
                <div style={{ background: '#fef3c7', padding: '10px 15px', borderRadius: '8px', color: '#92400e', marginBottom: '15px' }}>
                  <strong>Collaboration Mode:</strong> You can only add or remove questions for your subject. Only the test initiator can edit metadata or delete this test.
                </div>
              )}
              <div className="form-group">
                <label>Test Title</label>
                <input type="text" placeholder="e.g. Weekly Mock Test #4" value={testData.title} onChange={e => setTestData({ ...testData, title: e.target.value })} disabled={!isInitiator} />
              </div>

              <div className="form-group">
                <label>Subject</label>
                <div className="subject-chips">
                  {['Physics', 'Chemistry', 'Mathematics', 'Biology'].map(sub => (
                    <button
                      key={sub}
                      className={`chip ${testData.subject === sub ? 'active' : ''}`}
                      onClick={() => !userSubject && setTestData({ ...testData, subject: sub })}
                      disabled={userSubject && userSubject !== sub}
                      style={userSubject && userSubject !== sub ? { opacity: 0.5, cursor: 'not-allowed' } : {}}
                    >
                      {sub}
                    </button>
                  ))}
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Duration (mins)</label>
                  <input type="number" value={testData.duration} onChange={e => setTestData({ ...testData, duration: e.target.value })} disabled={!isInitiator} />
                </div>
                <div className="form-group">
                  <label>Total Marks (Auto-calculated)</label>
                  <input type="number" value={testData.totalMarks} disabled style={{ backgroundColor: '#f1f5f9' }} />
                </div>
              </div>

              <div className="form-group toggle-group">
                <label className="toggle-label">
                  <input type="checkbox" checked={testData.negativeMarking} onChange={e => setTestData({ ...testData, negativeMarking: e.target.checked })} disabled={!isInitiator} />
                  Enable Negative Marking
                </label>
                {testData.negativeMarking && (
                  <input type="number" className="inline-input" value={testData.negativeMarks} onChange={e => setTestData({ ...testData, negativeMarks: e.target.value })} disabled={!isInitiator} />
                )}
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Schedule Date (Optional)</label>
                  <input type="date" value={testData.date} onChange={e => setTestData({ ...testData, date: e.target.value })} disabled={!isInitiator} />
                </div>
                <div className="form-group">
                  <label>Time (Optional)</label>
                  <input type="time" value={testData.time} onChange={e => setTestData({ ...testData, time: e.target.value })} disabled={!isInitiator} />
                </div>
              </div>

              <div className="form-group">
                <label>Target Batches</label>
                <select
                  multiple
                  className="multi-select"
                  value={testData.targetBatches}
                  onChange={e => {
                    const options = Array.from(e.target.selectedOptions, option => option.value);
                    setTestData({ ...testData, targetBatches: options });
                  }}
                  disabled={!isInitiator}
                >
                  {batches.map(b => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
                <span className="help-text">Hold Ctrl/Cmd to select multiple batches.</span>
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
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                    />
                  </div>
                  <div className="subject-chips" style={{ marginBottom: '15px', display: 'flex', gap: '8px', flexWrap: 'wrap', padding: '0 16px' }}>
                    <button
                      className={`chip ${subjectFilter === '' ? 'active' : ''}`}
                      onClick={() => !userSubject && setSubjectFilter('')}
                      disabled={!!userSubject}
                      style={{ padding: '6px 12px', borderRadius: '16px', border: '1px solid #e2e8f0', background: subjectFilter === '' ? '#6366f1' : '#f8fafc', color: subjectFilter === '' ? '#fff' : '#475569', cursor: userSubject ? 'not-allowed' : 'pointer', opacity: userSubject ? 0.5 : 1 }}
                    >All</button>
                    {['Physics', 'Chemistry', 'Mathematics', 'Biology'].map(sub => (
                      <button
                        key={sub}
                        className={`chip ${subjectFilter === sub ? 'active' : ''}`}
                        onClick={() => !userSubject && setSubjectFilter(sub)}
                        disabled={userSubject && userSubject !== sub}
                        style={{ padding: '6px 12px', borderRadius: '16px', border: '1px solid #e2e8f0', background: subjectFilter === sub ? '#6366f1' : '#f8fafc', color: subjectFilter === sub ? '#fff' : '#475569', cursor: (userSubject && userSubject !== sub) ? 'not-allowed' : 'pointer', opacity: (userSubject && userSubject !== sub) ? 0.5 : 1 }}
                      >
                        {sub}
                      </button>
                    ))}
                  </div>
                  <div className="question-list">
                    {(() => {
                      const filteredQs = safeQuestions
                        .filter(q => (q.question_text || q.text || '').toLowerCase().includes(searchQuery.toLowerCase()))
                        .filter(q => subjectFilter === '' || (q.subject || '').toLowerCase() === subjectFilter.toLowerCase());

                      if (filteredQs.length === 0) {
                        return (
                          <div style={{ padding: '20px', textAlign: 'center', color: '#64748b' }}>
                            <p>No questions found for the current filters.</p>
                            <p style={{ fontSize: '12px' }}>Bank total: {safeQuestions.length} | Subject: {subjectFilter || 'All'}</p>
                          </div>
                        );
                      }

                      return filteredQs.map(q => {
                        const isSelected = selectedQuestions.find(sq => sq.id === q.id);
                        return (
                          <div key={q.id} className={`q-card ${isSelected ? 'selected' : ''}`}>
                            <div className="q-card-header">
                              <span className="q-subject">{q.subject}</span>
                              <span className={`q-diff ${q.difficulty ? q.difficulty.toLowerCase() : 'medium'}`}>{q.difficulty || 'Medium'}</span>
                            </div>
                            <p className="q-text">{q.question_text || q.text}</p>
                            {q.image_url && <img src={q.image_url} alt="Question Diagram" style={{ maxWidth: '100%', maxHeight: '150px', borderRadius: '4px', marginTop: '10px' }} />}
                            <div className="q-card-footer">
                              <span className="q-marks">{q.marks || 4} Marks</span>
                              <button className={`btn-sm ${isSelected ? 'btn-danger' : 'btn-primary'}`} onClick={() => toggleQuestion(q)}>
                                {isSelected ? 'Remove' : 'Add'}
                              </button>
                            </div>
                          </div>
                        );
                      });
                    })()}
                  </div>
                </div>

                <div className="selected-questions-panel">
                  <h3>Selected ({selectedQuestions.length})</h3>

                  {testData.t_type === 'jee_main' ? (
                    <div className="selected-list">
                      {['Physics', 'Chemistry', 'Mathematics', 'Biology'].map(sub => {
                        const subQs = selectedQuestions.filter(q => q.subject === sub);
                        if (subQs.length === 0 && (!userSubject || userSubject !== sub)) return null;

                        const mcqQs = subQs.filter(q => getQuestionType(q) === 'mcq');
                        const natQs = subQs.filter(q => getQuestionType(q) === 'nat');

                        return (
                          <div key={sub} style={{ marginBottom: '20px' }}>
                            <h4 style={{ fontSize: '14px', color: 'var(--text-primary)', marginBottom: '8px', borderBottom: '1px solid #e2e8f0', paddingBottom: '4px' }}>{sub}</h4>

                            <div style={{ marginBottom: '12px' }}>
                              <div style={{ fontSize: '12px', fontWeight: '600', color: mcqQs.length === 20 ? '#10b981' : '#6366f1', marginBottom: '6px' }}>
                                Section A (MCQ): {mcqQs.length} / 20
                              </div>
                              {mcqQs.map((q, idx) => (
                                <div key={q.id} className="selected-q-item">
                                  <span className="q-number">{idx + 1}.</span>
                                  <span className="q-snippet">{(q.question_text || q.text || '').substring(0, 30)}...</span>
                                  {(!userSubject || userSubject === q.subject) && (
                                    <button className="icon-btn-danger" onClick={() => toggleQuestion(q)}><Trash2 size={16} /></button>
                                  )}
                                </div>
                              ))}
                              {mcqQs.length === 0 && <p className="empty-state" style={{ fontSize: '12px', margin: '4px 0' }}>No MCQs selected.</p>}
                            </div>

                            <div>
                              <div style={{ fontSize: '12px', fontWeight: '600', color: natQs.length === 10 ? '#10b981' : '#6366f1', marginBottom: '6px' }}>
                                Section B (Numerical): {natQs.length} / 10
                              </div>
                              {natQs.map((q, idx) => (
                                <div key={q.id} className="selected-q-item">
                                  <span className="q-number">{idx + 1}.</span>
                                  <span className="q-snippet">{(q.question_text || q.text || '').substring(0, 30)}...</span>
                                  {(!userSubject || userSubject === q.subject) && (
                                    <button className="icon-btn-danger" onClick={() => toggleQuestion(q)}><Trash2 size={16} /></button>
                                  )}
                                </div>
                              ))}
                              {natQs.length === 0 && <p className="empty-state" style={{ fontSize: '12px', margin: '4px 0' }}>No Numerical questions selected.</p>}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  ) : (
                    <div className="selected-list">
                      {selectedQuestions.length === 0 ? (
                        <p className="empty-state">No questions selected yet.</p>
                      ) : (
                        selectedQuestions.map((q, idx) => (
                          <div key={q.id} className="selected-q-item">
                            <span className="q-number">{idx + 1}.</span>
                            <span className="q-snippet">{(q.question_text || q.text || '').substring(0, 40)}...</span>
                            {(!userSubject || userSubject === q.subject) && (
                              <button className="icon-btn-danger" onClick={() => toggleQuestion(q)}><Trash2 size={16} /></button>
                            )}
                          </div>
                        ))
                      )}
                    </div>
                  )}
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
                    <span className="value">{testData.duration} mins</span>
                  </div>
                  <div className="summary-item">
                    <span className="label">Total Marks</span>
                    <span className="value">{testData.totalMarks}</span>
                  </div>
                  <div className="summary-item">
                    <span className="label">Questions</span>
                    <span className="value">{selectedQuestions.length}</span>
                  </div>
                  <div className="summary-item">
                    <span className="label">Negative Marking</span>
                    <span className="value">{testData.negativeMarking ? `Yes (-${testData.negativeMarks})` : 'No'}</span>
                  </div>
                  <div className="summary-item">
                    <span className="label">Scheduled</span>
                    <span className="value">{testData.date ? `${testData.date} at ${testData.time}` : 'Unscheduled'}</span>
                  </div>
                </div>

                <div className="summary-section">
                  <h4>Target Batches</h4>
                  <div className="batches-list">
                    {testData.targetBatches.map(bId => {
                      const batch = batches.find(b => b.id === bId);
                      return <span key={bId} className="batch-chip">{batch ? batch.name : bId}</span>
                    })}
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