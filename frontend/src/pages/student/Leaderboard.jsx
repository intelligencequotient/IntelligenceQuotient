import React, { useState, useEffect, useMemo } from 'react';
import { Trophy, Medal, Award, Search, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { apiClient } from '../../api/client';
import './Leaderboard.css';

const PAGE_SIZE = 10;

const initialsOf = (name = '') =>
  name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() || '').join('') || '?';

const currentUserId = () => {
  try {
    return JSON.parse(localStorage.getItem('user') || '{}').id || null;
  } catch {
    return null;
  }
};

const Leaderboard = () => {
  const [rows, setRows] = useState([]);
  const [me, setMe] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const myId = useMemo(currentUserId, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError('');
      try {
        // The board is small enough to rank client-side; the server already
        // returns it pre-sorted with ranks assigned.
        const [board, mine] = await Promise.allSettled([
          apiClient.get('/leaderboard?page=1&limit=200'),
          apiClient.get('/leaderboard/me'),
        ]);

        if (cancelled) return;

        if (board.status === 'fulfilled') {
          setRows(board.value?.data || []);
        } else {
          setError(board.reason?.message || 'Could not load the leaderboard.');
        }
        if (mine.status === 'fulfilled') setMe(mine.value);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const filtered = useMemo(() => {
    if (!search.trim()) return rows;
    const q = search.toLowerCase();
    return rows.filter((s) => (s.name || '').toLowerCase().includes(q));
  }, [rows, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paginated = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

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
          <p>See where you stand among students across the platform.</p>
        </div>
        <div className="leaderboard-hero-icon">
          <Trophy size={64} color="var(--color-dashboard-blue)" opacity={0.2} />
        </div>
      </div>

      {error && (
        <div className="error-alert" style={{ color: '#dc2626', margin: '12px 0' }}>{error}</div>
      )}

      <div className="leaderboard-content animate-slide-up" style={{ animationDelay: '0.1s' }}>
        <div className="leaderboard-main glass">
          <div className="leaderboard-controls">
            <div className="search-bar-lb">
              <Search size={16} />
              <input
                type="text"
                placeholder="Search students..."
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              />
            </div>
            <span className="showing-count">
              {loading ? 'Loading…' : `Showing ${filtered.length} students`}
            </span>
          </div>

          <div className="table-header">
            <h2 className="table-card-title">All India Rankings</h2>
          </div>

          <div className="table-responsive">
            <table className="leaderboard-table">
              <thead>
                <tr>
                  <th>Rank</th>
                  <th>Student</th>
                  <th>Total Score</th>
                  <th>Tests Taken</th>
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr>
                    <td colSpan="4" style={{ textAlign: 'center', padding: '32px', color: 'var(--text-secondary)' }}>
                      <Loader2 size={18} style={{ verticalAlign: 'middle', marginRight: '8px' }} />
                      Loading rankings…
                    </td>
                  </tr>
                )}

                {!loading && paginated.length === 0 && (
                  <tr>
                    <td colSpan="4" style={{ textAlign: 'center', padding: '32px', color: 'var(--text-secondary)' }}>
                      No ranked students yet — rankings appear once tests have been submitted.
                    </td>
                  </tr>
                )}

                {!loading && paginated.map((student) => {
                  const isMe = !!myId && student.id === myId;
                  return (
                    <tr key={student.id || student.rank} className={isMe ? 'current-user-row' : ''}>
                      <td className="rank-cell">{renderRankIcon(student.rank)}</td>
                      <td>
                        <div className="student-cell">
                          <div className={`student-avatar ${isMe ? 'avatar-active' : ''}`}>
                            {initialsOf(student.name)}
                          </div>
                          <span className="student-name">
                            {student.name} {isMe && <span className="you-badge">You</span>}
                          </span>
                        </div>
                      </td>
                      <td className="score-cell">{student.totalScore}</td>
                      <td>{student.testCount}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="pagination-controls">
            <span className="page-info">Page {safePage} of {totalPages}</span>
            <div className="page-btns">
              <button className="page-btn" onClick={() => setPage(1)} disabled={safePage === 1}>«</button>
              <button className="page-btn" onClick={() => setPage((p) => Math.max(p - 1, 1))} disabled={safePage === 1}>
                <ChevronLeft size={16} />
              </button>
              <button className="page-btn" onClick={() => setPage((p) => Math.min(p + 1, totalPages))} disabled={safePage === totalPages}>
                <ChevronRight size={16} />
              </button>
              <button className="page-btn" onClick={() => setPage(totalPages)} disabled={safePage === totalPages}>»</button>
            </div>
          </div>
        </div>

        {/* Your standing, pulled from /leaderboard/me */}
        <div className="leaderboard-filter glass animate-slide-up" style={{ animationDelay: '0.2s' }}>
          <div className="filter-title">Your Standing</div>
          {!me?.rank ? (
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
              Submit a test to appear on the leaderboard.
            </p>
          ) : (
            <>
              <div style={{ margin: '12px 0 18px' }}>
                <div style={{ fontSize: '2rem', fontWeight: 700, lineHeight: 1 }}>#{me.rank}</div>
                <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                  of {me.totalStudents?.toLocaleString() || '—'} students
                </div>
              </div>
              <div className="filter-options">
                {(me.neighbors || []).map((n) => (
                  <div
                    key={n.id}
                    className={`filter-label ${n.isMe ? 'active' : ''}`}
                    style={{ display: 'flex', justifyContent: 'space-between', gap: '10px' }}
                  >
                    <span className="filter-text">#{n.rank} {n.name}</span>
                    <strong>{n.totalScore}</strong>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default Leaderboard;
