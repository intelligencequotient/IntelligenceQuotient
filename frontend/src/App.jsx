import React, { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AppDataProvider } from './context/AppDataContext';
import './App.css';

// Layouts (not lazy — needed immediately)
import MainLayout from './layouts/MainLayout';
import LockedLayout from './layouts/LockedLayout';
import ProtectedRoute from './components/ProtectedRoute';

// Loading fallback
const PageLoader = () => (
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', flexDirection: 'column', gap: '16px' }}>
    <div style={{ width: '40px', height: '40px', border: '3px solid #e2e8f0', borderTopColor: '#6366f1', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
    <p style={{ color: '#64748b', fontSize: '0.9rem' }}>Loading...</p>
    <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
  </div>
);

// Lazy-loaded pages
const LoginPage          = lazy(() => import('./pages/LoginPage'));
const StudentDashboard   = lazy(() => import('./pages/student/StudentDashboard'));
const SubjectLanding     = lazy(() => import('./pages/student/SubjectLanding'));
const AssessmentArena    = lazy(() => import('./pages/student/AssessmentArena'));
const PostTestResult     = lazy(() => import('./pages/student/PostTestResult'));
const AnalyticsHub       = lazy(() => import('./pages/student/AnalyticsHub'));
const LiveDoubtClient    = lazy(() => import('./pages/student/LiveDoubtClient'));
const Leaderboard        = lazy(() => import('./pages/student/Leaderboard'));
const Settings           = lazy(() => import('./pages/Settings'));

const TeacherDashboard   = lazy(() => import('./pages/teacher/TeacherDashboard'));
const TestConstructor    = lazy(() => import('./pages/teacher/TestConstructor'));
const CSVUpload          = lazy(() => import('./pages/teacher/CSVUpload'));
const CohortAnalytics    = lazy(() => import('./pages/teacher/CohortAnalytics'));
const StudentCRM         = lazy(() => import('./pages/teacher/StudentCRM'));
const DoubtQueue         = lazy(() => import('./pages/teacher/DoubtQueue'));
const BatchManagement    = lazy(() => import('./pages/teacher/BatchManagement'));
const StudentProfileDetail = lazy(() => import('./pages/teacher/StudentProfileDetail'));
const DoubtChatRoom      = lazy(() => import('./pages/teacher/DoubtChatRoom'));
const QuestionBank       = lazy(() => import('./pages/teacher/QuestionBank'));
const PDFPreviewModal    = lazy(() => import('./pages/teacher/PDFPreviewModal'));
const TeacherSettings    = lazy(() => import('./pages/teacher/TeacherSettings'));

function App() {
  return (
    <AppDataProvider>
      <BrowserRouter>
        <Suspense fallback={<PageLoader />}>
          <Routes>
            {/* Auth */}
            <Route path="/" element={<LoginPage />} />

            {/* Main layout (sidebar) */}
            <Route path="/student" element={
              <ProtectedRoute allowedRoles={['student']}>
                <MainLayout />
              </ProtectedRoute>
            }>
              {/* Student Routes */}
              <Route index element={<StudentDashboard />} />
              <Route path="subject/:subjectId" element={<SubjectLanding />} />
              <Route path="result/:testId" element={<PostTestResult />} />
              <Route path="analytics" element={<AnalyticsHub />} />
              <Route path="doubts" element={<LiveDoubtClient />} />
              <Route path="leaderboard" element={<Leaderboard />} />
              <Route path="settings" element={<Settings />} />
            </Route>

            {/* Teacher layout (sidebar) */}
            <Route path="/teacher" element={
              <ProtectedRoute allowedRoles={['teacher', 'admin']}>
                <MainLayout />
              </ProtectedRoute>
            }>
              <Route index element={<TeacherDashboard />} />
              <Route path="test-constructor" element={<TestConstructor />} />
              <Route path="csv-upload" element={<CSVUpload />} />
              <Route path="analytics" element={<CohortAnalytics />} />
              <Route path="crm" element={<StudentCRM />} />
              <Route path="student/:studentId" element={<StudentProfileDetail />} />
              <Route path="doubt-queue" element={<DoubtQueue />} />
              <Route path="doubt-chat/:doubtId" element={<DoubtChatRoom />} />
              <Route path="batch-management" element={<BatchManagement />} />
              <Route path="question-bank" element={<QuestionBank />} />
              <Route path="settings" element={<TeacherSettings />} />
              <Route path="pdf-preview" element={<PDFPreviewModal />} />
            </Route>

            {/* Full-screen locked exam layout */}
            <Route path="/student/locked" element={
              <ProtectedRoute allowedRoles={['student']}>
                <LockedLayout />
              </ProtectedRoute>
            }>
              <Route path="test/:testId" element={<AssessmentArena />} />
            </Route>
          </Routes>
        </Suspense>
      </BrowserRouter>
    </AppDataProvider>
  );
}

export default App;
