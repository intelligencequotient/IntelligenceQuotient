import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Mail, AlertCircle, Loader2 } from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  RadarChart, PolarGrid, PolarAngleAxis, Radar,
} from 'recharts';
import { apiClient } from '../../api/client';
import './StudentProfileDetail.css';

const initialsOf = (name = '') =>
  name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() || '').join('') || '?';

const shortDate = (d) => {
  if (!d) return '';
  const dt = new Date(d);
  return Number.isNaN(dt.getTime()) ? '' : dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};

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
      setError('');
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

  const performanceData = useMemo(
    () => (analytics?.scoreHistory || []).map((h) => ({
      test: h.title || shortDate(h.date),
      score: h.maxScore ? Math.round((Number(h.score) / Number(h.maxScore)) * 100) : 0,
    })),
    [analytics],
  );

  const subjectData = useMemo(
    () => (analytics?.subjectBreakdown || []).map((s) => ({
      subject: s.subject,
      score: s.accuracy,
      fullMark: 100,
    })),
    [analytics],
  );

  const weakSubjects = useMemo(
    () => (analytics?.subjectBreakdown || [])
      .filter((s) => s.totalAnswered >= 3 && s.accuracy < 60)
      .sort((a, b) => a.accuracy - b.accuracy),
    [analytics],
  );

  const batchName = student?.batch_students?.[0]?.batches?.name || 'Unassigned';

  if (loading) {
    return (
      <div style={{ padding: '60px', textAlign: 'center', color: 'var(--text-secondary)' }}>
        <Loader2 size={20} style={{ verticalAlign: 'middle', marginRight: '8px' }} />
        Loading student…
      </div>
    );
  }

  if (error || !student) {
    return (
      <div style={{ padding: '40px' }}>
        <button className="back-btn" onClick={() => navigate('/teacher/crm')}>
          <ArrowLeft size={20} /> Back to CRM
        </button>
        <p style={{ marginTop: '16px', color: '#dc2626' }}>{error || 'Student not found.'}</p>
      </div>
    );
  }

  return (
    <div className="student-profile-detail">
      <div className="profile-header-actions">
        <button className="back-btn" onClick={() => navigate('/teacher/crm')}>
          <ArrowLeft size={20} /> Back to CRM
        </button>
      </div>

      <div className="profile-header-card">
        <div className="profile-info-main">
          <div className="avatar-lg">{initialsOf(student.full_name)}</div>
          <div className="profile-info">
            <h2>{student.full_name}</h2>
            <span className="batch-badge">{batchName}</span>
            <div className="contact-info">
              <span className="contact-item"><Mail size={14} /> {student.email}</span>
            </div>
          </div>
        </div>
        <div className="profile-actions">
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Tests submitted</div>
            <div style={{ fontSize: '1.6rem', fontWeight: 700 }}>{analytics?.testsAttempted ?? 0}</div>
          </div>
        </div>
      </div>

      <div className="analytics-section">
        <div className="chart-card">
          <h2>Score History</h2>
          <div className="chart-container">
            {performanceData.length === 0 ? (
              <p style={{ color: 'var(--text-secondary)' }}>No submitted tests yet.</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={performanceData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="test" stroke="#64748b" />
                  <YAxis stroke="#64748b" domain={[0, 100]} />
                  <Tooltip formatter={(v) => [`${v}%`, 'Score']} />
                  <Line type="monotone" dataKey="score" stroke="var(--color-dashboard-blue)" strokeWidth={2} name="Score %" />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="side-cards">
          <div className="radar-card">
            <h2>Subject Balance</h2>
            <div className="radar-container">
              {subjectData.length < 3 ? (
                <p style={{ color: 'var(--text-secondary)', padding: '16px' }}>
                  Needs answers in at least three subjects.
                </p>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <RadarChart cx="50%" cy="50%" outerRadius="70%" data={subjectData}>
                    <PolarGrid stroke="#e2e8f0" />
                    <PolarAngleAxis dataKey="subject" tick={{ fill: '#64748b', fontSize: 12 }} />
                    <Radar name="Accuracy" dataKey="score" stroke="var(--color-teacher-accent)" fill="var(--color-teacher-accent)" fillOpacity={0.3} />
                  </RadarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          <div className="weak-topics-card">
            <h2><AlertCircle size={18} className="text-warning" /> Weak Subjects</h2>
            {weakSubjects.length === 0 ? (
              <p style={{ color: 'var(--text-secondary)', padding: '12px' }}>
                Nothing below 60% accuracy.
              </p>
            ) : (
              <ul className="topics-list">
                {weakSubjects.map((s) => (
                  <li key={s.subject}>
                    <div className="topic-name">{s.subject}</div>
                    <div className="topic-meta">
                      <span className={`subject-sm ${(s.subject || '').toLowerCase()}`}>{s.subject}</span>
                      <span className="confidence low">{s.accuracy}% over {s.totalAnswered} questions</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      {/* Recent attempts */}
      <div className="teacher-notes-card">
        <div className="notes-header">
          <h2>Recent Attempts</h2>
        </div>
        {(student.recentAttempts || []).length === 0 ? (
          <p className="notes-hint">This student hasn't submitted any tests yet.</p>
        ) : (
          <table className="crm-table" style={{ width: '100%' }}>
            <thead>
              <tr>
                <th>Test</th>
                <th>Score</th>
                <th>Submitted</th>
              </tr>
            </thead>
            <tbody>
              {student.recentAttempts.map((a) => (
                <tr key={a.id}>
                  <td>{a.tests?.title || 'Untitled test'}</td>
                  <td>{a.total_score}</td>
                  <td>{a.submitted_at ? new Date(a.submitted_at).toLocaleString() : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export default StudentProfileDetail;
