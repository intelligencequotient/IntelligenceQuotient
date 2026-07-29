import React from 'react';
import { Book, FlaskConical, Calculator, ArrowRight, TrendingUp, Clock, Target, Calendar } from 'lucide-react';
import { Link } from 'react-router-dom';
import './StudentDashboard.css';

const StudentDashboard = () => {
  const kpiData = [
    { label: 'Overall Rank', value: '#42', icon: TrendingUp, color: 'var(--color-dashboard-blue)' },
    { label: 'Avg Speed', value: '45s /q', icon: Clock, color: 'var(--color-chemistry-orange)' },
    { label: 'Accuracy', value: '88.5%', icon: Target, color: 'var(--color-biology-green)' },
    { label: 'Study Time', value: '142h', icon: Calendar, color: 'var(--color-physics-red)' },
  ];

  const subjects = [
    { id: 'physics', name: 'Physics', icon: Book, colorClass: 'subject-physics', desc: 'Master mechanics and electromagnetism.', progress: 62 },
    { id: 'chemistry', name: 'Chemistry', icon: FlaskConical, colorClass: 'subject-chemistry', desc: 'Explore organic and inorganic reactions.', progress: 78 },
    { id: 'math', name: 'Mathematics', icon: Calculator, colorClass: 'subject-math', desc: 'Solve complex calculus and algebra.', progress: 45 },
  ];

  return (
    <div className="dashboard-container animate-fade-in">
      {/* Premium Hero Banner */}
      <div className="hero-banner animate-slide-up">
        <div className="hero-content">
          <h1>Welcome back, Alex! 👋</h1>
          <p>You're on a 5-day streak. Your next major exam is approaching in 12 days. Let's make today count.</p>
        </div>
        <div className="hero-decoration">
          <div className="circle circle-1"></div>
          <div className="circle circle-2"></div>
        </div>
      </div>

      {/* KPI Grid */}
      <div className="section-header animate-slide-up" style={{ animationDelay: '0.1s' }}>
        <h2>Performance Overview</h2>
        <Link to="/student/analytics" className="view-all-link">Detailed Analytics <ArrowRight size={16}/></Link>
      </div>

      <div className="kpi-grid animate-slide-up" style={{ animationDelay: '0.2s' }}>
        {kpiData.map((kpi, idx) => {
          const Icon = kpi.icon;
          return (
            <div key={idx} className="kpi-card glass">
              <div className="kpi-icon-wrapper" style={{ backgroundColor: `${kpi.color}18`, color: kpi.color }}>
                <Icon size={24} />
              </div>
              <div className="kpi-info">
                <span className="kpi-label">{kpi.label}</span>
                <span className="kpi-value">{kpi.value}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Practice Exams Grid */}
      <div className="section-header mt-4 animate-slide-up" style={{ animationDelay: '0.25s' }}>
        <h2>Practice Exams</h2>
      </div>

      <div className="subject-grid animate-slide-up" style={{ animationDelay: '0.28s' }}>
        <div className="subject-card glass" style={{ borderTop: '4px solid var(--color-physics-red)' }}>
          <div className="subject-card-top">
            <div className="subject-icon-wrapper" style={{ color: 'var(--color-physics-red)', backgroundColor: 'rgba(244, 63, 94, 0.1)' }}>
              <Target size={28} />
            </div>
            <h3>JEE Main</h3>
          </div>
          <p>Full syllabus mock test based on the latest NTA pattern.</p>
          <div className="subject-actions" style={{ marginTop: '1.5rem' }}>
            <a href="http://localhost:5175/exam/instructions/jee-main-preview" target="_blank" rel="noopener noreferrer" className="btn btn-primary w-100 text-center" style={{ backgroundColor: 'var(--color-physics-red)', borderColor: 'var(--color-physics-red)' }}>
              Take Exam
            </a>
          </div>
        </div>

        <div className="subject-card glass" style={{ borderTop: '4px solid var(--color-dashboard-blue)' }}>
          <div className="subject-card-top">
            <div className="subject-icon-wrapper" style={{ color: 'var(--color-dashboard-blue)', backgroundColor: 'rgba(59, 130, 246, 0.1)' }}>
              <Book size={28} />
            </div>
            <h3>JEE Advanced</h3>
          </div>
          <p>Paper 1 mock test with MSQ, NAT, and tricky MCQs.</p>
          <div className="subject-actions" style={{ marginTop: '1.5rem' }}>
            <a href="http://localhost:5175/exam/instructions/jee-adv-preview" target="_blank" rel="noopener noreferrer" className="btn btn-primary w-100 text-center">
              Take Exam
            </a>
          </div>
        </div>
      </div>

      {/* Subject Grid */}
      <div className="section-header mt-4 animate-slide-up" style={{ animationDelay: '0.3s' }}>
        <h2>Subject Modules</h2>
      </div>

      <div className="subject-grid animate-slide-up" style={{ animationDelay: '0.4s' }}>
        {subjects.map((sub, idx) => {
          const Icon = sub.icon;
          return (
            <div key={idx} className={`subject-card glass ${sub.colorClass}`}>
              <div className="subject-card-top">
                <div className="subject-icon-wrapper">
                  <Icon size={28} />
                </div>
                <h3>{sub.name}</h3>
              </div>
              <p>{sub.desc}</p>

              <div className="subject-progress">
                <div className="progress-bar">
                  <div className="progress-fill" style={{ width: `${sub.progress}%` }}></div>
                </div>
                <span className="progress-text">In Progress — {sub.progress}%</span>
              </div>

              <div className="subject-actions">
                <Link to={`/student/subject/${sub.id}`} className="btn btn-primary w-100 text-center">
                  Continue Learning
                </Link>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default StudentDashboard;