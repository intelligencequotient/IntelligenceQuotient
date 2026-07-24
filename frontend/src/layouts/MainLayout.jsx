import React from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Book, FlaskConical, Calculator, Dna, Settings, LogOut, Award, Bookmark, Layers, Users, MessageSquare, Database, FileText, Upload, UsersRound } from 'lucide-react';
import './MainLayout.css';

const MainLayout = () => {
  const location = useLocation();
  const navigate = useNavigate();
  
  const userString = localStorage.getItem('user');
  const user = userString ? JSON.parse(userString) : { role: 'student', full_name: 'Student' };
  const isTeacher = user.role === 'teacher' || user.role === 'admin';

  const handleLogout = () => {
    localStorage.removeItem('access_token');
    localStorage.removeItem('user');
    navigate('/');
  };

  const studentNav = [
    { name: 'Dashboard', path: '/student', icon: LayoutDashboard },
    { name: 'Physics', path: '/student/subject/physics', icon: Book },
    { name: 'Chemistry', path: '/student/subject/chemistry', icon: FlaskConical },
    { name: 'Mathematics', path: '/student/subject/math', icon: Calculator },
    { name: 'Analytics', path: '/student/analytics', icon: Layers },
    { name: 'Leaderboard', path: '/student/leaderboard', icon: Award },
    { name: 'Doubts', path: '/student/doubts', icon: MessageSquare },
  ];

  const teacherNav = [
    { name: 'Dashboard', path: '/teacher', icon: LayoutDashboard },
    { name: 'Batch Management', path: '/teacher/batch-management', icon: UsersRound },
    { name: 'Test Constructor', path: '/teacher/test-constructor', icon: Layers },
    { name: 'Question Bank', path: '/teacher/question-bank', icon: Database },
    { name: 'Cohort Analytics', path: '/teacher/analytics', icon: Award },
    { name: 'Student CRM', path: '/teacher/crm', icon: Users },
    { name: 'Doubt Queue', path: '/teacher/doubt-queue', icon: MessageSquare },
    { name: 'CSV Upload', path: '/teacher/csv-upload', icon: Upload },
  ];

  const navItems = isTeacher ? teacherNav : studentNav;

  return (
    <div className={`app-layout ${isTeacher ? 'teacher-theme' : 'student-theme'}`}>
      <aside className="sidebar">
        <div className="sidebar-header">
          <div className="user-profile">
            <div className="avatar"></div>
            <div className="user-info">
              <h4>{user.full_name || (isTeacher ? 'Teacher' : 'Student')}</h4>
              <span>{isTeacher ? 'Teacher Portal' : 'Student Portal'}</span>
            </div>
          </div>
        </div>
        
        <nav className="sidebar-nav">
          {navItems.map((item) => {
            const Icon = item.icon;
            
            // Logic for active state, checking exact match OR specific sub-routes
            let isActive = location.pathname === item.path;
            
            // Special sub-route handling for teacher portal
            if (item.path === '/teacher/crm' && location.pathname.startsWith('/teacher/student/')) {
              isActive = true;
            }
            if (item.path === '/teacher/doubt-queue' && location.pathname.startsWith('/teacher/doubt-chat/')) {
              isActive = true;
            }

            return (
              <Link key={item.name} to={item.path} className={`nav-item ${isActive ? 'active' : ''}`}>
                <Icon size={20} />
                <span>{item.name}</span>
              </Link>
            );
          })}
        </nav>

        <div className="sidebar-footer">
          <Link to={isTeacher ? "/teacher/settings" : "/student/settings"} className={`nav-item ${location.pathname === (isTeacher ? '/teacher/settings' : '/student/settings') ? 'active' : ''}`}>
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

export default MainLayout;
