import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, ChevronLeft, ChevronRight, Users as UsersIcon } from 'lucide-react';
import { apiClient } from '../../api/client';
import './StudentCRM.css';

const PAGE_SIZE = 15;

/** "3 days ago" style formatting from a real timestamp. */
const relativeTime = (iso) => {
  if (!iso) return 'Never';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins} min${mins === 1 ? '' : 's'} ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} day${days === 1 ? '' : 's'} ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks} week${weeks === 1 ? '' : 's'} ago`;
  return new Date(iso).toLocaleDateString();
};

/**
 * Student CRM.
 *
 * "Last Active" was previously derived from `student.id.charCodeAt(0) % 7`, and
 * tests-taken / avg-score read fields that never existed. All three now come
 * from the API, aggregated from real attempts.
 */
const StudentCRM = () => {
  const navigate = useNavigate();

  const [students, setStudents] = useState([]);
  const [batches, setBatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [batchId, setBatchId] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);

  // Debounce so typing doesn't fire a request per keystroke.
  const debounceRef = useRef(null);
  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
    }, 350);
    return () => clearTimeout(debounceRef.current);
  }, [searchInput]);

  useEffect(() => {
    apiClient.get('/batches').then((b) => setBatches(b || [])).catch(() => setBatches([]));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (batchId) params.set('batchId', batchId);
      setStudents(await apiClient.get(`/users/students?${params}`) || []);
    } catch (e) {
      setError(e.message || 'Could not load students.');
      setStudents([]);
    } finally {
      setLoading(false);
    }
  }, [search, batchId]);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(
    () => (statusFilter ? students.filter((s) => s.status === statusFilter) : students),
    [students, statusFilter],
  );

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div className="student-crm">
      <header className="page-header">
        <div>
          <h1>Student CRM</h1>
          <p>Manage your students, track engagement, and monitor overall progress.</p>
        </div>
        <span className="total-count">{filtered.length} Students</span>
      </header>

      <div className="crm-controls">
        <div className="search-bar">
          <Search size={20} className="search-icon" />
          <input
            type="text"
            placeholder="Search students by name…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
        </div>
        <div className="filters">
          <select
            className="crm-select"
            value={batchId}
            onChange={(e) => { setBatchId(e.target.value); setPage(1); }}
          >
            <option value="">All batches</option>
            {batches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
          <select
            className="crm-select"
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          >
            <option value="">All statuses</option>
            <option value="Active">Active</option>
            <option value="At Risk">At Risk</option>
          </select>
        </div>
      </div>

      {error && <p className="crm-error">{error}</p>}

      <div className="table-container">
        <table className="crm-table">
          <thead>
            <tr>
              <th>Student Name</th>
              <th>Batch</th>
              <th>Last Active</th>
              <th>Tests Taken</th>
              <th>Avg Score</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan="6" className="crm-state">Loading students…</td></tr>
            )}

            {!loading && paginated.length === 0 && (
              <tr>
                <td colSpan="6" className="crm-state">
                  <UsersIcon size={28} />
                  <p>No students match these filters.</p>
                </td>
              </tr>
            )}

            {!loading && paginated.map((student) => {
              const name = student.full_name || 'Unknown Student';
              const initials = name.split(' ').map((n) => n[0]).join('').substring(0, 2).toUpperCase();
              const batchName = student.batch_students?.[0]?.batches?.name || 'Unassigned';

              return (
                <tr
                  key={student.id}
                  onClick={() => navigate(`/teacher/student/${student.id}`)}
                  style={{ cursor: 'pointer' }}
                >
                  <td>
                    <div className="student-name-cell">
                      <div className="student-avatar">{initials}</div>
                      <div>
                        <span className="s-name">{name}</span>
                        <span className="crm-muted crm-small crm-email">{student.email}</span>
                      </div>
                    </div>
                  </td>
                  <td><span className="batch-badge">{batchName}</span></td>
                  <td className="crm-muted">{relativeTime(student.lastActiveAt)}</td>
                  <td>{student.testsTaken ?? 0}</td>
                  <td>
                    {student.avgScorePercent == null ? (
                      <span className="crm-muted">—</span>
                    ) : (
                      <span className={`crm-pill ${student.avgScorePercent >= 75 ? 'good' : student.avgScorePercent >= 40 ? 'mid' : 'bad'}`}>
                        {student.avgScorePercent}%
                      </span>
                    )}
                  </td>
                  <td>
                    <span className={`status-dot ${(student.status || 'Active').toLowerCase().replace(' ', '-')}`} />
                    {student.status || 'Active'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {totalPages > 1 && (
          <div className="crm-pagination">
            <span className="page-info-crm">
              Page {page} of {totalPages} &nbsp;·&nbsp; {filtered.length} students
            </span>
            <div className="page-btns-crm">
              <button className="page-btn-crm" onClick={() => setPage((p) => Math.max(p - 1, 1))} disabled={page === 1}>
                <ChevronLeft size={16} />
              </button>
              <button className="page-btn-crm" onClick={() => setPage((p) => Math.min(p + 1, totalPages))} disabled={page === totalPages}>
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default StudentCRM;
