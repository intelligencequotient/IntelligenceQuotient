import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { apiClient } from '../api/client';
import ViolationMonitor from '../components/ViolationMonitor';
import ExamHeader from '../components/ExamHeader';
import QuestionPanel from '../components/QuestionPanel';
import QuestionPalette from '../components/QuestionPalette';
import ActionBar from '../components/ActionBar';
import SubmitConfirmModal from '../components/SubmitConfirmModal';
import { jeeMainMockQuestions, jeeAdvMockQuestions } from '../data/jeeMockData';
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
  
  const heartbeatRef = useRef(null);
  const [lockAcquired, setLockAcquired] = useState(false);
  const [activeSubject, setActiveSubject] = useState('Physics');
  const [activeSection, setActiveSection] = useState('A');
  const [hasStarted, setHasStarted] = useState(false);

  useEffect(() => {
    // For local mock preview, skip lock to allow easier testing
    if (sessionId === 'jee-main-preview' || sessionId === 'jee-adv-preview') {
      setLockAcquired(true);
      return;
    }
    const lockKey = `examLock:${sessionId}`;
    const activeLock = localStorage.getItem(lockKey);
    const now = Date.now();
    
    if (activeLock && now - parseInt(activeLock) < 5000) {
      alert("This exam is already running in another tab.");
      window.close();
      return;
    }
    
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
      if (sessionId === 'jee-main-preview') {
        setExamData({
          realSessionId: 'mock-session-main',
          title: 'JEE Main Mock Test (Preview)',
          duration_minutes: 180,
          total_questions: 75,
          examType: 'main'
        });
        setQuestions(jeeMainMockQuestions);
        setTimeLeft(180 * 60);
        setLoading(false);
        return;
      }
      if (sessionId === 'jee-adv-preview') {
        setExamData({
          realSessionId: 'mock-session-adv',
          title: 'JEE Advanced Mock Test (Preview)',
          duration_minutes: 180,
          total_questions: 51,
          examType: 'advanced'
        });
        setQuestions(jeeAdvMockQuestions);
        setTimeLeft(180 * 60);
        setLoading(false);
        return;
      }

      const startRes = await apiClient.post(`/exam/${sessionId}/start`, { studentId: 'mock-student-id' });
      const realSessionId = startRes.sessionId;
      setExamData({ ...startRes.testDetails, realSessionId });

      // Normal flow...
      setQuestions(jeeMainMockQuestions.slice(0, 3)); // Fallback if no questions endpoint yet

      const updateHeartbeat = async () => {
        try {
          const hb = await apiClient.get(`/exam/session/${realSessionId}/heartbeat`);
          setTimeLeft(hb.remainingSeconds);
          if (hb.status === 'auto_submitted') {
            setIsSubmitted(true);
            clearInterval(heartbeatRef.current);
          }
        } catch (e) { console.error("Heartbeat failed", e); }
      };

      updateHeartbeat();
      heartbeatRef.current = setInterval(updateHeartbeat, 5000);
    } catch (err) {
      alert(err.message || 'Error initializing exam');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    return () => clearInterval(heartbeatRef.current);
  }, []);

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
    if (timeLeft === 0 && hasStarted && !loading && !isSubmitted && !isTerminated) {
      handleFinalSubmit(true);
    }
  }, [timeLeft, hasStarted, loading, isSubmitted, isTerminated]);

  const handleResponseChange = async (questionId, responsePayload, status) => {
    // Bug #3 fix: when payload is null (clear), don't spread old keys
    setResponses(prev => ({
      ...prev,
      [currentQ]: responsePayload ? { ...responsePayload, status } : { status }
    }));
    if (sessionId === 'jee-main-preview' || sessionId === 'jee-adv-preview') return; // Skip API call for preview

    if (!examData?.realSessionId) return;
    try {
      await apiClient.post(`/exam/session/${examData.realSessionId}/response`, {
        question_id: questionId,
        selected_answer: responsePayload,
        status: status,
        time_spent_seconds: 15
      });
    } catch (e) { console.error("Failed to save response"); }
  };

  const handleFinalSubmit = async (auto = false) => {
    clearInterval(heartbeatRef.current);
    if (sessionId === 'jee-main-preview' || sessionId === 'jee-adv-preview') {
      setIsSubmitted(true);
      return;
    }
    
    try {
      await apiClient.post(`/exam/session/${examData.realSessionId}/submit`, { autoSubmitted: auto });
      setIsSubmitted(true);
    } catch (e) {
      alert("Error submitting: " + e.message);
    }
  };

  // Bug #2 support: stable callback ref for ViolationMonitor
  const handleViolationLimit = useCallback(() => {
    setIsTerminated(true);
    clearInterval(heartbeatRef.current);
  }, []);

  if (!lockAcquired) return null;
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
  if (isSubmitted) return <div className="exam-terminated"><h2>Exam Submitted</h2><button onClick={() => window.close()}>Close Tab</button></div>;
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
      
      {/* Subject Tabs (JEE Format) */}
      <div className="subject-tabs">
        {['Physics', 'Chemistry', 'Mathematics'].map(subj => (
          <button 
            key={subj} 
            className={`subj-tab ${activeSubject === subj ? 'active' : ''}`}
            onClick={() => {
              setActiveSubject(subj);
              // Jump to first question of the subject
              const firstQIdx = questions.findIndex(q => q.subject === subj);
              if (firstQIdx !== -1) {
                setCurrentQ(firstQIdx);
                if (examData?.examType === 'main') setActiveSection('A');
              }
            }}
          >
            {subj}
          </button>
        ))}
      </div>

      {examData?.examType === 'main' && (
        <div className="section-tabs">
          {['A', 'B'].map(sec => (
            <button 
              key={sec} 
              className={`sec-tab ${activeSection === sec ? 'active' : ''}`}
              onClick={() => {
                setActiveSection(sec);
                const firstQIdx = questions.findIndex(q => q.subject === activeSubject && q.section === sec);
                if (firstQIdx !== -1) setCurrentQ(firstQIdx);
              }}
            >
              Section {sec} {sec === 'A' ? '(MCQ)' : '(Numerical)'}
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
          activeSubject={activeSubject}
          activeSection={examData?.examType === 'main' ? activeSection : null}
          onNavigate={(idx) => {
            setCurrentQ(idx);
            setActiveSubject(questions[idx].subject);
            if (examData?.examType === 'main') setActiveSection(questions[idx].section);
          }} 
        />
      </div>
      {showSubmitModal && <SubmitConfirmModal responses={responses} total={questions.length} onCancel={() => setShowSubmitModal(false)} onConfirm={() => handleFinalSubmit(false)} />}
    </div>
  );
};

export default ExamShell;
