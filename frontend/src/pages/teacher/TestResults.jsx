import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Trophy, Users, TrendingUp, AlertTriangle, Download, Clock,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import { apiClient } from '../../api/client';
import MathText from '../../components/MathText';
import './TestResults.css';

/**
 * Teacher-facing results for one test: scoreboard, cohort summary and a
 * per-question difficulty breakdown so weak topics can be re-taught.
 */
const TestResults = () => {
  const { testId } = useParams();
  const navigate = useNavigate();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('students');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setData(await apiClient.get(`/tests/${testId}/results`));
    } catch (e) {
      setError(e.message || 'Could not load results.');
    } finally {
      setLoading(false);
    }
  }, [testId]);

  useEffect(() => { load(); }, [load]);

  /** Client-side CSV export — no server round trip needed for a page of data. */
  const exportCsv = () => {
    if (!data?.results?.length) return;

    const escape = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const header = ['Rank', 'Student', 'Email', 'Score', 'Max', 'Percentage', 'Submitted', 'Auto-submitted'];
    const rows = data.results.map((r) => [
      r.rank,
      r.users?.full_name || '',
      r.users?.email || '',
      r.total_score ?? 0,
      data.summary.maxMarks,
      `${r.percentage}%`,
      r.submitted_at ? new Date(r.submitted_at).toLocaleString() : '',
      r.auto_submitted ? 'Yes' : 'No',
    ]);

    const csv = [header, ...rows].map((row) => row.map(escape).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;
    link.download = `${(data.test?.title || 'test').replace(/[^a-z0-9]+/gi, '_')}_results.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  if (loading) return <div className="results-page"><p className="results-muted">Loading results…</p></div>;

  if (error) {
    return (
      <div className="results-page">
        <button className="results-back" onClick={() => navigate('/teacher/test-library')}>
          <ArrowLeft size={18} /> Back to Test Library
        </button>
        <p className="results-error">{error}</p>
      </div>
    );
  }

  const { test, summary, results, questionStats } = data;
  const attemptRate = summary.assigned > 0
    ? Math.round((summary.submitted / summary.assigned) * 100)
    : 0;

  // Distribution in 10% bands.
  const distribution = Array.from({ length: 10 }, (_, i) => ({
    range: `${i * 10}-${i * 10 + 10}%`,
    count: 0,
  }));
  for (const r of results) {
    const idx = Math.min(9, Math.floor(r.percentage / 10));
    distribution[idx].count += 1;
  }

  const kpis = [
    { label: 'Submitted', value: `${summary.submitted}/${summary.assigned}`, sub: `${attemptRate}% attempt rate`, icon: Users, color: '#3b82f6' },
    { label: 'Average', value: summary.average, sub: `out of ${summary.maxMarks}`, icon: TrendingUp, color: '#10b981' },
    { label: 'Highest', value: summary.highest, sub: `median ${summary.median}`, icon: Trophy, color: '#f59e0b' },
    { label: 'Auto-submitted', value: summary.autoSubmitted, sub: 'ran out of time', icon: Clock, color: '#7c3aed' },
  ];

  return (
    <div className="results-page">
      <header className="results-header">
        <div>
          <button className="results-back" onClick={() => navigate('/teacher/test-library')}>
            <ArrowLeft size={18} /> Back to Test Library
          </button>
          <h1>{test.title}</h1>
          <p className="results-muted">
            {test.duration_minutes} min · {summary.maxMarks} marks
          </p>
        </div>
        <button className="results-btn" onClick={exportCsv} disabled={!results.length}>
          <Download size={16} /> Export CSV
        </button>
      </header>

      <div className="results-kpi-grid">
        {kpis.map((k) => {
          const Icon = k.icon;
          return (
            <div key={k.label} className="results-kpi">
              <div className="results-kpi-icon" style={{ background: `${k.color}1a`, color: k.color }}>
                <Icon size={20} />
              </div>
              <div>
                <div className="results-kpi-label">{k.label}</div>
                <div className="results-kpi-value">{k.value}</div>
                <div className="results-kpi-sub">{k.sub}</div>
              </div>
            </div>
          );
        })}
      </div>

      {summary.submitted === 0 ? (
        <div className="results-empty">
          <AlertTriangle size={36} />
          <p>No submissions yet. Results appear here as students finish.</p>
        </div>
      ) : (
        <>
          <div className="results-card">
            <h2>Score Distribution</h2>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={distribution} margin={{ top: 8, right: 16, left: -16, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="range" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis allowDecimals={false} axisLine={false} tickLine={false} />
                <Tooltip />
                <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                  {distribution.map((d, i) => (
                    <Cell key={d.range} fill={i < 4 ? '#ef4444' : i < 7 ? '#f59e0b' : '#22c55e'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="results-tabs">
            <button className={tab === 'students' ? 'active' : ''} onClick={() => setTab('students')}>
              Students ({results.length})
            </button>
            <button className={tab === 'questions' ? 'active' : ''} onClick={() => setTab('questions')}>
              Question Analysis ({questionStats.length})
            </button>
          </div>

          {tab === 'students' ? (
            <div className="results-card results-table-wrap">
              <table className="results-table">
                <thead>
                  <tr>
                    <th>Rank</th><th>Student</th><th>Score</th><th>%</th><th>Submitted</th><th></th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((r) => (
                    <tr key={r.id}>
                      <td className="results-rank">#{r.rank}</td>
                      <td>
                        <div className="results-name">{r.users?.full_name || 'Unknown'}</div>
                        <div className="results-muted results-small">{r.users?.email}</div>
                      </td>
                      <td><strong>{r.total_score}</strong> / {summary.maxMarks}</td>
                      <td>
                        <span className={`results-pill ${r.percentage >= 75 ? 'good' : r.percentage >= 40 ? 'mid' : 'bad'}`}>
                          {r.percentage}%
                        </span>
                      </td>
                      <td className="results-muted results-small">
                        {r.submitted_at ? new Date(r.submitted_at).toLocaleString() : '—'}
                      </td>
                      <td>
                        {r.auto_submitted && (
                          <span className="results-flag" title="Ran out of time">
                            <Clock size={13} /> auto
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="results-card results-table-wrap">
              <p className="results-muted results-small results-hint">
                Sorted hardest first — the lowest accuracy items are the ones worth revisiting.
              </p>
              <table className="results-table">
                <thead>
                  <tr>
                    <th>Question</th><th>Subject</th><th>Topic</th>
                    <th>Correct</th><th>Wrong</th><th>Skipped</th><th>Accuracy</th>
                  </tr>
                </thead>
                <tbody>
                  {questionStats.map((q) => (
                    <tr key={q.questionId}>
                      <td className="results-qtext">
                        <MathText text={q.questionText || '(image-only question)'} />
                      </td>
                      <td>{q.subject}</td>
                      <td className="results-muted">{q.topic || '—'}</td>
                      <td className="results-ok">{q.correct}</td>
                      <td className="results-bad">{q.incorrect}</td>
                      <td className="results-muted">{q.unattempted}</td>
                      <td>
                        <span className={`results-pill ${q.accuracy >= 75 ? 'good' : q.accuracy >= 40 ? 'mid' : 'bad'}`}>
                          {q.accuracy}%
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default TestResults;
