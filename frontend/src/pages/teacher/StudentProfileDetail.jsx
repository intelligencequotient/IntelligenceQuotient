import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Mail, AlertCircle, Calendar, Target, TrendingUp } from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar,
} from 'recharts';
import { apiClient } from '../../api/client';
import './StudentProfileDetail.css';

/**
 * Individual student profile (teacher view).
 *
 * Performance, subject strengths and weak topics were three hardcoded arrays,
 * and the email/phone fell back to invented values. Everything now comes from
 * /users/students/:id and /analytics/student/:id.
 */
const StudentProfileDetail = () => {
  const { studentId } = useParams();
  const navigate = useNavigate();

  const [student, setStudent] = useState(null);
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoading(true);
      const [profile, stats] = await Promise.allSettled([
        apiClient.get(`/users/students/${studentId}`),
        apiClient.get(`/analytics/student/${studentId}`),
      ]);

      if (cancelled) return;

      if (profile.status === 'fulfilled') setStudent(profile.value);
      else setError(profile.reason?.message || 'Student not found.');

      if (stats.status === 'fulfilled') setAnalytics(stats.value);
      setLoading(false);
    })();

    return () => { cancelled = true; };
  }, [studentId]);

  if (loading) {
    return <div className="student-profile-detail"><p className="sp-muted">Loading profile…</p></div>;
  }

  if (error || !student) {
    return (
      <div className="student-profile-detail">
        <button className="back-btn" onClick={() => navigate('/teacher/crm')}>
          <ArrowLeft size={20} /> Back to CRM
        </button>
        <p className="sp-error">{error || 'Student not found.'}</p>
      </div>
    );
  }

  const name = student.full_name || 'Unknown Student';
  const initials = name.split(' ').map((n) => n[0]).join('').substring(0, 2).toUpperCase();
  const batchName = student.batch_students?.[0]?.batches?.name || 'Unassigned';

  const attempts = student.recentAttempts || [];
  const scoreHistory = analytics?.scoreHistory || [];
  const subjectBreakdown = analytics?.subjectBreakdown || [];
  const weakTopics = analytics?.weakTopics || [];
  const atRisk = (analytics?.predictions || []).filter((p) => p.risk_flag && p.topic);

  const performanceData = scoreHistory.map((entry, i) => ({
    test: entry.title || `Test ${i + 1}`,
    score: entry.maxScore ? Math.round((entry.score / entry.maxScore) * 100) : entry.score,
  }));

  const radarData = subjectBreakdown.map((s) => ({
    subject: s.subject,
    score: s.accuracy,
    fullMark: 100,
  }));

  const kpis = [
    { label: 'Tests Taken', value: analytics?.testsAttempted ?? 0, icon: Calendar },
    { label: 'Avg Accuracy', value: `${analytics?.avgAccuracy ?? 0}%`, icon: Target },
    { label: 'Total Score', value: analytics?.totalScore ?? 0, icon: TrendingUp },
  ];

  return (
    <div className="student-profile-detail">
      <div className="profile-header-actions">
        <button className="back-btn" onClick={() => navigate('/teacher/crm')}>
          <ArrowLeft size={20} /> Back to CRM
        </button>
      </div>

      <div className="profile-header-card">
        <div className="profile-info-main">
          <div className="avatar-lg">{initials}</div>
          <div className="profile-info">
            <h2>{name}</h2>
            <div className="sp-meta-row">
              <span className="batch-badge">{batchName}</span>
              {atRisk.length > 0 && (
                <span className="sp-risk"><AlertCircle size={13} /> At risk in {atRisk.length} topic(s)</span>
              )}
            </div>
            <div className="contact-info">
              <span className="contact-item"><Mail size={14} /> {student.email}</span>
              <span className="contact-item sp-muted">
                Joined {new Date(student.created_at).toLocaleDateString()}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="sp-kpi-grid">
        {kpis.map((k) => {
          const Icon = k.icon;
          return (
            <div key={k.label} className="sp-kpi">
              <Icon size={19} />
              <div>
                <span className="sp-kpi-label">{k.label}</span>
                <span className="sp-kpi-value">{k.value}</span>
              </div>
            </div>
          );
        })}
      </div>

      <div className="sp-grid">
        <div className="sp-card">
          <h3>Score Trend</h3>
          {performanceData.length < 2 ? (
            <p className="sp-muted sp-inline-empty">Needs at least two completed tests to plot a trend.</p>
          ) : (
            <ResponsiveContainer width="100%" height={230}>
              <LineChart data={performanceData} margin={{ top: 8, right: 20, left: -18, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="test" tick={{ fontSize: 11 }} stroke="#64748b" />
                <YAxis domain={[0, 100]} stroke="#64748b" />
                <Tooltip formatter={(v) => [`${v}%`, 'Score']} />
                <Line
                  type="monotone" dataKey="score"
                  stroke="var(--color-teacher-accent, #6366f1)" strokeWidth={3}
                  dot={{ r: 4 }} activeDot={{ r: 7 }}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="sp-card">
          <h3>Subject Strength</h3>
          {radarData.length < 3 ? (
            <p className="sp-muted sp-inline-empty">Needs answers across at least three subjects.</p>
          ) : (
            <ResponsiveContainer width="100%" height={230}>
              <RadarChart cx="50%" cy="50%" outerRadius="72%" data={radarData}>
                <PolarGrid stroke="#e2e8f0" />
                <PolarAngleAxis dataKey="subject" tick={{ fontSize: 12, fontWeight: 600 }} />
                <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} axisLine={false} />
                <Radar
                  name="Accuracy" dataKey="score"
                  stroke="var(--color-teacher-accent, #6366f1)" strokeWidth={2}
                  fill="var(--color-teacher-accent, #6366f1)" fillOpacity={0.35}
                />
                <Tooltip formatter={(v) => [`${v}%`, 'Accuracy']} />
              </RadarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      <div className="sp-grid">
        <div className="sp-card">
          <h3>Weak Topics</h3>
          {weakTopics.length === 0 ? (
            <p className="sp-muted sp-inline-empty">Nothing flagged — not enough data per topic yet.</p>
          ) : (
            <ul className="sp-weak-list">
              {weakTopics.map((t) => (
                <li key={`${t.subject}-${t.topic}`}>
                  <div>
                    <span className="sp-weak-topic">{t.topic}</span>
                    <span className="sp-muted sp-small"> · {t.subject}</span>
                  </div>
                  <span className={`sp-pill ${t.accuracy >= 60 ? 'mid' : 'bad'}`}>{t.accuracy}%</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="sp-card">
          <h3>Recent Attempts</h3>
          {attempts.length === 0 ? (
            <p className="sp-muted sp-inline-empty">No submitted tests yet.</p>
          ) : (
            <ul className="sp-attempt-list">
              {attempts.map((a) => (
                <li key={a.id}>
                  <div>
                    <span className="sp-attempt-title">{a.tests?.title || 'Test'}</span>
                    <span className="sp-muted sp-small">
                      {a.submitted_at ? new Date(a.submitted_at).toLocaleDateString() : '—'}
                    </span>
                  </div>
                  <strong>{a.total_score}</strong>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
};

export default StudentProfileDetail;
