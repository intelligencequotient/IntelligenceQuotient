import React from 'react';
import { Clock } from 'lucide-react';

const ExamHeader = ({ examData, timeLeft, candidateName }) => {
  const formatTime = (secs) => {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };
  const isWarning = timeLeft < 300;
  return (
    <header className="exam-header">
      <div className="exam-header-left">
        <h1 className="exam-logo">NTA Mock UI</h1>
        <span className="exam-title">{examData?.title || 'Secure Assessment'}</span>
      </div>
      <div className={`exam-timer ${isWarning ? 'warning' : ''}`}>
        <Clock size={20} />
        <span>Time Left: <strong>{formatTime(timeLeft)}</strong></span>
      </div>
      <div className="exam-header-right">
        <span className="candidate-name">Candidate: {candidateName || 'Student'}</span>
      </div>
    </header>
  );
};

export default ExamHeader;
