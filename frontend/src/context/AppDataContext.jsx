import React, { createContext, useContext, useState, useEffect, useMemo } from 'react';
import { apiClient } from '../api/client';

const AppDataContext = createContext();

export const useAppData = () => {
  return useContext(AppDataContext);
};

export const AppDataProvider = ({ children }) => {
  // Global State
  const [questions, setQuestions] = useState([]);
  const [tests, setTests] = useState([]);
  const [batches, setBatches] = useState([]);
  const [students, setStudents] = useState([]);
  const [doubts, setDoubts] = useState([]);
  const [testResults, setTestResults] = useState(null);
  const [loading, setLoading] = useState(true);

  // Fetch initial data based on role
  useEffect(() => {
    const fetchInitialData = async () => {
      const token = localStorage.getItem('access_token');
      const userStr = localStorage.getItem('user');
      if (!token || !userStr) {
        setLoading(false);
        return;
      }

      try {
        const user = JSON.parse(userStr);
        setLoading(true);

        // Fetch based on user role
        if (user.role === 'teacher' || user.role === 'admin') {
          const results = await Promise.allSettled([
            apiClient.get('/questions?limit=100'),
            apiClient.get('/tests'),
            apiClient.get('/batches'),
            apiClient.get('/users/students'),
            apiClient.get('/doubts')
          ]);
          
          setQuestions(results[0].status === 'fulfilled' ? (results[0].value.data || []) : []);
          setTests(results[1].status === 'fulfilled' ? (results[1].value || []) : []);
          setBatches(results[2].status === 'fulfilled' ? (results[2].value || []) : []);
          
          const fetchedStudents = results[3].status === 'fulfilled' ? (results[3].value || []) : [];
          if (!fetchedStudents.some(s => s.id === 'student-id-001')) {
            fetchedStudents.push({ id: 'student-id-001', name: 'Test Student', initials: 'TS' });
          }
          setStudents(fetchedStudents);

          let fetchedDoubts = results[4].status === 'fulfilled' ? (results[4].value || []) : [];
          fetchedDoubts = fetchedDoubts.map(d => ({
            ...d,
            studentId: d.student?.id || d.student_id,
            subject: d.questions?.subject || d.subject || 'General',
            snippet: d.questions?.question_text || d.snippet || 'No text provided',
            time: new Date(d.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          }));
          setDoubts(fetchedDoubts);
          
        } else if (user.role === 'student') {
          const [tRes, dRes] = await Promise.all([
            apiClient.get('/tests/available'),
            apiClient.get('/doubts/my')
          ]);
          setTests(tRes || []);
          
          let fetchedDoubts = dRes || [];
          fetchedDoubts = fetchedDoubts.map(d => ({
            ...d,
            subject: d.questions?.subject || d.subject || 'General',
            snippet: d.questions?.question_text || d.snippet || 'No text provided',
            time: new Date(d.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          }));
          setDoubts(fetchedDoubts);
        }
      } catch (error) {
        console.error('Failed to fetch initial app data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchInitialData();
  }, []);

  const value = useMemo(() => ({
    questions, setQuestions,
    tests, setTests,
    batches, setBatches,
    students, setStudents,
    doubts, setDoubts,
    testResults, setTestResults,
    loading
  }), [questions, tests, batches, students, doubts, testResults, loading]);

  return (
    <AppDataContext.Provider value={value}>
      {children}
    </AppDataContext.Provider>
  );
};
