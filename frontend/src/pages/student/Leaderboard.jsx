import React, { useState, useMemo } from 'react';
import { Trophy, Medal, Award, Search, ChevronLeft, ChevronRight } from 'lucide-react';
import { useAppData } from '../../context/AppDataContext';
import './Leaderboard.css';

const PAGE_SIZE = 10;
const subjects = ['PCMB', 'Physics', 'Chemistry', 'Mathematics', 'Biology'];

const Leaderboard = () => {
  const { students } = useAppData();
  const [selectedSubject, setSelectedSubject] = useState('PCMB');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    // Sort students by score descending for the leaderboard
    const sorted = [...students].sort((a, b) => b.score - a.score).map((s, idx) => ({ ...s, rank: idx + 1 }));
    if (!search.trim()) return sorted;
    return sorted.filter(s => s.name.toLowerCase().includes(search.toLowerCase()));
  }, [search, students]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const renderRankIcon = (rank) => {
    if (rank === 1) return <Trophy size={20} color="#fbbf24" fill="#fef3c7" />;
    if (rank === 2) return <Medal size={20} color="#94a3b8" fill="#f1f5f9" />;
    if (rank === 3) return <Award size={20} color="#b45309" fill="#fef3c7" />;
    return <span className="rank-number">#{rank}</span>;
  };

  return (
    <div className="leaderboard-container animate-fade-in">
      <div className="leaderboard-hero animate-slide-up">
        <div className="leaderboard-hero-content">
          <h1>National Leaderboard</h1>
          <p>See where you stand among top students across the country.</p>
        </div>
        <div className="leaderboard-hero-icon">
          <Trophy size={64} color="var(--color-dashboard-blue)" opacity={0.2} />
        </div>
      </div>

      <div className="leaderboard-content animate-slide-up" style={{ animationDelay: '0.1s' }}>
        <div className="leaderboard-main glass">
          {/* Controls */}
          <div className="leaderboard-controls">
            <div className="search-bar-lb">
              <Search size={16} />
              <input
                type="text"
                placeholder="Search students..."
                value={search}
                onChange={e => { setSearch(e.target.value); setPage(1); }}
              />
            </div>
            <span className="showing-count">Showing {filtered.length} students</span>
          </div>

          <div className="table-header">
            <h2 className="table-card-title">All India - {selectedSubject} Rankings</h2>
          </div>

          <div className="table-responsive">
            <table className="leaderboard-table">
              <thead>
                <tr>
                  <th>Rank</th>
                  <th>Student</th>
                  <th>Score</th>
                  <th>Practices</th>
                  <th>Tests</th>
                  <th>Accuracy</th>
                  <th>Speed</th>
                </tr>
              </thead>
              <tbody>
                {paginated.map((student) => (
                  <tr key={student.rank} className={student.isCurrentUser ? 'current-user-row' : ''}>
                    <td className="rank-cell">
                      {renderRankIcon(student.rank)}
                    </td>
                    <td>
                      <div className="student-cell">
                        <div className={`student-avatar ${student.isCurrentUser ? 'avatar-active' : ''}`}>
                          {student.initials}
                        </div>
                        <span className="student-name">
                          {student.name} {student.isCurrentUser && <span className="you-badge">You</span>}
                        </span>
                      </div>
                    </td>
                    <td className="score-cell">{student.score}</td>
                    <td>{student.practices}</td>
                    <td>{student.tests}</td>
                    <td className="accuracy-cell">{student.accuracy}%</td>
                    <td>{student.speed}s</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="pagination-controls">
            <span className="page-info">Page {page} of {totalPages}</span>
            <div className="page-btns">
              <button className="page-btn" onClick={() => setPage(1)} disabled={page === 1}>«</button>
              <button className="page-btn" onClick={() => setPage(p => Math.max(p - 1, 1))} disabled={page === 1}>
                <ChevronLeft size={16} />
              </button>
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                const p = Math.max(1, Math.min(page - 2, totalPages - 4)) + i;
                return (
                  <button key={p} className={`page-btn ${page === p ? 'active-page' : ''}`} onClick={() => setPage(p)}>
                    {p}
                  </button>
                );
              })}
              <button className="page-btn" onClick={() => setPage(p => Math.min(p + 1, totalPages))} disabled={page === totalPages}>
                <ChevronRight size={16} />
              </button>
              <button className="page-btn" onClick={() => setPage(totalPages)} disabled={page === totalPages}>»</button>
            </div>
          </div>
        </div>

        <div className="leaderboard-filter glass animate-slide-up" style={{ animationDelay: '0.2s' }}>
          <div className="filter-title">Subject Filters</div>
          <div className="filter-options">
            {subjects.map(subject => (
              <label key={subject} className={`filter-label ${selectedSubject === subject ? 'active' : ''}`}>
                <input
                  type="radio"
                  name="subject"
                  value={subject}
                  checked={selectedSubject === subject}
                  onChange={(e) => setSelectedSubject(e.target.value)}
                  className="hidden-radio"
                />
                <span className="filter-text">{subject}</span>
              </label>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Leaderboard;