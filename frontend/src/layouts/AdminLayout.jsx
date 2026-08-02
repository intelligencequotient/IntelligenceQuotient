import React from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Users, UsersRound, Database,
  ClipboardList, BookOpen, Settings, LogOut, Shield
} from 'lucide-react';
import './AdminLayout.css';

const AdminLayout = () => {
  const location = useLocation();
  const navigate = useNavigate();

  const userString = localStorage.getItem('user');
  const user = userString ? JSON.parse(userString) : { full_name: 'Admin' };

  const handleLogout = () => {
    localStorage.removeItem('access_token');
    localStorage.removeItem('user');
    navigate('/');
  };

  const adminNav = [
    { name: 'Dashboard',        path: '/admin',                 icon: LayoutDashboard },
    { name: 'User Management',  path: '/admin/users',           icon: Users },
    { name: 'Batch Management', path: '/admin/batches',         icon: UsersRound },
    { name: 'Question Bank',    path: '/admin/question-bank',   icon: Database },
    { name: 'Test Initiation',  path: '/admin/test-initiation', icon: ClipboardList },
    { name: 'Test Library',     path: '/admin/test-library',    icon: BookOpen },
  ];

  return (
    <div className="app-layout admin-theme">
      <aside className="sidebar">
        <div className="sidebar-header">
          <div className="user-profile">
            <div className="avatar admin-avatar-circle">
              <Shield size={18} color="white" />
            </div>
            <div className="user-info">
              <h4>{user.full_name || 'Administrator'}</h4>
              <span>Admin Portal</span>
            </div>
          </div>
        </div>

        <nav className="sidebar-nav">
          {adminNav.map((item) => {
            const Icon = item.icon;
            const isActive =
              item.path === '/admin'
                ? location.pathname === '/admin'
                : location.pathname.startsWith(item.path);
            return (
              <Link
                key={item.name}
                to={item.path}
                className={`nav-item ${isActive ? 'active' : ''}`}
              >
                <Icon size={20} />
                <span>{item.name}</span>
              </Link>
            );
          })}
        </nav>

        <div className="sidebar-footer">
          <Link
            to="/admin/settings"
            className={`nav-item ${location.pathname === '/admin/settings' ? 'active' : ''}`}
          >
            <Settings size={20} />
            <span>Settings</span>
          </Link>
          <button className="nav-item text-danger" onClick={handleLogout}>
            <LogOut size={20} />
            <span>Logout</span>
          </button>
        </div>
      </aside>

      <main className="main-content">
        <Outlet />
      </main>
    </div>
  );
};

export default AdminLayout;
