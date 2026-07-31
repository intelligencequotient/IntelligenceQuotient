import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { apiClient } from '../../api/client';
import './StudentCRM.css';

const PAGE_SIZE = 10;

const initialsOf = (name = '') =>
  name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() || '').join('') || '?';

const relativeTime = (iso) => {
  if (!iso) return 'Never';
  const diff = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(diff)) return 'Never';
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

const batchNameOf = (student) =>
  student.batch_students?.[0]?.batches?.name || 'Unassigned';

const StudentCRM = () => {
  const navigate = useNavigate();

  const [students, setStudents] = useState([]);
  const [batches, setBatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [batchFilter, setBatchFilter] = useState('');
  const [page, setPage] = useState(1);

  useEffect(() => {
    (async () => {
      try {
        setBatches((await apiClient.get('/batches')) || []);
      } catch {
        /* filter is optional */
      }
    })();
  }, []);

  // Debounce the search field
  useEffect(() => {
    const t = setTimeout(() => { setSearch(searchInput); setPage(1); }, 400);
    return () => clearTimeout(t);
  }, [searchInput]);

  const fetchStudents = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (batchFilter) params.set('batchId', batchFilter);
      const qs = params.toString();
      setStudents((await apiClient.get(`/users/students${qs ? `?${qs}` : ''}`)) || []);
    } catch (err) {
      setError(err.message || 'Could not load students.');
      setStudents([]);
    } finally {
      setLoading(false);
    }
  }, [search, batchFilter]);

  useEffect(() => { fetchStudents(); }, [fetchStudents]);

  const totalPages = Math.max(1, Math.ceil(students.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paginated = students.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  return (
    <div className="student-crm">
      <header className="page-header">
        <div>
          <h1>Student CRM</h1>
          <p>Manage your students, track engagement, and monitor overall progress.</p>
        </div>
        <span className="total-count">{loading ? '…' : `${students.length} Students`}</span>
      </header>

      {error && (
        <div className="error-alert" style={{ color: '#dc2626', margin: '12px 0' }}>{error}</div>
      )}

      <div className="crm-controls">
        <div className="search-bar">
          <Search size={20} className="search-icon" />
          <input
            type="text"
            placeholder="Search students by name..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
        </div>
        <div className="filters">
          <select
            className="filter-select"
            value={batchFilter}
            onChange={(e) => { setBatchFilter(e.target.value); setPage(1); }}
          >
            <option value="">All Batches</option>
            {batches.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="table-container">
        <table className="crm-table">
          <thead>
            <tr>
              <th>Student Name</th>
              <th>Email</th>
              <th>Batch</th>
              <th>Last Active</th>
              <th>Tests Taken</th>
              <th>Avg Score</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan="7" style={{ textAlign: 'center', padding: '32px', color: 'var(--text-secondary)' }}>
                  <Loader2 size={18} style={{ verticalAlign: 'middle', marginRight: '8px' }} />
                  Loading students…
                </td>
              </tr>
            )}

            {!loading && paginated.length === 0 && (
              <tr>
                <td colSpan="7" style={{ textAlign: 'center', padding: '32px', color: 'var(--text-secondary)' }}>
                  No students found.
                </td>
              </tr>
            )}

            {!loading && paginated.map((student) => (
              <tr
                key={student.id}
                onClick={() => navigate(`/teacher/student/${student.id}`)}
                style={{ cursor: 'pointer' }}
              >
                <td>
                  <div className="student-name-cell">
                    <div className="student-avatar">{initialsOf(student.full_name)}</div>
                    <span className="s-name">{student.full_name}</span>
                  </div>
                </td>
                <td>{student.email}</td>
                <td><span className="batch-badge">{batchNameOf(student)}</span></td>
                <td>{relativeTime(student.lastActive)}</td>
                <td>{student.testsTaken ?? 0}</td>
                <td>{student.avgPercentage === null || student.avgPercentage === undefined ? '—' : `${student.avgPercentage}%`}</td>
                <td>
                  <span className={`status-dot ${(student.status || 'Active').toLowerCase().replace(' ', '-')}`}></span>
                  {' '}{student.status || 'Active'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="crm-pagination">
          <span className="page-info-crm">
            Page {safePage} of {totalPages} &nbsp;·&nbsp; {students.length} students
          </span>
          <div className="page-btns-crm">
            <button className="page-btn-crm" onClick={() => setPage(1)} disabled={safePage === 1}>«</button>
            <button className="page-btn-crm" onClick={() => setPage((p) => Math.max(p - 1, 1))} disabled={safePage === 1}>
              <ChevronLeft size={16} />
            </button>
            <button className="page-btn-crm" onClick={() => setPage((p) => Math.min(p + 1, totalPages))} disabled={safePage === totalPages}>
              <ChevronRight size={16} />
            </button>
            <button className="page-btn-crm" onClick={() => setPage(totalPages)} disabled={safePage === totalPages}>»</button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default StudentCRM;
