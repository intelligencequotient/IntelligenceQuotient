import React, { useState, useEffect } from 'react';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Loader2 } from 'lucide-react';
import { apiClient } from '../../api/client';
import './CohortAnalytics.css';

const CohortAnalytics = () => {
  const [batches, setBatches] = useState([]);
  const [batchId, setBatchId] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Batch list for the filter
  useEffect(() => {
    (async () => {
      try {
        setBatches((await apiClient.get('/batches')) || []);
      } catch {
        /* filter is optional */
      }
    })();
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError('');
      try {
        const qs = batchId ? `?batchId=${encodeURIComponent(batchId)}` : '';
        const res = await apiClient.get(`/analytics/cohort${qs}`);
        if (!cancelled) setData(res);
      } catch (err) {
        if (!cancelled) setError(err.message || 'Could not load cohort analytics.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [batchId]);

  const scoreTrend = data?.scoreTrend || [];
  const distribution = data?.distribution || [];
  const missedTopics = data?.missedTopics || [];

  return (
    <div className="cohort-analytics">
      <header className="page-header d-flex justify-between align-center">
        <div>
          <h1>Cohort Analytics</h1>
          <p>Analyze batch performance, track trends, and identify learning gaps.</p>
        </div>
        <select
          className="filter-select"
          value={batchId}
          onChange={(e) => setBatchId(e.target.value)}
        >
          <option value="">All students</option>
          {batches.map((b) => (
            <option key={b.id} value={b.id}>{b.name}</option>
          ))}
        </select>
      </header>

      {error && (
        <div className="error-alert" style={{ color: '#dc2626', margin: '12px 0' }}>{error}</div>
      )}

      {loading ? (
        <div style={{ padding: '60px', textAlign: 'center', color: 'var(--text-secondary)' }}>
          <Loader2 size={20} style={{ verticalAlign: 'middle', marginRight: '8px' }} />
          Loading cohort data…
        </div>
      ) : (
        <>
          {/* Headline numbers */}
          <div className="kpi-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px', marginBottom: '20px' }}>
            <div className="chart-card" style={{ padding: '18px' }}>
              <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Students</span>
              <div style={{ fontSize: '1.8rem', fontWeight: 700 }}>{data?.totalStudents ?? 0}</div>
            </div>
            <div className="chart-card" style={{ padding: '18px' }}>
              <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Tests Submitted</span>
              <div style={{ fontSize: '1.8rem', fontWeight: 700 }}>{data?.totalAttempts ?? 0}</div>
            </div>
            <div className="chart-card" style={{ padding: '18px' }}>
              <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Average Score</span>
              <div style={{ fontSize: '1.8rem', fontWeight: 700 }}>{data?.avgPercentage ?? 0}%</div>
            </div>
            <div className="chart-card" style={{ padding: '18px' }}>
              <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Flagged At Risk</span>
              <div style={{ fontSize: '1.8rem', fontWeight: 700 }}>{data?.atRiskCount ?? 0}</div>
            </div>
          </div>

          <div className="analytics-grid">
            <div className="chart-card">
              <h2>Class Average Score Trend</h2>
              <div className="chart-container">
                {scoreTrend.length === 0 ? (
                  <p style={{ color: 'var(--text-secondary)' }}>No submitted tests yet.</p>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={scoreTrend} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                      <XAxis dataKey="name" stroke="#64748b" />
                      <YAxis stroke="#64748b" domain={[0, 100]} />
                      <Tooltip
                        contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                        formatter={(v) => [`${v}%`, 'Class average']}
                      />
                      <Legend />
                      <Line type="monotone" dataKey="score" name="Average %" stroke="var(--color-teacher-accent)" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 8 }} />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>

            <div className="chart-card">
              <h2>Score Distribution</h2>
              <div className="chart-container">
                {data?.totalAttempts === 0 ? (
                  <p style={{ color: 'var(--text-secondary)' }}>No attempts to distribute yet.</p>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={distribution} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                      <XAxis dataKey="range" stroke="#64748b" />
                      <YAxis stroke="#64748b" allowDecimals={false} />
                      <Tooltip
                        cursor={{ fill: 'rgba(99, 102, 241, 0.05)' }}
                        contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                      />
                      <Legend />
                      <Bar dataKey="count" name="Attempts" fill="var(--color-teacher-navy-mid)" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>

            <div className="missed-concepts-card">
              <h2>Commonly Missed Concepts</h2>
              <div className="concepts-list">
                {missedTopics.length === 0 ? (
                  <p style={{ color: 'var(--text-secondary)', padding: '12px' }}>
                    Not enough answered questions yet to identify weak topics.
                  </p>
                ) : (
                  missedTopics.map((concept) => (
                    <div key={`${concept.subject}-${concept.topic}`} className="concept-item">
                      <div className="concept-info">
                        <h3>{concept.topic}</h3>
                        <span className={`subject-tag ${(concept.subject || '').toLowerCase()}`}>{concept.subject}</span>
                      </div>
                      <div className="concept-stats">
                        <div className="stat-group">
                          <span className="stat-label">Students Wrong</span>
                          <span className="stat-value danger">{concept.wrongPercent}%</span>
                        </div>
                        <span className={`difficulty-badge ${(concept.difficulty || 'medium').toLowerCase()}`}>
                          {concept.difficulty || 'medium'}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default CohortAnalytics;
