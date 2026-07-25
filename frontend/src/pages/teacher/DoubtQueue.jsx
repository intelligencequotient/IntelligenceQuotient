import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { io } from 'socket.io-client';
import { MessageSquare, Clock, Filter, Search } from 'lucide-react';
import { useAppData } from '../../context/AppDataContext';
import { apiClient } from '../../api/client';
import './DoubtQueue.css';

const DoubtQueue = () => {
  const navigate = useNavigate();
  const { doubts, setDoubts, students } = useAppData();
  const [searchTerm, setSearchTerm] = useState('');
  const [activeFilter, setActiveFilter] = useState('All');
  const [socket, setSocket] = useState(null);

  useEffect(() => {
    const token = localStorage.getItem('access_token');
    let user = { id: '', role: 'teacher', full_name: 'Teacher' };
    try {
      const userStr = localStorage.getItem('user');
      if (userStr) user = JSON.parse(userStr);
    } catch (e) {}

    const newSocket = io('http://localhost:3000/doubts', {
      auth: { 
        token: token,
        userId: user.id,
        role: user.role,
        name: user.full_name || user.name
      }
    });

    newSocket.on('doubt:list', (list) => {
      setDoubts(list);
    });

    newSocket.on('doubt:new', (doubt) => {
      setDoubts(prev => [doubt, ...prev]);
    });

    newSocket.on('doubt:resolved', ({ doubtId }) => {
      setDoubts(prev => prev.map(d => d.id === doubtId ? { ...d, status: 'resolved' } : d));
    });

    newSocket.emit('doubt:request_list');
    setSocket(newSocket);

    return () => newSocket.close();
  }, [setDoubts]);

  const filteredDoubts = doubts.filter(doubt => {
    const student = students.find(s => s.id === doubt.studentId);
    const studentName = (student?.name || student?.full_name || 'Unknown Student');
    const safeSnippet = doubt.snippet || 'No text provided';
    const safeSubject = doubt.subject || 'General';

    const matchesSearch = studentName.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          safeSnippet.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesFilter = activeFilter === 'All' || safeSubject === activeFilter;
    return matchesSearch && matchesFilter && doubt.status?.toLowerCase() !== 'resolved';
  });

  const handleAccept = async (id) => {
    if (socket) {
      try {
        await apiClient.patch(`/doubts/${id}/accept`);
        socket.emit('doubt:accept', { doubtId: id });
        setDoubts(doubts.map(d => d.id === id ? { ...d, status: 'accepted' } : d));
        navigate(`/teacher/doubt-chat/${id}`);
      } catch (err) {
        console.error('Failed to accept doubt', err);
      }
    } else {
      navigate(`/teacher/doubt-chat/${id}`);
    }
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
            const studentName = (student?.name || student?.full_name || 'Unknown Student');
            const avatar = student?.initials || studentName.charAt(0).toUpperCase() || 'U';
            const safeSubject = doubt.subject || 'General';
            const safeSnippet = doubt.snippet || 'No text provided';
            
            return (
              <div key={doubt.id} className={`doubt-card ${doubt.status === 'Waiting' ? 'is-new' : ''}`}>
                {doubt.status === 'Waiting' && <div className="new-badge">NEW</div>}
                
                <div className="doubt-card-header">
                  <div className="student-avatar">{avatar}</div>
                  <div className="header-info">
                    <span className="student-name">{studentName}</span>
                    <span className="time-tag"><Clock size={12} /> {doubt.time || 'Just now'}</span>
                  </div>
                </div>

                <div className="doubt-card-body">
                  <span className={`subject-tag ${safeSubject.toLowerCase()}`}>{safeSubject}</span>
                  <p className="question-snippet">"{safeSnippet}"</p>
                </div>

                <div className="doubt-card-footer">
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