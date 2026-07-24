import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, ChevronRight, ChevronLeft, Search, Plus, Trash2, FileText, Settings, ListChecks } from 'lucide-react';
import { useAppData } from '../../context/AppDataContext';
import './TestConstructor.css';

const TestConstructor = () => {
  const navigate = useNavigate();
  const { questions, tests, setTests } = useAppData();
  const [step, setStep] = useState(1);
  const [selectedQuestions, setSelectedQuestions] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');

  // Toast State
  const [toast, setToast] = useState('');

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  };

  // Step 1 State
  const [testData, setTestData] = useState({
    title: '',
    subject: 'Physics',
    duration: 60,
    totalMarks: 100,
    negativeMarking: true,
    negativeMarks: 1,
    date: '',
    time: '',
    targetBatches: ['Grade 12 Physics - Batch A']
  });

  const handleNext = () => setStep(prev => Math.min(prev + 1, 3));
  const handlePrev = () => setStep(prev => Math.max(prev - 1, 1));
  const handleSaveDraft = () => showToast('Draft saved successfully!');
  const handlePublish = () => {
    const newTest = {
      id: Date.now().toString(),
      title: testData.title || 'Untitled Test',
      subjects: testData.subject,
      questions: selectedQuestions.map(q => q.id),
      duration: testData.duration * 60,
      createdAt: new Date().toISOString()
    };
    setTests([...tests, newTest]);
    showToast('Test published successfully!');
    setTimeout(() => navigate('/teacher'), 1500);
  };
  const toggleQuestion = (q) => {
    if (selectedQuestions.find(sq => sq.id === q.id)) {
      setSelectedQuestions(selectedQuestions.filter(sq => sq.id !== q.id));
    } else {
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
          <h1>Test Constructor</h1>
          <p>Design, build, and publish new assessments.</p>
        </div>
        <div className="header-actions">
          <button className="btn-outline" onClick={handleSaveDraft}>Save Draft</button>
          {step < 3 ? (
            <button className="btn-primary" onClick={handleNext}>Next Step <ChevronRight size={18} /></button>
          ) : (
            <button className="btn-primary success-bg" onClick={handlePublish}>Publish Test</button>
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
              <div className="form-group">
                <label>Test Title</label>
                <input type="text" placeholder="e.g. Weekly Mock Test #4" value={testData.title} onChange={e => setTestData({...testData, title: e.target.value})} />
              </div>
              
              <div className="form-group">
                <label>Subject</label>
                <div className="subject-chips">
                  {['Physics', 'Chemistry', 'Mathematics', 'Biology'].map(sub => (
                    <button 
                      key={sub} 
                      className={`chip ${testData.subject === sub ? 'active' : ''}`}
                      onClick={() => setTestData({...testData, subject: sub})}
                    >
                      {sub}
                    </button>
                  ))}
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Duration (mins)</label>
                  <input type="number" value={testData.duration} onChange={e => setTestData({...testData, duration: e.target.value})} />
                </div>
                <div className="form-group">
                  <label>Total Marks</label>
                  <input type="number" value={testData.totalMarks} onChange={e => setTestData({...testData, totalMarks: e.target.value})} />
                </div>
              </div>

              <div className="form-group toggle-group">
                <label className="toggle-label">
                  <input type="checkbox" checked={testData.negativeMarking} onChange={e => setTestData({...testData, negativeMarking: e.target.checked})} />
                  Enable Negative Marking
                </label>
                {testData.negativeMarking && (
                  <input type="number" className="inline-input" value={testData.negativeMarks} onChange={e => setTestData({...testData, negativeMarks: e.target.value})} />
                )}
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Schedule Date</label>
                  <input type="date" value={testData.date} onChange={e => setTestData({...testData, date: e.target.value})} />
                </div>
                <div className="form-group">
                  <label>Time</label>
                  <input type="time" value={testData.time} onChange={e => setTestData({...testData, time: e.target.value})} />
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
                    setTestData({...testData, targetBatches: options});
                  }}
                >
                  <option value="Grade 12 Physics - Batch A">Grade 12 Physics - Batch A</option>
                  <option value="JEE Advanced - Evening">JEE Advanced - Evening</option>
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
                  <div className="question-list">
                    {questions.filter(q => q.text.toLowerCase().includes(searchQuery.toLowerCase())).map(q => {
                      const isSelected = selectedQuestions.find(sq => sq.id === q.id);
                      return (
                        <div key={q.id} className={`q-card ${isSelected ? 'selected' : ''}`}>
                          <div className="q-card-header">
                            <span className="q-subject">{q.subject}</span>
                            <span className={`q-diff ${q.difficulty.toLowerCase()}`}>{q.difficulty}</span>
                          </div>
                          <p className="q-text">{q.text}</p>
                          <div className="q-card-footer">
                            <span className="q-marks">4 Marks</span>
                            <button className={`btn-sm ${isSelected ? 'btn-danger' : 'btn-primary'}`} onClick={() => toggleQuestion(q)}>
                              {isSelected ? 'Remove' : 'Add'}
                            </button>
                          </div>
                        </div>
                      )
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
                          <span className="q-snippet">{q.text.substring(0, 40)}...</span>
                          <button className="icon-btn-danger" onClick={() => toggleQuestion(q)}><Trash2 size={16} /></button>
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
                    {testData.targetBatches.map(b => <span key={b} className="batch-chip">{b}</span>)}
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