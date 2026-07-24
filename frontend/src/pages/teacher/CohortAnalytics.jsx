import React from 'react';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import './CohortAnalytics.css';

const scoreTrendData = [
  { name: 'Test 1', score: 65 },
  { name: 'Test 2', score: 68 },
  { name: 'Test 3', score: 72 },
  { name: 'Test 4', score: 70 },
  { name: 'Test 5', score: 75 },
  { name: 'Test 6', score: 78 },
];

const scoreDistributionData = [
  { range: '0-20', count: 2 },
  { range: '21-40', count: 5 },
  { range: '41-60', count: 15 },
  { range: '61-80', count: 35 },
  { range: '81-100', count: 18 },
];

const commonlyMissedConcepts = [
  { id: 1, topic: 'Integration by Parts', subject: 'Mathematics', wrongPercent: 68, difficulty: 'Hard' },
  { id: 2, topic: 'Electromagnetic Induction', subject: 'Physics', wrongPercent: 55, difficulty: 'Hard' },
  { id: 3, topic: 'Chemical Kinetics', subject: 'Chemistry', wrongPercent: 42, difficulty: 'Medium' },
  { id: 4, topic: 'Cell Division', subject: 'Biology', wrongPercent: 35, difficulty: 'Medium' },
  { id: 5, topic: 'Rotational Mechanics', subject: 'Physics', wrongPercent: 30, difficulty: 'Hard' },
];

const CohortAnalytics = () => {
  return (
    <div className="cohort-analytics">
      <header className="page-header">
        <h1>Cohort Analytics</h1>
        <p>Analyze batch performance, track trends, and identify learning gaps.</p>
      </header>

      <div className="analytics-grid">
        <div className="chart-card">
          <h2>Class Average Score Trend</h2>
          <div className="chart-container">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={scoreTrendData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="name" stroke="#64748b" />
                <YAxis stroke="#64748b" />
                <Tooltip 
                  contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                />
                <Legend />
                <Line type="monotone" dataKey="score" stroke="var(--color-teacher-accent)" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 8 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="chart-card">
          <h2>Score Distribution (Latest Test)</h2>
          <div className="chart-container">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={scoreDistributionData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="range" stroke="#64748b" />
                <YAxis stroke="#64748b" />
                <Tooltip 
                  cursor={{ fill: 'rgba(99, 102, 241, 0.05)' }}
                  contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                />
                <Legend />
                <Bar dataKey="count" fill="var(--color-teacher-navy-mid)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="missed-concepts-card">
          <h2>Commonly Missed Concepts</h2>
          <div className="concepts-list">
            {commonlyMissedConcepts.map((concept) => (
              <div key={concept.id} className="concept-item">
                <div className="concept-info">
                  <h3>{concept.topic}</h3>
                  <span className={`subject-tag ${concept.subject.toLowerCase()}`}>{concept.subject}</span>
                </div>
                <div className="concept-stats">
                  <div className="stat-group">
                    <span className="stat-label">Students Wrong</span>
                    <span className="stat-value danger">{concept.wrongPercent}%</span>
                  </div>
                  <span className={`difficulty-badge ${concept.difficulty.toLowerCase()}`}>{concept.difficulty}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default CohortAnalytics;