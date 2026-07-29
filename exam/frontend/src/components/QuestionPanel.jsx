import React from 'react';

const NumericKeypad = ({ value, onChange }) => {
  const handleKeyClick = (key) => {
    if (key === 'Clear') return onChange('');
    if (key === 'Backspace') return onChange(value.slice(0, -1));
    if (key === '-') {
      if (value.startsWith('-')) return onChange(value.slice(1));
      return onChange('-' + value);
    }
    if (key === '.') {
      if (value.includes('.')) return;
      return onChange(value + '.');
    }
    if (value.length > 15) return;
    onChange(value + key);
  };

  // Layout: 3 columns, Backspace is 1 cell, Clear spans 2
  const keys = ['7', '8', '9', '4', '5', '6', '1', '2', '3', '0', '.', '-', 'Backspace', 'Clear'];

  return (
    <div className="numeric-keypad">
      {keys.map(k => (
        <button 
          key={k} 
          className={`keypad-btn ${k === 'Clear' ? 'keypad-clear' : ''} ${k === 'Backspace' ? 'keypad-backspace' : ''}`} 
          type="button" 
          onClick={() => handleKeyClick(k)}
        >
          {k === 'Backspace' ? '⌫' : k}
        </button>
      ))}
    </div>
  );
};

const QuestionPanel = ({ question, qIndex, currentResponse, onResponseChange }) => {
  if (!question) return <div className="q-panel loading">Loading question...</div>;

  const handleResponseUpdate = (payload) => {
    let newStatus = 'answered';
    if (currentResponse?.status === 'marked' || currentResponse?.status === 'answered_marked') {
      newStatus = 'answered_marked';
    }
    onResponseChange(question.id, payload, newStatus);
  };

  const handleMCQSelect = (idx) => {
    handleResponseUpdate({ index: idx });
  };

  const handleMSQToggle = (idx) => {
    const currentSelected = currentResponse?.indices || [];
    let newSelected;
    if (currentSelected.includes(idx)) {
      newSelected = currentSelected.filter(i => i !== idx);
    } else {
      newSelected = [...currentSelected, idx];
    }
    // If they uncheck all, we shouldn't necessarily call it answered, but logic can handle that in ActionBar
    handleResponseUpdate({ indices: newSelected });
  };

  const handleNATChange = (val) => {
    handleResponseUpdate({ text: val });
  };

  const renderOptions = () => {
    if (question.type === 'mcq') {
      return (
        <div className="q-options mcq">
          {question.options?.map((opt, idx) => (
            <label key={idx} className={`q-option ${currentResponse?.index === idx ? 'selected' : ''}`}>
              <input 
                type="radio" 
                name={`q-${question.id}`} 
                checked={currentResponse?.index === idx}
                onChange={() => handleMCQSelect(idx)}
              />
              <span className="opt-label">{String.fromCharCode(65 + idx)}.</span>
              <span className="opt-text">{opt}</span>
            </label>
          ))}
        </div>
      );
    }

    if (question.type === 'msq') {
      return (
        <div className="q-options msq">
          <p className="q-instruction">Multiple options can be correct. Select all that apply.</p>
          {question.options?.map((opt, idx) => {
            const isChecked = currentResponse?.indices?.includes(idx);
            return (
              <label key={idx} className={`q-option ${isChecked ? 'selected' : ''}`}>
                <input 
                  type="checkbox" 
                  checked={isChecked || false}
                  onChange={() => handleMSQToggle(idx)}
                />
                <span className="opt-label">{String.fromCharCode(65 + idx)}.</span>
                <span className="opt-text">{opt}</span>
              </label>
            );
          })}
        </div>
      );
    }

    if (question.type === 'nat') {
      const val = currentResponse?.text || '';
      return (
        <div className="q-options nat">
          <div className="nat-input-container">
            <input 
              type="text" 
              className="nat-display"
              value={val}
              readOnly 
              placeholder="Use keypad to enter answer"
              // Prevent manual typing to strictly enforce the virtual keypad
              onKeyDown={(e) => e.preventDefault()}
            />
          </div>
          <NumericKeypad value={val} onChange={handleNATChange} />
        </div>
      );
    }
  };

  return (
    <div className="q-panel">
      <div className="q-meta">
        <span className="q-number">Question {qIndex + 1}</span>
        {question.type && <span className="q-type-badge">{question.type.toUpperCase()}</span>}
      </div>
      <div className="q-text">
        <p>{question.question_text}</p>
      </div>
      {renderOptions()}
    </div>
  );
};

export default QuestionPanel;
