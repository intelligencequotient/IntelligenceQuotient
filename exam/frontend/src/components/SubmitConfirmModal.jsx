import React from 'react';

const SubmitConfirmModal = ({ responses, total, onCancel, onConfirm }) => {
  const answered = Object.values(responses).filter(r => r.status === 'answered' || r.status === 'answered_marked').length;
  const marked = Object.values(responses).filter(r => r.status === 'marked' || r.status === 'answered_marked').length;
  const notAnswered = total - answered;

  return (
    <div className="modal-overlay">
      <div className="submit-modal">
        <h2>Submit Exam</h2>
        <div className="submit-summary">
          <p><strong>Total Questions:</strong> {total}</p>
          <p><strong>Answered:</strong> {answered}</p>
          <p><strong>Not Answered:</strong> {notAnswered}</p>
          <p><strong>Marked for Review:</strong> {marked}</p>
        </div>
        <p className="submit-warning">Are you sure you want to submit the exam? This action cannot be undone.</p>
        <div className="modal-actions">
          <button className="btn-cancel" onClick={onCancel}>No, Go Back</button>
          <button className="btn-confirm" onClick={onConfirm}>Yes, Submit Exam</button>
        </div>
      </div>
    </div>
  );
};

export default SubmitConfirmModal;
