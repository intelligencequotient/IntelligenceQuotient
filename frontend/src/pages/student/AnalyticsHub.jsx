import React, { useState, useEffect } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer,
  Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  BarChart, Bar, Cell,
} from 'recharts';
import { AlertTriangle, TrendingUp, Target, Clock, RefreshCw, Brain } from 'lucide-react';
import { apiClient } from '../../api/client';
import MathText from '../../components/MathText';
import './AnalyticsHub.css';

/**
 * Student analytics, now driven by real data.
 *
 * Everything here used to be hardcoded arrays. It now reads /analytics/me,
 * which aggregates the student's graded answers, plus the spaced-repetition
 * state and predictions written after each submission.
 */
const AnalyticsHub = () => {
  const [data, setData] = useState(null);
  const [dueQuestions, setDueQuestions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoading(true);
      // Revision list is a nice-to-have — a failure there must not blank the page.
      const [analytics, due] = await Promise.allSettled([
        apiClient.get('/analytics/me'),
        apiClient.get('/analytics/revision-due?limit=8'),
      ]);

      if (cancelled) return;

      if (analytics.status === 'fulfilled') {
        setData(analytics.value);
      } else {
        setError(analytics.reason?.message || 'Could not load your analytics.');
      }
      if (due.status === 'fulfilled') setDueQuestions(due.value || []);
      setLoading(false);
    })();

    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return <div className="analytics-container"><p className="ah-muted">Loading your analytics…</p></div>;
  }

  if (error) {
    return <div className="analytics-container"><p className="ah-error">{error}</p></div>;
  }

  const {
    testsAttempted = 0,
    totalScore = 0,
    avgAccuracy = 0,
    avgSecondsPerQuestion = 0,
    subjectBreakdown = [],
    weakTopics = [],
    topicBreakdown = [],
    scoreHistory = [],
    predictions = [],
  } = data || {};

  const hasData = testsAttempted > 0;

  // Actual score vs the prediction for that subject, over time.
  const trajectory = scoreHistory.map((entry) => ({
    date: entry.date ? new Date(entry.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '—',
    actual: entry.maxScore ? Math.round((entry.score / entry.maxScore) * 100) : entry.score,
    title: entry.title,
  }));

  const radarData = subjectBreakdown.map((s) => ({
    subject: s.subject,
    score: s.accuracy,
    fullMark: 100,
  }));

  const topicChart = topicBreakdown.slice(0, 8).map((t) => ({
    topic: t.topic,
    accuracy: t.accuracy,
  }));

  const atRisk = predictions.filter((p) => p.risk_flag && p.topic);

  const kpis = [
    { label: 'Tests Attempted', value: testsAttempted, icon: Target, color: 'var(--color-dashboard-blue, #3b82f6)' },
    { label: 'Total Score', value: totalScore, icon: TrendingUp, color: 'var(--color-biology-green, #10b981)' },
    { label: 'Avg Accuracy', value: `${avgAccuracy}%`, icon: Brain, color: 'var(--color-chemistry-orange, #f59e0b)' },
    { label: 'Avg / Question', value: `${avgSecondsPerQuestion}s`, icon: Clock, color: 'var(--color-physics-red, #f43f5e)' },
  ];

  return (
    <div className="analytics-container animate-fade-in">
      <div className="analytics-header animate-slide-up">
        <h1>
          Analytics Hub
          <TrendingUp size={28} style={{ color: 'var(--color-dashboard-blue)', marginLeft: 8, verticalAlign: 'middle' }} />
        </h1>
        <p>Your performance, built from every question you have answered.</p>
      </div>

      {!hasData ? (
        <div className="ah-empty">
          <Target size={40} />
          <h3>No data yet</h3>
          <p>Take your first test and your analytics will appear here.</p>
        </div>
      ) : (
        <>
          <div className="ah-kpi-grid animate-slide-up">
            {kpis.map((k) => {
              const Icon = k.icon;
              return (
                <div key={k.label} className="ah-kpi glass">
                  <div className="ah-kpi-icon" style={{ background: `${k.color}18`, color: k.color }}>
                    <Icon size={22} />
                  </div>
                  <div>
                    <span className="ah-kpi-label">{k.label}</span>
                    <span className="ah-kpi-value">{k.value}</span>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="analytics-card glass animate-slide-up">
            <div className="analytics-title">Score Trajectory</div>
            <div className="chart-container">
              {trajectory.length < 2 ? (
                <p className="ah-muted ah-inline-empty">At least two completed tests are needed to plot a trend.</p>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={trajectory} margin={{ top: 20, right: 30, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border-color)" />
                    <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: 'var(--text-secondary)' }} dy={10} />
                    <YAxis axisLine={false} tickLine={false} domain={[0, 100]} tick={{ fill: 'var(--text-secondary)' }} dx={-10} />
                    <RechartsTooltip
                      contentStyle={{ borderRadius: 12, border: 'none', boxShadow: 'var(--shadow-lg)' }}
                      formatter={(v) => [`${v}%`, 'Score']}
                      labelFormatter={(label, payload) => payload?.[0]?.payload?.title || label}
                    />
                    <Legend verticalAlign="top" height={36} iconType="circle" />
                    <Line
                      type="monotone" dataKey="actual" name="Score %"
                      stroke="var(--color-dashboard-blue)" strokeWidth={3}
                      dot={{ r: 5, strokeWidth: 2 }} activeDot={{ r: 7 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          <div className="analytics-grid-2">
            <div className="analytics-card glass animate-slide-up">
              <div className="analytics-title">Subject-wise Strength</div>
              <div className="radar-container">
                {radarData.length < 3 ? (
                  <p className="ah-muted ah-inline-empty">
                    Answer questions across at least three subjects to see the radar.
                  </p>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <RadarChart cx="50%" cy="50%" outerRadius="70%" data={radarData}>
                      <PolarGrid stroke="var(--border-color)" />
                      <PolarAngleAxis dataKey="subject" tick={{ fill: 'var(--text-primary)', fontWeight: 600, fontSize: 13 }} />
                      <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} axisLine={false} />
                      <Radar
                        name="Accuracy" dataKey="score"
                        stroke="var(--color-dashboard-blue)" strokeWidth={2}
                        fill="var(--color-dashboard-blue)" fillOpacity={0.4}
                      />
                      <RechartsTooltip formatter={(v) => [`${v}%`, 'Accuracy']} />
                    </RadarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>

            <div className="analytics-card glass animate-slide-up">
              <div className="analytics-title ah-title-row">
                <span>Weak Topics</span>
                {atRisk.length > 0 && <span className="alert-badge">{atRisk.length} at risk</span>}
              </div>
              <div className="weak-topics-list">
                {weakTopics.length === 0 ? (
                  <p className="ah-muted ah-inline-empty">
                    Nothing flagged yet — answer a few more questions per topic.
                  </p>
                ) : (
                  weakTopics.map((topic) => {
                    const risky = atRisk.some((p) => p.topic === topic.topic);
                    return (
                      <div key={`${topic.subject}-${topic.topic}`} className="weak-topic-card">
                        <div className="weak-topic-info">
                          <div
                            className="weak-topic-icon-wrapper"
                            style={{
                              backgroundColor: risky ? 'rgba(244,63,94,0.12)' : 'rgba(245,158,11,0.14)',
                              color: risky ? '#e11d48' : '#b45309',
                            }}
                          >
                            <AlertTriangle size={20} />
                          </div>
                          <div className="weak-topic-text">
                            <h4>{topic.topic}</h4>
                            <p>
                              {topic.subject} • <strong>{topic.accuracy}%</strong> accuracy
                              <span className="ah-muted"> ({topic.totalAnswered} answered)</span>
                            </p>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>

          {topicChart.length > 0 && (
            <div className="analytics-card glass animate-slide-up">
              <div className="analytics-title">Topic-wise Accuracy</div>
              <div className="topic-accuracy-container">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart layout="vertical" data={topicChart} margin={{ top: 5, right: 30, left: 60, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="var(--border-color)" />
                    <XAxis type="number" domain={[0, 100]} tick={{ fill: 'var(--text-secondary)' }} />
                    <YAxis
                      dataKey="topic" type="category" width={120}
                      axisLine={false} tickLine={false}
                      tick={{ fill: 'var(--text-primary)', fontWeight: 500, fontSize: 12 }}
                    />
                    <RechartsTooltip
                      cursor={{ fill: 'var(--border-color)', opacity: 0.4 }}
                      contentStyle={{ borderRadius: 12, border: 'none', boxShadow: 'var(--shadow-lg)' }}
                      formatter={(v) => [`${v}%`, 'Accuracy']}
                    />
                    <Bar dataKey="accuracy" radius={[0, 8, 8, 0]} barSize={20}>
                      {topicChart.map((entry) => (
                        <Cell
                          key={entry.topic}
                          fill={entry.accuracy > 75 ? 'var(--color-biology-green)' : entry.accuracy > 50 ? 'var(--color-dashboard-blue)' : 'var(--color-physics-red)'}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          <div className="analytics-card glass animate-slide-up">
            <div className="analytics-title ah-title-row">
              <span><RefreshCw size={17} style={{ verticalAlign: 'middle', marginRight: 6 }} /> Due for Revision</span>
              <span className="ah-muted ah-small">Spaced repetition</span>
            </div>
            {dueQuestions.length === 0 ? (
              <p className="ah-muted ah-inline-empty">
                Nothing due right now. Questions reappear here as their revision interval elapses.
              </p>
            ) : (
              <ul className="ah-revision-list">
                {dueQuestions.map((item) => (
                  <li key={item.question_id}>
                    <div className="ah-revision-main">
                      <MathText
                        as="span"
                        className="ah-revision-text"
                        text={item.questions?.question_text || '(image-based question)'}
                      />
                      <span className="ah-muted ah-small">
                        {item.questions?.subject}
                        {item.questions?.topic ? ` • ${item.questions.topic}` : ''}
                      </span>
                    </div>
                    <span className="ah-mastery" title="Mastery level">
                      {Math.round((item.mastery_level ?? 0) * 100)}%
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default AnalyticsHub;
