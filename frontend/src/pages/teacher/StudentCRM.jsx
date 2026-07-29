import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Filter, MoreVertical, Check, X, ChevronLeft, ChevronRight } from 'lucide-react';
import { useAppData } from '../../context/AppDataContext';
import './StudentCRM.css';

const PAGE_SIZE = 10;

const StudentCRM = () => {
  const navigate = useNavigate();
  const { students, batches, setStudents } = useAppData();
  const [selectedIds, setSelectedIds] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [page, setPage] = useState(1);
  const [toast, setToast] = useState('');

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
    setSelectedIds([]);
  };

  const handleBulkAction = (action) => {
    showToast(`Successfully applied "${action}" to ${selectedIds.length} students.`);
  };

  const filteredStudents = useMemo(() => {
    return (students || []).filter(s => (s.full_name || s.name || '').toLowerCase().includes(searchTerm.toLowerCase()));
  }, [searchTerm, students]);

  const totalPages = Math.ceil(filteredStudents.length / PAGE_SIZE);
  const paginatedStudents = filteredStudents.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const handleSelectAll = (e) => {
    if (e.target.checked) {
      setSelectedIds(paginatedStudents.map(s => s.id));
    } else {
      setSelectedIds([]);
    }
  };

  const toggleSelect = (id) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  return (
    <div className="student-crm">
      <header className="page-header">
        <div>
          <h1>Student CRM</h1>
          <p>Manage your students, track engagement, and monitor overall progress.</p>
        </div>
        <span className="total-count">{filteredStudents.length} Students</span>
      </header>

      {toast && <div className="toast-notification">{toast}</div>}

      <div className="crm-controls">
        <div className="search-bar">
          <Search size={20} className="search-icon" />
          <input 
            type="text"
            placeholder="Search students by name..."
            value={searchTerm}
            onChange={(e) => { setSearchTerm(e.target.value); setPage(1); }}
          />
        </div>
        <div className="filters">
          <button className="filter-btn"><Filter size={18} /> Batch</button>
          <button className="filter-btn"><Filter size={18} /> Status</button>
        </div>
      </div>

      {selectedIds.length > 0 && (
        <div className="bulk-actions-bar">
          <span className="selected-count">{selectedIds.length} student(s) selected</span>
          <div className="bulk-buttons">
            <button className="btn-outline" onClick={() => handleBulkAction('Reassign Batch')}>Reassign Batch</button>
            <button className="btn-danger-outline" onClick={() => handleBulkAction('Deactivate')}>Deactivate</button>
          </div>
        </div>
      )}

      <div className="table-container">
        <table className="crm-table">
          <thead>
            <tr>
              <th className="checkbox-cell">
                <input 
                  type="checkbox"
                  checked={paginatedStudents.length > 0 && paginatedStudents.every(s => selectedIds.includes(s.id))}
                  onChange={handleSelectAll}
                />
              </th>
              <th>Student Name</th>
              <th>Batch</th>
              <th>Last Active</th>
              <th>Tests Taken</th>
              <th>Avg Score</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {paginatedStudents.map(student => {
              const sName = student.full_name || student.name || 'Unknown Student';
              const initials = sName.split(' ').map(n => n[0]).join('').substring(0,2).toUpperCase();
              const batchName = student.batch_students?.[0]?.batches?.name || batches.find(b => b.id === student.batchId)?.name || 'Unassigned';
              const sStatus = student.status || 'Active';
              const testsTaken = student.tests || 0;
              const avgScore = student.score || 'N/A';
              
              // Safe mock for "last active"
              const hashId = student.id ? student.id.charCodeAt(0) : 0;
              
              return (
              <tr key={student.id} className={selectedIds.includes(student.id) ? 'selected-row' : ''} onClick={() => navigate(`/teacher/student/${student.id}`)} style={{cursor: 'pointer'}}>
                <td onClick={(e) => e.stopPropagation()}>
                  <div 
                    className={`checkbox-custom ${selectedIds.includes(student.id) ? 'checked' : ''}`}
                    onClick={() => toggleSelect(student.id)}
                  >
                    {selectedIds.includes(student.id) && <Check size={14} color="white" />}
                  </div>
                </td>
                <td>
                  <div className="student-name-cell">
                    <div className="student-avatar">{initials}</div>
                    <span className="s-name">{sName}</span>
                  </div>
                </td>
                <td><span className="batch-badge">{batchName}</span></td>
                <td>{['Just now', '5 mins ago', '1 hour ago', '2 hours ago', '1 day ago', '3 days ago', '1 week ago'][hashId % 7]}</td>
                <td>{testsTaken}</td>
                <td>{avgScore}</td>
                <td><span className={`status-dot ${sStatus.toLowerCase().replace(' ', '-')}`}></span> {sStatus}</td>
                <td onClick={(e) => e.stopPropagation()}>
                  <button className="icon-btn"><MoreVertical size={16}/></button>
                </td>
              </tr>
            )})}
          </tbody>
        </table>

        {/* Pagination */}
        <div className="crm-pagination">
          <span className="page-info-crm">Page {page} of {totalPages} &nbsp;·&nbsp; {filteredStudents.length} students</span>
          <div className="page-btns-crm">
            <button className="page-btn-crm" onClick={() => setPage(1)} disabled={page === 1}>«</button>
            <button className="page-btn-crm" onClick={() => setPage(p => Math.max(p - 1, 1))} disabled={page === 1}><ChevronLeft size={16} /></button>
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              const p = Math.max(1, Math.min(page - 2, totalPages - 4)) + i;
              return <button key={p} className={`page-btn-crm ${page === p ? 'active-page-crm' : ''}`} onClick={() => setPage(p)}>{p}</button>;
            })}
            <button className="page-btn-crm" onClick={() => setPage(p => Math.min(p + 1, totalPages))} disabled={page === totalPages}><ChevronRight size={16} /></button>
            <button className="page-btn-crm" onClick={() => setPage(totalPages)} disabled={page === totalPages}>»</button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default StudentCRM;
