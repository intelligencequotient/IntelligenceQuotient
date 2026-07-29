import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppData } from '../../context/AppDataContext';
import { FileText, Plus, Search, Calendar, Clock, Edit } from 'lucide-react';
import './TestLibrary.css';

const TestLibrary = () => {
  const { tests } = useAppData();
  const navigate = useNavigate();
  const user = JSON.parse(localStorage.getItem('user') || '{}');

  // Format date helper
  const formatDate = (dateStr) => {
    if (!dateStr) return 'N/A';
    return new Date(dateStr).toLocaleDateString();
  };

  return (
    <div className="test-library">
      <div className="page-header">
        <div>
          <h1>Test Library</h1>
          <p>View and collaborate on tests across all subjects</p>
        </div>
        <button className="btn-primary" onClick={() => navigate('/teacher/test-constructor')}>
          <Plus size={18} />
          <span>Create New Test</span>
        </button>
      </div>

      <div className="library-content">
        <div className="library-filters">
          <div className="search-box">
            <Search size={18} className="search-icon" />
            <input type="text" placeholder="Search tests..." />
          </div>
        </div>

        <div className="tests-grid">
          {tests.length === 0 ? (
            <div className="empty-state">
              <FileText size={48} />
              <h3>No tests found</h3>
              <p>Get started by creating your first test.</p>
            </div>
          ) : (
            tests.map(test => (
              <div key={test.id} className="test-card">
                <div className="test-card-header">
                  <h3>{test.title}</h3>
                  <span className={`status-badge ${test.status}`}>{test.status}</span>
                </div>
                
                <p className="test-desc">{test.description || 'No description provided.'}</p>
                
                <div className="test-meta">
                  <div className="meta-item">
                    <Clock size={14} />
                    <span>{test.duration_minutes} mins</span>
                  </div>
                  <div className="meta-item">
                    <Calendar size={14} />
                    <span>{formatDate(test.created_at)}</span>
                  </div>
                </div>

                <div className="test-card-footer">
                  <div className="initiator-badge">
                    {test.created_by === user.id ? (
                      <span className="owner-badge">Your Test</span>
                    ) : (
                      <span className="collab-badge" style={{color: '#6366f1', fontSize: '12px', fontWeight: '600'}}>Collaboration</span>
                    )}
                  </div>
                  <button 
                    className="btn-secondary" 
                    onClick={() => navigate(`/teacher/test-constructor/${test.id}`)}
                  >
                    <Edit size={16} />
                    <span>{test.created_by === user.id ? 'Edit Test' : 'Add Questions'}</span>
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default TestLibrary;
