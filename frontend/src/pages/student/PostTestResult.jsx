import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  CheckCircle, XCircle, MinusCircle, Trophy, Clock, Target, ArrowLeft, Flag,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { apiClient } from '../../api/client';
import MathText from '../../components/MathText';
import './PostTestResult.css';

/**
 * Post-test result.
 *
 * This page used to read `testResults` from AppDataContext — which nothing ever
 * set — so it always rendered "No results found", with a hardcoded rank and an
 * empty answer table. It now fetches the graded attempt directly.
 *
 * The route param is the attempt id (that is what AssessmentArena navigates with).
 */
const PostTestResult = () => {
  const navigate = useNavigate();
  // Route is declared as :testId, but an attempt id is what gets passed.
  const { testId: attemptId } = useParams();

  const [attempt, setAttempt] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!attemptId) {
      setError('No attempt specified.');
      setLoading(false);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const data = await apiClient.get(`/attempts/${attemptId}`);
        if (!cancelled) setAttempt(data);
      } catch (e) {
        if (!cancelled) setError(e.message || 'Could not load your result.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [attemptId]);

  if (loading) return <div className="result-page"><p className="pr-muted">Loading your result…</p></div>;

  if (error || !attempt) {
    return (
      <div className="result-page">
        <p className="pr-error">{error || 'Result not found.'}</p>
        <button className="btn-back" onClick={() => navigate('/student')}>
          <ArrowLeft size={16} /> Back to Dashboard
        </button>
      </div>
    );
  }

  const test = attempt.tests || {};
  const answers = attempt.answers || [];
  const cohort = attempt.cohort;

  const score = Number(attempt.total_score) || 0;
  const maxScore = Number(test.total_marks) || 0;

  const correct = answers.filter((a) => a.is_correct === true).length;
  const incorrect = answers.filter((a) => a.is_correct === false).length;
  // Questions never opened have no answer row at all, so derive from the total.
  const answered = correct + incorrect;
  const unattempted = Math.max(0, answers.length - answered);
  const accuracy = answered > 0 ? Math.round((correct / answered) * 100) : 0;

  const timeTaken = attempt.submitted_at && attempt.started_at
    ? Math.floor((new Date(attempt.submitted_at) - new Date(attempt.started_at)) / 1000)
    : 0;
  const totalTime = Math.min(timeTaken, (test.duration_minutes || 0) * 60 || timeTaken);

  const fmt = (secs) => `${Math.floor(secs / 60)}m ${secs % 60}s`;

  // Real subject-wise breakdown from the graded answers.
  const bySubject = {};
  for (const a of answers) {
    const subject = a.questions?.subject || 'General';
    if (!bySubject[subject]) bySubject[subject] = { correct: 0, incorrect: 0, unattempted: 0 };
    if (a.is_correct === true) bySubject[subject].correct += 1;
    else if (a.is_correct === false) bySubject[subject].incorrect += 1;
    else bySubject[subject].unattempted += 1;
  }

  const subjectWise = Object.entries(bySubject).map(([subject, s]) => {
    const attempted = s.correct + s.incorrect;
    return {
      subject,
      ...s,
      accuracy: attempted > 0 ? Math.round((s.correct / attempted) * 100) : 0,
    };
  });

  const chartData = subjectWise.map((s) => ({
    subject: s.subject,
    Correct: s.correct,
    Incorrect: s.incorrect,
    Unattempted: s.unattempted,
  }));

  const optionLabel = (question, answer) => {
    if (answer?.value !== undefined) return String(answer.value);
    const idx = answer?.index;
    if (idx === undefined || idx === null) return '—';
    const opts = question?.options;
    const letter = ['A', 'B', 'C', 'D'][idx] ?? idx;
    return Array.isArray(opts) && opts[idx] ? `${letter}. ${opts[idx]}` : `Option ${letter}`;
  };

  const passed = maxScore > 0 && score / maxScore >= 0.4;

  return (
    <div className="result-page">
      <div className="result-hero">
        <div className="hero-left">
          <div className={`score-circle ${passed ? 'pass' : 'fail'}`}>
            <span className="score-num">{score}</span>
            <span className="score-denom">/ {maxScore}</span>
          </div>
          <div className="hero-info">
            <h1>{test.title || 'Assessment'}</h1>
            <span className={`pass-badge ${passed ? 'badge-pass' : 'badge-fail'}`}>
              {maxScore > 0 ? `${Math.round((score / maxScore) * 100)}%` : '—'}
            </span>
            {attempt.auto_submitted && (
              <span className="pr-auto-flag"><Clock size={13} /> Auto-submitted — time ran out</span>
            )}
            {cohort ? (
              <p className="percentile-text">
                You scored better than <strong>{cohort.percentile}%</strong> of the {cohort.totalStudents} student(s) who took this test.
              </p>
            ) : (
              <p className="percentile-text pr-muted">You are the first to complete this test.</p>
            )}
          </div>
        </div>

        <div className="hero-stats">
          <div className="hero-stat">
            <Trophy size={22} className="stat-icon trophy" />
            <div>
              <span className="stat-label">Rank</span>
              <strong>{cohort ? `#${cohort.rank} / ${cohort.totalStudents}` : '—'}</strong>
            </div>
          </div>
          <div className="hero-stat">
            <Clock size={22} className="stat-icon clock" />
            <div><span className="stat-label">Time Taken</span><strong>{fmt(totalTime)}</strong></div>
          </div>
          <div className="hero-stat">
            <Target size={22} className="stat-icon target" />
            <div>
              <span className="stat-label">Accuracy</span>
              <strong>{accuracy}%</strong>
            </div>
          </div>
        </div>
      </div>

      <div className="summary-strip">
        <div className="strip-item correct-strip">
          <CheckCircle size={22} /><div><strong>{correct}</strong><span>Correct</span></div>
        </div>
        <div className="strip-item incorrect-strip">
          <XCircle size={22} /><div><strong>{incorrect}</strong><span>Incorrect</span></div>
        </div>
        <div className="strip-item unattempted-strip">
          <MinusCircle size={22} /><div><strong>{unattempted}</strong><span>Unattempted</span></div>
        </div>
      </div>

      {cohort && (
        <div className="pr-cohort-strip">
          <span>Class average <strong>{cohort.average}</strong></span>
          <span>Highest <strong>{cohort.highest}</strong></span>
          <span>Your score <strong>{score}</strong></span>
        </div>
      )}

      <div className="result-grid">
        <div className="subject-cards-section">
          <h2>Subject-wise Performance</h2>
          <div className="subject-cards">
            {subjectWise.length === 0 ? (
              <p className="pr-muted">No per-subject data available.</p>
            ) : subjectWise.map((s) => (
              <div key={s.subject} className="subj-card">
                <div className="subj-header">
                  <h3>{s.subject}</h3>
                  <span className={`acc-badge ${s.accuracy >= 75 ? 'acc-good' : s.accuracy >= 50 ? 'acc-mid' : 'acc-bad'}`}>
                    {s.accuracy}% Accuracy
                  </span>
                </div>
                <div className="accuracy-bar-wrap">
                  <div className="accuracy-bar" style={{ width: `${s.accuracy}%` }} />
                </div>
                <div className="subj-breakdown">
                  <span className="correct-text">✓ {s.correct} Correct</span>
                  <span className="incorrect-text">✗ {s.incorrect} Wrong</span>
                  <span className="unatt-text">— {s.unattempted} Skipped</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="chart-card">
          <h2>Breakdown by Subject</h2>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={chartData} margin={{ top: 5, right: 20, left: -10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="subject" axisLine={false} tickLine={false} />
              <YAxis allowDecimals={false} axisLine={false} tickLine={false} />
              <Tooltip />
              <Legend />
              <Bar dataKey="Correct" fill="#22c55e" radius={[4, 4, 0, 0]} />
              <Bar dataKey="Incorrect" fill="#ef4444" radius={[4, 4, 0, 0]} />
              <Bar dataKey="Unattempted" fill="#94a3b8" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="answer-review-card">
        <h2>Answer Review</h2>
        <div className="table-responsive">
          <table className="answer-table">
            <thead>
              <tr>
                <th>#</th><th>Question</th><th>Subject</th>
                <th>Your Answer</th><th>Correct Answer</th><th>Time</th><th>Status</th>
              </tr>
            </thead>
            <tbody>
              {answers.map((a, i) => {
                const status = a.is_correct === true ? 'correct'
                  : a.is_correct === false ? 'incorrect' : 'unattempted';
                return (
                  <tr key={a.question_id} className={`row-${status}`}>
                    <td>{i + 1}</td>
                    <td className="q-review-text">
                      <MathText text={a.questions?.question_text || '(image-based question)'} />
                      {a.flagged_for_doubt && (
                        <span className="pr-flagged"><Flag size={11} /> flagged</span>
                      )}
                    </td>
                    <td><span className="subj-pill">{a.questions?.subject || '—'}</span></td>
                    <td className={status === 'incorrect' ? 'wrong-ans' : ''}>
                      <MathText text={optionLabel(a.questions, a.selected_answer)} />
                    </td>
                    <td className="correct-ans">
                      <MathText text={optionLabel(a.questions, a.questions?.correct_answer)} />
                    </td>
                    <td className="pr-muted">{a.time_spent_seconds ? `${a.time_spent_seconds}s` : '—'}</td>
                    <td>
                      {status === 'correct' && <span className="status-icon correct"><CheckCircle size={18} /></span>}
                      {status === 'incorrect' && <span className="status-icon incorrect"><XCircle size={18} /></span>}
                      {status === 'unattempted' && <span className="status-icon unattempted"><MinusCircle size={18} /></span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="result-actions">
        <button className="btn-back" onClick={() => navigate('/student')}>
          <ArrowLeft size={16} /> Back to Dashboard
        </button>
        <button className="btn-retake" onClick={() => navigate('/student/analytics')}>
          View Full Analytics
        </button>
      </div>
    </div>
  );
};

export default PostTestResult;
