import React from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import '../index.css';

const examConfigs = {
  'jee-main-preview': {
    title: 'JEE Main 2026 — Mock Test',
    duration: '3 Hours (180 minutes)',
    totalQuestions: 75,
    totalMarks: 300,
    sections: [
      { name: 'Section A (MCQ)', count: '20 per subject', marking: '+4 correct, −1 incorrect' },
      { name: 'Section B (Numerical)', count: '5 per subject', marking: '+4 correct, −1 incorrect (2026 pattern)' },
    ],
    subjects: 'Physics, Chemistry, Mathematics',
  },
  'jee-adv-preview': {
    title: 'JEE Advanced 2026 — Paper 1 Mock Test',
    duration: '3 Hours (180 minutes)',
    totalQuestions: 51,
    totalMarks: '~180 (varies by question type)',
    sections: [
      { name: 'MCQ (Single Correct)', count: '6 per subject', marking: '+3 correct, −1 incorrect' },
      { name: 'MSQ (Multiple Correct)', count: '6 per subject', marking: '+4 full, partial marks available' },
      { name: 'NAT (Numerical)', count: '5 per subject', marking: '+4 correct, no negative' },
    ],
    subjects: 'Physics, Chemistry, Mathematics',
  },
};

const defaultConfig = {
  title: 'Secure Assessment',
  duration: '60 Minutes',
  totalQuestions: '—',
  totalMarks: '—',
  sections: [{ name: 'MCQ', count: 'Variable', marking: '+4 correct, −1 incorrect' }],
  subjects: 'Variable',
};

const ExamLauncher = () => {
  const navigate = useNavigate();
  const { testId } = useParams();
  const config = examConfigs[testId] || defaultConfig;

  const handleStartExam = () => {
    const examWin = window.open(`/exam/session/${testId}`, '_blank', 'noopener,noreferrer');
    if (!examWin) {
      navigate(`/exam/session/${testId}`);
    }
  };

  return (
    <div className="exam-launcher-container">
      <div className="launcher-card">
        <h2>{config.title}</h2>
        <div className="instructions-content">
          <p><strong>Duration:</strong> {config.duration}</p>
          <p><strong>Total Questions:</strong> {config.totalQuestions}</p>
          <p><strong>Total Marks:</strong> {config.totalMarks}</p>
          <p><strong>Subjects:</strong> {config.subjects}</p>
          <hr />
          <h3>Marking Scheme</h3>
          <table className="marking-table">
            <thead>
              <tr><th>Section</th><th>Questions</th><th>Marking</th></tr>
            </thead>
            <tbody>
              {config.sections.map((s, i) => (
                <tr key={i}><td>{s.name}</td><td>{s.count}</td><td>{s.marking}</td></tr>
              ))}
            </tbody>
          </table>
          <hr />
          <h3>Rules of the Exam</h3>
          <ul>
            <li>Do not switch tabs. This session is monitored.</li>
            <li>Do not exit fullscreen mode.</li>
            <li>Copy, paste, and right-click are disabled.</li>
            <li>If you violate these rules 3 times, your exam will be automatically terminated.</li>
          </ul>
          <p className="consent-text">By clicking below, you agree to these terms.</p>
        </div>
        <div className="launcher-actions">
          <button className="btn-cancel" onClick={() => window.close()}>Cancel</button>
          <button className="btn-start" onClick={handleStartExam}>I agree, begin test</button>
        </div>
      </div>
    </div>
  );
};

export default ExamLauncher;
