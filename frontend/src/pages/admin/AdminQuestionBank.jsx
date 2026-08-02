import React, { useState, useMemo } from 'react';
import { Search, Trash2, Upload, X } from 'lucide-react';
import { useAppData } from '../../context/AppDataContext';
import { apiClient } from '../../api/client';

const AdminQuestionBank = () => {
  const { questions, setQuestions } = useAppData();
  const [searchQuery, setSearchQuery] = useState('');
  const [subjectFilter, setSubjectFilter] = useState('All');
  const [difficultyFilter, setDifficultyFilter] = useState('All');
  const [toast, setToast] = useState({ msg: '', type: 'ok' });
  const [enlargedImage, setEnlargedImage] = useState(null);
  const [uploading, setUploading] = useState(false);

  const showToast = (msg, type = 'ok') => {
    setToast({ msg, type });
    setTimeout(() => setToast({ msg: '', type: 'ok' }), 3500);
  };

  const filteredQuestions = useMemo(() => {
    return questions.filter(q => {
      const matchSearch = (q.question_text || q.text || '').toLowerCase().includes(searchQuery.toLowerCase());
      const matchSubj = subjectFilter === 'All' || (q.subject || '').toLowerCase() === subjectFilter.toLowerCase();
      const matchDiff = difficultyFilter === 'All' || (q.difficulty || '').toLowerCase() === difficultyFilter.toLowerCase();
      return matchSearch && matchSubj && matchDiff;
    });
  }, [questions, searchQuery, subjectFilter, difficultyFilter]);

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this question?')) return;
    try {
      await apiClient.delete(`/questions/${id}`);
      setQuestions(questions.filter(q => q.id !== id));
      showToast('Question deleted.');
    } catch (e) { showToast(e.message || 'Failed to delete', 'error'); }
  };

  const handlePdfUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      // Field name must match FileInterceptor('file') on the backend —
      // sending 'pdf' left req.file undefined and threw a 500.
      formData.append('file', file);
      formData.append('examType', 'jee');
      await apiClient.post('/questions/bulk-upload-pdf', formData);
      showToast('PDF processed — questions are waiting in the Review Queue.');
    } catch (err) { showToast(err.message || 'PDF upload failed', 'error'); }
    finally { setUploading(false); e.target.value = ''; }
  };

  const diffColor = { easy: '#059669', medium: '#d97706', hard: '#dc2626' };
  const diffBg    = { easy: 'rgba(16,185,129,0.1)', medium: 'rgba(245,158,11,0.1)', hard: 'rgba(239,68,68,0.1)' };

  return (
    <div className="admin-page">
      {toast.msg && <div className={`admin-toast ${toast.type === 'error' ? 'error' : ''}`}>{toast.msg}</div>}

      <div className="admin-page-header">
        <div>
          <h1>Question Bank</h1>
          <p>Manage all questions and upload PDFs to extract new ones.</p>
        </div>
        <label className="admin-btn admin-btn-primary" style={{ cursor: 'pointer' }}>
          <Upload size={15} /> {uploading ? 'Uploading...' : 'Upload PDF'}
          <input type="file" accept=".pdf" style={{ display: 'none' }} onChange={handlePdfUpload} disabled={uploading} />
        </label>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
        <div className="admin-search-bar">
          <Search size={15} />
          <input placeholder="Search questions..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
        </div>
        <select className="admin-select" value={subjectFilter} onChange={e => setSubjectFilter(e.target.value)}>
          <option value="All">All Subjects</option>
          <option>Mathematics</option>
          <option>Physics</option>
          <option>Chemistry</option>
          <option>Biology</option>
        </select>
        <select className="admin-select" value={difficultyFilter} onChange={e => setDifficultyFilter(e.target.value)}>
          <option value="All">All Difficulties</option>
          <option>Easy</option>
          <option>Medium</option>
          <option>Hard</option>
        </select>
        <span style={{ fontSize: 13, color: 'var(--text-secondary)', marginLeft: 'auto' }}>
          {filteredQuestions.length} question{filteredQuestions.length !== 1 ? 's' : ''}
        </span>
      </div>

      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th style={{ width: '40%' }}>Question</th>
              <th>Subject</th><th>Topic</th><th>Difficulty</th><th>Type</th><th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredQuestions.length === 0 ? (
              <tr><td colSpan="6" style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: 32 }}>No questions match your filters.</td></tr>
            ) : filteredQuestions.map(q => {
              const diff = (q.difficulty || 'medium').toLowerCase();
              return (
                <tr key={q.id}>
                  <td>
                    {q.image_url ? (
                      <img
                        src={q.image_url}
                        alt="Question"
                        onClick={() => setEnlargedImage(q.image_url)}
                        style={{ maxWidth: 260, maxHeight: 100, objectFit: 'contain', borderRadius: 6, border: '1px solid var(--border-color)', cursor: 'zoom-in', padding: 4 }}
                      />
                    ) : (
                      <p style={{ fontSize: 13, maxWidth: 360, lineHeight: 1.5, margin: 0, color: 'var(--text-primary)' }}>
                        {(q.question_text || q.text || '').slice(0, 120)}{(q.question_text || q.text || '').length > 120 ? '…' : ''}
                      </p>
                    )}
                  </td>
                  <td>{q.subject || '—'}</td>
                  <td style={{ color: 'var(--text-secondary)', fontSize: 12 }}>{q.topic || 'General'}</td>
                  <td>
                    <span style={{ display: 'inline-flex', alignItems: 'center', padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600, textTransform: 'capitalize', background: diffBg[diff] || diffBg.medium, color: diffColor[diff] || diffColor.medium }}>
                      {q.difficulty || 'Medium'}
                    </span>
                  </td>
                  <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{q.q_type || q.type || '—'}</td>
                  <td>
                    <button className="admin-btn admin-btn-danger" style={{ padding: '6px 10px' }} onClick={() => handleDelete(q.id)}>
                      <Trash2 size={13} />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Enlarge image */}
      {enlargedImage && (
        <div onClick={() => setEnlargedImage(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
          <img src={enlargedImage} alt="Enlarged" style={{ maxWidth: '90vw', maxHeight: '90vh', objectFit: 'contain', background: '#fff', padding: 16, borderRadius: 8 }} onClick={e => e.stopPropagation()} />
          <button onClick={() => setEnlargedImage(null)} style={{ position: 'absolute', top: 24, right: 32, background: 'none', border: 'none', color: 'white', cursor: 'pointer' }}><X size={32} /></button>
        </div>
      )}
    </div>
  );
};

export default AdminQuestionBank;
