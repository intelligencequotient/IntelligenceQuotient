import React, { useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { Book, FlaskConical, Calculator, Zap, Battery, Activity, Wifi, Beaker, Atom, Droplet, Flame, Hash, Percent, Sigma, PieChart, Play, CheckCircle } from 'lucide-react';
import './SubjectLanding.css';

const SubjectLanding = () => {
  const { subjectId } = useParams();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('Chapters');

  const tabs = ['Chapters', 'Practice', 'Test', 'Analytics', 'Leaderboard'];

  const subjectData = {
    physics: {
      title: 'Physics',
      icon: Book,
      colorVar: 'var(--color-physics-red)',
      bgGradient: 'linear-gradient(135deg, #f43f5e, #be123c)',
      chapters: [
        { id: 1, title: 'Electric Charges and Fields', icon: Zap, progress: 100 },
        { id: 2, title: 'Electrostatic Potential and Capacitance', icon: Battery, progress: 65 },
        { id: 3, title: 'Current Electricity', icon: Activity, progress: 0 },
        { id: 4, title: 'Moving Charges and Magnetism', icon: Wifi, progress: 0 },
      ]
    },
    chemistry: {
      title: 'Chemistry',
      icon: FlaskConical,
      colorVar: 'var(--color-chemistry-orange)',
      bgGradient: 'linear-gradient(135deg, #f59e0b, #b45309)',
      chapters: [
        { id: 1, title: 'Some Basic Concepts of Chemistry', icon: Beaker, progress: 100 },
        { id: 2, title: 'Structure of Atom', icon: Atom, progress: 100 },
        { id: 3, title: 'States of Matter', icon: Droplet, progress: 40 },
        { id: 4, title: 'Thermodynamics', icon: Flame, progress: 0 },
      ]
    },
    math: {
      title: 'Mathematics',
      icon: Calculator,
      colorVar: 'var(--color-math-teal)',
      bgGradient: 'linear-gradient(135deg, #0ea5e9, #0369a1)',
      chapters: [
        { id: 1, title: 'Relations and Functions', icon: Sigma, progress: 85 },
        { id: 2, title: 'Inverse Trigonometric Functions', icon: PieChart, progress: 20 },
        { id: 3, title: 'Matrices', icon: Hash, progress: 0 },
        { id: 4, title: 'Determinants', icon: Percent, progress: 0 },
      ]
    }
  };

  const data = subjectData[subjectId] || subjectData.physics;
  const SubjectIcon = data.icon;

  const handleTabClick = (tab) => {
    setActiveTab(tab);
    if (tab === 'Analytics') navigate('/student/analytics');
    if (tab === 'Leaderboard') navigate('/student/leaderboard');
    if (tab === 'Test') navigate('/student/locked/test/1');
  };

  return (
    <div className="subject-landing-container animate-fade-in" style={{ '--subject-color': data.colorVar }}>
      <div className="subject-hero animate-slide-up" style={{ background: data.bgGradient }}>
        <div className="subject-hero-content">
          <div className="subject-hero-icon">
            <SubjectIcon size={48} color="white" />
          </div>
          <div className="subject-hero-text">
            <h1>{data.title}</h1>
            <p>Class 12 • Standard Curriculum</p>
          </div>
        </div>
        <div className="subject-hero-actions">
          <button className="btn-resume-learning">Resume Last Topic <Play size={16} fill="currentColor" /></button>
        </div>

        {/* Decorative elements */}
        <div className="hero-shape shape-1"></div>
        <div className="hero-shape shape-2"></div>
      </div>

      <div className="tabs-container glass animate-slide-up" style={{ animationDelay: '0.1s' }}>
        <ul className="tabs-list">
          {tabs.map((tab, idx) => (
            <li
              key={idx}
              className={`tab-item ${activeTab === tab ? 'active' : ''}`}
              onClick={() => handleTabClick(tab)}
            >
              {tab}
            </li>
          ))}
        </ul>
      </div>

      <div className="curriculum-section animate-slide-up" style={{ animationDelay: '0.2s' }}>
        <div className="section-header">
          <h2>Curriculum</h2>
          <p>Select a chapter to begin learning.</p>
        </div>

        <div className="chapters-grid">
          {data.chapters.map(chapter => {
            const Icon = chapter.icon;
            const isCompleted = chapter.progress === 100;
            const inProgress = chapter.progress > 0 && chapter.progress < 100;

            return (
              <div key={chapter.id} className="chapter-card glass">
                <div className="chapter-card-header">
                  <div className="chapter-icon-wrapper" style={{ color: data.colorVar, backgroundColor: `${data.colorVar}18` }}>
                    <Icon size={24} />
                  </div>
                  {isCompleted && <CheckCircle size={24} color="var(--color-biology-green)" />}
                </div>

                <div className="chapter-info">
                  <span className="chapter-number">Chapter {chapter.id}</span>
                  <h3 className="chapter-title">{chapter.title}</h3>
                </div>

                <div className="chapter-progress-section">
                  <div className="progress-bar-thin">
                    <div className="progress-fill-thin" style={{ width: `${chapter.progress}%`, backgroundColor: data.colorVar }}></div>
                  </div>
                  <div className="progress-labels">
                    <span>{chapter.progress}% Completed</span>
                    {inProgress && <span className="status-in-progress">In Progress</span>}
                  </div>
                </div>

                <div className="chapter-hover-actions">
                  <Link to={`/student/locked/test/${chapter.id}`} className="btn-chapter-action" style={{ backgroundColor: data.colorVar, color: 'white' }}>
                    Take Test
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default SubjectLanding;