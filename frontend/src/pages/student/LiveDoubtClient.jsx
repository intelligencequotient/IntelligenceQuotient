import React, { useState, useRef, useEffect } from 'react';
import { Filter, HelpCircle, Video, Image as ImageIcon, Send, Plus, X, Trash2 } from 'lucide-react';
import { io } from 'socket.io-client';
import { apiClient } from '../../api/client';
import { useAppData } from '../../context/AppDataContext';
import { parseChatMessage, openImageSafely } from '../../utils/chatMedia';
import './LiveDoubtClient.css';

const SOCKET_URL = 'http://localhost:3000';

const LiveDoubtClient = () => {
  const { doubts, setDoubts, refreshDoubts, teachers: ctxTeachers } = useAppData();
  const [activeDoubt, setActiveDoubt] = useState(doubts[0]?.id || null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('All Active');
  const [toast, setToast] = useState('');
  const [showTeacherModal, setShowTeacherModal] = useState(false);
  const [teachers, setTeachers] = useState(ctxTeachers || []);
  const [loadingTeachers, setLoadingTeachers] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);

  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [socket, setSocket] = useState(null);
  
  const bottomRef = useRef(null);
  const fileInputRef = useRef(null);

  // Initialize Socket.IO connection
  useEffect(() => {
    const token = localStorage.getItem('access_token');
    const newSocket = io(SOCKET_URL, {
      auth: { token: `Bearer ${token}` }
    });

    // Surface server-side rejections (expired token, no access to a room, flood control)
    newSocket.on('auth_error', ({ message }) => {
      console.error('[socket] authentication failed:', message);
    });
    newSocket.on('error', ({ message }) => {
      if (message) showToast(message);
    });

    setSocket(newSocket);

    return () => newSocket.close();
  }, []);

  // Sync teachers from context when available
  useEffect(() => {
    if (ctxTeachers && ctxTeachers.length > 0) {
      setTeachers(ctxTeachers);
    }
  }, [ctxTeachers]);

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

    const handleNewMessage = (msg) => {
      setChatMessages(prev => {
        // Deduplicate by message id
        if (prev.some(m => m.id === msg.id)) return prev;
        return [...prev, {
          id: msg.id,
          sender: msg.sender.role === 'student' ? 'student' : 'teacher',
          text: msg.message_text,
          time: new Date(msg.sent_at || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          name: msg.sender.full_name
        }];
      });
    };

    const handleUserTyping = (user) => {
      if (user.role !== 'student') setIsTyping(true);
    };

    const handleUserStoppedTyping = () => {
      setIsTyping(false);
    };

    const handleStatusChange = (data) => {
      if (data.doubtId === activeDoubt) {
        setDoubts(prev => prev.map(d => d.id === data.doubtId ? { ...d, status: data.status } : d));
      }
    };

    socket.on('new_message', handleNewMessage);
    socket.on('user_typing', handleUserTyping);
    socket.on('user_stopped_typing', handleUserStoppedTyping);
    socket.on('doubt_status_changed', handleStatusChange);

    return () => {
      socket.emit('leave_room', { doubtId: activeDoubt });
      socket.off('new_message', handleNewMessage);
      socket.off('user_typing', handleUserTyping);
      socket.off('user_stopped_typing', handleUserStoppedTyping);
      socket.off('doubt_status_changed', handleStatusChange);
    };
  }, [activeDoubt, socket]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages, isTyping]);

  const handleSend = () => {
    if (!chatInput.trim() || !socket || !activeDoubt) return;
    socket.emit('send_message', { doubtId: activeDoubt, message_text: chatInput });
    setChatInput('');
  };

  const handleImageUpload = async (e) => {
    const file = e.target.files[0];
    if (!file || !activeDoubt) return;

    const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowed.includes(file.type)) {
      showToast('Only image files are supported (JPG, PNG, GIF, WEBP).');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      showToast('Image must be 5 MB or smaller.');
      return;
    }

    setUploadingImage(true);
    try {
      const formData = new FormData();
      formData.append('image', file);
      const token = localStorage.getItem('access_token');
      const res = await fetch(`http://localhost:3000/api/doubts/${activeDoubt}/upload-image`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || 'Upload failed');
      }
      // The server stores the message and broadcasts it to the room,
      // so there is nothing to emit from here.
      await res.json();
    } catch (err) {
      console.error(err);
      showToast(err.message || 'Image upload failed. Please try again.');
    } finally {
      setUploadingImage(false);
      // Reset file input
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
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

  const openTeacherModal = async () => {
    setShowTeacherModal(true);
    // Always re-fetch teachers when the modal opens to ensure fresh data
    if (teachers.length === 0) {
      setLoadingTeachers(true);
      try {
        // Students see the reduced directory: names only, no staff emails.
        setTeachers(await apiClient.getList('/users/teachers/directory'));
      } catch (e) {
        console.error('Failed to load teachers', e);
        showToast('Could not load teachers. Please try again.');
      } finally {
        setLoadingTeachers(false);
      }
    }
  };

  const handleRaiseDoubt = async (teacherId) => {
    try {
      // Create doubt directly assigned to the selected teacher.
      // No question_id needed — the student is raising a freeform doubt.
      const newDoubt = await apiClient.post('/doubts', { teacher_id: teacherId });
      showToast('Doubt raised! Connecting to teacher...');
      setShowTeacherModal(false);
      if (refreshDoubts) {
        await refreshDoubts();
      }
      if (newDoubt && newDoubt.id) {
        setActiveDoubt(newDoubt.id);
      }
    } catch (e) {
      console.error(e);
      showToast('Failed to raise new doubt.');
    }
  };

  const handleDeleteDoubt = async (e, doubtId) => {
    e.stopPropagation();
    try {
      await apiClient.delete(`/doubts/${doubtId}`);
      if (activeDoubt === doubtId) {
        setActiveDoubt(null);
      }
      if (refreshDoubts) {
        await refreshDoubts();
      }
      showToast('Session deleted.');
    } catch (err) {
      console.error(err);
      showToast('Failed to delete session.');
    }
  };


  const filteredDoubts = doubts.filter(d => {
    const textToSearch = d.questions?.question_text || (d.teacher?.full_name ? `Chat with ${d.teacher.full_name}` : 'General doubt');
    const matchesSearch = textToSearch.toLowerCase().includes(searchQuery.toLowerCase());
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
          <h2>Chat History</h2>
          <button className="btn-primary" onClick={openTeacherModal} style={{ padding: '8px 16px', fontSize: '14px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '6px', borderRadius: '24px', boxShadow: '0 4px 12px rgba(79, 70, 229, 0.4)' }}>
            <Plus size={18} /> New Doubt
          </button>
        </div>
        
        <div className="doubt-list">
          {filteredDoubts.map(doubt => (
            <div 
              key={doubt.id} 
              className={`doubt-card ${activeDoubt === doubt.id ? 'active' : ''}`}
              onClick={() => setActiveDoubt(doubt.id)}
            >
              <div className="doubt-meta" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div className="doubt-meta-info">
                  <span>{doubt.questions?.subject || 'Freeform Doubt'}</span> • <span>{new Date(doubt.created_at).toLocaleDateString()}</span>
                </div>
                <button
                  className="delete-doubt-btn"
                  style={{ background: 'none', border: 'none', color: 'var(--color-physics-red)', cursor: 'pointer', padding: '4px' }}
                  onClick={(e) => handleDeleteDoubt(e, doubt.id)}
                  title="Delete Session"
                >
                  <Trash2 size={16} />
                </button>
              </div>
              <p className="doubt-snippet">
                {doubt.questions?.question_text
                  ? doubt.questions.question_text.substring(0, 50) + '...'
                  : doubt.teacher?.full_name ? `Chat with ${doubt.teacher.full_name}` : 'General doubt'}
              </p>
              <div className={`status-badge badge-${doubt.status.toLowerCase()}`}>
                {doubt.status} {doubt.status === 'accepted' && doubt.teacher?.full_name && `· ${doubt.teacher.full_name}`}
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
                  <h3>{currentDoubtData?.teacher?.full_name || 'Teacher / Admin'}</h3>
                  <span>{currentDoubtData?.status === 'accepted' ? 'Connected' : 'Waiting for connection...'}</span>
                </div>
              </div>
              <div className="chat-actions">
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

              {chatMessages.map(msg => {
                const content = parseChatMessage(msg.text);
                return (
                  <div key={msg.id} className={`message ${msg.sender === 'student' ? 'message-student' : 'message-teacher'}`}>
                    <div className="bubble">
                      {content.type === 'image' ? (
                        <img
                          src={content.url}
                          alt="Uploaded"
                          referrerPolicy="no-referrer"
                          style={{ maxWidth: '200px', maxHeight: '200px', borderRadius: '8px', cursor: 'pointer' }}
                          onClick={() => openImageSafely(content.url)}
                        />
                      ) : (
                        content.text
                      )}
                    </div>
                    <span className="message-time">{msg.time} {msg.name && `- ${msg.name}`}</span>
                  </div>
                );
              })}

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
              {/* Hidden image file input */}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={handleImageUpload}
              />
              <button
                className="btn-icon"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingImage}
                title="Upload image"
                style={{ opacity: uploadingImage ? 0.5 : 1 }}
              >
                {uploadingImage ? '⏳' : <ImageIcon size={20} />}
              </button>
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
      </div>

      {showTeacherModal && (
        <div className="teacher-modal-overlay">
          <div className="teacher-modal">
            <div className="modal-header">
              <h3>Select a Teacher</h3>
              <button className="btn-icon" onClick={() => setShowTeacherModal(false)}><X size={20}/></button>
            </div>
            <div className="teacher-list">
              {loadingTeachers ? (
                <div style={{padding: '20px', textAlign: 'center', color: 'var(--text-secondary)'}}>Loading teachers...</div>
              ) : teachers.length === 0 ? (
                <div style={{padding: '20px', textAlign: 'center', color: 'var(--text-secondary)'}}>
                  No teachers available. Please try again.
                </div>
              ) : (
                teachers.map(teacher => (
                  <div key={teacher.id} className="teacher-card" onClick={() => handleRaiseDoubt(teacher.id)}>
                    <div className="teacher-avatar">{teacher.full_name.charAt(0).toUpperCase()}</div>
                    <div className="teacher-info">
                      <h4>{teacher.full_name}</h4>
                      <span>Teacher</span>
                    </div>
                    <button className="btn-primary" style={{marginLeft: 'auto'}}>Chat Now</button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LiveDoubtClient;
