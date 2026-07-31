import React, { useState, useEffect, useMemo } from 'react';
import { Book, FlaskConical, Calculator, Dna, ArrowRight, TrendingUp, Clock, Target, Calendar, Loader2 } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { apiClient } from '../../api/client';
import './StudentDashboard.css';

const SUBJECTS = [
  { id: 'physics', name: 'Physics', icon: Book, colorClass: 'subject-physics', desc: 'Master mechanics and electromagnetism.' },
  { id: 'chemistry', name: 'Chemistry', icon: FlaskConical, colorClass: 'subject-chemistry', desc: 'Explore organic and inorganic reactions.' },
  { id: 'mathematics', name: 'Mathematics', icon: Calculator, colorClass: 'subject-math', desc: 'Solve complex calculus and algebra.' },
  { id: 'biology', name: 'Biology', icon: Dna, colorClass: 'subject-biology', desc: 'Understand life sciences end to end.' },
];

const currentUser = () => {
  try {
    return JSON.parse(localStorage.getItem('user') || '{}');
  } catch {
    return {};
  }
};

const StudentDashboard = () => {
  const navigate = useNavigate();
  const [user] = useState(currentUser);

  const [analytics, setAnalytics] = useState(null);
  const [rank, setRank] = useState(null);
  const [available, setAvailable] = useState([]);
  const [attempts, setAttempts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [a, r, t, at] = await Promise.allSettled([
        apiClient.get('/analytics/me'),
        apiClient.get('/leaderboard/me'),
        apiClient.get('/tests/available'),
        apiClient.get('/attempts/my'),
      ]);
      if (cancelled) return;
      if (a.status === 'fulfilled') setAnalytics(a.value);
      if (r.status === 'fulfilled') setRank(r.value);
      if (t.status === 'fulfilled') setAvailable(t.value || []);
      if (at.status === 'fulfilled') setAttempts(at.value || []);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  // Overall accuracy across every subject the student has answered in
  const overallAccuracy = useMemo(() => {
    const rows = analytics?.subjectBreakdown || [];
    const total = rows.reduce((s, r) => s + (r.totalAnswered || 0), 0);
    if (!total) return null;
    const weighted = rows.reduce((s, r) => s + (r.accuracy || 0) * (r.totalAnswered || 0), 0);
    return Math.round(weighted / total);
  }, [analytics]);

  const submitted = useMemo(
    () => attempts.filter((a) => a.status === 'submitted'),
    [attempts],
  );

  const inProgress = useMemo(
    () => attempts.find((a) => a.status === 'in_progress'),
    [attempts],
  );

  // Next test whose window is open or upcoming
  const nextTest = useMemo(() => {
    const now = Date.now();
    return [...available]
      .filter((a) => a.tests)
      .sort((x, y) => new Date(x.scheduled_start || 0) - new Date(y.scheduled_start || 0))
      .find((a) => !a.scheduled_end || new Date(a.scheduled_end).getTime() >= now);
  }, [available]);

  const dash = (v, suffix = '') => (loading ? '—' : v === null || v === undefined ? '—' : `${v}${suffix}`);

  const kpiData = [
    { label: 'Overall Rank', value: rank?.rank ? `#${rank.rank}` : dash(null), icon: TrendingUp, color: 'var(--color-dashboard-blue)' },
    { label: 'Tests Submitted', value: dash(submitted.length), icon: Calendar, color: 'var(--color-chemistry-orange)' },
    { label: 'Accuracy', value: dash(overallAccuracy, '%'), icon: Target, color: 'var(--color-biology-green)' },
    { label: 'Tests Available', value: dash(available.length), icon: Clock, color: 'var(--color-physics-red)' },
  ];

  const heroLine = () => {
    if (loading) return 'Loading your progress…';
    if (inProgress) return 'You have a test in progress. Pick up where you left off.';
    if (nextTest) {
      const when = nextTest.scheduled_start
        ? new Date(nextTest.scheduled_start).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
        : null;
      return `Next up: ${nextTest.tests.title}${when ? ` — opens ${when}` : ''}.`;
    }
    if (available.length === 0) return 'No tests assigned right now. Check back soon.';
    return "Let's make today count.";
  };

  const primaryTestId = inProgress?.tests?.id || nextTest?.tests?.id || null;

  return (
    <div className="dashboard-container animate-fade-in">
      <div className="hero-banner animate-slide-up">
        <div className="hero-content">
          <h1>Welcome back{user.full_name ? `, ${user.full_name.split(' ')[0]}` : ''} 👋</h1>
          <p>{heroLine()}</p>
          {primaryTestId && (
            <div className="hero-actions">
              <button
                className="btn-glow"
                style={{ border: 'none', cursor: 'pointer' }}
                onClick={() => navigate(`/student/locked/test/${primaryTestId}`)}
              >
                {inProgress ? 'Resume Test' : 'Start Test'}
              </button>
            </div>
          )}
        </div>
        <div className="hero-decoration">
          <div className="circle circle-1"></div>
          <div className="circle circle-2"></div>
        </div>
      </div>

      <div className="section-header animate-slide-up" style={{ animationDelay: '0.1s' }}>
        <h2>Performance Overview</h2>
        <Link to="/student/analytics" className="view-all-link">Detailed Analytics <ArrowRight size={16} /></Link>
      </div>

      <div className="kpi-grid animate-slide-up" style={{ animationDelay: '0.2s' }}>
        {kpiData.map((kpi, idx) => {
          const Icon = kpi.icon;
          return (
            <div key={idx} className="kpi-card glass">
              <div className="kpi-icon-wrapper" style={{ backgroundColor: `${kpi.color}18`, color: kpi.color }}>
                <Icon size={24} />
              </div>
              <div className="kpi-info">
                <span className="kpi-label">{kpi.label}</span>
                <span className="kpi-value">{kpi.value}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Assigned tests */}
      <div className="section-header mt-4 animate-slide-up" style={{ animationDelay: '0.3s' }}>
        <h2>Your Tests</h2>
      </div>

      <div className="subject-grid animate-slide-up" style={{ animationDelay: '0.35s' }}>
        {loading && (
          <p style={{ color: 'var(--text-secondary)' }}>
            <Loader2 size={16} style={{ verticalAlign: 'middle', marginRight: '6px' }} />
            Loading assigned tests…
          </p>
        )}

        {!loading && available.length === 0 && (
          <p style={{ color: 'var(--text-secondary)' }}>
            No tests have been assigned to your batch yet.
          </p>
        )}

        {!loading && available.filter((a) => a.tests).map((a) => {
          const attempt = attempts.find((x) => x.tests?.id === a.tests.id);
          const done = attempt?.status === 'submitted';
          return (
            <div key={a.id} className="subject-card glass">
              <div className="subject-card-top">
                <div className="subject-icon-wrapper"><Book size={28} /></div>
                <h3>{a.tests.title}</h3>
              </div>
              <p>
                {a.tests.duration_minutes} mins · {a.tests.total_marks} marks
                {a.scheduled_start && (
                  <> · opens {new Date(a.scheduled_start).toLocaleDateString()}</>
                )}
              </p>
              <div className="subject-actions">
                {done ? (
                  <Link to={`/student/result/${attempt.id}`} className="btn btn-primary w-100 text-center">
                    View Result
                  </Link>
                ) : (
                  <Link to={`/student/locked/test/${a.tests.id}`} className="btn btn-primary w-100 text-center">
                    {attempt?.status === 'in_progress' ? 'Resume Test' : 'Start Test'}
                  </Link>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Subject modules */}
      <div className="section-header mt-4 animate-slide-up" style={{ animationDelay: '0.4s' }}>
        <h2>Subject Modules</h2>
      </div>

      <div className="subject-grid animate-slide-up" style={{ animationDelay: '0.45s' }}>
        {SUBJECTS.map((sub) => {
          const Icon = sub.icon;
          const stat = (analytics?.subjectBreakdown || []).find(
            (s) => (s.subject || '').toLowerCase() === sub.name.toLowerCase(),
          );
          const accuracy = stat?.accuracy ?? 0;
          return (
            <div key={sub.id} className={`subject-card glass ${sub.colorClass}`}>
              <div className="subject-card-top">
                <div className="subject-icon-wrapper"><Icon size={28} /></div>
                <h3>{sub.name}</h3>
              </div>
              <p>{sub.desc}</p>

              <div className="subject-progress">
                <div className="progress-bar">
                  <div className="progress-fill" style={{ width: `${accuracy}%` }}></div>
                </div>
                <span className="progress-text">
                  {stat ? `${accuracy}% accuracy over ${stat.totalAnswered} questions` : 'No attempts yet'}
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
