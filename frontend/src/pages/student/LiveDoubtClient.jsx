import React, { useState, useRef, useEffect } from 'react';
import { Filter, HelpCircle, Video, Image as ImageIcon, Paperclip, Sigma, Send, Plus } from 'lucide-react';
import { io } from 'socket.io-client';
import { apiClient } from '../../api/client';
import { useAppData } from '../../context/AppDataContext';
import './LiveDoubtClient.css';

const SOCKET_URL = 'http://localhost:3000/doubts';

const LiveDoubtClient = () => {
  const { doubts, setDoubts } = useAppData();
  
  // Set default active doubt to the first available doubt if it exists
  const [activeDoubt, setActiveDoubt] = useState(doubts.length > 0 ? doubts[0].id : null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('All Active');
  const [toast, setToast] = useState('');

  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [isLiveActive, setIsLiveActive] = useState(false);
  const [liveMeetLink, setLiveMeetLink] = useState('');
  const [socket, setSocket] = useState(null);
  
  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [newDoubtSubject, setNewDoubtSubject] = useState('Physics');
  const [newDoubtText, setNewDoubtText] = useState('');
  
  const fileInputRef = useRef(null);
  const bottomRef = useRef(null);

  // Auto-select first doubt if doubts array changes and nothing is selected
  useEffect(() => {
    if (!activeDoubt && doubts.length > 0) {
      setActiveDoubt(doubts[0].id);
    }
  }, [doubts, activeDoubt]);

  // Initialize Socket.IO connection
  useEffect(() => {
    const token = localStorage.getItem('access_token');
    let user = { id: '', role: 'student', full_name: 'Student' };
    try {
      const userStr = localStorage.getItem('user');
      if (userStr) user = JSON.parse(userStr);
    } catch (e) {}

    const newSocket = io(SOCKET_URL, {
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

    newSocket.emit('doubt:request_list');
    setSocket(newSocket);

    return () => newSocket.close();
  }, []);

  // Fetch history and join room when active doubt changes
  useEffect(() => {
    if (!activeDoubt || !socket) return;

    // Join new room
    socket.emit('room:join', { doubtId: activeDoubt });

    // Fetch previous messages
    const fetchHistory = async () => {
      try {
        const res = await apiClient.get(`/doubts/${activeDoubt}/messages`);
        if (res) {
          setChatMessages(res.map(msg => {
            let text = msg.message_text;
            let imageUrl = null;
            if (text.includes('|||IMG|||')) {
              const parts = text.split('|||IMG|||');
              text = parts[0];
              imageUrl = parts[1];
            }
            return {
              id: msg.id,
              sender: msg.users?.role === 'student' ? 'student' : 'teacher',
              text: text,
              imageUrl: imageUrl,
              time: new Date(msg.sent_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
              name: msg.users?.role === 'student' ? 'Student' : 'Teacher'
            };
          }));
        }
      } catch (err) {
        console.error('Failed to load chat history', err);
      }
    };
    fetchHistory();

    // Listeners for this room
    socket.on('doubt:resolved', ({ doubtId }) => {
      setDoubts(prev => prev.map(d => d.id === doubtId ? { ...d, status: 'resolved' } : d));
      if (activeDoubt === doubtId) {
        showToast('Teacher has ended the session.');
      }
    });

    socket.on('doubt:accepted', ({ doubtId }) => {
      setDoubts(prev => prev.map(d => d.id === doubtId ? { ...d, status: 'accepted' } : d));
      if (activeDoubt === doubtId) {
        showToast('Teacher has joined the session!');
      }
    });

    socket.on('session:live_start', (data) => {
      if (data.doubtId === activeDoubt) {
        setLiveMeetLink(data.meetLink);
        setIsLiveActive(true);
        showToast('Teacher started a live session!');
      }
    });

    socket.on('message:new', (msg) => {
      setChatMessages(prev => {
        // Prevent duplicate messages by checking ID
        if (prev.some(p => p.id === msg.id)) return prev;
        return [...prev, {
          id: msg.id,
          sender: msg.senderRole === 'student' ? 'student' : 'teacher',
          text: msg.text,
          imageUrl: msg.imageUrl,
          time: new Date(msg.sentAt || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          name: msg.senderRole === 'student' ? 'Student' : 'Teacher'
        }];
      });
    });

    socket.on('typing:start', (data) => {
      if (data.senderRole === 'teacher' && data.doubtId === activeDoubt) {
        setIsTyping(true);
      }
    });

    socket.on('typing:stop', (data) => {
      if (data.doubtId === activeDoubt) {
        setIsTyping(false);
      }
    });

    return () => {
      socket.emit('room:leave', { doubtId: activeDoubt });
      socket.off('message:new');
      socket.off('typing:start');
      socket.off('typing:stop');
      socket.off('doubt:resolved');
      socket.off('doubt:accepted');
      socket.off('session:live_start');
      // Clear chat messages when switching rooms
      setChatMessages([]);
      setIsLiveActive(false);
    };
  }, [activeDoubt, socket]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages, isTyping]);

  const handleSend = () => {
    if (!chatInput.trim() || !socket || !activeDoubt) return;
    
    socket.emit('message:send', {
      doubtId: activeDoubt,
      text: chatInput
    });
    
    setChatInput('');
    socket.emit('typing:stop', { doubtId: activeDoubt });
  };

  const handleTyping = (e) => {
    setChatInput(e.target.value);
    if (socket && activeDoubt) {
      socket.emit('typing:start', { doubtId: activeDoubt });
      // Clear typing after 2 seconds of inactivity
      clearTimeout(window.typingTimeout);
      window.typingTimeout = setTimeout(() => {
        socket.emit('typing:stop', { doubtId: activeDoubt });
      }, 2000);
    }
  };

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      if (socket) {
        socket.emit('message:send', {
          doubtId: activeDoubt,
          text: '🖼️ Sent an image',
          imageUrl: ev.target.result
        });
      }
    };
    reader.readAsDataURL(file);
    e.target.value = ''; // Reset input
  };

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  };

  const handleRaiseDoubt = () => {
    if (socket && newDoubtText.trim()) {
      socket.emit('doubt:raise', {
        subject: newDoubtSubject,
        text: newDoubtText
      });
      showToast('New doubt raised!');
      setShowModal(false);
      setNewDoubtText('');
    }
  };

  const filteredDoubts = doubts.filter(d => {
    const safeText = d.questions?.question_text || d.snippet || '';
    const matchesSearch = safeText.toLowerCase().includes(searchQuery.toLowerCase());
    const status = (d.status || 'pending').toLowerCase();
    if (statusFilter === 'All Active') return matchesSearch && status !== 'resolved';
    if (statusFilter === 'Waiting') return matchesSearch && status === 'pending';
    if (statusFilter === 'Resolved') return matchesSearch && status === 'resolved';
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
          {filteredDoubts.length === 0 && <div style={{padding: '20px', color: 'var(--text-secondary)', textAlign: 'center'}}>No doubts found. Raise one to start!</div>}
          {filteredDoubts.map(doubt => (
            <div 
              key={doubt.id} 
              className={`doubt-card ${activeDoubt === doubt.id ? 'active' : ''}`}
              onClick={() => setActiveDoubt(doubt.id)}
            >
              <div className="doubt-meta">
                <div className="doubt-meta-info">
                  <span>{doubt.questions?.subject || doubt.subject}</span> • <span>{new Date(doubt.created_at || Date.now()).toLocaleDateString()}</span>
                </div>
              </div>
              <p className="doubt-snippet">{doubt.questions?.question_text?.substring(0, 50) || doubt.snippet?.substring(0, 50)}...</p>
              <div className={`status-badge badge-${(doubt.status || 'pending').toLowerCase()}`}>
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
                <div className="teacher-avatar" style={{ width: '48px', height: '48px', fontSize: '20px', background: 'linear-gradient(135deg, #3b82f6, #2563eb)', border: '2px solid #e2e8f0' }}>
                  👨‍🏫
                </div>
                <div className="teacher-info">
                  <h3 style={{ fontSize: '16px', fontWeight: '600' }}>{currentDoubtData?.status === 'accepted' ? 'Expert Teacher' : 'Searching for Teacher...'}</h3>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px', fontSize: '13px' }}>
                    <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: currentDoubtData?.status === 'accepted' ? '#22c55e' : '#f59e0b' }}></span>
                    {currentDoubtData?.status === 'accepted' ? 'Connected & Live' : 'Waiting for connection...'}
                  </span>
                </div>
              </div>
            </div>

            <div className="chat-content-wrapper" style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
              {isLiveActive && (
                <div className="live-video-container" style={{ flex: '1', backgroundColor: '#000', position: 'relative' }}>
                  <iframe 
                    src={liveMeetLink}
                    style={{ width: '100%', height: '100%', border: 'none' }}
                    allow="camera; microphone; fullscreen; display-capture; autoplay"
                  ></iframe>
                </div>
              )}

              <div className="chat-panel" style={{ display: 'flex', flexDirection: 'column', flex: isLiveActive ? '0 0 320px' : '1', borderLeft: isLiveActive ? '1px solid var(--border-color)' : 'none', overflow: 'hidden' }}>
                <div className="chat-thread" style={{ flex: 1 }}>
                  <div className="pinned-question">
                    <HelpCircle className="pinned-icon" size={24} />
                    <div className="pinned-text">
                      <h4>Original Doubt</h4>
                      <p>{currentDoubtData?.questions?.question_text || currentDoubtData?.snippet}</p>
                    </div>
                  </div>

                  {chatMessages.map(msg => (
                    <div key={msg.id} className={`message ${msg.sender === 'student' ? 'message-student' : 'message-teacher'}`}>
                      <div className="bubble">
                        {msg.text}
                        {msg.imageUrl && <img src={msg.imageUrl} alt="Attachment" style={{ maxWidth: '100%', borderRadius: '8px', marginTop: '8px' }} />}
                      </div>
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
                  <button className="btn-icon" onClick={() => fileInputRef.current?.click()}><ImageIcon size={20} /></button>
                  <input type="file" ref={fileInputRef} style={{ display: 'none' }} accept="image/*" onChange={handleImageUpload} />
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
                  <button className="btn-send" onClick={handleSend} disabled={!chatInput.trim()}><Send size={18} /></button>
                </div>
              </div>
            </div>
          </>
        ) : (
          <div style={{display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-secondary)'}}>
            Select a doubt to view chat
          </div>
        )}
        <button className="fab" onClick={() => setShowModal(true)}>
          <Plus size={20} /> Raise New Doubt
        </button>
      </div>

      {/* Raise Doubt Modal */}
      {showModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h3>Raise a New Doubt</h3>
            <div className="form-group" style={{ marginTop: '15px' }}>
              <label style={{ display: 'block', marginBottom: '5px' }}>Subject</label>
              <select 
                value={newDoubtSubject}
                onChange={(e) => setNewDoubtSubject(e.target.value)}
                style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border-color)', marginBottom: '15px' }}
              >
                <option value="Physics">Physics</option>
                <option value="Chemistry">Chemistry</option>
                <option value="Mathematics">Mathematics</option>
                <option value="General">General</option>
              </select>

              <label style={{ display: 'block', marginBottom: '5px' }}>What are you stuck on?</label>
              <textarea 
                value={newDoubtText}
                onChange={(e) => setNewDoubtText(e.target.value)}
                placeholder="Describe your doubt here..."
                style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border-color)', minHeight: '100px', resize: 'vertical' }}
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px' }}>
              <button 
                onClick={() => setShowModal(false)}
                style={{ padding: '8px 16px', border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text-secondary)' }}
              >
                Cancel
              </button>
              <button 
                onClick={handleRaiseDoubt}
                disabled={!newDoubtText.trim()}
                style={{ padding: '8px 16px', border: 'none', background: '#3b82f6', color: 'white', borderRadius: '8px', cursor: newDoubtText.trim() ? 'pointer' : 'not-allowed', opacity: newDoubtText.trim() ? 1 : 0.6, fontWeight: '500' }}
              >
                Submit Doubt
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LiveDoubtClient;

