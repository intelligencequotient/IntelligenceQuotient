import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Users, Layers, Award, MessageSquare, FileText, Upload, PlusCircle, Database, TrendingUp } from 'lucide-react';
import './TeacherDashboard.css';

const TeacherDashboard = () => {
  const navigate = useNavigate();
  return (
    <div className="teacher-dashboard">
      <header className="hero-banner">
        <div className="hero-content">
          <div className="greeting">
            <h1>Welcome back, Dr. Robert Chen</h1>
            <span className="role-badge">Senior Evaluator</span>
          </div>
          <p>Here's what's happening with your batches today.</p>
        </div>
      </header>

      <section className="kpi-grid">
        <div className="kpi-card" onClick={() => navigate('/teacher/crm')}>
          <div className="kpi-icon-wrapper"><Users size={24} /></div>
          <div className="kpi-details">
            <span className="kpi-label">Total Students</span>
            <span className="kpi-value">245</span>
          </div>
        </div>
        <div className="kpi-card" onClick={() => navigate('/teacher/batch-management')}>
          <div className="kpi-icon-wrapper"><Layers size={24} /></div>
          <div className="kpi-details">
            <span className="kpi-label">Active Batches</span>
            <span className="kpi-value">4</span>
          </div>
        </div>
        <div className="kpi-card" onClick={() => navigate('/teacher/test-library')}>
          <div className="kpi-icon-wrapper"><FileText size={24} /></div>
          <div className="kpi-details">
            <span className="kpi-label">Tests Published This Week</span>
            <span className="kpi-value">3</span>
          </div>
        </div>
        <div className="kpi-card" onClick={() => navigate('/teacher/doubt-queue')}>
          <div className="kpi-icon-wrapper"><MessageSquare size={24} /></div>
          <div className="kpi-details">
            <span className="kpi-label">Pending Doubts</span>
            <span className="kpi-value warning">12</span>
          </div>
        </div>
        <div className="kpi-card" onClick={() => navigate('/teacher/analytics')}>
          <div className="kpi-icon-wrapper"><Award size={24} /></div>
          <div className="kpi-details">
            <span className="kpi-label">Avg Cohort Score</span>
            <span className="kpi-value success">78%</span>
          </div>
        </div>
      </section>

      <section className="quick-actions">
        <h2>Quick Actions</h2>
        <div className="action-grid">
          <Link to="/teacher/test-library" className="action-card">
            <div className="action-icon"><FileText size={32} /></div>
            <h3>Test Library</h3>
            <p>View existing tests and collaborate on test creation.</p>
          </Link>
          <Link to="/teacher/csv-upload" className="action-card">
            <div className="action-icon"><Upload size={32} /></div>
            <h3>Upload via CSV</h3>
            <p>Bulk import questions quickly using our standard CSV template.</p>
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