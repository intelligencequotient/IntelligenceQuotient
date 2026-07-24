import React from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle, XCircle, MinusCircle, Trophy, Clock, Target, ArrowLeft, RotateCcw } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { useAppData } from '../../context/AppDataContext';
import './PostTestResult.css';

const PostTestResult = () => {
  const navigate = useNavigate();
  const { testResults, tests } = useAppData();

  if (!testResults) {
    return <div style={{padding: '40px', textAlign: 'center'}}>No results found. Go take a test first!</div>;
  }

  const test = tests.find(t => t.id === testResults.testId) || {};

  const PLACEHOLDER_RANK = 38;
  const PLACEHOLDER_TOTAL_STUDENTS = 1240;
  const PLACEHOLDER_PERCENTILE = 96.9;

  const MOCK_RESULTS = {
    testName: test.title || 'Assessment',
    score: testResults.score,
    totalMarks: testResults.maxScore,
    rank: PLACEHOLDER_RANK,
    totalStudents: PLACEHOLDER_TOTAL_STUDENTS,
    percentile: PLACEHOLDER_PERCENTILE,
    timeTaken: `${Math.floor(testResults.timeTaken / 60)}m ${testResults.timeTaken % 60}s`,
    avgTimePerQ: `${Math.floor(testResults.timeTaken / (testResults.correct + testResults.incorrect || 1))}s`,
    correct: testResults.correct,
    incorrect: testResults.incorrect,
    unattempted: testResults.unattempted,
    subjectWise: [
      { subject: 'Mixed', correct: testResults.correct, incorrect: testResults.incorrect, unattempted: testResults.unattempted, accuracy: testResults.accuracy },
    ],
    chartData: [
      { subject: 'Mixed', Correct: testResults.correct, Incorrect: testResults.incorrect, Unattempted: testResults.unattempted },
    ],
    answers: []
  };

  // The pass threshold is arbitrarily set to 60 for this demo.
  const pass = MOCK_RESULTS.score >= 60;

  return (
    <div className="result-page">
      {/* Hero Score Card */}
      <div className="result-hero">
        <div className="hero-left">
          <div className={`score-circle ${pass ? 'pass' : 'fail'}`}>
            <span className="score-num">{MOCK_RESULTS.score}</span>
            <span className="score-denom">/ {MOCK_RESULTS.totalMarks}</span>
          </div>
          <div className="hero-info">
            <h1>{MOCK_RESULTS.testName}</h1>
            <span className={`pass-badge ${pass ? 'badge-pass' : 'badge-fail'}`}>
              {pass ? '✓ PASSED' : '✗ FAILED'}
            </span>
            <p className="percentile-text">Top <strong>{100 - MOCK_RESULTS.percentile}%</strong> — You scored better than <strong>{MOCK_RESULTS.percentile}%</strong> of all students</p>
          </div>
        </div>
        <div className="hero-stats">
          <div className="hero-stat">
            <Trophy size={22} className="stat-icon trophy" />
            <div><span className="stat-label">Rank</span><strong>#{MOCK_RESULTS.rank} / {MOCK_RESULTS.totalStudents.toLocaleString()}</strong></div>
          </div>
          <div className="hero-stat">
            <Clock size={22} className="stat-icon clock" />
            <div><span className="stat-label">Time Taken</span><strong>{MOCK_RESULTS.timeTaken}</strong></div>
          </div>
          <div className="hero-stat">
            <Target size={22} className="stat-icon target" />
            <div><span className="stat-label">Avg / Question</span><strong>{MOCK_RESULTS.avgTimePerQ}</strong></div>
          </div>
        </div>
      </div>

      {/* Summary Strip */}
      <div className="summary-strip">
        <div className="strip-item correct-strip">
          <CheckCircle size={22} />
          <div><strong>{MOCK_RESULTS.correct}</strong><span>Correct</span></div>
        </div>
        <div className="strip-item incorrect-strip">
          <XCircle size={22} />
          <div><strong>{MOCK_RESULTS.incorrect}</strong><span>Incorrect</span></div>
        </div>
        <div className="strip-item unattempted-strip">
          <MinusCircle size={22} />
          <div><strong>{MOCK_RESULTS.unattempted}</strong><span>Unattempted</span></div>
        </div>
      </div>

      <div className="result-grid">
        {/* Subject-wise Cards */}
        <div className="subject-cards-section">
          <h2>Subject-wise Performance</h2>
          <div className="subject-cards">
            {MOCK_RESULTS.subjectWise.map(s => (
              <div key={s.subject} className="subj-card">
                <div className="subj-header">
                  <h3>{s.subject}</h3>
                  <span className={`acc-badge ${s.accuracy >= 75 ? 'acc-good' : s.accuracy >= 50 ? 'acc-mid' : 'acc-bad'}`}>
                    {s.accuracy}% Accuracy
                  </span>
                </div>
                <div className="accuracy-bar-wrap">
                  <div className="accuracy-bar" style={{ width: `${s.accuracy}%` }}></div>
                </div>
                <div className="subj-breakdown">
                  <span className="correct-text">✓ {s.correct} Correct</span>
                  <span className="incorrect-text">✗ {s.incorrect} Wrong</span>
                  <span className="unatt-text">— {s.unattempted} Skipped</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Bar Chart */}
        <div className="chart-card">
          <h2>Score Breakdown by Subject</h2>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={MOCK_RESULTS.chartData} margin={{ top: 5, right: 20, left: -10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="subject" axisLine={false} tickLine={false} />
              <YAxis axisLine={false} tickLine={false} />
              <Tooltip />
              <Legend />
              <Bar dataKey="Correct" fill="#22c55e" radius={[4, 4, 0, 0]} />
              <Bar dataKey="Incorrect" fill="#ef4444" radius={[4, 4, 0, 0]} />
              <Bar dataKey="Unattempted" fill="#94a3b8" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Answer Review Table */}
      <div className="answer-review-card">
        <h2>Answer Review</h2>
        <div className="table-responsive">
          <table className="answer-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Question</th>
                <th>Subject</th>
                <th>Your Answer</th>
                <th>Correct Answer</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {MOCK_RESULTS.answers.map(a => (
                <tr key={a.id} className={`row-${a.status}`}>
                  <td>{a.id}</td>
                  <td className="q-review-text">{a.question}</td>
                  <td><span className="subj-pill">{a.subject}</span></td>
                  <td className={a.status === 'incorrect' ? 'wrong-ans' : ''}>{a.yourAnswer}</td>
                  <td className="correct-ans">{a.correct}</td>
                  <td>
                    {a.status === 'correct' && <span className="status-icon correct"><CheckCircle size={18} /></span>}
                    {a.status === 'incorrect' && <span className="status-icon incorrect"><XCircle size={18} /></span>}
                    {a.status === 'unattempted' && <span className="status-icon unattempted"><MinusCircle size={18} /></span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="result-actions">
        <button className="btn-back" onClick={() => navigate('/student')}>
          <ArrowLeft size={16} /> Back to Dashboard
        </button>
        <button className="btn-retake" onClick={() => navigate(`/student/locked/test/${testResults?.testId || 1}`)}>
          <RotateCcw size={16} /> Retake Test
        </button>
      </div>
    </div>
  );
};

export default PostTestResult;