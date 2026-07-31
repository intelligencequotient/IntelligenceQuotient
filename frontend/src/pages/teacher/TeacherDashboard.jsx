import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Users, Layers, Award, MessageSquare, FileText, Upload, PlusCircle, Database, TrendingUp } from 'lucide-react';
import { apiClient } from '../../api/client';
import './TeacherDashboard.css';

const currentUser = () => {
  try {
    return JSON.parse(localStorage.getItem('user') || '{}');
  } catch {
    return {};
  }
};

const TeacherDashboard = () => {
  const navigate = useNavigate();
  const [user] = useState(currentUser);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Each card degrades independently — one failing endpoint shouldn't
      // blank out the whole dashboard.
      const [cohort, students, batches, tests, doubts] = await Promise.allSettled([
        apiClient.get('/analytics/cohort'),
        apiClient.get('/users/students'),
        apiClient.get('/batches'),
        apiClient.get('/tests'),
        apiClient.get('/doubts'),
      ]);
      if (cancelled) return;

      const val = (r, fallback) => (r.status === 'fulfilled' ? r.value : fallback);
      const testList = val(tests, []) || [];
      const doubtList = val(doubts, []) || [];

      setStats({
        totalStudents: val(cohort, {})?.totalStudents ?? (val(students, []) || []).length,
        activeBatches: (val(batches, []) || []).length,
        publishedTests: testList.filter((t) => t.status === 'published').length,
        pendingDoubts: doubtList.filter((d) => d.status !== 'resolved').length,
        avgScore: val(cohort, {})?.avgPercentage ?? null,
      });
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  const show = (v, suffix = '') => (loading ? '—' : v === null || v === undefined ? '—' : `${v}${suffix}`);

  const kpis = [
    { label: 'Total Students', value: show(stats?.totalStudents), icon: Users, to: '/teacher/crm' },
    { label: 'Active Batches', value: show(stats?.activeBatches), icon: Layers, to: '/teacher/batch-management' },
    { label: 'Published Tests', value: show(stats?.publishedTests), icon: FileText, to: '/teacher/test-constructor' },
    { label: 'Pending Doubts', value: show(stats?.pendingDoubts), icon: MessageSquare, to: '/teacher/doubt-queue', tone: 'warning' },
    { label: 'Avg Cohort Score', value: show(stats?.avgScore, '%'), icon: Award, to: '/teacher/analytics', tone: 'success' },
  ];

  return (
    <div className="teacher-dashboard">
      <header className="hero-banner">
        <div className="hero-content">
          <div className="greeting">
            <h1>Welcome back{user.full_name ? `, ${user.full_name}` : ''}</h1>
            <span className="role-badge">{user.role === 'admin' ? 'Administrator' : 'Teacher'}</span>
          </div>
          <p>Here's what's happening with your batches today.</p>
        </div>
      </header>

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
          <Link to="/teacher/test-constructor" className="action-card">
            <div className="action-icon"><PlusCircle size={32} /></div>
            <h3>Create Test</h3>
            <p>Design a new assessment from scratch using the test constructor.</p>
          </Link>
          <Link to="/teacher/csv-upload" className="action-card">
            <div className="action-icon"><Upload size={32} /></div>
            <h3>Upload via CSV or PDF</h3>
            <p>Bulk import questions from a CSV template or an exam paper.</p>
          </Link>
          <Link to="/teacher/doubt-queue" className="action-card">
            <div className="action-icon"><MessageSquare size={32} /></div>
            <h3>View Doubt Queue</h3>
            <p>Resolve incoming student questions in real-time.</p>
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
