import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Flag, ChevronLeft, ChevronRight, AlertTriangle, Clock, CheckCircle } from 'lucide-react';
import { apiClient } from '../../api/client';
import MathText from '../../components/MathText';
import './AssessmentArena.css';

/**
 * Live exam.
 *
 * Answer state is keyed by question id, not by position — that is what makes a
 * resumed attempt restorable, and it survives any future reordering. Time per
 * question is measured for real (it used to be a hardcoded 15 seconds).
 *
 * The countdown comes from the server's `expiresAt`; the client clock is only
 * used to tick it down. The backend rejects writes past the deadline and grades
 * abandoned attempts on its own, so nothing here is load-bearing for integrity.
 */
const AssessmentArena = () => {
  const navigate = useNavigate();
  const { testId } = useParams();

  const [test, setTest] = useState(null);
  const [testQuestions, setTestQuestions] = useState([]);
  const [attemptId, setAttemptId] = useState(null);

  const [currentQ, setCurrentQ] = useState(0);
  const [answers, setAnswers] = useState({});   // questionId -> { index } | { value }
  const [flagged, setFlagged] = useState(new Set()); // questionIds
  const [timeSpent, setTimeSpent] = useState({});    // questionId -> accumulated seconds
  const [timeLeft, setTimeLeft] = useState(null);

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [showAutoSubmit, setShowAutoSubmit] = useState(false);
  const [saveError, setSaveError] = useState('');

  const timerRef = useRef(null);
  const questionEnteredAt = useRef(Date.now());
  const submittedRef = useRef(false);

  // ── Bootstrap ─────────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    const initTest = async () => {
      try {
        setLoading(true);

        const testRes = await apiClient.get(`/tests/${testId}`);
        if (cancelled) return;
        setTest(testRes);

        const startRes = await apiClient.post(`/attempts/start/${testId}`);
        if (cancelled) return;
        setAttemptId(startRes.attemptId);

        // Rehydrate a resumed attempt. Without this, reopening a test showed a
        // blank paper even though the answers were safely in the database.
        if (startRes.savedAnswers?.length) {
          const restoredAnswers = {};
          const restoredFlags = new Set();
          const restoredTime = {};

          for (const saved of startRes.savedAnswers) {
            if (saved.selected_answer != null) {
              restoredAnswers[saved.question_id] = saved.selected_answer;
            }
            if (saved.flagged_for_doubt) restoredFlags.add(saved.question_id);
            if (saved.time_spent_seconds) restoredTime[saved.question_id] = saved.time_spent_seconds;
          }

          setAnswers(restoredAnswers);
          setFlagged(restoredFlags);
          setTimeSpent(restoredTime);
        }

        const endTime = new Date(startRes.expiresAt).getTime();
        const tick = () => {
          const remaining = Math.max(0, Math.floor((endTime - Date.now()) / 1000));
          setTimeLeft(remaining);
          if (remaining <= 0) {
            clearInterval(timerRef.current);
            setShowAutoSubmit(true);
          }
        };
        tick();
        timerRef.current = setInterval(tick, 1000);

        const qRes = await apiClient.get(`/tests/${testId}/questions`);
        if (cancelled) return;
        setTestQuestions(qRes || []);
        questionEnteredAt.current = Date.now();
      } catch (err) {
        if (cancelled) return;
        // The server finalises an attempt whose window elapsed while the student
        // was away, and says so — send them to the result rather than a dead end.
        alert(err.message || 'Error starting test');
        navigate('/student');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    initTest();

    return () => {
      cancelled = true;
      clearInterval(timerRef.current);
    };
  }, [testId, navigate]);

  const currentQuestion = testQuestions[currentQ]?.questions;
  const currentQuestionId = currentQuestion?.id;

  /** Seconds spent on the current question since it was opened. */
  const consumeElapsed = useCallback(() => {
    const elapsed = Math.round((Date.now() - questionEnteredAt.current) / 1000);
    questionEnteredAt.current = Date.now();
    return Math.max(0, elapsed);
  }, []);

  /** Persists one answer, carrying the real accumulated time for that question. */
  const persistAnswer = useCallback(
    async (questionId, selectedAnswer, extraSeconds) => {
      if (!attemptId || !questionId) return;

      const total = (timeSpent[questionId] || 0) + (extraSeconds || 0);
      try {
        await apiClient.patch(`/attempts/${attemptId}/answer`, {
          question_id: questionId,
          selected_answer: selectedAnswer,
          time_spent_seconds: total,
        });
        setSaveError('');
      } catch (err) {
        // Past the deadline the server refuses writes — surface that clearly.
        setSaveError(err.message || 'Could not save your answer.');
      }
    },
    [attemptId, timeSpent],
  );

  // Bank the time spent whenever the student moves to a different question.
  const goToQuestion = useCallback(
    (index) => {
      if (index === currentQ) return;

      const elapsed = consumeElapsed();
      const leavingId = testQuestions[currentQ]?.questions?.id;

      if (leavingId && elapsed > 0) {
        setTimeSpent((prev) => ({ ...prev, [leavingId]: (prev[leavingId] || 0) + elapsed }));
        // Only re-save if the question actually has an answer to attach it to.
        if (answers[leavingId] !== undefined) {
          persistAnswer(leavingId, answers[leavingId], elapsed);
        }
      }

      setCurrentQ(index);
    },
    [currentQ, testQuestions, answers, consumeElapsed, persistAnswer],
  );

  const handleAnswer = async (optIndex) => {
    if (!currentQuestionId) return;

    const selected = { index: optIndex };
    setAnswers((prev) => ({ ...prev, [currentQuestionId]: selected }));

    const elapsed = consumeElapsed();
    if (elapsed > 0) {
      setTimeSpent((prev) => ({
        ...prev,
        [currentQuestionId]: (prev[currentQuestionId] || 0) + elapsed,
      }));
    }
    await persistAnswer(currentQuestionId, selected, elapsed);
  };

  const toggleFlag = async () => {
    if (!currentQuestionId || !attemptId) return;

    const willFlag = !flagged.has(currentQuestionId);
    setFlagged((prev) => {
      const next = new Set(prev);
      if (willFlag) next.add(currentQuestionId);
      else next.delete(currentQuestionId);
      return next;
    });

    try {
      await apiClient.patch(`/attempts/${attemptId}/flag`, {
        question_id: currentQuestionId,
        flagged: willFlag,
      });
    } catch (err) {
      setSaveError(err.message || 'Could not update the flag.');
    }
  };

  const handleFinalSubmit = async (auto = false) => {
    if (submittedRef.current) return;
    submittedRef.current = true;
    setSubmitting(true);
    clearInterval(timerRef.current);

    // Bank the time on the question the student is sitting on.
    const elapsed = consumeElapsed();
    if (currentQuestionId && answers[currentQuestionId] !== undefined && elapsed > 0) {
      await persistAnswer(currentQuestionId, answers[currentQuestionId], elapsed);
    }

    try {
      await apiClient.post(`/attempts/${attemptId}/submit`, { autoSubmitted: auto });
      navigate(`/student/result/${attemptId}`);
    } catch (err) {
      submittedRef.current = false;
      setSubmitting(false);
      alert('Error submitting test: ' + err.message);
    }
  };

  const formatTime = (secs) => {
    if (secs == null) return '--:--:--';
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    return [h, m, s].map((v) => String(v).padStart(2, '0')).join(':');
  };

  const getQStatus = (idx) => {
    const qid = testQuestions[idx]?.questions?.id;
    if (qid && flagged.has(qid)) return 'flagged';
    if (qid && answers[qid] !== undefined) return 'answered';
    return 'unanswered';
  };

  const answeredCount = testQuestions.filter((tq) => answers[tq.questions?.id] !== undefined).length;
  const unansweredCount = testQuestions.length - answeredCount;
  const isWarning = timeLeft !== null && timeLeft < 300;

  if (loading || !testQuestions.length) {
    return <div style={{ padding: 40, color: 'white' }}>Loading test…</div>;
  }

  const selectedIndex = answers[currentQuestionId]?.index;

  return (
    <div className="arena-wrapper">
      <header className="arena-header">
        <div className="header-left">
          <span className="exam-title">{test?.title || 'Assessment'}</span>
          <span className="exam-meta">{currentQuestion?.subject || 'General'}</span>
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
          <button className="btn-submit-exam" onClick={() => setShowSubmitModal(true)}>
            Submit Exam
          </button>
        </div>
      </header>

      {saveError && <div className="arena-save-error">{saveError}</div>}

      <div className="arena-body">
        <div className="question-panel">
          <div className="q-meta-row">
            <span className={`q-subject-badge subject-${(currentQuestion?.subject || '').toLowerCase()}`}>
              {currentQuestion?.subject || 'General'}
            </span>
            <span className="q-counter">Question {currentQ + 1} of {testQuestions.length}</span>
            <button
              className={`flag-btn ${flagged.has(currentQuestionId) ? 'flagged' : ''}`}
              onClick={toggleFlag}
            >
              <Flag size={16} />
              {flagged.has(currentQuestionId) ? 'Flagged' : 'Flag for Review'}
            </button>
          </div>

          <div className="question-text">
            <MathText as="p" text={currentQuestion?.question_text || ''} />
            {currentQuestion?.image_url && (
              <img className="arena-q-image" src={currentQuestion.image_url} alt="Question diagram" />
            )}
          </div>

          <div className="options-list">
            {(currentQuestion?.options || []).map((opt, idx) => (
              <button
                key={idx}
                className={`option-btn ${selectedIndex === idx ? 'selected' : ''}`}
                onClick={() => handleAnswer(idx)}
              >
                <span className="opt-letter">{['A', 'B', 'C', 'D'][idx]}</span>
                <span className="opt-text"><MathText text={String(opt)} /></span>
                {selectedIndex === idx && <CheckCircle size={18} className="opt-check" />}
              </button>
            ))}
          </div>

          <div className="q-navigation">
            <button
              className="nav-btn"
              onClick={() => goToQuestion(Math.max(currentQ - 1, 0))}
              disabled={currentQ === 0}
            >
              <ChevronLeft size={20} /> Previous
            </button>
            <button
              className="nav-btn primary"
              onClick={() => goToQuestion(Math.min(currentQ + 1, testQuestions.length - 1))}
              disabled={currentQ === testQuestions.length - 1}
            >
              Save &amp; Next <ChevronRight size={20} />
            </button>
          </div>
        </div>

        <aside className="question-grid-panel">
          <h3 className="grid-title">Question Navigator</h3>
          <div className="grid-legend">
            <span className="legend-item"><span className="dot answered-dot" /> Answered</span>
            <span className="legend-item"><span className="dot unanswered-dot" /> Not Answered</span>
            <span className="legend-item"><span className="dot flagged-dot" /> Flagged</span>
          </div>

          <div className="q-grid">
            {testQuestions.map((_, idx) => (
              <button
                key={idx}
                className={`q-grid-btn ${getQStatus(idx)} ${currentQ === idx ? 'current' : ''}`}
                onClick={() => goToQuestion(idx)}
              >
                {idx + 1}
              </button>
            ))}
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
            <p>You've answered <strong>{answeredCount}</strong> of <strong>{testQuestions.length}</strong> questions.</p>
            {unansweredCount > 0 && (
              <p className="unanswered-warning">{unansweredCount} question(s) are still unanswered.</p>
            )}
            <div className="modal-actions">
              <button className="btn-go-back" onClick={() => setShowSubmitModal(false)} disabled={submitting}>
                Go Back &amp; Review
              </button>
              <button className="btn-confirm-submit" onClick={() => handleFinalSubmit(false)} disabled={submitting}>
                {submitting ? 'Submitting…' : 'Yes, Submit Now'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showAutoSubmit && (
        <div className="modal-overlay">
          <div className="submit-modal auto-submit">
            <Clock size={40} className="modal-warning-icon" />
            <h2>Time's Up!</h2>
            <p>Your exam is being submitted automatically.</p>
            <button className="btn-confirm-submit" onClick={() => handleFinalSubmit(true)} disabled={submitting}>
              {submitting ? 'Submitting…' : 'View Results'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default AssessmentArena;
