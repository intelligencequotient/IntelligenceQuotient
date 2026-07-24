import React, { useState, useRef, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Send, Paperclip, CheckCircle } from 'lucide-react';
import './DoubtChatRoom.css';

const TEACHER_REPLIES = [
  "Great question! Let me walk you through step by step.",
  "I see what's confusing you here. The key is to apply the formula carefully.",
  "Look at step 2 again — you need to account for the sign convention.",
  "Yes, that's the correct approach! Now try applying it to the next part.",
  "Remember, in this type of problem, always start by drawing a free-body diagram.",
];

const DoubtChatRoom = () => {
  const { doubtId } = useParams();
  const navigate = useNavigate();
  const [messages, setMessages] = useState([
    { id: 1, sender: 'student', text: "Hi Sir, I'm stuck on step 3 of this problem. I tried applying the formula but I keep getting a negative sign where there shouldn't be one. Can you check my working?", time: '09:42 AM' },
    { id: 2, sender: 'student', isImage: true, url: 'https://images.unsplash.com/photo-1632516643720-e7f5d7d6eca9?w=400&h=300&fit=crop', time: '09:42 AM' }
  ]);
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const bottomRef = useRef(null);
  let replyIndex = useRef(0);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  const handleSend = () => {
    if (!inputValue.trim()) return;
    const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    // Append teacher message
    setMessages(prev => [...prev, { id: Date.now(), sender: 'teacher', text: inputValue, time: now }]);
    setInputValue('');

    // Simulate student reply after 2 seconds
    setIsTyping(true);
    setTimeout(() => {
      const reply = TEACHER_REPLIES[replyIndex.current % TEACHER_REPLIES.length];
      replyIndex.current++;
      setIsTyping(false);
      setMessages(prev => [...prev, {
        id: Date.now() + 1,
        sender: 'student',
        text: reply,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      }]);
    }, 2000);
  };

  const handleResolve = () => navigate('/teacher/doubt-queue');

  return (
    <div className="doubt-chat-room">
      <header className="chat-header">
        <button className="back-btn" onClick={() => navigate('/teacher/doubt-queue')}>
          <ArrowLeft size={20} /> Back to Queue
        </button>
        <div className="chat-actions">
          <button className="btn-outline">Escalate</button>
          <button className="btn-primary" onClick={handleResolve}>Mark as Resolved</button>
        </div>
      </header>

      <div className="pinned-question-card">
        <div className="q-image-placeholder">
          <img src="https://images.unsplash.com/photo-1632516643720-e7f5d7d6eca9?w=100&h=100&fit=crop" alt="Math Problem" />
        </div>
        <div className="pinned-content">
          <div className="pinned-meta">
            <span className="subject-tag mathematics">Mathematics</span>
            <span className="q-id">Question ID: #MATH-892</span>
          </div>
          <h3>Integration by Parts Doubt</h3>
          <span className="student-name">Sarah Jenkins</span>
        </div>
      </div>

      <div className="chat-thread">
        {messages.map(msg => (
          <div key={msg.id} className={`message-bubble ${msg.sender}`}>
            {msg.isImage ? (
              <img src={msg.url} alt="Student Work" className="msg-image" />
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
        <button className="attach-btn"><Paperclip size={20} /></button>
        <input
          type="text"
          placeholder="Type your response..."
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSend()}
        />
        <button className="send-btn" onClick={handleSend}><Send size={20} /></button>
      </div>
    </div>
  );
};

export default DoubtChatRoom;
