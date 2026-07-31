import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { CheckCircle, XCircle, MinusCircle, Trophy, Clock, Target, ArrowLeft, Loader2 } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { apiClient } from '../../api/client';
import './PostTestResult.css';

/** Render a stored answer ({ index } or { value }) as readable text. */
const answerText = (answer, options) => {
  if (answer === null || answer === undefined) return '—';
  if (answer.value !== undefined) return String(answer.value);
  const idx = answer.index;
  if (idx === undefined || idx === null || idx < 0) return '—';
  const opt = Array.isArray(options) ? options[idx] : undefined;
  return opt || ['A', 'B', 'C', 'D'][idx] || '—';
};

const formatDuration = (seconds) => {
  if (!Number.isFinite(seconds) || seconds < 0) return '—';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${s}s`;
};

const PostTestResult = () => {
  const navigate = useNavigate();
  const { attemptId } = useParams();

  const [attempt, setAttempt] = useState(null);
  const [rank, setRank] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError('');
      try {
        const res = await apiClient.get(`/attempts/${attemptId}`);
        if (!cancelled) setAttempt(res);
      } catch (err) {
        if (!cancelled) setError(err.message || 'Could not load your result.');
      } finally {
        if (!cancelled) setLoading(false);
      }

      // Rank is a nice-to-have; a failure here shouldn't break the page
      try {
        const me = await apiClient.get('/leaderboard/me');
        if (!cancelled) setRank(me);
      } catch {
        /* ignore */
      }
    })();
    return () => { cancelled = true; };
  }, [attemptId]);

  const stats = useMemo(() => {
    if (!attempt) return null;
    const answers = attempt.answers || [];

    const correct = answers.filter((a) => a.is_correct === true).length;
    const incorrect = answers.filter((a) => a.is_correct === false).length;
    const unattempted = answers.filter((a) => a.is_correct === null || a.is_correct === undefined).length;
    const attempted = correct + incorrect;

    const score = Number(attempt.total_score) || 0;
    const maxScore = Number(attempt.tests?.total_marks) || 0;

    const timeTakenSeconds = attempt.submitted_at && attempt.started_at
      ? Math.max(0, Math.round((new Date(attempt.submitted_at) - new Date(attempt.started_at)) / 1000))
      : answers.reduce((sum, a) => sum + (Number(a.time_spent_seconds) || 0), 0);

    // Group by subject for the breakdown cards + chart
    const bySubject = {};
    for (const a of answers) {
      const subject = a.questions?.subject || 'General';
      bySubject[subject] ||= { subject, correct: 0, incorrect: 0, unattempted: 0 };
      if (a.is_correct === true) bySubject[subject].correct += 1;
      else if (a.is_correct === false) bySubject[subject].incorrect += 1;
      else bySubject[subject].unattempted += 1;
    }
    const subjectWise = Object.values(bySubject).map((s) => {
      const att = s.correct + s.incorrect;
      return { ...s, accuracy: att ? Math.round((s.correct / att) * 100) : 0 };
    });

    return {
      correct,
      incorrect,
      unattempted,
      attempted,
      score,
      maxScore,
      accuracy: attempted ? Math.round((correct / attempted) * 100) : 0,
      timeTaken: formatDuration(timeTakenSeconds),
      avgPerQuestion: attempted ? `${Math.round(timeTakenSeconds / attempted)}s` : '—',
      subjectWise,
      chartData: subjectWise.map((s) => ({
        subject: s.subject,
        Correct: s.correct,
        Incorrect: s.incorrect,
        Unattempted: s.unattempted,
      })),
      answers,
    };
  }, [attempt]);

  if (loading) {
    return (
      <div style={{ padding: '60px', textAlign: 'center', color: 'var(--text-secondary)' }}>
        <Loader2 size={22} style={{ verticalAlign: 'middle', marginRight: '8px' }} />
        Loading your result…
      </div>
    );
  }

  if (error || !attempt || !stats) {
    return (
      <div style={{ padding: '60px', textAlign: 'center' }}>
        <p style={{ color: '#dc2626', marginBottom: '16px' }}>{error || 'Result not found.'}</p>
        <button className="btn-back" onClick={() => navigate('/student')}>
          <ArrowLeft size={16} /> Back to Dashboard
        </button>
      </div>
    );
  }

  const percentage = stats.maxScore ? Math.round((stats.score / stats.maxScore) * 100) : 0;
  const pass = percentage >= 40;

  return (
    <div className="result-page">
      {/* Hero Score Card */}
      <div className="result-hero">
        <div className="hero-left">
          <div className={`score-circle ${pass ? 'pass' : 'fail'}`}>
            <span className="score-num">{stats.score}</span>
            <span className="score-denom">/ {stats.maxScore}</span>
          </div>
          <div className="hero-info">
            <h1>{attempt.tests?.title || 'Assessment'}</h1>
            <span className={`pass-badge ${pass ? 'badge-pass' : 'badge-fail'}`}>
              {percentage}%
            </span>
            {attempt.auto_submitted && (
              <p className="percentile-text">This attempt was auto-submitted when time ran out.</p>
            )}
          </div>
        </div>
        <div className="hero-stats">
          <div className="hero-stat">
            <Trophy size={22} className="stat-icon trophy" />
            <div>
              <span className="stat-label">Overall Rank</span>
              <strong>
                {rank?.rank
                  ? `#${rank.rank}${rank.totalStudents ? ` / ${rank.totalStudents.toLocaleString()}` : ''}`
                  : 'Unranked'}
              </strong>
            </div>
          </div>
          <div className="hero-stat">
            <Clock size={22} className="stat-icon clock" />
            <div><span className="stat-label">Time Taken</span><strong>{stats.timeTaken}</strong></div>
          </div>
          <div className="hero-stat">
            <Target size={22} className="stat-icon target" />
            <div><span className="stat-label">Avg / Question</span><strong>{stats.avgPerQuestion}</strong></div>
          </div>
        </div>
      </div>

      {/* Summary Strip */}
      <div className="summary-strip">
        <div className="strip-item correct-strip">
          <CheckCircle size={22} />
          <div><strong>{stats.correct}</strong><span>Correct</span></div>
        </div>
        <div className="strip-item incorrect-strip">
          <XCircle size={22} />
          <div><strong>{stats.incorrect}</strong><span>Incorrect</span></div>
        </div>
        <div className="strip-item unattempted-strip">
          <MinusCircle size={22} />
          <div><strong>{stats.unattempted}</strong><span>Unattempted</span></div>
        </div>
      </div>

      <div className="result-grid">
        <div className="subject-cards-section">
          <h2>Subject-wise Performance</h2>
          <div className="subject-cards">
            {stats.subjectWise.length === 0 && (
              <p style={{ color: 'var(--text-secondary)' }}>No answer data recorded for this attempt.</p>
            )}
            {stats.subjectWise.map((s) => (
              <div key={s.subject} className="subj-card">
                <div className="subj-header">
                  <h3>{s.subject}</h3>
                  <span className={`acc-badge ${s.accuracy >= 75 ? 'acc-good' : s.accuracy >= 50 ? 'acc-mid' : 'acc-bad'}`}>
                    {s.accuracy}% Accuracy
                  </span>
                </div>
                <div className="accuracy-bar-wrap">
                  <div className="accuracy-bar" style={{ width: `${s.accuracy}%` }}></div>
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
          <h2>Score Breakdown by Subject</h2>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={stats.chartData} margin={{ top: 5, right: 20, left: -10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="subject" axisLine={false} tickLine={false} />
              <YAxis axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip />
              <Legend />
              <Bar dataKey="Correct" fill="#22c55e" radius={[4, 4, 0, 0]} />
              <Bar dataKey="Incorrect" fill="#ef4444" radius={[4, 4, 0, 0]} />
              <Bar dataKey="Unattempted" fill="#94a3b8" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Answer Review */}
      <div className="answer-review-card">
        <h2>Answer Review</h2>
        <div className="table-responsive">
          <table className="answer-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Question</th>
                <th>Subject</th>
                <th>Your Answer</th>
                <th>Correct Answer</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {stats.answers.map((a, idx) => {
                const q = a.questions || {};
                const status = a.is_correct === true ? 'correct'
                  : a.is_correct === false ? 'incorrect' : 'unattempted';
                return (
                  <tr key={a.question_id || idx} className={`row-${status}`}>
                    <td>{idx + 1}</td>
                    <td className="q-review-text">{q.question_text || '[Image question]'}</td>
                    <td><span className="subj-pill">{q.subject || 'General'}</span></td>
                    <td className={status === 'incorrect' ? 'wrong-ans' : ''}>
                      {answerText(a.selected_answer, q.options)}
                    </td>
                    <td className="correct-ans">{answerText(q.correct_answer, q.options)}</td>
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
      </div>
    </div>
  );
};

export default PostTestResult;
