import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MessageSquare, Clock, Filter, Search, Trash2 } from 'lucide-react';
import { useAppData } from '../../context/AppDataContext';
import { apiClient } from '../../api/client';
import './DoubtQueue.css';

const DoubtQueue = () => {
  const navigate = useNavigate();
  const { doubts, setDoubts, students } = useAppData();
  const [searchTerm, setSearchTerm] = useState('');
  const [activeFilter, setActiveFilter] = useState('All');
  const [queueError, setQueueError] = useState('');
  
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const currentUserId = user?.id;

  const filteredDoubts = doubts.filter(doubt => {
    const isPendingUnassigned = doubt.status === 'pending' && !doubt.accepted_by;
    const isAssignedToMe = doubt.accepted_by === currentUserId || (doubt.status === 'accepted' && doubt.teacher?.id === currentUserId);
    
    if (!isPendingUnassigned && !isAssignedToMe) return false;
    
    const studentName = doubt.student?.full_name || 'Unknown Student';
    const snippet = doubt.questions?.question_text || '';
    const subject = doubt.questions?.subject || 'Unknown';
    const matchesSearch = studentName.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          snippet.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesFilter = activeFilter === 'All' || subject === activeFilter;
    return matchesSearch && matchesFilter && doubt.status !== 'resolved';
  });

  const handleAccept = async (id) => {
    setQueueError('');
    try {
      await apiClient.patch(`/doubts/${id}/accept`);
      setDoubts(doubts.map(d => d.id === id ? { ...d, status: 'accepted' } : d));
      navigate(`/teacher/doubt-chat/${id}`);
    } catch (e) {
      console.error('Failed to accept doubt', e);
      // e.g. another teacher claimed it first
      setQueueError(e.message || 'Could not open this doubt.');
      setDoubts(doubts.filter(d => d.id !== id));
    }
  };

  const handleDelete = async (id) => {
    try {
      await apiClient.delete(`/doubts/${id}`);
      setDoubts(doubts.filter(d => d.id !== id));
    } catch (e) {
      console.error('Failed to delete doubt', e);
      setQueueError(e.message || 'Could not delete this doubt.');
    }
  };

  const pendingCount = doubts.filter(d => (d.status === 'pending' && !d.accepted_by) || d.accepted_by === currentUserId).length;

  return (
    <div className="doubt-queue">
      <header className="page-header d-flex justify-between align-center">
        <div>
          <h1>Live Doubt Queue</h1>
          <p>Monitor and resolve student doubts in real-time.</p>
        </div>
        <div className="queue-status">
          <span className="pulse-dot"></span>
          <span>{pendingCount} Doubts Pending</span>
        </div>
      </header>

      {queueError && (
        <div style={{ padding: '10px 14px', marginBottom: '12px', borderRadius: '8px', background: 'rgba(220,53,69,0.1)', color: '#dc3545' }}>
          {queueError}
        </div>
      )}



      <div className="queue-list">
        {filteredDoubts.length === 0 ? (
          <div style={{padding: '40px', textAlign: 'center', color: 'var(--text-secondary)'}}>No active doubts in the queue.</div>
        ) : (
          filteredDoubts.map(doubt => {
            const studentName = doubt.student?.full_name || 'Unknown Student';
            const avatar = studentName.charAt(0).toUpperCase();
            const subject = doubt.questions?.subject || 'Unknown';
            const snippet = doubt.questions?.question_text || '';
            const timeStr = new Date(doubt.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

            return (
              <div key={doubt.id} className={`doubt-card ${doubt.status === 'pending' ? 'is-new' : ''}`}>
                {doubt.status === 'pending' && <div className="new-badge">NEW</div>}
                <div className="doubt-card-left">
                  <div className="student-avatar">{avatar}</div>
                  <div className="doubt-info">
                    <div className="doubt-meta">
                      <span className="student-name">{studentName}</span>
                      <span className={`subject-tag ${subject.toLowerCase()}`}>{subject}</span>
                      <span className="time-tag"><Clock size={12} /> {timeStr}</span>
                    </div>
                    <p className="question-snippet">"{snippet.length > 100 ? snippet.substring(0, 100) + '...' : snippet}"</p>
                  </div>
                </div>
                <div className="doubt-card-right" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <button className="btn-accept" onClick={() => handleAccept(doubt.id)}>
                    {doubt.status === 'accepted' ? 'Resume Session' : 'Accept Doubt'}
                  </button>
                  <button 
                    className="delete-doubt-btn"
                    style={{ background: 'none', border: 'none', color: 'var(--color-physics-red)', cursor: 'pointer', padding: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    onClick={() => handleDelete(doubt.id)}
                    title="Delete Session"
                  >
                    <Trash2 size={20} />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default DoubtQueue;