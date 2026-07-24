import React, { useState, useMemo } from 'react';
import { Search, Plus, Filter, Edit, Copy, Trash2, X, Image as ImageIcon } from 'lucide-react';
import { useAppData } from '../../context/AppDataContext';
import './QuestionBank.css';

const QuestionBank = () => {
  const { questions, setQuestions } = useAppData();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [subjectFilter, setSubjectFilter] = useState('All');
  const [difficultyFilter, setDifficultyFilter] = useState('All');
  const [toast, setToast] = useState('');
  const [enlargedImage, setEnlargedImage] = useState(null);

  // Modal State
  const [newQuestion, setNewQuestion] = useState({
    subject: 'Mathematics', type: 'Single Choice', difficulty: 'Easy', text: '',
    options: ['', '', '', ''], correct: 0
  });

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  };

  const handleDelete = (id) => {
    if(window.confirm('Are you sure you want to delete this question?')) {
      setQuestions(questions.filter(q => q.id !== id));
      showToast('Question deleted successfully.');
    }
  };

  const handleDuplicate = (q) => {
    const duplicated = { ...q, id: Date.now().toString(), usedIn: 0 };
    setQuestions([duplicated, ...questions]);
    showToast('Question duplicated.');
  };

  const handleSaveNewQuestion = () => {
    if (!newQuestion.text.trim()) {
      showToast("Please enter question content.");
      return;
    }
    const qToAdd = {
      ...newQuestion,
      id: Date.now().toString(),
      lastUsed: 'Just now',
    };
    setQuestions([qToAdd, ...questions]);
    setIsModalOpen(false);
    setNewQuestion({ subject: 'Mathematics', type: 'Single Choice', difficulty: 'Easy', text: '', options: ['', '', '', ''], correct: 0 });
    showToast('Question added successfully!');
  };

  const filteredQuestions = useMemo(() => {
    return questions.filter(q => {
      const matchSearch = (q.question_text || q.text || '').toLowerCase().includes(searchQuery.toLowerCase());
      const matchSubj = subjectFilter === 'All' || (q.subject || '').toLowerCase() === subjectFilter.toLowerCase();
      const matchDiff = difficultyFilter === 'All' || (q.difficulty || '').toLowerCase() === difficultyFilter.toLowerCase();
      return matchSearch && matchSubj && matchDiff;
    });
  }, [questions, searchQuery, subjectFilter, difficultyFilter]);

  return (
    <div className="question-bank">
      <header className="page-header d-flex justify-between align-center">
        <div>
          <h1>Question Bank</h1>
          <p>Manage and organize your assessment items.</p>
        </div>
        <button className="btn-primary" onClick={() => setIsModalOpen(true)}>
          <Plus size={18} /> Add New Question
        </button>
      </header>

      {toast && <div className="toast-notification">{toast}</div>}

      <div className="bank-controls">
        <div className="search-bar">
          <Search size={20} className="search-icon" />
          <input 
            type="text" 
            placeholder="Search questions..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <div className="filters">
          <select className="filter-select" value={subjectFilter} onChange={(e) => setSubjectFilter(e.target.value)}>
            <option value="All">All Subjects</option>
            <option value="Mathematics">Mathematics</option>
            <option value="Physics">Physics</option>
            <option value="Chemistry">Chemistry</option>
            <option value="Biology">Biology</option>
          </select>
          <select className="filter-select" value={difficultyFilter} onChange={(e) => setDifficultyFilter(e.target.value)}>
            <option value="All">All Difficulties</option>
            <option value="Easy">Easy</option>
            <option value="Medium">Medium</option>
            <option value="Hard">Hard</option>
          </select>
        </div>
      </div>

      <div className="table-container">
        <table className="bank-table">
          <thead>
            <tr>
              <th className="preview-col">Question Preview</th>
              <th>Subject</th>
              <th>Topic</th>
              <th>Type</th>
              <th>Difficulty</th>
              <th>Answer</th>
              <th className="actions-col">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredQuestions.length === 0 && (
              <tr>
                <td colSpan="7" style={{textAlign: 'center', padding: '24px', color: 'var(--text-secondary)'}}>No questions match your filters.</td>
              </tr>
            )}
            {filteredQuestions.map(q => (
              <tr key={q.id}>
                <td className="preview-col">
                  {q.image_url ? (
                    <img 
                      src={q.image_url} 
                      alt="Question Preview" 
                      onClick={() => setEnlargedImage(q.image_url)}
                      style={{ width: '100%', maxWidth: '500px', maxHeight: '350px', objectFit: 'contain', display: 'block', margin: '8px 0', borderRadius: '6px', border: '1px solid #e2e8f0', backgroundColor: '#fff', padding: '4px', cursor: 'zoom-in' }} 
                    />
                  ) : (
                    <p className="q-preview-text" style={{ fontSize: '0.85rem', maxWidth: '400px' }}>{q.question_text || q.text || 'No content provided.'}</p>
                  )}
                </td>
                <td>{q.subject}</td>
                <td>{q.topic || 'General'}</td>
                <td>{q.q_type || q.type}</td>
                <td><span className={`diff-badge ${(q.difficulty || 'medium').toLowerCase()}`}>{q.difficulty || 'Medium'}</span></td>
                <td>
                  <strong style={{ color: 'var(--primary-color)' }}>
                    {q.correct_answer?.value 
                      ? q.correct_answer.value 
                      : (q.correct_answer?.index !== undefined && q.options 
                          ? q.options[q.correct_answer.index] 
                          : 'N/A')}
                  </strong>
                </td>
                <td className="actions-col">
                  <div className="row-actions">
                    <button className="action-btn" title="Edit" onClick={() => showToast('Edit modal would open here.')}><Edit size={16} /></button>
                    <button className="action-btn" title="Duplicate" onClick={() => handleDuplicate(q)}><Copy size={16} /></button>
                    <button className="action-btn danger" title="Delete" onClick={() => handleDelete(q.id)}><Trash2 size={16} /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="table-footer">
          <span>Showing {filteredQuestions.length} results</span>
          <div className="pagination">
            <button className="page-btn disabled">&lt;</button>
            <button className="page-btn disabled">&gt;</button>
          </div>
        </div>
      </div>

      {isModalOpen && (
        <div className="modal-overlay">
          <div className="modal-content large">
            <div className="modal-header">
              <h2>Add New Question</h2>
              <button className="close-btn" onClick={() => setIsModalOpen(false)}><X size={20} /></button>
            </div>
            
            <div className="modal-body">
              <div className="form-row">
                <div className="form-group flex-1">
                  <label>Subject</label>
                  <select value={newQuestion.subject} onChange={e => setNewQuestion({...newQuestion, subject: e.target.value})}>
                    <option>Mathematics</option><option>Physics</option><option>Chemistry</option><option>Biology</option>
                  </select>
                </div>
                <div className="form-group flex-1">
                  <label>Type</label>
                  <input type="text" value={newQuestion.type} onChange={e => setNewQuestion({...newQuestion, type: e.target.value})} />
                </div>
                <div className="form-group flex-1">
                  <label>Difficulty</label>
                  <select value={newQuestion.difficulty} onChange={e => setNewQuestion({...newQuestion, difficulty: e.target.value})}>
                    <option>Easy</option><option>Medium</option><option>Hard</option>
                  </select>
                </div>
              </div>

              <div className="form-group">
                <label>Question Content</label>
                <div className="rich-editor">
                  <div className="editor-toolbar">
                    <button type="button"><b>B</b></button>
                    <button type="button"><i>I</i></button>
                    <button type="button"><u>U</u></button>
                    <span className="divider"></span>
                    <button type="button"><ImageIcon size={16} /> Add Image</button>
                  </div>
                  <textarea className="editor-textarea" placeholder="Type your question here..." value={newQuestion.text} onChange={e => setNewQuestion({...newQuestion, text: e.target.value})}></textarea>
                </div>
              </div>

              <div className="options-section">
                <label>Options (Mark correct answer)</label>
                {['A', 'B', 'C', 'D'].map((opt, idx) => (
                  <div key={opt} className="option-row">
                    <input 
                      type="radio" 
                      name="correct-opt" 
                      className="correct-radio" 
                      checked={newQuestion.correct === idx}
                      onChange={() => setNewQuestion({...newQuestion, correct: idx})}
                    />
                    <span className="opt-label">{opt}</span>
                    <input 
                      type="text" 
                      className="opt-input" 
                      placeholder={`Option ${opt}`} 
                      value={newQuestion.options[idx]}
                      onChange={(e) => {
                        const updatedOptions = [...newQuestion.options];
                        updatedOptions[idx] = e.target.value;
                        setNewQuestion({...newQuestion, options: updatedOptions});
                      }}
                    />
                  </div>
                ))}
              </div>

              <div className="form-group mt-3">
                <label>Solution / Explanation (Optional)</label>
                <textarea className="solution-textarea" placeholder="Explain the correct answer..."></textarea>
              </div>
            </div>

            <div className="modal-footer">
              <button className="btn-outline" onClick={() => setIsModalOpen(false)}>Cancel</button>
              <button className="btn-primary" onClick={handleSaveNewQuestion}>Save Question</button>
            </div>
          </div>
        </div>
      )}

      {enlargedImage && (
        <div 
          className="modal-overlay" 
          style={{ zIndex: 9999, backgroundColor: 'rgba(0,0,0,0.85)', cursor: 'zoom-out', display: 'flex', alignItems: 'center', justifyContent: 'center' }} 
          onClick={() => setEnlargedImage(null)}
        >
          <img 
            src={enlargedImage} 
            alt="Enlarged Question" 
            style={{ maxWidth: '90vw', maxHeight: '90vh', objectFit: 'contain', backgroundColor: 'white', padding: '16px', borderRadius: '8px' }} 
            onClick={(e) => e.stopPropagation()} // Prevent closing if clicking the actual image container
          />
          <button 
            className="close-btn" 
            style={{ position: 'absolute', top: '24px', right: '32px', color: 'white', background: 'transparent', border: 'none', cursor: 'pointer' }}
            onClick={() => setEnlargedImage(null)}
          >
            <X size={36} />
          </button>
        </div>
      )}
    </div>
  );
};

export default QuestionBank;
