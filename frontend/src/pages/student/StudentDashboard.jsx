import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Book, FlaskConical, Calculator, ArrowRight, TrendingUp, Clock, Target,
  Calendar, PlayCircle, CheckCircle2, Lock,
} from 'lucide-react';
import { apiClient, getStoredUser } from '../../api/client';
import './StudentDashboard.css';

/**
 * Origin of the standalone secure-exam app. Was hardcoded to localhost:5175,
 * which meant the "Start Test" button could only ever work on one dev machine.
 */
const EXAM_APP_URL = (import.meta.env.VITE_EXAM_APP_URL || 'http://localhost:5175').replace(/\/$/, '');

/**
 * Hands the session over to the exam app.
 *
 * The tokens travel in the URL *fragment*: browsers never send it to a server
 * and it never reaches an access log. The refresh token goes too — an exam can
 * run for three hours and an access token expires in one.
 */
const launchExam = (testId) => {
  const token = localStorage.getItem('access_token');
  const refresh = localStorage.getItem('refresh_token');

  const fragment = new URLSearchParams();
  if (token) fragment.set('token', token);
  if (refresh) fragment.set('refresh', refresh);

  const url = `${EXAM_APP_URL}/exam/instructions/${testId}#${fragment.toString()}`;

  // Open in a new tab so the portal stays put behind the exam — the launcher's
  // Cancel button calls window.close(), which only works on a scripted window.
  const win = window.open(url, '_blank', 'noopener,noreferrer');
  if (!win) window.location.href = url;
};

const SUBJECTS = [
  { id: 'physics',   name: 'Physics',     icon: Book,        colorClass: 'subject-physics',   desc: 'Master mechanics and electromagnetism.' },
  { id: 'chemistry', name: 'Chemistry',   icon: FlaskConical, colorClass: 'subject-chemistry', desc: 'Explore organic and inorganic reactions.' },
  { id: 'math',      name: 'Mathematics', icon: Calculator,  colorClass: 'subject-math',      desc: 'Solve complex calculus and algebra.' },
];

/**
 * Student home.
 *
 * Previously every number here was hardcoded and there was no route into an
 * exam at all — the assessment arena existed but nothing linked to it. This now
 * lists the tests actually assigned to the student and launches them.
 */
