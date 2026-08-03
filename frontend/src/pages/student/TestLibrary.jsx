import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FileText, CheckCircle2, Clock, Target, Trophy, ArrowRight,
  Search, SlidersHorizontal, TrendingUp, BookOpen, ChevronDown, ChevronUp,
  Calendar, Star, BarChart2,
} from 'lucide-react';
import { apiClient } from '../../api/client';
import './TestLibrary.css';

const SCORE_FILTERS = [
  { label: 'All Results', value: 'all' },
  { label: '≥ 75%  (Strong)', value: 'good' },
  { label: '40–74%  (Average)', value: 'mid' },
  { label: '< 40%  (Needs Work)', value: 'bad' },
];

const SORT_OPTIONS = [
  { label: 'Newest First', value: 'newest' },
  { label: 'Oldest First', value: 'oldest' },
  { label: 'Highest Score', value: 'score_desc' },
  { label: 'Lowest Score', value: 'score_asc' },
];

/** Format seconds → "Xm Ys" */
const fmtDuration = (seconds) => {
  if (!seconds || seconds < 0) return '—';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${s}s`;
};

/** Pretty date — "3 Aug 2026" */
const fmtDate = (iso) => {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric',
  });
};

const ScoreBadge = ({ pct }) => {
  const cls = pct >= 75 ? 'tl-badge-good' : pct >= 40 ? 'tl-badge-mid' : 'tl-badge-bad';
  return <span className={`tl-badge ${cls}`}>{pct}%</span>;
};

const StudentTestLibrary = () => {
  const navigate = useNavigate();

  const [attempts, setAttempts] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState('');

  const [search, setSearch]     = useState('');
  const [scoreFilter, setScoreFilter] = useState('all');
  const [sortBy, setSortBy]     = useState('newest');
  const [showSort, setShowSort] = useState(false);

  /* ── Fetch all past attempts ──────────────────────────────────────────── */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await apiClient.get('/attempts/my');
        if (!cancelled) setAttempts(data || []);
      } catch (e) {
        if (!cancelled) setError(e.message || 'Could not load your test history.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  /* ── Only show submitted attempts ─────────────────────────────────────── */
  const submitted = useMemo(
    () => attempts.filter((a) => a.status === 'submitted'),
    [attempts],
  );

  /* ── Aggregate stats ──────────────────────────────────────────────────── */
  const stats = useMemo(() => {
    if (!submitted.length) return null;
    const pcts = submitted.map((a) => {
      const max = a.tests?.total_marks || 0;
      return max > 0 ? Math.round(((a.total_score || 0) / max) * 100) : 0;
    });
    const totalSeconds = submitted.reduce((acc, a) => {
      if (!a.submitted_at || !a.started_at) return acc;
      return acc + Math.floor((new Date(a.submitted_at) - new Date(a.started_at)) / 1000);
    }, 0);
    return {
      total:   submitted.length,
      avgPct:  Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length),
      bestPct: Math.max(...pcts),
      totalTime: totalSeconds,
    };
  }, [submitted]);

  /* ── Filter + sort ────────────────────────────────────────────────────── */
  const filtered = useMemo(() => {
    let list = submitted.filter((a) => {
      const title = (a.tests?.title || '').toLowerCase();
      if (search && !title.includes(search.toLowerCase())) return false;
      const max = a.tests?.total_marks || 0;
      const pct = max > 0 ? Math.round(((a.total_score || 0) / max) * 100) : 0;
      if (scoreFilter === 'good' && pct < 75) return false;
      if (scoreFilter === 'mid' && (pct < 40 || pct >= 75)) return false;
      if (scoreFilter === 'bad' && pct >= 40) return false;
      return true;
    });

    list = [...list].sort((a, b) => {
      if (sortBy === 'newest') return new Date(b.submitted_at) - new Date(a.submitted_at);
      if (sortBy === 'oldest') return new Date(a.submitted_at) - new Date(b.submitted_at);
      const pctA = a.tests?.total_marks > 0 ? (a.total_score || 0) / a.tests.total_marks : 0;
      const pctB = b.tests?.total_marks > 0 ? (b.total_score || 0) / b.tests.total_marks : 0;
      return sortBy === 'score_desc' ? pctB - pctA : pctA - pctB;
    });

    return list;
  }, [submitted, search, scoreFilter, sortBy]);

  /* ── Render helpers ───────────────────────────────────────────────────── */
  const currentSortLabel = SORT_OPTIONS.find((o) => o.value === sortBy)?.label;

  if (loading) {
    return (
      <div className="tl-page animate-fade-in">
        <div className="tl-skeleton-header" />
        <div className="tl-skeleton-stats" />
        <div className="tl-skeleton-list">
          {[1, 2, 3].map((i) => <div key={i} className="tl-skeleton-card" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="tl-page animate-fade-in">

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="tl-header animate-slide-up">
        <div className="tl-header-left">
          <div className="tl-header-icon">
            <BookOpen size={28} />
          </div>
          <div>
            <h1 className="tl-title">Test Library</h1>
            <p className="tl-subtitle">Your complete history of every test you've taken</p>
          </div>
        </div>
        {stats && (
          <div className="tl-header-right">
            <span className="tl-total-badge">
              <FileText size={14} /> {stats.total} test{stats.total !== 1 ? 's' : ''} completed
            </span>
          </div>
        )}
      </div>

      {/* ── Stats Bar ───────────────────────────────────────────────────── */}
      {stats && (
        <div className="tl-stats-grid animate-slide-up">
          <div className="tl-stat-card glass">
            <div className="tl-stat-icon" style={{ background: 'rgba(59,130,246,0.12)', color: 'var(--color-dashboard-blue)' }}>
              <FileText size={22} />
            </div>
            <div className="tl-stat-info">
              <span className="tl-stat-label">Tests Taken</span>
              <span className="tl-stat-value">{stats.total}</span>
            </div>
          </div>
          <div className="tl-stat-card glass">
            <div className="tl-stat-icon" style={{ background: 'rgba(16,185,129,0.12)', color: 'var(--color-biology-green)' }}>
              <TrendingUp size={22} />
            </div>
            <div className="tl-stat-info">
              <span className="tl-stat-label">Avg Score</span>
              <span className="tl-stat-value">{stats.avgPct}%</span>
            </div>
          </div>
          <div className="tl-stat-card glass">
            <div className="tl-stat-icon" style={{ background: 'rgba(245,158,11,0.12)', color: 'var(--color-chemistry-orange)' }}>
              <Star size={22} />
            </div>
            <div className="tl-stat-info">
              <span className="tl-stat-label">Best Score</span>
              <span className="tl-stat-value">{stats.bestPct}%</span>
            </div>
          </div>
          <div className="tl-stat-card glass">
            <div className="tl-stat-icon" style={{ background: 'rgba(99,102,241,0.12)', color: '#6366f1' }}>
              <Clock size={22} />
            </div>
            <div className="tl-stat-info">
              <span className="tl-stat-label">Total Time Spent</span>
              <span className="tl-stat-value">{fmtDuration(stats.totalTime)}</span>
            </div>
          </div>
        </div>
      )}

      {/* ── Error state ─────────────────────────────────────────────────── */}
      {error && (
        <div className="tl-error animate-slide-up">
          <p>{error}</p>
          <button className="tl-retry-btn" onClick={() => window.location.reload()}>Retry</button>
        </div>
      )}

      {/* ── Empty (no history at all) ────────────────────────────────────── */}
      {!error && !loading && submitted.length === 0 && (
        <div className="tl-empty animate-slide-up glass">
          <div className="tl-empty-icon"><BarChart2 size={44} /></div>
          <h3>No tests completed yet</h3>
          <p>Once you finish a test, it will appear here with your full result breakdown.</p>
          <button className="tl-go-dash" onClick={() => navigate('/student')}>
            Go to Dashboard
          </button>
        </div>
      )}

      {/* ── Filters + Sort ──────────────────────────────────────────────── */}
      {submitted.length > 0 && (
        <div className="tl-controls animate-slide-up">
          {/* Search */}
          <div className="tl-search-wrap">
            <Search size={16} className="tl-search-icon" />
            <input
              id="tl-search-input"
              className="tl-search"
              type="text"
              placeholder="Search by test name…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {/* Score filter pills */}
          <div className="tl-filter-pills">
            {SCORE_FILTERS.map((f) => (
              <button
                key={f.value}
                className={`tl-pill ${scoreFilter === f.value ? 'tl-pill-active' : ''}`}
                onClick={() => setScoreFilter(f.value)}
              >
                {f.label}
              </button>
            ))}
          </div>

          {/* Sort dropdown */}
          <div className="tl-sort-wrap">
            <button
              id="tl-sort-btn"
              className="tl-sort-btn"
              onClick={() => setShowSort((v) => !v)}
            >
              <SlidersHorizontal size={15} />
              {currentSortLabel}
              {showSort ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
            {showSort && (
              <div className="tl-sort-dropdown glass">
                {SORT_OPTIONS.map((o) => (
                  <button
                    key={o.value}
                    className={`tl-sort-option ${sortBy === o.value ? 'tl-sort-option-active' : ''}`}
                    onClick={() => { setSortBy(o.value); setShowSort(false); }}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Result count ────────────────────────────────────────────────── */}
      {submitted.length > 0 && (
        <p className="tl-result-count">
          Showing <strong>{filtered.length}</strong> of {submitted.length} test{submitted.length !== 1 ? 's' : ''}
        </p>
      )}

      {/* ── No results after filter ──────────────────────────────────────── */}
      {submitted.length > 0 && filtered.length === 0 && (
        <div className="tl-empty animate-fade-in glass">
          <div className="tl-empty-icon"><Search size={36} /></div>
          <h3>No matches found</h3>
          <p>Try adjusting your search or filter.</p>
        </div>
      )}

      {/* ── Test Cards ──────────────────────────────────────────────────── */}
      <div className="tl-list animate-slide-up">
        {filtered.map((attempt, idx) => {
          const test    = attempt.tests || {};
          const max     = test.total_marks || 0;
          const score   = attempt.total_score || 0;
          const pct     = max > 0 ? Math.round((score / max) * 100) : 0;
          const durationSecs = attempt.submitted_at && attempt.started_at
            ? Math.max(0, Math.floor((new Date(attempt.submitted_at) - new Date(attempt.started_at)) / 1000))
            : null;

          const barColor = pct >= 75 ? '#10b981' : pct >= 40 ? '#f59e0b' : '#f43f5e';

          return (
            <div
              key={attempt.id}
              className="tl-card glass animate-slide-up"
              style={{ animationDelay: `${idx * 50}ms` }}
            >
              {/* Left accent bar */}
              <div className="tl-card-accent" style={{ background: barColor }} />

              {/* Body */}
              <div className="tl-card-body">
                {/* Title row */}
                <div className="tl-card-top">
                  <div className="tl-card-title-group">
                    <h3 className="tl-card-title">{test.title || 'Test'}</h3>
                    <ScoreBadge pct={pct} />
                  </div>
                  <div className="tl-card-meta">
                    <span className="tl-meta-item">
                      <Calendar size={13} />
                      {fmtDate(attempt.submitted_at)}
                    </span>
                    {durationSecs !== null && (
                      <span className="tl-meta-item">
                        <Clock size={13} />
                        {fmtDuration(durationSecs)}
                      </span>
                    )}
                  </div>
                </div>

                {/* Score progress bar */}
                <div className="tl-progress-wrap">
                  <div className="tl-progress-bar">
                    <div
                      className="tl-progress-fill"
                      style={{ width: `${pct}%`, background: barColor }}
                    />
                  </div>
                  <span className="tl-progress-label">
                    {score} / {max} marks
                  </span>
                </div>

                {/* Stats row */}
                <div className="tl-card-stats">
                  <div className="tl-card-stat">
                    <Trophy size={14} className="tl-stat-ico" />
                    <span>{score}</span>
                    <span className="tl-stat-sub"> marks scored</span>
                  </div>
                  <div className="tl-card-stat">
                    <Target size={14} className="tl-stat-ico" />
                    <span>{pct}%</span>
                    <span className="tl-stat-sub"> of total</span>
                  </div>
                  <div className="tl-card-stat">
                    <CheckCircle2 size={14} className="tl-stat-ico" style={{ color: '#10b981' }} />
                    <span className={pct >= 40 ? 'tl-pass' : 'tl-fail'}>
                      {pct >= 40 ? 'Passed' : 'Failed'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Action */}
              <button
                id={`tl-view-result-${attempt.id}`}
                className="tl-view-btn"
                onClick={() => navigate(`/student/result/${attempt.id}`)}
                aria-label={`View result for ${test.title}`}
              >
                View Result
                <ArrowRight size={15} />
              </button>
            </div>
          );
        })}
      </div>

    </div>
  );
};

export default StudentTestLibrary;
