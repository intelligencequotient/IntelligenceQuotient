import React, { useState, useEffect, useCallback } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import { Users, TrendingUp, AlertTriangle, ClipboardList } from 'lucide-react';
import { apiClient, toList } from '../../api/client';
import './CohortAnalytics.css';

/**
 * Cohort analytics.
 *
 * The charts here were fed by four hardcoded arrays. They now come from
 * /analytics/cohort (summary) and /tests/:id/results (per-question difficulty),
 * scoped by an optional batch filter.
 */
const CohortAnalytics = () => {
  const [batches, setBatches] = useState([]);
  const [batchId, setBatchId] = useState('');
  const [summary, setSummary] = useState(null);

  const [tests, setTests] = useState([]);
  const [selectedTest, setSelectedTest] = useState('');
  const [testResults, setTestResults] = useState(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Batches and published tests only need fetching once.
  useEffect(() => {
    (async () => {
      const [b, t] = await Promise.allSettled([
        apiClient.get('/batches'),
        apiClient.get('/tests?status=published'),
      ]);
      if (b.status === 'fulfilled') setBatches(toList(b.value));
      if (t.status === 'fulfilled') {
        const list = toList(t.value);
        setTests(list);
        if (list.length) setSelectedTest(list[0].id);
      }
    })();
  }, []);

  const loadSummary = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const query = batchId ? `?batchId=${encodeURIComponent(batchId)}` : '';
      setSummary(await apiClient.get(`/analytics/cohort${query}`));
    } catch (e) {
      setError(e.message || 'Could not load cohort analytics.');
    } finally {
      setLoading(false);
    }
  }, [batchId]);

  useEffect(() => { loadSummary(); }, [loadSummary]);

  // Per-question difficulty for whichever test is selected.
  useEffect(() => {
    if (!selectedTest) { setTestResults(null); return; }

    let cancelled = false;
    apiClient
      .get(`/tests/${selectedTest}/results`)
      .then((data) => { if (!cancelled) setTestResults(data); })
      .catch(() => { if (!cancelled) setTestResults(null); });

    return () => { cancelled = true; };
  }, [selectedTest]);

  const kpis = [
    { label: 'Students', value: summary?.totalStudents ?? 0, icon: Users, color: '#3b82f6' },
    { label: 'Avg Score', value: summary?.avgScore ?? 0, icon: TrendingUp, color: '#10b981' },
    { label: 'Attempts', value: summary?.totalAttempts ?? 0, icon: ClipboardList, color: '#f59e0b' },
    { label: 'At Risk', value: summary?.atRiskCount ?? 0, icon: AlertTriangle, color: '#ef4444' },
  ];

  // Hardest questions across the selected test.
  const missed = (testResults?.questionStats || []).slice(0, 8).map((q) => ({
    label: (q.topic || q.subject || 'Question').slice(0, 28),
    wrongPercent: 100 - q.accuracy,
    subject: q.subject,
    accuracy: q.accuracy,
  }));

  const distribution = (() => {
    if (!testResults?.results?.length) return [];
    const bands = Array.from({ length: 10 }, (_, i) => ({ range: `${i * 10}-${i * 10 + 10}%`, count: 0 }));
    for (const r of testResults.results) {
      bands[Math.min(9, Math.floor(r.percentage / 10))].count += 1;
    }
    return bands;
  })();

  return (
    <div className="cohort-analytics">
      <header className="page-header">
        <h1>Cohort Analytics</h1>
        <p>Analyze batch performance, track trends, and identify learning gaps.</p>
      </header>

      <div className="ca-filters">
        <label>
          <span className="ca-label">Batch</span>
          <select value={batchId} onChange={(e) => setBatchId(e.target.value)}>
            <option value="">All students</option>
            {batches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </label>

        <label>
          <span className="ca-label">Test</span>
          <select
            value={selectedTest}
            onChange={(e) => setSelectedTest(e.target.value)}
            disabled={!tests.length}
          >
            {tests.length === 0
              ? <option value="">No published tests</option>
              : tests.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
          </select>
        </label>
      </div>

      {error && <p className="ca-error">{error}</p>}

      <div className="ca-kpi-grid">
        {kpis.map((k) => {
          const Icon = k.icon;
          return (
            <div key={k.label} className="ca-kpi">
              <div className="ca-kpi-icon" style={{ background: `${k.color}1a`, color: k.color }}>
                <Icon size={20} />
              </div>
              <div>
                <div className="ca-kpi-label">{k.label}</div>
                <div className="ca-kpi-value">{loading ? '—' : k.value}</div>
              </div>
            </div>
          );
        })}
      </div>

      {summary?.totalStudents === 0 ? (
        <div className="ca-empty">
          <Users size={38} />
          <p>No students in this selection yet.</p>
        </div>
      ) : (
        <div className="analytics-grid">
          <div className="chart-card">
            <h2>Score Distribution{testResults?.test ? ` — ${testResults.test.title}` : ''}</h2>
            <div className="chart-container">
              {distribution.length === 0 ? (
                <p className="ca-muted ca-inline-empty">No submissions for this test yet.</p>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={distribution} margin={{ top: 8, right: 20, left: -14, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                    <XAxis dataKey="range" stroke="#64748b" tick={{ fontSize: 11 }} />
                    <YAxis stroke="#64748b" allowDecimals={false} />
                    <Tooltip />
                    <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                      {distribution.map((d, i) => (
                        <Cell key={d.range} fill={i < 4 ? '#ef4444' : i < 7 ? '#f59e0b' : '#22c55e'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          <div className="chart-card">
            <h2>Most Missed Questions</h2>
            <div className="chart-container">
              {missed.length === 0 ? (
                <p className="ca-muted ca-inline-empty">No answer data for this test yet.</p>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart layout="vertical" data={missed} margin={{ top: 8, right: 24, left: 50, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
                    <XAxis type="number" domain={[0, 100]} stroke="#64748b" />
                    <YAxis
                      dataKey="label" type="category" width={130}
                      axisLine={false} tickLine={false} tick={{ fontSize: 11 }}
                    />
                    <Tooltip formatter={(v) => [`${v}% got it wrong`, '']} />
                    <Bar dataKey="wrongPercent" radius={[0, 6, 6, 0]} barSize={18} fill="#f43f5e" />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        </div>
      )}

      {testResults?.questionStats?.length > 0 && (
        <div className="chart-card ca-table-card">
          <h2>Commonly Missed Concepts</h2>
          <div className="ca-table-wrap">
            <table className="ca-table">
              <thead>
                <tr><th>Topic</th><th>Subject</th><th>Correct</th><th>Wrong</th><th>Accuracy</th></tr>
              </thead>
              <tbody>
                {testResults.questionStats.slice(0, 10).map((q) => (
                  <tr key={q.questionId}>
                    <td>{q.topic || '—'}</td>
                    <td>{q.subject}</td>
                    <td className="ca-ok">{q.correct}</td>
                    <td className="ca-bad">{q.incorrect}</td>
                    <td>
                      <span className={`ca-pill ${q.accuracy >= 75 ? 'good' : q.accuracy >= 40 ? 'mid' : 'bad'}`}>
                        {q.accuracy}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default CohortAnalytics;
