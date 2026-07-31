import React, { useState, useEffect, useMemo } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer,
  Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  BarChart, Bar, Cell,
} from 'recharts';
import { AlertTriangle, TrendingUp, Loader2 } from 'lucide-react';
import { apiClient } from '../../api/client';
import './AnalyticsHub.css';

const SUBJECT_COLORS = {
  Physics: 'var(--color-physics-red)',
  Chemistry: 'var(--color-chemistry-orange)',
  Mathematics: 'var(--color-math-teal)',
  Biology: 'var(--color-biology-green)',
};

const shortDate = (d) => {
  if (!d) return '';
  const dt = new Date(d);
  return Number.isNaN(dt.getTime())
    ? ''
    : dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};

const AnalyticsHub = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await apiClient.get('/analytics/me');
        if (!cancelled) setData(res);
      } catch (err) {
        if (!cancelled) setError(err.message || 'Could not load your analytics.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // ─── Derive chart shapes from the API payload ─────────────────────────────

  const scoreTrend = useMemo(() => {
    const history = data?.scoreHistory || [];
    return history.map((h) => ({
      date: shortDate(h.date),
      title: h.title,
      percentage: h.maxScore ? Math.round((Number(h.score) / Number(h.maxScore)) * 100) : 0,
    }));
  }, [data]);

  const radarData = useMemo(
    () => (data?.subjectBreakdown || []).map((s) => ({
      subject: s.subject,
      score: s.accuracy,
      fullMark: 100,
    })),
    [data],
  );

  // Anything under 60% accuracy with at least a few attempts is worth flagging
  const weakSubjects = useMemo(
    () => (data?.subjectBreakdown || [])
      .filter((s) => s.totalAnswered >= 3 && s.accuracy < 60)
      .sort((a, b) => a.accuracy - b.accuracy),
    [data],
  );

  // Spaced-repetition rows are already ordered by priority server-side
  const priorityTopics = useMemo(
    () => (data?.spacedRepetition || []).slice(0, 8).map((r) => ({
      topic: r.questions?.topic || r.questions?.subject || 'Unknown',
      mastery: Math.round((Number(r.mastery_level) || 0) * (Number(r.mastery_level) <= 1 ? 100 : 1)),
    })),
    [data],
  );

  const subjectAccuracy = useMemo(
    () => (data?.subjectBreakdown || []).map((s) => ({
      topic: s.subject,
      accuracy: s.accuracy,
    })),
    [data],
  );

  if (loading) {
    return (
      <div style={{ padding: '60px', textAlign: 'center', color: 'var(--text-secondary)' }}>
        <Loader2 size={22} style={{ verticalAlign: 'middle', marginRight: '8px' }} />
        Loading your analytics…
      </div>
    );
  }

  const hasData = (data?.testsAttempted || 0) > 0 || radarData.length > 0;

  return (
    <div className="analytics-container animate-fade-in">
      <div className="analytics-header animate-slide-up">
        <h1>
          Analytics Hub
          <TrendingUp size={28} style={{ color: 'var(--color-dashboard-blue)', marginLeft: '8px', verticalAlign: 'middle' }} />
        </h1>
        <p>Deep dive into your performance metrics.</p>
      </div>

      {error && (
        <div className="error-alert" style={{ color: '#dc2626', margin: '12px 0' }}>{error}</div>
      )}

      {!error && !hasData && (
        <div className="analytics-card glass" style={{ padding: '48px', textAlign: 'center' }}>
          <h3>No data yet</h3>
          <p style={{ color: 'var(--text-secondary)' }}>
            Take a test and your performance breakdown will appear here.
          </p>
        </div>
      )}

      {hasData && (
        <>
          {/* Score history */}
          <div className="analytics-card glass animate-slide-up" style={{ animationDelay: '0.1s' }}>
            <div className="analytics-title">
              Score History ({data.testsAttempted} test{data.testsAttempted === 1 ? '' : 's'} submitted)
            </div>
            <div className="chart-container">
              {scoreTrend.length === 0 ? (
                <p style={{ color: 'var(--text-secondary)' }}>No submitted tests yet.</p>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={scoreTrend} margin={{ top: 20, right: 30, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border-color)" />
                    <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: 'var(--text-secondary)' }} dy={10} />
                    <YAxis axisLine={false} tickLine={false} domain={[0, 100]} tick={{ fill: 'var(--text-secondary)' }} dx={-10} />
                    <RechartsTooltip
                      contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: 'var(--shadow-lg)' }}
                      itemStyle={{ fontWeight: 600 }}
                      formatter={(v) => [`${v}%`, 'Score']}
                      labelFormatter={(_, payload) => payload?.[0]?.payload?.title || ''}
                    />
                    <Legend verticalAlign="top" height={36} iconType="circle" />
                    <Line
                      type="monotone"
                      dataKey="percentage"
                      name="Score %"
                      stroke="var(--color-dashboard-blue)"
                      strokeWidth={4}
                      dot={{ r: 6, strokeWidth: 2 }}
                      activeDot={{ r: 8 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          <div className="analytics-grid-2">
            {/* Subject strength radar */}
            <div className="analytics-card glass animate-slide-up" style={{ animationDelay: '0.2s' }}>
              <div className="analytics-title">Subject-wise Strength</div>
              <div className="radar-container">
                {radarData.length < 3 ? (
                  <p style={{ color: 'var(--text-secondary)', padding: '20px' }}>
                    Answer questions in at least three subjects to see the strength chart.
                  </p>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <RadarChart cx="50%" cy="50%" outerRadius="70%" data={radarData}>
                      <PolarGrid stroke="var(--border-color)" />
                      <PolarAngleAxis dataKey="subject" tick={{ fill: 'var(--text-primary)', fontWeight: 600, fontSize: 13 }} />
                      <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} axisLine={false} />
                      <Radar name="Accuracy" dataKey="score" stroke="var(--color-dashboard-blue)" strokeWidth={2} fill="var(--color-dashboard-blue)" fillOpacity={0.4} />
                      <RechartsTooltip />
                    </RadarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>

            {/* Weak areas */}
            <div className="analytics-card glass animate-slide-up" style={{ animationDelay: '0.3s' }}>
              <div className="analytics-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>Weak Areas</span>
                {weakSubjects.length > 0 && (
                  <span className="alert-badge">{weakSubjects.length} Alert{weakSubjects.length === 1 ? '' : 's'}</span>
                )}
              </div>
              <div className="weak-topics-list">
                {weakSubjects.length === 0 ? (
                  <p style={{ color: 'var(--text-secondary)', padding: '12px' }}>
                    Nothing below 60% accuracy — keep it up.
                  </p>
                ) : (
                  weakSubjects.map((s) => {
                    const color = SUBJECT_COLORS[s.subject] || 'var(--color-dashboard-blue)';
                    return (
                      <div key={s.subject} className="weak-topic-card">
                        <div className="weak-topic-info">
                          <div className="weak-topic-icon-wrapper" style={{ backgroundColor: `${color}18`, color }}>
                            <AlertTriangle size={20} />
                          </div>
                          <div className="weak-topic-text">
                            <h4>{s.subject}</h4>
                            <p><strong>{s.accuracy}%</strong> accuracy over {s.totalAnswered} questions</p>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>

          {/* Accuracy by subject */}
          <div className="analytics-card glass animate-slide-up" style={{ animationDelay: '0.4s' }}>
            <div className="analytics-title">Accuracy by Subject</div>
            <div className="topic-accuracy-container">
              {subjectAccuracy.length === 0 ? (
                <p style={{ color: 'var(--text-secondary)' }}>No answers recorded yet.</p>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart layout="vertical" data={subjectAccuracy} margin={{ top: 5, right: 30, left: 50, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="var(--border-color)" />
                    <XAxis type="number" domain={[0, 100]} tick={{ fill: 'var(--text-secondary)' }} />
                    <YAxis dataKey="topic" type="category" axisLine={false} tickLine={false} tick={{ fill: 'var(--text-primary)', fontWeight: 500 }} />
                    <RechartsTooltip
                      cursor={{ fill: 'var(--border-color)', opacity: 0.4 }}
                      contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: 'var(--shadow-lg)' }}
                      formatter={(v) => [`${v}%`, 'Accuracy']}
                    />
                    <Bar dataKey="accuracy" radius={[0, 8, 8, 0]} barSize={24}>
                      {subjectAccuracy.map((entry, index) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={entry.accuracy > 80 ? 'var(--color-biology-green)' : entry.accuracy > 60 ? 'var(--color-dashboard-blue)' : 'var(--color-physics-red)'}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          {/* Revision priorities, if the spaced-repetition table has rows */}
          {priorityTopics.length > 0 && (
            <div className="analytics-card glass animate-slide-up" style={{ animationDelay: '0.5s' }}>
              <div className="analytics-title">Revision Priorities</div>
              <div className="weak-topics-list">
                {priorityTopics.map((t, idx) => (
                  <div key={`${t.topic}-${idx}`} className="weak-topic-card">
                    <div className="weak-topic-info">
                      <div className="weak-topic-text">
                        <h4>{t.topic}</h4>
                        <p>Mastery: <strong>{t.mastery}%</strong></p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default AnalyticsHub;
