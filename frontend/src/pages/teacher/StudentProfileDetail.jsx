import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Mail, Phone, MessageSquare, Save, AlertCircle } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar } from 'recharts';
import { useAppData } from '../../context/AppDataContext';
import './StudentProfileDetail.css';

const performanceData = [
  { test: 'Test 1', score: 65, predicted: 68 },
  { test: 'Test 2', score: 72, predicted: 70 },
  { test: 'Test 3', score: 68, predicted: 74 },
  { test: 'Test 4', score: 85, predicted: 78 },
  { test: 'Test 5', score: 82, predicted: 83 },
];

const subjectData = [
  { subject: 'Physics', score: 85, fullMark: 100 },
  { subject: 'Chemistry', score: 72, fullMark: 100 },
  { subject: 'Maths', score: 90, fullMark: 100 },
  { subject: 'Biology', score: 60, fullMark: 100 },
];

const weakTopics = [
  { topic: 'Organic Chemistry: Aldehydes', subject: 'Chemistry', confidence: 'Low' },
  { topic: 'Genetics: Mendelian Inheritance', subject: 'Biology', confidence: 'Medium' },
];

const StudentProfileDetail = () => {
  const { studentId } = useParams();
  const navigate = useNavigate();
  const { students, batches } = useAppData();
  const [notes, setNotes] = useState('Student shows great improvement in calculus but needs to focus more on organic chemistry reaction mechanisms.');
  const [toast, setToast] = useState('');

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  };

  const student = students.find(s => s.id === studentId);
  const batchName = batches.find(b => b.id === student?.batchId)?.name || 'Unassigned';

  if (!student) {
    return <div style={{padding: '40px'}}>Student not found.</div>;
  }

  return (
    <div className="student-profile-detail">
      <div className="profile-header-actions">
        <button className="back-btn" onClick={() => navigate('/teacher/crm')}>
          <ArrowLeft size={20} /> Back to CRM
        </button>
      </div>

      {toast && <div className="toast-notification">{toast}</div>}

      <div className="profile-header-card">
        <div className="profile-info-main">
          <div className="avatar-lg">{student.initials}</div>
          <div className="profile-info">
            <h2>{student.name}</h2>
            <span className="batch-badge">{batchName}</span>
            <span className={`status-dot ${student.status.toLowerCase().replace(' ', '-')}`}></span> <span className="status-text">{student.status}</span>
            <div className="contact-info">
              <span className="contact-item"><Mail size={14} /> {student.email || `${student.name.toLowerCase().replace(/\s+/g, '.')}@edu.com`}</span>
              <span className="contact-item"><Phone size={14} /> {student.phone || '+1 (555) 019-2834'}</span>
            </div>
          </div>
        </div>
        <div className="profile-actions">
          <button className="btn-primary-outline" onClick={() => showToast('Message sent to student.')}><MessageSquare size={18} /> Message Student</button>
        </div>
      </div>

      <div className="analytics-section">
        <div className="chart-card">
          <h2>Performance & Prediction</h2>
          <div className="chart-container">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={performanceData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="test" stroke="#64748b" />
                <YAxis stroke="#64748b" />
                <Tooltip />
                <Line type="monotone" dataKey="score" stroke="var(--color-dashboard-blue)" strokeWidth={2} name="Actual Score" />
                <Line type="monotone" dataKey="predicted" stroke="var(--color-teacher-accent)" strokeDasharray="5 5" strokeWidth={2} name="Predicted" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="side-cards">
          <div className="radar-card">
            <h2>Subject Balance</h2>
            <div className="radar-container">
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart cx="50%" cy="50%" outerRadius="70%" data={subjectData}>
                  <PolarGrid stroke="#e2e8f0" />
                  <PolarAngleAxis dataKey="subject" tick={{ fill: '#64748b', fontSize: 12 }} />
                  <Radar name="Score" dataKey="score" stroke="var(--color-teacher-accent)" fill="var(--color-teacher-accent)" fillOpacity={0.3} />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          </div>
          
          <div className="weak-topics-card">
            <h2><AlertCircle size={18} className="text-warning" /> Weak Topics</h2>
            <ul className="topics-list">
              {weakTopics.map((topic, i) => (
                <li key={i}>
                  <div className="topic-name">{topic.topic}</div>
                  <div className="topic-meta">
                    <span className={`subject-sm ${topic.subject.toLowerCase()}`}>{topic.subject}</span>
                    <span className={`confidence ${topic.confidence.toLowerCase()}`}>{topic.confidence} Confidence</span>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      <div className="teacher-notes-card">
        <div className="notes-header">
          <h2>Private Teacher Notes</h2>
          <button className="btn-save" onClick={() => showToast('Notes saved successfully.')}><Save size={16} /> Save Notes</button>
        </div>
        <p className="notes-hint">These notes are only visible to you and other authorized faculty.</p>
        <textarea 
          className="notes-textarea" 
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Add observations, behavioral notes, or academic flags here..."
        />
      </div>
    </div>
  );
};

export default StudentProfileDetail;

