import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Users, Layers, Award, MessageSquare, FileText, Upload, Database, TrendingUp,
  ClipboardCheck, AlertTriangle,
} from 'lucide-react';
import { apiClient, getStoredUser } from '../../api/client';
import './TeacherDashboard.css';

/**
 * Teacher home.
 *
 * Every KPI here used to be a hardcoded literal ("245 students", "12 doubts").
 * They are now derived from the same endpoints the individual pages use.
 */
const TeacherDashboard = () => {
  const navigate = useNavigate();
  const user = getStoredUser() || {};

  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const [students, batches, tests, doubts, cohort, review] = await Promise.allSettled([
        apiClient.get('/users/students'),
        apiClient.get('/batches'),
        apiClient.get('/tests'),
        apiClient.get('/doubts'),
        apiClient.get('/analytics/cohort'),
        apiClient.get('/questions/review-queue?limit=1'),
      ]);

      if (cancelled) return;

      const val = (r, fallback) => (r.status === 'fulfilled' ? r.value : fallback);
      const testList = val(tests, []) || [];
      const doubtList = val(doubts, []) || [];

      setStats({
        students: (val(students, []) || []).length,
        batches: (val(batches, []) || []).length,
        published: testList.filter((t) => t.status === 'published').length,
        drafts: testList.filter((t) => t.status !== 'published').length,
        pendingDoubts: doubtList.filter((d) => d.status !== 'resolved').length,
        avgScore: val(cohort, {})?.avgScore ?? 0,
        atRisk: val(cohort, {})?.atRiskCount ?? 0,
        pendingReview: val(review, {})?.total ?? 0,
      });
      setLoading(false);
    })();

    return () => { cancelled = true; };
  }, []);

  const show = (v) => (loading ? '—' : v);

  const kpis = [
    { label: 'Total Students', value: show(stats?.students), icon: Users, to: '/teacher/crm' },
    { label: 'Active Batches', value: show(stats?.batches), icon: Layers, to: '/teacher/batch-management' },
    { label: 'Published Tests', value: show(stats?.published), icon: FileText, to: '/teacher/test-library' },
    { label: 'Pending Doubts', value: show(stats?.pendingDoubts), icon: MessageSquare, to: '/teacher/doubt-queue', tone: stats?.pendingDoubts ? 'warning' : '' },
    { label: 'Avg Cohort Score', value: show(stats?.avgScore), icon: Award, to: '/teacher/analytics', tone: 'success' },
  ];

  return (
    <div className="teacher-dashboard">
      <header className="hero-banner">
        <div className="hero-content">
          <div className="greeting">
            <h1>Welcome back, {user.full_name || 'Teacher'}</h1>
            <span className="role-badge">
              {user.subject && user.subject !== 'All' ? `${user.subject} Faculty` : 'Faculty'}
            </span>
          </div>
          <p>Here's what's happening with your batches today.</p>
        </div>
      </header>

      {/* Things that need attention, only when they exist. */}
      {!loading && (stats?.pendingReview > 0 || stats?.atRisk > 0) && (
        <section className="td-alerts">
          {stats.pendingReview > 0 && (
            <button className="td-alert" onClick={() => navigate('/teacher/review-queue')}>
              <ClipboardCheck size={18} />
              <span>
                <strong>{stats.pendingReview}</strong> extracted question(s) awaiting review
              </span>
            </button>
          )}
          {stats.atRisk > 0 && (
            <button className="td-alert warn" onClick={() => navigate('/teacher/analytics')}>
              <AlertTriangle size={18} />
              <span>
                <strong>{stats.atRisk}</strong> student(s) flagged at risk
              </span>
            </button>
          )}
        </section>
      )}

      <section className="kpi-grid">
        {kpis.map((kpi) => {
          const Icon = kpi.icon;
          return (
            <div key={kpi.label} className="kpi-card" onClick={() => navigate(kpi.to)}>
              <div className="kpi-icon-wrapper"><Icon size={24} /></div>
              <div className="kpi-details">
                <span className="kpi-label">{kpi.label}</span>
                <span className={`kpi-value ${kpi.tone || ''}`}>{kpi.value}</span>
              </div>
            </div>
          );
        })}
      </section>

      <section className="quick-actions">
        <h2>Quick Actions</h2>
        <div className="action-grid">
          <Link to="/teacher/test-library" className="action-card">
            <div className="action-icon"><FileText size={32} /></div>
            <h3>Test Library</h3>
            <p>View existing tests, see results, and collaborate on test creation.</p>
          </Link>
          <Link to="/teacher/csv-upload" className="action-card">
            <div className="action-icon"><Upload size={32} /></div>
            <h3>Bulk Upload</h3>
            <p>Import questions from a CSV, or extract them from a PDF paper.</p>
          </Link>
          <Link to="/teacher/review-queue" className="action-card">
            <div className="action-icon"><ClipboardCheck size={32} /></div>
            <h3>Review Queue</h3>
            <p>Verify AI-extracted questions before they reach a live test.</p>
          </Link>
          <Link to="/teacher/doubt-queue" className="action-card">
            <div className="action-icon"><MessageSquare size={32} /></div>
            <h3>Doubt Queue</h3>
            <p>Resolve incoming student questions in real time.</p>
          </Link>
          <Link to="/teacher/question-bank" className="action-card">
            <div className="action-icon"><Database size={32} /></div>
            <h3>Question Bank</h3>
            <p>Manage and organize your assessment items.</p>
          </Link>
          <Link to="/teacher/analytics" className="action-card">
            <div className="action-icon"><TrendingUp size={32} /></div>
            <h3>Cohort Analytics</h3>
            <p>View detailed performance metrics across batches.</p>
          </Link>
        </div>
      </section>
    </div>
  );
};

export default TeacherDashboard;