const StudentDashboard = () => {
  const navigate = useNavigate();
  const user = getStoredUser() || {};

  const [assignments, setAssignments] = useState([]);
  const [attempts, setAttempts] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [rank, setRank] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      // One slow or empty endpoint must not blank the whole dashboard.
      const [tests, myAttempts, stats, myRank] = await Promise.allSettled([
        apiClient.get('/tests/available'),
        apiClient.get('/attempts/my'),
        apiClient.get('/analytics/me'),
        apiClient.get('/leaderboard/me'),
      ]);

      if (cancelled) return;

      if (tests.status === 'fulfilled') setAssignments(tests.value || []);
      if (myAttempts.status === 'fulfilled') setAttempts(myAttempts.value || []);
      if (stats.status === 'fulfilled') setAnalytics(stats.value);
      if (myRank.status === 'fulfilled') setRank(myRank.value);
      setLoading(false);
    })();

    return () => { cancelled = true; };
  }, []);

  // attempt status per test, so a finished test shows its result instead of restarting.
  const attemptByTest = new Map();
  for (const a of attempts) {
    const testId = a.tests?.id;
    if (testId) attemptByTest.set(testId, a);
  }

  const now = Date.now();
  const windowFor = (assignment) => {
    const start = assignment.scheduled_start ? new Date(assignment.scheduled_start).getTime() : null;
    const end = assignment.scheduled_end ? new Date(assignment.scheduled_end).getTime() : null;
    if (start && now < start) return { state: 'upcoming', start, end };
    if (end && now > end) return { state: 'closed', start, end };
    return { state: 'open', start, end };
  };

  const kpis = [
    {
      label: 'Overall Rank',
      value: rank?.rank ? `#${rank.rank}` : '—',
      icon: TrendingUp,
      color: 'var(--color-dashboard-blue)',
    },
    {
      label: 'Avg / Question',
      value: analytics?.avgSecondsPerQuestion ? `${analytics.avgSecondsPerQuestion}s` : '—',
      icon: Clock,
      color: 'var(--color-chemistry-orange)',
    },
    {
      label: 'Accuracy',
      value: analytics?.avgAccuracy != null ? `${analytics.avgAccuracy}%` : '—',
      icon: Target,
      color: 'var(--color-biology-green)',
    },
    {
      label: 'Tests Taken',
      value: analytics?.testsAttempted ?? 0,
      icon: Calendar,
      color: 'var(--color-physics-red)',
    },
  ];

  const firstName = (user.full_name || 'there').split(' ')[0];

  return (
    <div className="dashboard-container animate-fade-in">
      <div className="hero-banner animate-slide-up">
        <div className="hero-content">
          <h1>Welcome back, {firstName}! 👋</h1>
          <p>
            {loading
              ? 'Loading your progress…'
              : assignments.length > 0
                ? `You have ${assignments.length} test${assignments.length === 1 ? '' : 's'} assigned.`
                : 'No tests assigned right now — keep practising.'}
          </p>
        </div>
        <div className="hero-decoration">
          <div className="circle circle-1" />
          <div className="circle circle-2" />
        </div>
      </div>

      <div className="section-header animate-slide-up">
        <h2>Performance Overview</h2>
        <Link to="/student/analytics" className="view-all-link">
          Detailed Analytics <ArrowRight size={16} />
        </Link>
      </div>

      <div className="kpi-grid animate-slide-up">
        {kpis.map((kpi) => {
          const Icon = kpi.icon;
          return (
            <div key={kpi.label} className="kpi-card glass">
              <div className="kpi-icon-wrapper" style={{ backgroundColor: `${kpi.color}18`, color: kpi.color }}>
                <Icon size={24} />
              </div>
              <div className="kpi-info">
                <span className="kpi-label">{kpi.label}</span>
                <span className="kpi-value">{loading ? '—' : kpi.value}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* ── The route into an exam ─────────────────────────────────────────── */}
      <div className="section-header mt-4 animate-slide-up">
        <h2>Your Tests</h2>
      </div>

      {loading ? (
        <p className="sd-muted">Loading your tests…</p>
      ) : assignments.length === 0 ? (
        <div className="sd-empty">
          <Target size={36} />
          <p>No tests have been assigned to you yet.</p>
        </div>
      ) : (
        <div className="sd-test-list animate-slide-up">
          {assignments.map((assignment) => {
            const test = assignment.tests || {};
            const attempt = attemptByTest.get(test.id);
            const submitted = attempt?.status === 'submitted';
            const inProgress = attempt?.status === 'in_progress';
            const { state, start, end } = windowFor(assignment);

            return (
              <div key={assignment.id} className="sd-test-card glass">
                <div className="sd-test-main">
                  <div className="sd-test-head">
                    <h3>{test.title}</h3>
                    {submitted && <span className="sd-badge done"><CheckCircle2 size={13} /> Completed</span>}
                    {inProgress && <span className="sd-badge progress">In progress</span>}
                    {!attempt && state === 'upcoming' && <span className="sd-badge upcoming"><Lock size={13} /> Not open yet</span>}
                    {!attempt && state === 'closed' && <span className="sd-badge closed">Window closed</span>}
                  </div>

                  <p className="sd-muted sd-test-desc">{test.description || 'No description provided.'}</p>

                  <div className="sd-test-meta">
                    <span><Clock size={13} /> {test.duration_minutes} min</span>
                    <span>{test.total_marks} marks</span>
                    {start && (
                      <span>
                        {state === 'upcoming' ? 'Opens ' : 'Opened '}
                        {new Date(start).toLocaleString()}
                      </span>
                    )}
                    {end && state !== 'closed' && (
                      <span>Closes {new Date(end).toLocaleString()}</span>
                    )}
                  </div>
                </div>

                <div className="sd-test-action">
                  {submitted ? (
                    <button className="btn btn-primary" onClick={() => navigate(`/student/result/${attempt.id}`)}>
                      View Result
                    </button>
                  ) : state === 'open' ? (
                    <button
                      className="btn btn-primary"
                      onClick={() => launchExam(test.id)}
                    >
                      <PlayCircle size={17} /> {inProgress ? 'Resume Test' : 'Start Test'}
                    </button>
                  ) : (
                    <button className="btn btn-primary" disabled>
                      {state === 'upcoming' ? 'Not open yet' : 'Closed'}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Past attempts ──────────────────────────────────────────────────── */}
      {attempts.filter((a) => a.status === 'submitted').length > 0 && (
        <>
          <div className="section-header mt-4 animate-slide-up">
            <h2>Recent Results</h2>
          </div>
          <div className="sd-history animate-slide-up">
            {attempts
              .filter((a) => a.status === 'submitted')
              .slice(0, 5)
              .map((a) => {
                const max = a.tests?.total_marks || 0;
                const pct = max > 0 ? Math.round(((a.total_score || 0) / max) * 100) : 0;
                return (
                  <button
                    key={a.id}
                    className="sd-history-row"
                    onClick={() => navigate(`/student/result/${a.id}`)}
                  >
                    <span className="sd-history-title">{a.tests?.title || 'Test'}</span>
                    <span className="sd-muted sd-small">
                      {a.submitted_at ? new Date(a.submitted_at).toLocaleDateString() : ''}
                    </span>
                    <span className={`sd-score ${pct >= 75 ? 'good' : pct >= 40 ? 'mid' : 'bad'}`}>
                      {a.total_score} / {max}
                    </span>
                    <ArrowRight size={15} className="sd-muted" />
                  </button>
                );
              })}
          </div>
        </>
      )}

      <div className="section-header mt-4 animate-slide-up">
        <h2>Subject Modules</h2>
      </div>

      <div className="subject-grid animate-slide-up">
        {SUBJECTS.map((sub) => {
          const Icon = sub.icon;
          // Progress comes from real per-subject accuracy where it exists.
          const stat = analytics?.subjectBreakdown?.find(
            (s) => s.subject.toLowerCase().startsWith(sub.name.slice(0, 4).toLowerCase()),
          );
          const progress = stat?.accuracy ?? 0;

          return (
            <div key={sub.id} className={`subject-card glass ${sub.colorClass}`}>
              <div className="subject-card-top">
                <div className="subject-icon-wrapper"><Icon size={28} /></div>
                <h3>{sub.name}</h3>
              </div>
              <p>{sub.desc}</p>

              <div className="subject-progress">
                <div className="progress-bar">
                  <div className="progress-fill" style={{ width: `${progress}%` }} />
                </div>
                <span className="progress-text">
                  {stat ? `${progress}% accuracy · ${stat.totalAnswered} answered` : 'No data yet'}
                </span>
              </div>

              <div className="subject-actions">
                <Link to={`/student/subject/${sub.id}`} className="btn btn-primary w-100 text-center">
                  Continue Learning
                </Link>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default StudentDashboard;
