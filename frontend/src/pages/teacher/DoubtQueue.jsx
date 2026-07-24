import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MessageSquare, Clock, Filter, Search } from 'lucide-react';
import { useAppData } from '../../context/AppDataContext';
import './DoubtQueue.css';

const DoubtQueue = () => {
  const navigate = useNavigate();
  const { doubts, setDoubts, students } = useAppData();
  const [searchTerm, setSearchTerm] = useState('');
  const [activeFilter, setActiveFilter] = useState('All');

  const filteredDoubts = doubts.filter(doubt => {
    const student = students.find(s => s.id === doubt.studentId);
    const studentName = student ? student.name : 'Unknown Student';
    const matchesSearch = studentName.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          doubt.snippet.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesFilter = activeFilter === 'All' || doubt.subject === activeFilter;
    return matchesSearch && matchesFilter && doubt.status !== 'Resolved';
  });

  const handleAccept = (id) => {
    setDoubts(doubts.map(d => d.id === id ? { ...d, status: 'Connected' } : d));
    navigate(`/teacher/doubt-chat/${id}`);
  };

  return (
    <div className="doubt-queue">
      <header className="page-header d-flex justify-between align-center">
        <div>
          <h1>Live Doubt Queue</h1>
          <p>Monitor and resolve student doubts in real-time.</p>
        </div>
        <div className="queue-status">
          <span className="pulse-dot"></span>
          <span>4 Doubts Pending</span>
        </div>
      </header>

      <div className="queue-controls">
        <div className="search-bar">
          <Search size={18} className="search-icon" />
          <input 
            type="text" 
            placeholder="Search by student or keyword..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="filters">
          {['All', 'Mathematics', 'Physics', 'Chemistry'].map(subject => (
            <button 
              key={subject}
              className={`filter-btn ${activeFilter === subject ? 'active' : ''}`}
              onClick={() => setActiveFilter(subject)}
            >
              {subject}
            </button>
          ))}
        </div>
      </div>

      <div className="queue-list">
        {filteredDoubts.length === 0 ? (
          <div style={{padding: '40px', textAlign: 'center', color: 'var(--text-secondary)'}}>No active doubts in the queue.</div>
        ) : (
          filteredDoubts.map(doubt => {
            const student = students.find(s => s.id === doubt.studentId);
            const studentName = student ? student.name : 'Unknown Student';
            const avatar = student ? student.initials : 'U';
            return (
              <div key={doubt.id} className={`doubt-card ${doubt.status === 'Waiting' ? 'is-new' : ''}`}>
                {doubt.status === 'Waiting' && <div className="new-badge">NEW</div>}
                <div className="doubt-card-left">
                  <div className="student-avatar">{avatar}</div>
                  <div className="doubt-info">
                    <div className="doubt-meta">
                      <span className="student-name">{studentName}</span>
                      <span className={`subject-tag ${doubt.subject.toLowerCase()}`}>{doubt.subject}</span>
                      <span className="time-tag"><Clock size={12} /> {doubt.time}</span>
                    </div>
                    <p className="question-snippet">"{doubt.snippet}"</p>
                  </div>
                </div>
                <div className="doubt-card-right">
                  <button className="btn-accept" onClick={() => handleAccept(doubt.id)}>
                    {doubt.status === 'Connected' ? 'Resume Session' : 'Accept Doubt'}
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