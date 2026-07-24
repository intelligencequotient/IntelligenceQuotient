import React, { useState, useRef, useEffect } from 'react';
import { Filter, HelpCircle, Video, Image as ImageIcon, Paperclip, Sigma, Send, Plus } from 'lucide-react';
import { io } from 'socket.io-client';
import { apiClient } from '../../api/client';
import { useAppData } from '../../context/AppDataContext';
import './LiveDoubtClient.css';

const SOCKET_URL = 'http://localhost:3000';

const LiveDoubtClient = () => {
  const { doubts } = useAppData();
  const [activeDoubt, setActiveDoubt] = useState(doubts[0]?.id || null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('All Active');
  const [toast, setToast] = useState('');

  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [socket, setSocket] = useState(null);
  
  const bottomRef = useRef(null);

  // Initialize Socket.IO connection
  useEffect(() => {
    const token = localStorage.getItem('access_token');
    const newSocket = io(SOCKET_URL, {
      auth: { token: `Bearer ${token}` }
    });

    setSocket(newSocket);

    return () => newSocket.close();
  }, []);

  // Fetch history and join room when active doubt changes
  useEffect(() => {
    if (!activeDoubt || !socket) return;

    // Join new room
    socket.emit('join_room', { doubtId: activeDoubt });

    // Fetch message history via REST
    const fetchHistory = async () => {
      try {
        const history = await apiClient.get(`/doubts/${activeDoubt}/messages`);
        setChatMessages(history.map(msg => ({
          id: msg.id,
          sender: msg.users?.role === 'student' ? 'student' : 'teacher',
          text: msg.message_text,
          time: new Date(msg.sent_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          name: msg.users?.full_name
        })));
      } catch (err) {
        console.error('Failed to load history', err);
      }
    };
    fetchHistory();

    // Listeners for this room
    socket.on('new_message', (msg) => {
      setChatMessages(prev => [...prev, {
        id: msg.id,
        sender: msg.sender.role === 'student' ? 'student' : 'teacher',
        text: msg.message_text,
        time: new Date(msg.sent_at || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        name: msg.sender.full_name
      }]);
    });

    socket.on('user_typing', (user) => {
      if (user.role !== 'student') setIsTyping(true);
    });

    socket.on('user_stopped_typing', () => {
      setIsTyping(false);
    });

    return () => {
      socket.emit('leave_room', { doubtId: activeDoubt });
      socket.off('new_message');
      socket.off('user_typing');
      socket.off('user_stopped_typing');
    };
  }, [activeDoubt, socket]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages, isTyping]);

  const handleSend = () => {
    if (!chatInput.trim() || !socket || !activeDoubt) return;
    
    socket.emit('send_message', {
      doubtId: activeDoubt,
      message_text: chatInput
    });
    
    setChatInput('');
  };

  const handleTyping = (e) => {
    setChatInput(e.target.value);
    if (socket && activeDoubt) {
      socket.emit('typing_start', { doubtId: activeDoubt });
      // Clear typing after 2 seconds of inactivity
      clearTimeout(window.typingTimeout);
      window.typingTimeout = setTimeout(() => {
        socket.emit('typing_stop', { doubtId: activeDoubt });
      }, 2000);
    }
  };

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  };

  const filteredDoubts = doubts.filter(d => {
    const matchesSearch = d.questions?.question_text?.toLowerCase().includes(searchQuery.toLowerCase());
    if (statusFilter === 'All Active') return matchesSearch && d.status !== 'resolved';
    if (statusFilter === 'Waiting') return matchesSearch && d.status === 'pending';
    if (statusFilter === 'Resolved') return matchesSearch && d.status === 'resolved';
    return matchesSearch;
  });

  const currentDoubtData = doubts.find(d => d.id === activeDoubt);

  return (
    <div className="doubt-client-container">
      {toast && <div className="toast-notification">{toast}</div>}
      {/* Left Sidebar */}
      <div className="doubt-sidebar">
        <div className="doubt-sidebar-header">
          <h2>Live Doubts <Filter size={18} /></h2>
          <input 
            type="text" 
            className="search-input" 
            placeholder="Search past doubts..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <div className="status-filters">
            <span className={`filter-badge ${statusFilter === 'All Active' ? 'active' : ''}`} onClick={() => setStatusFilter('All Active')}>All Active</span>
            <span className={`filter-badge ${statusFilter === 'Waiting' ? 'active' : ''}`} onClick={() => setStatusFilter('Waiting')}>Waiting</span>
            <span className={`filter-badge ${statusFilter === 'Resolved' ? 'active' : ''}`} onClick={() => setStatusFilter('Resolved')}>Resolved</span>
          </div>
        </div>
        
        <div className="doubt-list">
          {filteredDoubts.map(doubt => (
            <div 
              key={doubt.id} 
              className={`doubt-card ${activeDoubt === doubt.id ? 'active' : ''}`}
              onClick={() => setActiveDoubt(doubt.id)}
            >
              <div className="doubt-meta">
                <div className="doubt-meta-info">
                  <span>{doubt.questions?.subject}</span> • <span>{new Date(doubt.created_at).toLocaleDateString()}</span>
                </div>
              </div>
              <p className="doubt-snippet">{doubt.questions?.question_text?.substring(0, 50)}...</p>
              <div className={`status-badge badge-${doubt.status.toLowerCase()}`}>
                {doubt.status} {doubt.status === 'accepted' && `by Teacher`}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="chat-main">
        {activeDoubt ? (
          <>
            <div className="chat-header">
              <div className="teacher-profile">
                <div className="teacher-avatar">T</div>
                <div className="teacher-info">
                  <h3>Teacher / Admin</h3>
                  <span>{currentDoubtData?.status === 'accepted' ? 'Connected' : 'Waiting for connection...'}</span>
                </div>
              </div>
              <div className="chat-actions">
                <button style={{ marginRight: '8px', border: 'none', background: 'transparent', color: 'var(--text-secondary)' }} onClick={() => showToast('Starting video call...')}>
                  <Video size={20} />
                </button>
                <button onClick={() => showToast('Session ended.')}>End Session</button>
              </div>
            </div>

            <div className="chat-thread">
              <div className="pinned-question">
                <HelpCircle className="pinned-icon" size={24} />
                <div className="pinned-text">
                  <h4>Original Doubt</h4>
                  <p>{currentDoubtData?.questions?.question_text}</p>
                </div>
              </div>

              {chatMessages.map(msg => (
                <div key={msg.id} className={`message ${msg.sender === 'student' ? 'message-student' : 'message-teacher'}`}>
                  <div className="bubble">{msg.text}</div>
                  <span className="message-time">{msg.time} {msg.name && `- ${msg.name}`}</span>
                </div>
              ))}

              {isTyping && (
                <div className="message message-teacher">
                  <div className="bubble typing-bubble">
                    <span className="dot"></span>
                    <span className="dot"></span>
                    <span className="dot"></span>
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </div>

            <div className="chat-input-area">
              <button className="btn-icon"><ImageIcon size={20} /></button>
              <button className="btn-icon"><Paperclip size={20} /></button>
              <button className="btn-icon"><Sigma size={20} /></button>
              <input
                type="text"
                className="chat-input"
                placeholder="Type your doubt here..."
                value={chatInput}
                onChange={handleTyping}
                onKeyDown={e => e.key === 'Enter' && handleSend()}
              />
              <button className="btn-send" onClick={handleSend}><Send size={18} /></button>
            </div>
          </>
        ) : (
          <div style={{display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-secondary)'}}>
            Select a doubt to view chat
          </div>
        )}
        <button className="fab" onClick={() => showToast('New doubt creation started.')}>
          <Plus size={20} /> Raise New Doubt
        </button>
      </div>
    </div>
  );
};

export default LiveDoubtClient;
