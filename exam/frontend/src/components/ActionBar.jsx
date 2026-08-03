import React from 'react';

const ActionBar = ({ currentQ, totalQ, onNavigate, currentResponse, questionId, onResponseChange, onSubmitClick }) => {
  const handleSaveAndNext = () => {
    if (!currentResponse) onResponseChange(questionId, null, 'not_answered');
    if (currentQ < totalQ - 1) onNavigate(currentQ + 1);
  };
  const handleClear = () => {
    onResponseChange(questionId, null, 'not_answered');
  };
  const hasAnswered = () => {
    if (!currentResponse) return false;
    if (currentResponse.index !== undefined && currentResponse.index !== null) return true;
    if (currentResponse.indices && currentResponse.indices.length > 0) return true;
    if (currentResponse.value != null && String(currentResponse.value).trim() !== '') return true;
    return false;
  };

  const handleSaveAndMark = () => {
    if (hasAnswered()) {
      onResponseChange(questionId, currentResponse, 'answered_marked');
    } else {
      onResponseChange(questionId, null, 'marked');
    }
    if (currentQ < totalQ - 1) onNavigate(currentQ + 1);
  };
  const handleMarkAndNext = () => {
    if (hasAnswered()) {
      onResponseChange(questionId, currentResponse, 'answered_marked');
    } else {
      onResponseChange(questionId, null, 'marked');
    }
    if (currentQ < totalQ - 1) onNavigate(currentQ + 1);
  };

  return (
    <div className="action-bar">
      <div className="action-left">
        <button className="btn-action mark-next" onClick={handleMarkAndNext}>Mark for Review & Next</button>
        <button className="btn-action clear" onClick={handleClear}>Clear Response</button>
      </div>
      <div className="action-right">
        <button className="btn-action save-mark" onClick={handleSaveAndMark}>Save & Mark for Review</button>
        <button className="btn-action save-next" onClick={handleSaveAndNext}>
          {currentQ === totalQ - 1 ? 'Save' : 'Save & Next'}
        </button>
        <button className="btn-action submit-final" onClick={onSubmitClick}>Submit Exam</button>
      </div>
    </div>
  );
};

export default ActionBar;
