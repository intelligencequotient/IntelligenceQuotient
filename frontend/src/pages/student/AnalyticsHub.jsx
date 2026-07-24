import React from 'react';
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer, ReferenceLine,
  Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  BarChart, Bar, Cell
} from 'recharts';
import { AlertTriangle, ArrowRight, TrendingUp } from 'lucide-react';
import { useState } from 'react';
import './AnalyticsHub.css';

const AnalyticsHub = () => {
  const [toast, setToast] = useState('');

  const trajectoryData = [
    { date: 'Sep', actual: 65, predicted: 65 },
    { date: 'Oct', actual: 72, predicted: 75 },
    { date: 'Nov', actual: 80, predicted: 82 },
    { date: 'Dec', actual: 85, predicted: 88 },
    { date: 'Jan', actual: null, predicted: 92 },
    { date: 'Feb', actual: null, predicted: 95 },
  ];

  const radarData = [
    { subject: 'Physics', score: 85, fullMark: 100 },
    { subject: 'Math', score: 92, fullMark: 100 },
    { subject: 'Biology', score: 75, fullMark: 100 },
    { subject: 'Chemistry', score: 88, fullMark: 100 },
    { subject: 'English', score: 78, fullMark: 100 },
  ];

  const weakTopics = [
    { name: 'Circular Motion', subject: 'Physics', accuracy: '42%', color: 'var(--color-physics-red)' },
    { name: 'Integration', subject: 'Mathematics', accuracy: '51%', color: 'var(--color-math-teal)' },
    { name: 'Organic Rxns', subject: 'Chemistry', accuracy: '58%', color: 'var(--color-chemistry-orange)' },
  ];

  const topicAccuracyData = [
    { topic: 'Kinematics', accuracy: 85 },
    { topic: 'Thermodynamics', accuracy: 72 },
    { topic: 'Calculus', accuracy: 94 },
    { topic: 'Genetics', accuracy: 68 },
  ];

  return (
    <div className="analytics-container animate-fade-in">
      {toast && <div className="toast-notification">{toast}</div>}

      <div className="analytics-header animate-slide-up">
        <h1>Analytics Hub <TrendingUp size={28} style={{color: 'var(--color-dashboard-blue)', marginLeft: '8px', verticalAlign: 'middle'}}/></h1>
        <p>Deep dive into your performance metrics and AI-driven insights.</p>
      </div>

      {/* Line Chart */}
      <div className="analytics-card glass animate-slide-up" style={{ animationDelay: '0.1s' }}>
        <div className="analytics-title">Predicted Score Trajectory</div>
        <div className="chart-container">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={trajectoryData} margin={{ top: 20, right: 30, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border-color)" />
              <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{fill: 'var(--text-secondary)'}} dy={10} />
              <YAxis axisLine={false} tickLine={false} domain={[0, 100]} tick={{fill: 'var(--text-secondary)'}} dx={-10} />
              <RechartsTooltip
                contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: 'var(--shadow-lg)' }}
                itemStyle={{ fontWeight: 600 }}
              />
              <Legend verticalAlign="top" height={36} iconType="circle" />
              <ReferenceLine x="Jan" stroke="var(--color-physics-red)" strokeDasharray="3 3" label={{ position: 'top', value: 'Today', fill: 'var(--color-physics-red)', fontSize: 12, fontWeight: 600 }} />
              <Line type="monotone" dataKey="actual" name="Actual Score" stroke="var(--color-dashboard-blue)" strokeWidth={4} dot={{ r: 6, strokeWidth: 2 }} activeDot={{ r: 8 }} />
              <Line type="monotone" dataKey="predicted" name="AI Predicted" stroke="var(--text-secondary)" strokeWidth={2} strokeDasharray="5 5" dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="analytics-grid-2">
        {/* Radar Chart */}
        <div className="analytics-card glass animate-slide-up" style={{ animationDelay: '0.2s' }}>
          <div className="analytics-title">Subject-wise Strength</div>
          <div className="radar-container">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart cx="50%" cy="50%" outerRadius="70%" data={radarData}>
                <PolarGrid stroke="var(--border-color)" />
                <PolarAngleAxis dataKey="subject" tick={{fill: 'var(--text-primary)', fontWeight: 600, fontSize: 13}} />
                <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} axisLine={false} />
                <Radar name="Student" dataKey="score" stroke="var(--color-dashboard-blue)" strokeWidth={2} fill="var(--color-dashboard-blue)" fillOpacity={0.4} />
                <RechartsTooltip />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Weak Topics */}
        <div className="analytics-card glass animate-slide-up" style={{ animationDelay: '0.3s' }}>
          <div className="analytics-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>Weak Topics</span>
            <span className="alert-badge">3 Alerts</span>
          </div>
          <div className="weak-topics-list">
            {weakTopics.map((topic, idx) => (
              <div key={idx} className="weak-topic-card">
                <div className="weak-topic-info">
                  <div className="weak-topic-icon-wrapper" style={{ backgroundColor: `${topic.color}18`, color: topic.color }}>
                    <AlertTriangle size={20} />
                  </div>
                  <div className="weak-topic-text">
                    <h4>{topic.name}</h4>
                    <p>{topic.subject} • <strong>{topic.accuracy}</strong> Accuracy</p>
                  </div>
                </div>
                <button
                  className="btn-icon-circle"
                  onClick={() => {
                    setToast(`Generating practice set for ${topic.name}...`);
                    setTimeout(() => setToast(''), 3000);
                  }}
                  title="Practice Now"
                >
                  <ArrowRight size={18} />
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Bar Chart */}
      <div className="analytics-card glass animate-slide-up" style={{ animationDelay: '0.4s' }}>
        <div className="analytics-title">Topic-wise Accuracy Overview</div>
        <div className="topic-accuracy-container">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart layout="vertical" data={topicAccuracyData} margin={{ top: 5, right: 30, left: 50, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="var(--border-color)" />
              <XAxis type="number" domain={[0, 100]} tick={{fill: 'var(--text-secondary)'}} />
              <YAxis dataKey="topic" type="category" axisLine={false} tickLine={false} tick={{fill: 'var(--text-primary)', fontWeight: 500}} />
              <RechartsTooltip
                cursor={{fill: 'var(--border-color)', opacity: 0.4}}
                contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: 'var(--shadow-lg)' }}
              />
              <Bar dataKey="accuracy" radius={[0, 8, 8, 0]} barSize={24}>
                {topicAccuracyData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.accuracy > 80 ? 'var(--color-biology-green)' : entry.accuracy > 70 ? 'var(--color-dashboard-blue)' : 'var(--color-physics-red)'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};

export default AnalyticsHub;
