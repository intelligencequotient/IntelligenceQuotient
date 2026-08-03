import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { apiClient, captureTokenFromUrl, getToken } from '../api/client';
import ViolationMonitor from '../components/ViolationMonitor';
import ExamHeader from '../components/ExamHeader';
import QuestionPanel from '../components/QuestionPanel';
import QuestionPalette from '../components/QuestionPalette';
import ActionBar from '../components/ActionBar';
import SubmitConfirmModal from '../components/SubmitConfirmModal';
import { jeeMainMockQuestions, jeeAdvMockQuestions } from '../data/jeeMockData';
import { normalisePaper, subjectsInPaper, sectionsInSubject } from '../lib/questionFormat';
import '../index.css';

const ExamShell = () => {
  const { sessionId } = useParams();

  const [loading, setLoading] = useState(true);
  const [examData, setExamData] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [currentQ, setCurrentQ] = useState(0);
  const [responses, setResponses] = useState({});
  const [timeLeft, setTimeLeft] = useState(0);
  
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [violationWarning, setViolationWarning] = useState(null);
  const [isTerminated, setIsTerminated] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [result, setResult] = useState(null);
  const [fatalError, setFatalError] = useState('');

  const heartbeatRef = useRef(null);
  const submittingRef = useRef(false);
  const questionEnteredAt = useRef(Date.now());
  const [lockAcquired, setLockAcquired] = useState(false);
  // Tabs are built from the paper the teacher actually assembled, not from a
  // fixed Physics/Chemistry/Mathematics list — a single-subject or Biology test
  // used to render an empty palette because nothing matched the default tab.
  const [activeSubject, setActiveSubject] = useState(null);
  const [activeSection, setActiveSection] = useState(null);
  const [hasStarted, setHasStarted] = useState(false);
  const [saveError, setSaveError] = useState('');

  // Lift the access token out of the URL fragment before anything else runs.
  useEffect(() => {
    captureTokenFromUrl();
  }, []);

  useEffect(() => {
    // For local mock preview, skip lock to allow easier testing
    if (sessionId === 'jee-main-preview' || sessionId === 'jee-adv-preview') {
      setLockAcquired(true);
      return;
    }
    const lockKey = `examLock:${sessionId}`;
    const activeLock = localStorage.getItem(lockKey);
    const now = Date.now();
    
    // TEMPORARILY DISABLED FOR DEVELOPMENT
    // if (activeLock && now - parseInt(activeLock) < 5000) {
    //   alert("This exam is already running in another tab.");
    //   window.close();
    //   return;
    // }
    
    localStorage.setItem(lockKey, now.toString());
    setLockAcquired(true);

    const lockInterval = setInterval(() => localStorage.setItem(lockKey, Date.now().toString()), 2000);
    return () => { clearInterval(lockInterval); localStorage.removeItem(lockKey); };
  }, [sessionId]);

  const handleStartExam = async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
      }
    } catch (e) {
      console.warn("Fullscreen request failed. Proceeding anyway.");
    }
    
    setHasStarted(true);

    try {
      // Offline demo papers, for showing the proctoring UI without a real test.
      if (sessionId === 'jee-main-preview' || sessionId === 'jee-adv-preview') {
        const isMain = sessionId === 'jee-main-preview';
        setExamData({
          realSessionId: isMain ? 'mock-session-main' : 'mock-session-adv',
          title: `JEE ${isMain ? 'Main' : 'Advanced'} Mock Test (Preview)`,
          duration_minutes: 180,
          total_questions: isMain ? 75 : 51,
          examType: isMain ? 'main' : 'advanced',
          isPreview: true,
        });
        const mockPaper = isMain ? jeeMainMockQuestions : jeeAdvMockQuestions;
        setQuestions(mockPaper);
        setActiveSubject(mockPaper[0]?.subject ?? null);
        setActiveSection(mockPaper[0]?.section ?? null);
        setTimeLeft(180 * 60);
        setLoading(false);
        return;
      }

      // Real exam. The token arrives in the URL fragment from the portal.
      if (!getToken()) {
        setFatalError('No active session. Please launch this exam from your dashboard.');
        setLoading(false);
        return;
      }

      // Call the real attempt start endpoint
      const startRes = await apiClient.post(`/attempts/start/${sessionId}`);
      const realSessionId = startRes.attemptId;

      // Fetch test details for UI
      const testDetails = await apiClient.get(`/tests/${sessionId}`);

      setExamData({
        ...testDetails,
        realSessionId,
        examType: testDetails.t_type || 'main',
        isPreview: false,
      });

      // Fetch questions using the testId. The bank speaks `q_type`
      // (single_correct / multi_correct / integer) while the UI renders on
      // `type` (mcq / msq / nat) — normalisePaper bridges the two, and without
      // it the answer options never rendered at all.
      const rawPaper = await apiClient.get(`/tests/${sessionId}/questions`);
      const paper = normalisePaper(rawPaper);

      if (!paper.length) {
        setFatalError('This test has no questions yet. Please contact your teacher.');
        setLoading(false);
        return;
      }

      setQuestions(paper);
      setActiveSubject(paper[0].subject);
      setActiveSection(paper[0].section);

      // Rehydrate a resumed session.
      if (startRes.savedAnswers?.length) {
        const indexByQuestionId = new Map(paper.map((q, idx) => [q.id, idx]));
        const restored = {};
        for (const saved of startRes.savedAnswers) {
          const idx = indexByQuestionId.get(saved.question_id);
          if (idx !== undefined) {
            restored[idx] = { ...(saved.selected_answer || {}), status: saved.status || 'answered' };
          }
        }
        setResponses(restored);
      }

      // Removed server heartbeat for now, rely on visual timer.
      if (startRes.timeLeftSeconds !== undefined) {
        setTimeLeft(startRes.timeLeftSeconds);
      }
    } catch (err) {
      setFatalError(err.message || 'Error initializing exam');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // No heartbeat interval needed anymore
  }, []);

  // Restart the per-question stopwatch whenever the student moves.
  useEffect(() => {
    questionEnteredAt.current = Date.now();
  }, [currentQ]);

  // Bug #6 fix: single interval, no dependency on timeLeft
  useEffect(() => {
    if (!hasStarted || loading) return;
    const visualTimer = setInterval(() => {
      setTimeLeft(prev => {
        const next = Math.max(0, prev - 1);
        return next;
      });
    }, 1000);
    return () => clearInterval(visualTimer);
  }, [hasStarted, loading]);

  // Bug #10 fix: auto-submit when timer reaches 0
  useEffect(() => {
    if (timeLeft === 0 && hasStarted && !loading && !isSubmitted && !isTerminated && !fatalError) {
      handleFinalSubmit(true);
    }
  }, [timeLeft, hasStarted, loading, isSubmitted, isTerminated, fatalError]);

  const handleResponseChange = async (questionId, responsePayload, status) => {
    // Bug #3 fix: when payload is null (clear), don't spread old keys
    setResponses(prev => ({
      ...prev,
      [currentQ]: responsePayload ? { ...responsePayload, status } : { status }
    }));
    if (examData?.isPreview) return; // Nothing to persist for a demo paper.
    if (!examData?.realSessionId) return;

    try {
      await apiClient.patch(`/attempts/${examData.realSessionId}/answer`, {
        question_id: questionId,
        selected_answer: responsePayload,
        status: status,
        time_spent_seconds: Math.max(0, Math.round((Date.now() - questionEnteredAt.current) / 1000)),
      });
      setSaveError('');
    } catch (e) {
      console.error('Failed to save response', e);
      // A failed save used to be swallowed into the console: the student kept
      // answering a paper the server was no longer recording.
      setSaveError(
        e.status === 401
          ? 'Your session expired — this answer was NOT saved. Relaunch the test from your dashboard.'
          : 'This answer could not be saved. Check your connection and re-select it.',
      );
    }
  };

  const handleFinalSubmit = async (auto = false) => {
    if (submittingRef.current) return;
    submittingRef.current = true;
    clearInterval(heartbeatRef.current);

    if (examData?.isPreview) {
      setIsSubmitted(true);
      return;
    }

    try {
      const summary = await apiClient.post(
        `/attempts/${examData.realSessionId}/submit`,
        { autoSubmitted: auto },
      );
      setResult(summary);
      setIsSubmitted(true);
    } catch (e) {
      submittingRef.current = false;
      alert('Error submitting: ' + e.message);
    }
  };

  const handleViolationLimit = useCallback(() => {
    setIsTerminated(true);
  }, []);

  // Navigation structure comes from the paper, so it matches whatever the
  // teacher assembled — one subject, four subjects, MCQ-only, mixed, anything.
  const subjects = useMemo(() => subjectsInPaper(questions), [questions]);
  const sections = useMemo(
    () => sectionsInSubject(questions, activeSubject),
    [questions, activeSubject],
  );

  if (!lockAcquired) return null;

  if (fatalError) {
    return (
      <div className="exam-terminated error">
        <h2>Cannot start this exam</h2>
        <p>{fatalError}</p>
        <button onClick={() => window.close()}>Close Tab</button>
      </div>
    );
  }

  if (!hasStarted) {
    return (
      <div className="exam-terminated">
        <h2>Ready to Begin?</h2>
        <p>The exam will open in full screen. Do not exit fullscreen or switch tabs during the test.</p>
        <button onClick={handleStartExam}>Enter Fullscreen & Start Exam</button>
      </div>
    );
  }
  if (loading) return <div className="exam-loading">Loading secure environment...</div>;
  if (isSubmitted) {
    return (
      <div className="exam-terminated">
        <h2>Exam Submitted</h2>
        {result ? (
          <div className="exam-result-summary">
            <p className="exam-result-score">
              <strong>{result.score}</strong> / {result.maxScore}
            </p>
            <p>
              {result.correct} correct · {result.incorrect} incorrect · {result.unattempted} unattempted
            </p>
            <p>Accuracy: {result.accuracy}%</p>
            {result.autoSubmitted && <p className="exam-result-note">Submitted automatically — time expired.</p>}
          </div>
        ) : (
          <p>Your responses have been recorded.</p>
        )}
        <button onClick={() => window.close()}>Close Tab</button>
      </div>
    );
  }
  if (isTerminated) return <div className="exam-terminated error"><h2>Exam Terminated</h2><p>Rule violations exceeded limit.</p><button onClick={() => window.close()}>Close Tab</button></div>;

  return (
    <div className="exam-shell">
      <ViolationMonitor 
        sessionId={examData.realSessionId} 
        onViolationLimitReached={handleViolationLimit}
        onViolationWarning={setViolationWarning}
      />
      {violationWarning && (
        <div className="violation-overlay">
          <div className="violation-modal">
            <h3>Warning: Rule Violation</h3>
            <p>We detected: {violationWarning}. Please remain in fullscreen and do not switch tabs.</p>
            <button onClick={() => {
              setViolationWarning(null);
              document.documentElement.requestFullscreen().catch(() => {});
            }}>Resume Exam</button>
          </div>
        </div>
      )}
      <ExamHeader examData={examData} timeLeft={timeLeft} />

      {saveError && <div className="exam-save-error">{saveError}</div>}

      {/* Subject tabs, built from the paper itself. */}
      {subjects.length > 1 && (
        <div className="subject-tabs">
          {subjects.map(subj => (
            <button
              key={subj}
              className={`subj-tab ${activeSubject === subj ? 'active' : ''}`}
              onClick={() => {
                const firstQIdx = questions.findIndex(q => q.subject === subj);
                setActiveSubject(subj);
                if (firstQIdx !== -1) {
                  setCurrentQ(firstQIdx);
                  setActiveSection(questions[firstQIdx].section);
                }
              }}
            >
              {subj}
            </button>
          ))}
        </div>
      )}

      {/* Section tabs only when this subject actually has more than one. */}
      {sections.length > 1 && (
        <div className="section-tabs">
          {sections.map(sec => (
            <button
              key={sec}
              className={`sec-tab ${activeSection === sec ? 'active' : ''}`}
              onClick={() => {
                setActiveSection(sec);
                const firstQIdx = questions.findIndex(q => q.subject === activeSubject && q.section === sec);
                if (firstQIdx !== -1) setCurrentQ(firstQIdx);
              }}
            >
              Section {sec} {sec === 'A' ? '(Objective)' : '(Numerical)'}
            </button>
          ))}
        </div>
      )}

      <div className="exam-body">
        <div className="exam-main-panel">
          <QuestionPanel 
            question={questions[currentQ]} 
            qIndex={currentQ}
            currentResponse={responses[currentQ]}
            onResponseChange={handleResponseChange}
          />
          <ActionBar 
            currentQ={currentQ} totalQ={questions.length} onNavigate={setCurrentQ}
            currentResponse={responses[currentQ]} questionId={questions[currentQ]?.id}
            onResponseChange={handleResponseChange} onSubmitClick={() => setShowSubmitModal(true)}
          />
        </div>
        <QuestionPalette
          questions={questions}
          responses={responses}
          currentQ={currentQ}
          activeSubject={subjects.length > 1 ? activeSubject : null}
          activeSection={sections.length > 1 ? activeSection : null}
          onNavigate={(idx) => {
            setCurrentQ(idx);
            setActiveSubject(questions[idx].subject);
            setActiveSection(questions[idx].section);
          }}
        />
      </div>
      {showSubmitModal && <SubmitConfirmModal responses={responses} total={questions.length} onCancel={() => setShowSubmitModal(false)} onConfirm={() => handleFinalSubmit(false)} />}
    </div>
  );
};

export default ExamShell;
