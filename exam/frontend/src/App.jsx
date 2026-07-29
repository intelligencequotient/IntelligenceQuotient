import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import ExamLauncher from './pages/ExamLauncher';
import ExamShell from './pages/ExamShell';
import './index.css';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/exam/instructions/jee-main-preview" replace />} />
        <Route path="/exam" element={<Navigate to="/exam/instructions/jee-main-preview" replace />} />
        <Route path="/exam/instructions/:testId" element={<ExamLauncher />} />
        <Route path="/exam/session/:sessionId" element={<ExamShell />} />
        <Route path="*" element={<Navigate to="/exam/instructions/jee-main-preview" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
