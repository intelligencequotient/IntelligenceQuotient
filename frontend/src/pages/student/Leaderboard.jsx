import React, { useState, useEffect, useCallback } from 'react';
import { Trophy, Medal, Award, Search, ChevronLeft, ChevronRight } from 'lucide-react';
import { apiClient, getStoredUser } from '../../api/client';
import './Leaderboard.css';

const PAGE_SIZE = 20;

/**
 * National leaderboard.
 *
 * Previously this sorted `students` from AppDataContext by a `score` field that
 * does not exist — and for a student that array is never even populated, so the
 * table was always empty. It now calls /leaderboard, which aggregates every
 * submitted attempt server-side and is cached.
 */
const Leaderboard = () => {
  const me = getStoredUser() || {};

  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [myRank, setMyRank] = useState(null);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [board, mine] = await Promise.allSettled([
        apiClient.get(`/leaderboard?page=${page}&limit=${PAGE_SIZE}`),
        apiClient.get('/leaderboard/me'),
      ]);

      if (board.status === 'fulfilled') {
        setRows(board.value?.data || []);
        setTotal(board.value?.total || 0);
      } else {
        setError(board.reason?.message || 'Could not load the leaderboard.');
      }

      if (mine.status === 'fulfilled') setMyRank(mine.value);
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => { load(); }, [load]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // Search filters the current page — the ranking itself stays server-authoritative.
  const visible = search.trim()
    ? rows.filter((r) => r.name.toLowerCase().includes(search.toLowerCase()))
    : rows;

  const rankIcon = (rank) => {
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
          <p>Ranked by total score across every submitted test.</p>
        </div>
        <div className="leaderboard-hero-icon">
          <Trophy size={64} color="var(--color-dashboard-blue)" opacity={0.2} />
        </div>
      </div>

      {myRank?.rank && (
        <div className="lb-mycard glass animate-slide-up">
          <div>
            <span className="lb-mycard-label">Your Rank</span>
            <span className="lb-mycard-rank">#{myRank.rank}</span>
            <span className="lb-muted lb-small"> of {myRank.totalStudents}</span>
          </div>
          <div className="lb-mycard-score">
            <span className="lb-mycard-label">Total Score</span>
            <strong>{myRank.totalScore ?? 0}</strong>
          </div>
        </div>
      )}

      <div className="leaderboard-content animate-slide-up" style={{ animationDelay: '0.1s' }}>
        <div className="leaderboard-main glass">
          <div className="leaderboard-controls">
            <div className="search-bar-lb">
              <Search size={16} />
              <input
                type="text"
                placeholder="Search this page…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <span className="showing-count">
              {total} student{total === 1 ? '' : 's'} ranked
            </span>
          </div>

          {loading ? (
            <p className="lb-muted lb-pad">Loading rankings…</p>
          ) : error ? (
            <p className="lb-error lb-pad">{error}</p>
          ) : visible.length === 0 ? (
            <div className="lb-empty">
              <Trophy size={36} />
              <p>
                {total === 0
                  ? 'No results yet — rankings appear once tests are submitted.'
                  : 'No one on this page matches that search.'}
              </p>
            </div>
          ) : (
            <div className="lb-table-wrap">
              <table className="leaderboard-table">
                <thead>
                  <tr>
                    <th>Rank</th><th>Student</th><th>Tests</th><th>Best</th><th>Total Score</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((row) => (
                    <tr key={row.id} className={row.id === me.id ? 'lb-me' : ''}>
                      <td className="lb-rank-cell">{rankIcon(row.rank)}</td>
                      <td>
                        <span className="lb-name">{row.name}</span>
                        {row.id === me.id && <span className="lb-you">You</span>}
                      </td>
                      <td className="lb-muted">{row.testCount}</td>
                      <td className="lb-muted">{row.bestScore}</td>
                      <td><strong>{row.totalScore}</strong></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {totalPages > 1 && (
            <div className="lb-pager">
              <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                <ChevronLeft size={16} /> Previous
              </button>
              <span className="lb-muted lb-small">Page {page} of {totalPages}</span>
              <button disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
                Next <ChevronRight size={16} />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Leaderboard;
