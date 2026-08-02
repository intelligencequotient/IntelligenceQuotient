import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Book, FlaskConical, Calculator, BookOpen, Video, CheckCircle, ExternalLink } from 'lucide-react';
import { apiClient } from '../../api/client';
import './SubjectLanding.css';

/**
 * Subject landing page.
 *
 * The chapter list, its icons and the progress percentages were four hardcoded
 * objects, and every "Take Test" link pointed at `/student/locked/test/1`,
 * `/2`, `/3` — chapter numbers, not real test ids, so they all 403'd.
 *
 * Topics now come from the syllabus, coverage from the student's own accuracy
 * per topic, and lectures from the lecture library.
 */

// Route slug -> canonical subject name used across the API.
const SUBJECT_MAP = {
  physics:   { name: 'Physics',     icon: Book,        colorVar: 'var(--color-physics-red)',      bgGradient: 'linear-gradient(135deg, #f43f5e, #be123c)' },
  chemistry: { name: 'Chemistry',   icon: FlaskConical, colorVar: 'var(--color-chemistry-orange)', bgGradient: 'linear-gradient(135deg, #f59e0b, #b45309)' },
  math:      { name: 'Mathematics', icon: Calculator,  colorVar: 'var(--color-math-teal)',        bgGradient: 'linear-gradient(135deg, #0ea5e9, #0369a1)' },
  biology:   { name: 'Biology',     icon: Book,        colorVar: 'var(--color-biology-green)',    bgGradient: 'linear-gradient(135deg, #10b981, #047857)' },
};

const TABS = ['Chapters', 'Lectures', 'Analytics', 'Leaderboard'];

