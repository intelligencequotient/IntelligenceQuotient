import React from 'react';

const QuestionPalette = ({ questions, responses, currentQ, activeSubject, activeSection, onNavigate }) => {
  // Bug #7 fix: filter questions by active subject/section before counting
  const filteredIndices = questions
    .map((q, idx) => ({ q, idx }))
    .filter(({ q }) => {
      if (activeSubject && q.subject !== activeSubject) return false;
      if (activeSection && q.section !== activeSection) return false;
      return true;
    });

  const getCounts = () => {
    let answered = 0, notAnswered = 0, notVisited = 0, marked = 0, answeredMarked = 0;
    filteredIndices.forEach(({ idx }) => {
      const status = responses[idx]?.status || 'not_visited';
      if (status === 'answered') answered++;
      else if (status === 'not_answered') notAnswered++;
      else if (status === 'not_visited') notVisited++;
      else if (status === 'marked') marked++;
      else if (status === 'answered_marked') answeredMarked++;
    });
    return { answered, notAnswered, notVisited, marked, answeredMarked };
  };
  const counts = getCounts();

  return (
    <aside className="exam-palette">
      <div className="palette-legend">
        <div className="legend-row">
          <span className="legend-item"><span className="legend-icon answered">{counts.answered}</span> Answered</span>
          <span className="legend-item"><span className="legend-icon not-answered">{counts.notAnswered}</span> Not Answered</span>
        </div>
        <div className="legend-row">
          <span className="legend-item"><span className="legend-icon not-visited">{counts.notVisited}</span> Not Visited</span>
          <span className="legend-item"><span className="legend-icon marked">{counts.marked}</span> Marked for Review</span>
        </div>
        <div className="legend-row">
          <span className="legend-item"><span className="legend-icon answered-marked">{counts.answeredMarked}</span> Answered & Marked for Review</span>
        </div>
      </div>
      <div className="palette-grid">
        {filteredIndices.map(({ idx }) => {
          // Bug #8 fix: use replaceAll instead of replace for safety
          const status = responses[idx]?.status || 'not_visited';
          return (
            <button
              key={idx}
              className={`grid-btn ${status.replaceAll('_', '-')} ${currentQ === idx ? 'current' : ''}`}
              onClick={() => onNavigate(idx)}
            >
              {idx + 1}
            </button>
          );
        })}
      </div>
    </aside>
  );
};

export default QuestionPalette;
