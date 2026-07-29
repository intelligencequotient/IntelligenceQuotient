import React, { useState, useRef, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Send, Paperclip, Image as ImageIcon, CheckCircle, HelpCircle, MessageSquare } from 'lucide-react';
import { io } from 'socket.io-client';
import { apiClient } from '../../api/client';
import { parseChatMessage, openImageSafely } from '../../utils/chatMedia';
import './DoubtChatRoom.css';

const SOCKET_URL = 'http://localhost:3000';

const DoubtChatRoom = () => {
  const { doubtId } = useParams();
  const navigate = useNavigate();
  
  const [messages, setMessages] = useState([]);
  const [doubtData, setDoubtData] = useState(null);
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [socket, setSocket] = useState(null);
  const [loading, setLoading] = useState(true);
  const [accessError, setAccessError] = useState('');
  const [uploadingImage, setUploadingImage] = useState(false);
  const [toast, setToast] = useState('');
  
  const bottomRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const fileInputRef = useRef(null);

  // Initialize data and socket
  useEffect(() => {
    if (!doubtId) return;

    let aborted = false;
    let socketRef;

    const init = async () => {
      try {
        setLoading(true);
        // Fetch doubt metadata
        const doubtRes = await apiClient.get(`/doubts/${doubtId}`);
        if (aborted) return;
        setDoubtData(doubtRes);

        // Fetch message history
        const historyRes = await apiClient.get(`/doubts/${doubtId}/messages`);
        if (aborted) return;
        setMessages(historyRes.map(msg => ({
          id: msg.id,
          sender: msg.users?.role === 'teacher' || msg.users?.role === 'admin' ? 'teacher' : 'student',
          text: msg.message_text,
          time: new Date(msg.sent_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          name: msg.users?.full_name
        })));

        // Setup Socket
        const token = localStorage.getItem('access_token');
        socketRef = io(SOCKET_URL, {
          auth: { token: `Bearer ${token}` }
        });

        if (aborted) { socketRef.close(); return; }

        setSocket(socketRef);

        socketRef.on('connect', () => {
          socketRef.emit('join_room', { doubtId });
        });

        socketRef.on('auth_error', ({ message }) => {
          console.error('[socket] authentication failed:', message);
          setAccessError(message || 'Your session has expired. Please log in again.');
        });
        socketRef.on('error', ({ message }) => {
          console.warn('[socket]', message);
        });

        const handleNewMessage = (msg) => {
          setMessages(prev => {
            // Deduplicate by message id
            if (prev.some(m => m.id === msg.id)) return prev;
            return [...prev, {
              id: msg.id,
              sender: msg.sender.role === 'teacher' || msg.sender.role === 'admin' ? 'teacher' : 'student',
              text: msg.message_text,
              time: new Date(msg.sent_at || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
              name: msg.sender.full_name
            }];
          });
        };

        const handleUserTyping = (user) => {
          if (user.role === 'student') setIsTyping(true);
        };

        const handleUserStoppedTyping = () => {
          setIsTyping(false);
        };

        const handleStatusChange = (data) => {
          if (data.doubtId === doubtId) {
             setDoubtData(prev => prev ? { ...prev, status: data.status } : prev);
          }
        };

        socketRef.on('new_message', handleNewMessage);
        socketRef.on('user_typing', handleUserTyping);
        socketRef.on('user_stopped_typing', handleUserStoppedTyping);
        socketRef.on('doubt_status_changed', handleStatusChange);

      } catch (err) {
        if (!aborted) {
          console.error('Failed to load doubt room', err);
          setAccessError(err.message || 'This conversation is not available to you.');
        }
      } finally {
        if (!aborted) setLoading(false);
      }
    };

    init();

    return () => {
      aborted = true;
      if (socketRef) {
        socketRef.emit('leave_room', { doubtId });
        socketRef.close();
      }
    };
  }, [doubtId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  const handleSend = () => {
    if (!inputValue.trim() || !socket || !doubtId) return;
    
    socket.emit('send_message', {
      doubtId: doubtId,
      message_text: inputValue
    });
    
    setInputValue('');
  };

  const handleTyping = (e) => {
    setInputValue(e.target.value);
    if (socket && doubtId) {
      socket.emit('typing_start', { doubtId });
      
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
      
      typingTimeoutRef.current = setTimeout(() => {
        socket.emit('typing_stop', { doubtId });
      }, 2000);
    }
  };

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  };

  const handleImageUpload = async (e) => {
    const file = e.target.files[0];
    if (!file || !doubtId) return;

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
      const res = await fetch(`http://localhost:3000/api/doubts/${doubtId}/upload-image`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || 'Upload failed');
      }
      await res.json();
    } catch (err) {
      console.error(err);
      showToast(err.message || 'Image upload failed. Please try again.');
    } finally {
      setUploadingImage(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleResolve = async () => {
    try {
      await apiClient.patch(`/doubts/${doubtId}/resolve`);
      navigate('/teacher/doubt-queue');
    } catch (err) {
      console.error('Failed to resolve doubt', err);
    }
  };

  if (loading) {
    return <div className="doubt-chat-room">Loading...</div>;
  }

  if (accessError) {
    return (
      <div className="doubt-chat-room" style={{ padding: '24px' }}>
        <button className="back-btn" onClick={() => navigate('/teacher/doubt-queue')}>
          <ArrowLeft size={20} /> Back to Queue
        </button>
        <p style={{ marginTop: '16px' }}>{accessError}</p>
      </div>
    );
  }

  const studentName = doubtData?.student?.full_name || 'Unknown Student';
  const subject = doubtData?.questions?.subject || 'Subject';
  const questionText = doubtData?.questions?.question_text || '';

  return (
    <div className="doubt-chat-room">
      {toast && <div className="toast-notification" style={{position:'fixed',top:'20px',right:'20px',background:'#1e293b',color:'#f1f5f9',padding:'12px 20px',borderRadius:'8px',zIndex:9999,boxShadow:'0 4px 12px rgba(0,0,0,.3)'}}>{toast}</div>}
      <header className="chat-header">
        <button className="back-btn" onClick={() => navigate('/teacher/doubt-queue')}>
          <ArrowLeft size={20} /> Back to Queue
        </button>
        <div className="chat-actions">
          <button className="btn-outline">Escalate</button>
          <button className="btn-primary" onClick={handleResolve}>Mark as Resolved</button>
        </div>
      </header>

      {questionText ? (
        <div className="pinned-question-card">
          <div className="pinned-icon-wrap" style={{display:'flex',alignItems:'center',justifyContent:'center',width:'48px',height:'48px',borderRadius:'12px',background:'#eef2ff',flexShrink:0}}>
            <HelpCircle size={24} style={{color:'var(--color-teacher-accent, #6366f1)'}} />
          </div>
          <div className="pinned-content">
            <div className="pinned-meta">
              <span className={`subject-tag ${subject.toLowerCase()}`}>{subject}</span>
              {doubtData?.questions?.id && (
                <span className="q-id">ID: #{doubtData.questions.id.substring(0, 8).toUpperCase()}</span>
              )}
            </div>
            <h3>{questionText}</h3>
            <span className="student-name">Asked by {studentName}</span>
          </div>
        </div>
      ) : (
        <div className="pinned-question-card">
          <div className="pinned-icon-wrap" style={{display:'flex',alignItems:'center',justifyContent:'center',width:'48px',height:'48px',borderRadius:'12px',background:'#eef2ff',flexShrink:0}}>
            <MessageSquare size={24} style={{color:'var(--color-teacher-accent, #6366f1)'}} />
          </div>
          <div className="pinned-content">
            <div className="pinned-meta">
              <span className="subject-tag" style={{background:'#f1f5f9',color:'#475569'}}>Freeform Doubt</span>
            </div>
            <h3>Direct conversation with {studentName}</h3>
            <span className="student-name">No specific question attached</span>
          </div>
        </div>
      )}

      <div className="chat-thread">
        {messages.map(msg => {
          const content = parseChatMessage(msg.text);
          return (
            <div key={msg.id} className={`message-bubble ${msg.sender}`}>
              {content.type === 'image' ? (
                <img
                  src={content.url}
                  alt="Student Work"
                  className="msg-image"
                  referrerPolicy="no-referrer"
                  style={{ cursor: 'pointer' }}
                  onClick={() => openImageSafely(content.url)}
                />
              ) : (
                <p>{content.text}</p>
              )}
              <span className="msg-time">{msg.time} {msg.name ? `- ${msg.name}` : ''}</span>
            </div>
          );
        })}
        {isTyping && (
          <div className="message-bubble student typing-indicator">
            <span></span><span></span><span></span>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="chat-input-area">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={handleImageUpload}
        />
        <button
          className="attach-btn"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploadingImage}
          title="Upload image"
          style={{ opacity: uploadingImage ? 0.5 : 1 }}
        >
          {uploadingImage ? '⏳' : <Paperclip size={20} />}
        </button>
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
  );
};

export default DoubtChatRoom;
