import React from 'react';
import { Navigate } from 'react-router-dom';

const ProtectedRoute = ({ allowedRoles, children }) => {
  const token = localStorage.getItem('access_token');
  const userStr = localStorage.getItem('user');
  
  if (!token || !userStr) {
    // Not logged in
    return <Navigate to="/" replace />;
  }

  try {
    const user = JSON.parse(userStr);
    if (allowedRoles && !allowedRoles.includes(user.role)) {
      // Logged in, but wrong role. Redirect them to their respective dashboard
      if (user.role === 'teacher' || user.role === 'admin') return <Navigate to="/teacher" replace />;
      if (user.role === 'student') return <Navigate to="/student" replace />;
      return <Navigate to="/" replace />;
    }
    
    // Logged in and authorized
    return children;
  } catch (err) {
    // Invalid user data
    localStorage.removeItem('access_token');
    localStorage.removeItem('user');
    return <Navigate to="/" replace />;
  }
};

export default ProtectedRoute;
