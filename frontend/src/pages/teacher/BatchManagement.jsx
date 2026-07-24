import React, { useState } from 'react';
import { Plus, Users as UsersIcon, Calendar, Search, MoreVertical, X, ChevronRight, ChevronDown } from 'lucide-react';
import { useAppData } from '../../context/AppDataContext';
import './BatchManagement.css';

const BatchManagement = () => {
  const { batches, setBatches, students, setStudents } = useAppData();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [expandedBatch, setExpandedBatch] = useState(null);
  
  const [newBatch, setNewBatch] = useState({ name: '', startDate: '', endDate: '', teacher: 'Dr. Robert Chen' });
  const [studentSearch, setStudentSearch] = useState('');
  const [toast, setToast] = useState('');

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  };

  const toggleExpand = (id) => {
    setExpandedBatch(expandedBatch === id ? null : id);
    setStudentSearch('');
  };

  const handleCreateBatch = (e) => {
    e.preventDefault();
    if(!newBatch.name.trim()) return;
    const b = {
      id: Date.now().toString(),
      name: newBatch.name,
      status: 'Active',
      studentCount: 0,
      startDate: newBatch.startDate || 'Jan 2024',
      endDate: newBatch.endDate || 'Dec 2024'
    };
    setBatches([...batches, b]);
    setIsModalOpen(false);
    setNewBatch({ name: '', startDate: '', endDate: '', teacher: 'Dr. Robert Chen' });
    showToast('Batch created successfully!');
  };

  const handleRemoveStudent = (batchId, studentId) => {
    // Unassign the student from the batch
    setStudents(students.map(s => s.id === studentId ? { ...s, batchId: null } : s));
    
    // Update batch count
    setBatches(batches.map(b => b.id === batchId ? { ...b, studentCount: Math.max(0, b.studentCount - 1) } : b));
    showToast('Student removed from batch.');
  };

  return (
    <div className="batch-management">
      <header className="page-header d-flex justify-between align-center">
        <div>
          <h1>Batch Management</h1>
          <p>Organize and manage your student cohorts.</p>
        </div>
        <button className="btn-primary" onClick={() => setIsModalOpen(true)}>
          <Plus size={18} /> Create New Batch
        </button>
      </header>

      {toast && <div className="toast-notification">{toast}</div>}

      <div className="batch-grid">
        {batches.map(batch => (
          <div key={batch.id} className="batch-card">
            <div className="batch-card-header">
              <span className={`batch-status-badge ${batch.status.toLowerCase()}`}>
                <span className="dot"></span>{batch.status}
              </span>
              <button className="icon-btn"><MoreVertical size={18} /></button>
            </div>
            
            <h2 className="batch-name">{batch.name}</h2>
            
            <div className="batch-meta">
              <div className="meta-item">
                <UsersIcon size={16} />
                <span>{batch.studentCount} Students</span>
              </div>
              <div className="meta-item">
                <Calendar size={16} />
                <span>{batch.startDate} - {batch.endDate}</span>
              </div>
            </div>

            <div className="batch-actions">
              <button 
                className="manage-students-btn"
                onClick={() => toggleExpand(batch.id)}
              >
                <span>Manage Students</span>
                {expandedBatch === batch.id ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
              </button>
            </div>

            {expandedBatch === batch.id && (
              <div className="expanded-student-manager">
                <div className="manager-search">
                  <Search size={16} />
                  <input 
                    type="text" 
                    placeholder="Search enrolled students..." 
                    value={studentSearch}
                    onChange={(e) => setStudentSearch(e.target.value)}
                  />
                </div>
                <ul className="enrolled-students">
                  {students.filter(s => s.batchId === batch.id)
                    .filter(s => s.name.toLowerCase().includes(studentSearch.toLowerCase()))
                    .map(student => (
                    <li key={student.id}>
                      <span>{student.name}</span>
                      <button className="remove-btn" onClick={() => handleRemoveStudent(batch.id, student.id)}><X size={14} /></button>
                    </li>
                  ))}
                  {students.filter(s => s.batchId === batch.id).length === 0 && (
                    <li style={{color: 'var(--text-secondary)', padding: '8px 0'}}>No students found.</li>
                  )}
                </ul>
              </div>
            )}
          </div>
        ))}
      </div>

      {isModalOpen && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h2>Create New Batch</h2>
              <button className="close-btn" onClick={() => setIsModalOpen(false)}><X size={20} /></button>
            </div>
            <form className="batch-form" onSubmit={handleCreateBatch}>
              <div className="form-group">
                <label>Batch Name</label>
                <input type="text" placeholder="e.g. Grade 12 Physics - Batch A" value={newBatch.name} onChange={e => setNewBatch({...newBatch, name: e.target.value})} required />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Start Date</label>
                  <input type="date" value={newBatch.startDate} onChange={e => setNewBatch({...newBatch, startDate: e.target.value})} required />
                </div>
                <div className="form-group">
                  <label>End Date</label>
                  <input type="date" value={newBatch.endDate} onChange={e => setNewBatch({...newBatch, endDate: e.target.value})} required />
                </div>
              </div>
              <div className="form-group">
                <label>Assigned Teacher</label>
                <select value={newBatch.teacher} onChange={e => setNewBatch({...newBatch, teacher: e.target.value})}>
                  <option>Dr. Robert Chen</option>
                  <option>Prof. Sarah Jenkins</option>
                </select>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn-outline" onClick={() => setIsModalOpen(false)}>Cancel</button>
                <button type="submit" className="btn-primary">Create Batch</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default BatchManagement;