const SubjectLanding = () => {
  const { subjectId } = useParams();
  const navigate = useNavigate();

  const subject = SUBJECT_MAP[subjectId] || SUBJECT_MAP.physics;
  const SubjectIcon = subject.icon;

  const [activeTab, setActiveTab] = useState('Chapters');
  const [syllabus, setSyllabus] = useState([]);
  const [lectures, setLectures] = useState([]);
  const [topicStats, setTopicStats] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    (async () => {
      const [syl, lec, analytics] = await Promise.allSettled([
        apiClient.get(`/lectures/syllabus/${encodeURIComponent(subject.name)}`),
        apiClient.get(`/lectures?subject=${encodeURIComponent(subject.name)}`),
        apiClient.get('/analytics/me'),
      ]);

      if (cancelled) return;

      if (syl.status === 'fulfilled') setSyllabus(syl.value || []);
      if (lec.status === 'fulfilled') setLectures(lec.value || []);
      if (analytics.status === 'fulfilled') {
        setTopicStats(
          (analytics.value?.topicBreakdown || []).filter((t) => t.subject === subject.name),
        );
      }
      setLoading(false);
    })();

    return () => { cancelled = true; };
  }, [subject.name]);

  const handleTabClick = (tab) => {
    if (tab === 'Analytics') return navigate('/student/analytics');
    if (tab === 'Leaderboard') return navigate('/student/leaderboard');
    setActiveTab(tab);
  };

  /**
   * Chapters come from the syllabus when one exists; otherwise fall back to the
   * topics the student has actually answered questions in, so the page is still
   * useful before a syllabus is loaded.
   */
  const chapters = syllabus.length
    ? syllabus.map((item) => ({
        id: item.id,
        title: item.topic,
        subtitle: item.subtopic,
        accuracy: topicStats.find((t) => t.topic === item.topic)?.accuracy ?? null,
        answered: topicStats.find((t) => t.topic === item.topic)?.totalAnswered ?? 0,
      }))
    : topicStats.map((t, i) => ({
        id: `${t.topic}-${i}`,
        title: t.topic,
        subtitle: null,
        accuracy: t.accuracy,
        answered: t.totalAnswered,
      }));

  return (
    <div className="subject-landing-container animate-fade-in" style={{ '--subject-color': subject.colorVar }}>
      <div className="subject-hero animate-slide-up" style={{ background: subject.bgGradient }}>
        <div className="subject-hero-content">
          <div className="subject-hero-icon">
            <SubjectIcon size={48} color="white" />
          </div>
          <div className="subject-hero-text">
            <h1>{subject.name}</h1>
            <p>
              {loading
                ? 'Loading…'
                : `${chapters.length} topic${chapters.length === 1 ? '' : 's'} · ${lectures.length} lecture${lectures.length === 1 ? '' : 's'}`}
            </p>
          </div>
        </div>
        <div className="hero-shape shape-1" />
        <div className="hero-shape shape-2" />
      </div>

      <div className="tabs-container glass animate-slide-up" style={{ animationDelay: '0.1s' }}>
        <ul className="tabs-list">
          {TABS.map((tab) => (
            <li
              key={tab}
              className={`tab-item ${activeTab === tab ? 'active' : ''}`}
              onClick={() => handleTabClick(tab)}
            >
              {tab}
            </li>
          ))}
        </ul>
      </div>

      {activeTab === 'Chapters' && (
        <div className="curriculum-section animate-slide-up" style={{ animationDelay: '0.2s' }}>
          <div className="section-header">
            <h2>Curriculum</h2>
            <p>Your accuracy per topic, based on every question you have answered.</p>
          </div>

          {loading ? (
            <p className="sl-muted">Loading curriculum…</p>
          ) : chapters.length === 0 ? (
            <div className="sl-empty">
              <BookOpen size={36} />
              <p>No syllabus recorded for {subject.name} yet, and you haven't answered any {subject.name} questions.</p>
            </div>
          ) : (
            <div className="chapters-grid">
              {chapters.map((chapter) => {
                const covered = chapter.accuracy != null;
                return (
                  <div key={chapter.id} className="chapter-card glass">
                    <div className="chapter-card-header">
                      <div
                        className="chapter-icon-wrapper"
                        style={{ color: subject.colorVar, backgroundColor: `${subject.colorVar}18` }}
                      >
                        <BookOpen size={24} />
                      </div>
                      {covered && chapter.accuracy >= 80 && (
                        <CheckCircle size={22} color="var(--color-biology-green)" />
                      )}
                    </div>

                    <div className="chapter-info">
                      <h3 className="chapter-title">{chapter.title}</h3>
                      {chapter.subtitle && <span className="sl-muted sl-small">{chapter.subtitle}</span>}
                    </div>

                    <div className="chapter-progress-section">
                      <div className="progress-bar-thin">
                        <div
                          className="progress-fill-thin"
                          style={{ width: `${chapter.accuracy ?? 0}%`, backgroundColor: subject.colorVar }}
                        />
                      </div>
                      <div className="progress-labels">
                        <span>
                          {covered
                            ? `${chapter.accuracy}% accuracy · ${chapter.answered} answered`
                            : 'Not attempted yet'}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {activeTab === 'Lectures' && (
        <div className="curriculum-section animate-slide-up">
          <div className="section-header">
            <h2>Lectures</h2>
            <p>Recorded sessions for {subject.name}.</p>
          </div>

          {loading ? (
            <p className="sl-muted">Loading lectures…</p>
          ) : lectures.length === 0 ? (
            <div className="sl-empty">
              <Video size={36} />
              <p>No lectures uploaded for {subject.name} yet.</p>
              <Link to="/student/lectures" className="sl-link">Browse all lectures</Link>
            </div>
          ) : (
            <div className="chapters-grid">
              {lectures.map((lecture) => (
                <div key={lecture.id} className="chapter-card glass">
                  <div className="chapter-card-header">
                    <div
                      className="chapter-icon-wrapper"
                      style={{ color: subject.colorVar, backgroundColor: `${subject.colorVar}18` }}
                    >
                      <Video size={24} />
                    </div>
                  </div>
                  <div className="chapter-info">
                    <h3 className="chapter-title">{lecture.title}</h3>
                    {lecture.topic && <span className="sl-muted sl-small">{lecture.topic}</span>}
                  </div>
                  {lecture.drive_url && (
                    <div className="chapter-hover-actions">
                      <a
                        className="btn-chapter-action"
                        style={{ backgroundColor: subject.colorVar, color: 'white' }}
                        href={lecture.drive_url}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Watch <ExternalLink size={14} />
                      </a>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default SubjectLanding;
