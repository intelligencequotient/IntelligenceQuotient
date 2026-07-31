import React, { useState, useRef, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Send, Paperclip, CheckCircle, Video } from 'lucide-react';
import { io } from 'socket.io-client';
import { useAppData } from '../../context/AppDataContext';
import { apiClient } from '../../api/client';
import './DoubtChatRoom.css';

const SOCKET_URL = 'http://localhost:3000/doubts';

const DoubtChatRoom = () => {
  const { doubtId } = useParams();
  const navigate = useNavigate();
  const { doubts, students } = useAppData();
  const currentDoubt = doubts.find(d => d.id === doubtId);
  const student = students?.find(s => s.id === currentDoubt?.studentId);
  const studentName = student?.name || student?.full_name || 'Student';

  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [isLiveActive, setIsLiveActive] = useState(false);
  const [liveMeetLink, setLiveMeetLink] = useState('');
  const [socket, setSocket] = useState(null);
  const fileInputRef = useRef(null);
  const bottomRef = useRef(null);

  useEffect(() => {
    // Initialize Socket.IO connection for Teacher
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

    setSocket(newSocket);

    // Join room
    newSocket.emit('room:join', { doubtId });

    // Fetch previous messages
    const fetchHistory = async () => {
      try {
        const res = await apiClient.get(`/doubts/${doubtId}/messages`);
        if (res) {
          setMessages(res.map(msg => {
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
              isImage: !!imageUrl,
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

    // Listeners
    newSocket.on('message:new', (msg) => {
      setMessages(prev => {
        if (prev.some(p => p.id === msg.id)) return prev;
        return [...prev, {
          id: msg.id,
          sender: msg.senderRole === 'teacher' ? 'teacher' : 'student',
          text: msg.text,
          imageUrl: msg.imageUrl,
          isImage: !!msg.imageUrl,
          time: new Date(msg.sentAt || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }];
      });
    });

    newSocket.on('typing:start', (data) => {
      if (data.senderRole === 'student') setIsTyping(true);
    });

    newSocket.on('typing:stop', () => {
      setIsTyping(false);
    });

    newSocket.on('session:live_start', (data) => {
      setLiveMeetLink(data.meetLink);
      setIsLiveActive(true);
    });

    return () => {
      newSocket.emit('room:leave', { doubtId });
      newSocket.close();
    };
  }, [doubtId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  const handleSend = () => {
    if (!inputValue.trim() || !socket) return;
    
    socket.emit('message:send', {
      doubtId,
      text: inputValue
    });
    
    setInputValue('');
    socket.emit('typing:stop', { doubtId });
  };

  const handleTyping = (e) => {
    setInputValue(e.target.value);
    if (socket) {
      socket.emit('typing:start', { doubtId });
      clearTimeout(window.teacherTypingTimeout);
      window.teacherTypingTimeout = setTimeout(() => {
        socket.emit('typing:stop', { doubtId });
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
          doubtId,
          text: '🖼️ Sent an image',
          imageUrl: ev.target.result
        });
      }
    };
    reader.readAsDataURL(file);
    e.target.value = ''; // Reset input
  };

  const handleEndSession = async () => {
    try {
      await apiClient.patch(`/doubts/${doubtId}/resolve`);
      socket.emit('doubt:resolve', { doubtId });
      setIsLiveActive(false);
      navigate('/teacher/doubt-queue');
    } catch (err) {
      console.error('Failed to resolve doubt:', err);
    }
  };

  const handleStartLiveSession = () => {
    if (socket && !isLiveActive) {
      const meetLink = `https://meet.jit.si/IQ-Doubt-${doubtId}`;
      socket.emit('session:live_start', { doubtId, meetLink });
      
      socket.emit('message:send', {
        doubtId,
        text: `🎥 Teacher has started a live video session!`
      });
    }
  };

  return (
    <div className="doubt-chat-room">
      <header className="chat-header">
        <button className="back-btn" onClick={() => navigate('/teacher/doubt-queue')}>
          <ArrowLeft size={20} /> Back to Queue
        </button>
        <div className="chat-actions">
          {!isLiveActive && (
            <button className="btn-outline" onClick={handleStartLiveSession}>
              <Video size={16} style={{marginRight: '6px'}} /> Start Live
            </button>
          )}
          <button className="btn-primary" onClick={handleEndSession}>End Session</button>
        </div>
      </header>

      <div className="pinned-question-card" style={{ alignItems: 'center', padding: '20px' }}>
        <div className="student-avatar-large" style={{ width: '60px', height: '60px', borderRadius: '50%', backgroundColor: '#e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '24px', fontWeight: 'bold', color: '#64748b' }}>
          {studentName.charAt(0).toUpperCase()}
        </div>
        <div className="pinned-content">
          <div className="pinned-meta">
            <span className={`subject-tag ${(currentDoubt?.subject || 'Mathematics').toLowerCase()}`}>{currentDoubt?.subject || currentDoubt?.questions?.subject || 'Mathematics'}</span>
            <span className="q-id">Doubt #{doubtId.substring(0,6).toUpperCase()}</span>
          </div>
          <h3 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '4px' }}>{studentName}</h3>
          <span className="student-name" style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#64748b' }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#22c55e' }}></span>
            Active Session
          </span>
        </div>
      </div>

      <div className="chat-content-wrapper" style={{ display: 'flex', flex: 1, overflow: 'hidden', marginTop: '15px', gap: isLiveActive ? '15px' : '0' }}>
        {isLiveActive && (
          <div className="live-video-container" style={{ flex: '1', backgroundColor: '#000', borderRadius: '12px', overflow: 'hidden' }}>
            <iframe 
              src={liveMeetLink}
              style={{ width: '100%', height: '100%', border: 'none' }}
              allow="camera; microphone; fullscreen; display-capture; autoplay"
            ></iframe>
          </div>
        )}

        <div className="chat-panel" style={{ display: 'flex', flexDirection: 'column', flex: isLiveActive ? '0 0 350px' : '1', overflow: 'hidden', backgroundColor: 'white', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
          <div className="chat-thread" style={{ flex: 1, marginBottom: 0, border: 'none', borderRadius: 0, borderBottom: '1px solid var(--border-color)' }}>
            {messages.length === 0 && (
              <div style={{ textAlign: 'center', color: '#888', marginTop: '20px' }}>
                No messages yet. Say hello!
              </div>
            )}
        {messages.map(msg => (
          <div key={msg.id} className={`message-bubble ${msg.sender}`}>
            {msg.isImage ? (
              <img src={msg.imageUrl} alt="Attachment" className="msg-image" style={{ maxWidth: '100%', borderRadius: '8px' }} />
            ) : (
              <p>{msg.text}</p>
            )}
            <span className="msg-time">{msg.time}</span>
          </div>
        ))}
        {isTyping && (
          <div className="message-bubble student typing-indicator">
            <span></span><span></span><span></span>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="chat-input-area">
        <button className="attach-btn" onClick={() => fileInputRef.current?.click()}><Paperclip size={20} /></button>
        <input type="file" ref={fileInputRef} style={{ display: 'none' }} accept="image/*" onChange={handleImageUpload} />
        <input
          type="text"
          placeholder="Type your response..."
          value={inputValue}
          onChange={handleTyping}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
          />
          <button className="send-btn" onClick={handleSend}><Send size={20} /></button>
        </div>
        </div>
      </div>
    </div>
  );
};

export default DoubtChatRoom;
