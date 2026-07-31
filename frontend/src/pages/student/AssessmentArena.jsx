import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Flag, ChevronLeft, ChevronRight, AlertTriangle, Clock, CheckCircle } from 'lucide-react';
import { apiClient } from '../../api/client';
import './AssessmentArena.css';

const AssessmentArena = () => {
  const navigate = useNavigate();
  const { testId } = useParams();

  const [test, setTest] = useState(null);
  const [testQuestions, setTestQuestions] = useState([]);
  const [attemptId, setAttemptId] = useState(null);

  const [currentQ, setCurrentQ] = useState(0);
  const [answers, setAnswers] = useState({});
  const [flagged, setFlagged] = useState(new Set());
  const [timeLeft, setTimeLeft] = useState(3600);
  
  const [loading, setLoading] = useState(true);
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [showAutoSubmit, setShowAutoSubmit] = useState(false);
  const timerRef = useRef(null);

  useEffect(() => {
    const initTest = async () => {
      try {
        setLoading(true);
        // 1. Get test details
        const testRes = await apiClient.get(`/tests/${testId}`);
        setTest(testRes);

        // 2. Start attempt
        const startRes = await apiClient.post(`/attempts/start/${testId}`);
        setAttemptId(startRes.attemptId);
        
        // Timer
        let endTime = new Date(startRes.expiresAt).getTime();
        const updateTimer = () => {
          const remaining = Math.max(0, Math.floor((endTime - Date.now()) / 1000));
          setTimeLeft(remaining);
          if (remaining <= 0) {
            clearInterval(timerRef.current);
            setShowAutoSubmit(true);
          }
        };
        updateTimer();
        timerRef.current = setInterval(updateTimer, 1000);

        // 3. Get questions
        const qRes = await apiClient.get(`/tests/${testId}/questions`);
        // qRes looks like: [{ question_order, questions: { id, text, options... } }]
        setTestQuestions(qRes || []);
      } catch (err) {
        alert(err.message || 'Error starting test');
        navigate('/student');
      } finally {
        setLoading(false);
      }
    };
    initTest();

    return () => clearInterval(timerRef.current);
  }, [testId, navigate]);

  const formatTime = (secs) => {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  const handleAnswer = async (optIndex) => {
    setAnswers(prev => ({ ...prev, [currentQ]: optIndex }));
    const questionId = testQuestions[currentQ].questions.id;
    
    try {
      await apiClient.patch(`/attempts/${attemptId}/answer`, {
        question_id: questionId,
        selected_answer: { index: optIndex },
        time_spent_seconds: 15 // Mock time spent
      });
    } catch (err) {
      console.error('Failed to save answer', err);
    }
  };

  const toggleFlag = async () => {
    const isFlagged = !flagged.has(currentQ);
    setFlagged(prev => {
      const next = new Set(prev);
      if (next.has(currentQ)) next.delete(currentQ);
      else next.add(currentQ);
      return next;
    });

    const questionId = testQuestions[currentQ].questions.id;
    try {
      await apiClient.patch(`/attempts/${attemptId}/flag`, {
        question_id: questionId,
        flagged: isFlagged
      });
    } catch (err) {
      console.error('Failed to toggle flag', err);
    }
  };

  const getQStatus = (idx) => {
    if (flagged.has(idx)) return 'flagged';
    if (answers[idx] !== undefined) return 'answered';
    return 'unanswered';
  };

  const answeredCount = Object.keys(answers).length;
  const unansweredCount = testQuestions.length - answeredCount;

  const handleFinalSubmit = async (auto = false) => {
    clearInterval(timerRef.current);
    try {
      await apiClient.post(`/attempts/${attemptId}/submit`, { autoSubmitted: auto });
      navigate(`/student/result/${attemptId}`); // Navigate to result with attemptId
    } catch (err) {
      alert('Error submitting test: ' + err.message);
      navigate('/student');
    }
  };

  const isWarning = timeLeft < 300; 

  if (loading || !testQuestions.length) {
    return <div style={{padding: '40px', color: 'white'}}>Loading test...</div>;
  }

  const currentQuestion = testQuestions[currentQ].questions;

  return (
    <div className="arena-wrapper">
      <header className="arena-header">
        <div className="header-left">
          <span className="exam-title">{test?.title || 'Assessment'}</span>
          <span className="exam-meta">{currentQuestion.subject || 'General'}</span>
        </div>
        <div className={`timer-block ${isWarning ? 'timer-warning' : ''}`}>
          <Clock size={20} />
          <span className="timer-display">{formatTime(timeLeft)}</span>
          {isWarning && <span className="warning-label">Time Running Low!</span>}
        </div>
        <div className="header-right">
          <div className="progress-summary">
            <span className="stat answered"><CheckCircle size={14} /> {answeredCount} Answered</span>
            <span className="stat unanswered">◯ {unansweredCount} Left</span>
            <span className="stat flagged-stat"><Flag size={14} /> {flagged.size} Flagged</span>
          </div>
          <button className="btn-submit-exam" onClick={() => setShowSubmitModal(true)}>Submit Exam</button>
        </div>
      </header>

      <div className="arena-body">
        <div className="question-panel">
          <div className="q-meta-row">
            <span className={`q-subject-badge subject-${currentQuestion.subject.toLowerCase()}`}>
              {currentQuestion.subject}
            </span>
            <span className="q-counter">Question {currentQ + 1} of {testQuestions.length}</span>
            <button
              className={`flag-btn ${flagged.has(currentQ) ? 'flagged' : ''}`}
              onClick={toggleFlag}
            >
              <Flag size={16} />
              {flagged.has(currentQ) ? 'Flagged' : 'Flag for Review'}
            </button>
          </div>

          <div className="question-text">
            <p>{currentQuestion.question_text}</p>
          </div>

          <div className="options-list">
            {currentQuestion.options.map((opt, idx) => (
              <button
                key={idx}
                className={`option-btn ${answers[currentQ] === idx ? 'selected' : ''}`}
                onClick={() => handleAnswer(idx)}
              >
                <span className="opt-letter">{['A', 'B', 'C', 'D'][idx]}</span>
                <span className="opt-text">{opt}</span>
                {answers[currentQ] === idx && <CheckCircle size={18} className="opt-check" />}
              </button>
            ))}
          </div>

          <div className="q-navigation">
            <button
              className="nav-btn"
              onClick={() => setCurrentQ(prev => Math.max(prev - 1, 0))}
              disabled={currentQ === 0}
            >
              <ChevronLeft size={20} /> Previous
            </button>
            <button
              className="nav-btn primary"
              onClick={() => setCurrentQ(prev => Math.min(prev + 1, testQuestions.length - 1))}
              disabled={currentQ === testQuestions.length - 1}
            >
              Save & Next <ChevronRight size={20} />
            </button>
          </div>
        </div>

        <aside className="question-grid-panel">
          <h3 className="grid-title">Question Navigator</h3>
          <div className="grid-legend">
            <span className="legend-item"><span className="dot answered-dot"></span> Answered</span>
            <span className="legend-item"><span className="dot unanswered-dot"></span> Not Answered</span>
            <span className="legend-item"><span className="dot flagged-dot"></span> Flagged</span>
          </div>

          <div className="q-grid">
            {testQuestions.map((_, idx) => {
              const status = getQStatus(idx);
              return (
                <button
                  key={idx}
                  className={`q-grid-btn ${status} ${currentQ === idx ? 'current' : ''}`}
                  onClick={() => setCurrentQ(idx)}
                >
                  {idx + 1}
                </button>
              );
            })}
          </div>

          <div className="grid-stats">
            <div className="stat-row"><span>Total Questions</span><strong>{testQuestions.length}</strong></div>
            <div className="stat-row"><span>Answered</span><strong className="text-green">{answeredCount}</strong></div>
            <div className="stat-row"><span>Not Answered</span><strong className="text-red">{unansweredCount}</strong></div>
            <div className="stat-row"><span>Flagged</span><strong className="text-orange">{flagged.size}</strong></div>
          </div>
        </aside>
      </div>

      {showSubmitModal && (
        <div className="modal-overlay">
          <div className="submit-modal">
            <AlertTriangle size={40} className="modal-warning-icon" />
            <h2>Submit Exam?</h2>
            <p>You've answered <strong>{answeredCount}</strong> out of <strong>{testQuestions.length}</strong> questions.</p>
            {unansweredCount > 0 && (
              <p className="unanswered-warning">{unansweredCount} question(s) are still unanswered.</p>
            )}
            <div className="modal-actions">
              <button className="btn-go-back" onClick={() => setShowSubmitModal(false)}>Go Back & Review</button>
              <button className="btn-confirm-submit" onClick={() => handleFinalSubmit(false)}>Yes, Submit Now</button>
            </div>
          </div>
        </div>
      )}

      {showAutoSubmit && (
        <div className="modal-overlay">
          <div className="submit-modal auto-submit">
            <Clock size={40} className="modal-warning-icon" />
            <h2>Time's Up!</h2>
            <p>Your exam has been auto-submitted.</p>
            <button className="btn-confirm-submit" onClick={() => handleFinalSubmit(true)}>View Results</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default AssessmentArena;