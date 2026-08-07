import React, { useState, useEffect } from 'react';
import { Users, UsersRound, BookOpen, ClipboardList, ArrowRight } from 'lucide-react';
import { apiClient, toList } from '../../api/client';
import { Link } from 'react-router-dom';

const AdminDashboard = () => {
  const userStr = localStorage.getItem('user');
  const user = userStr ? JSON.parse(userStr) : {};

  const [stats, setStats] = useState({ students: 0, teachers: 0, batches: 0, tests: 0 });
  const [recentUsers, setRecentUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const [allUsers, batches, tests] = await Promise.allSettled([
          apiClient.get('/users/admin/all'),
          apiClient.get('/batches'),
          apiClient.get('/tests'),
        ]);
        // These endpoints answer a paginated envelope; toList takes the rows
        // out of either that or a bare array.
        const users = allUsers.status === 'fulfilled' ? toList(allUsers.value) : [];
        const batchList = batches.status === 'fulfilled' ? toList(batches.value) : [];
        const testList = tests.status === 'fulfilled' ? toList(tests.value) : [];
        setStats({
          students: users.filter(u => u.role === 'student').length,
          teachers: users.filter(u => u.role === 'teacher').length,
          // `total` counts the whole collection, not just this page.
          batches: batchList.length,
          tests: tests.status === 'fulfilled' ? (tests.value?.total ?? testList.length) : 0,
        });
        setRecentUsers(users.slice(0, 6));
      } catch (e) { console.error(e); }
      finally { setLoading(false); }
    };
    load();
  }, []);

  const kpis = [
    { label: 'Total Students', value: stats.students, icon: Users, color: '#3b82f6', bg: 'rgba(59,130,246,0.1)' },
    { label: 'Total Teachers', value: stats.teachers, icon: UsersRound, color: '#10b981', bg: 'rgba(16,185,129,0.1)' },
    { label: 'Active Batches', value: stats.batches, icon: BookOpen, color: '#f59e0b', bg: 'rgba(245,158,11,0.1)' },
    { label: 'Total Tests', value: stats.tests, icon: ClipboardList, color: '#7c3aed', bg: 'rgba(124,58,237,0.1)' },
  ];

  const quickActions = [
    { label: 'Add User', to: '/admin/users', color: '#3b82f6' },
    { label: 'Create Batch', to: '/admin/batches', color: '#10b981' },
    { label: 'Upload PDF', to: '/admin/question-bank', color: '#f59e0b' },
    { label: 'Initiate Test', to: '/admin/test-initiation', color: '#7c3aed' },
  ];

  return (
    <div className="admin-page">
      {/* Hero Banner */}
      <div className="admin-hero">
        <h1>Welcome back, {user.full_name?.split(' ')[0] || 'Admin'}! 👋</h1>
        <p>Full system overview — manage users, batches, questions and tests from one place.</p>
      </div>

      {/* KPI Grid */}
      <div className="admin-kpi-grid">
        {kpis.map((k) => {
          const Icon = k.icon;
          return (
            <div key={k.label} className="admin-kpi-card">
              <div className="admin-kpi-icon" style={{ background: k.bg }}>
                <Icon size={22} color={k.color} />
              </div>
              <div>
                <div className="admin-kpi-label">{k.label}</div>
                <div className="admin-kpi-value">{loading ? '—' : k.value}</div>
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        {/* Quick Actions */}
        <div className="admin-card">
          <h3 className="admin-card-title">Quick Actions</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {quickActions.map((a) => (
              <Link
                key={a.label}
                to={a.to}
                className="admin-btn admin-btn-ghost"
                style={{ justifyContent: 'space-between', width: '100%' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: a.color, flexShrink: 0 }} />
                  <span>{a.label}</span>
                </div>
                <ArrowRight size={14} />
              </Link>
            ))}
          </div>
        </div>

        {/* Recent Users */}
        <div className="admin-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h3 className="admin-card-title" style={{ margin: 0 }}>Recent Users</h3>
            <Link to="/admin/users" style={{ fontSize: 13, color: 'var(--color-admin-purple)', textDecoration: 'none', fontWeight: 600 }}>View all →</Link>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {loading ? (
              <p style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Loading...</p>
            ) : recentUsers.length === 0 ? (
              <p style={{ color: 'var(--text-secondary)', fontSize: 13 }}>No users found.</p>
            ) : recentUsers.map((u) => (
              <div key={u.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{
                    width: 34, height: 34, borderRadius: '50%', flexShrink: 0,
                    background: u.role === 'teacher' ? 'rgba(16,185,129,0.15)' : 'rgba(59,130,246,0.15)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 13, fontWeight: 700,
                    color: u.role === 'teacher' ? '#059669' : '#2563eb',
                  }}>
                    {(u.full_name || u.email || 'U')[0].toUpperCase()}
                  </div>
                  <div>
                    <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text-primary)' }}>{u.full_name || 'Unnamed'}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{u.email}</div>
                  </div>
                </div>
                <span className={`admin-badge admin-badge-${u.role}`}>{u.role}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;
