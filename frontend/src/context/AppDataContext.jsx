import React, { createContext, useContext, useState, useEffect, useMemo } from 'react';
import { apiClient, toList } from '../api/client';

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
  const [teachers, setTeachers] = useState([]);
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

        // List endpoints answer a paginated envelope; `toList` accepts either
        // that or a bare array, so a shape change cannot silently blank a page.
        const rows = (result) => (result.status === 'fulfilled' ? toList(result.value) : []);

        // Fetch based on user role
        if (user.role === 'teacher' || user.role === 'admin') {
          // Use Promise.allSettled to prevent one failing endpoint from crashing the entire app data fetch
          const results = await Promise.allSettled([
            apiClient.get('/questions?limit=100'),
            apiClient.get('/tests'),
            apiClient.get('/batches'),
            apiClient.get('/users/students'),
            apiClient.get('/doubts'),
            apiClient.get('/users/teachers')
          ]);

          setQuestions(rows(results[0]));
          setTests(rows(results[1]));
          setBatches(rows(results[2]));
          setStudents(rows(results[3]));
          setDoubts(rows(results[4]));
          setTeachers(rows(results[5]));
        } else if (user.role === 'student') {
          const results = await Promise.allSettled([
            apiClient.get('/tests/available'),
            apiClient.get('/doubts/my'),
            // Students get the reduced directory — the full staff roster
            // (including work emails) is teacher/admin only.
            apiClient.get('/users/teachers/directory')
          ]);
          setTests(rows(results[0]));
          setDoubts(rows(results[1]));
          setTeachers(rows(results[2]));
        }
      } catch (error) {
        console.error('Failed to fetch initial app data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchInitialData();
  }, []);

  const refreshTests = async () => {
    try {
      const userStr = localStorage.getItem('user');
      if (!userStr) return;
      const user = JSON.parse(userStr);
      setTests(
        await apiClient.getList(
          user.role === 'teacher' || user.role === 'admin' ? '/tests' : '/tests/available',
        ),
      );
    } catch (e) {
      console.error('Failed to refresh tests:', e);
    }
  };

  const refreshDoubts = async () => {
    try {
      const userStr = localStorage.getItem('user');
      if (!userStr) return;
      const user = JSON.parse(userStr);
      setDoubts(
        await apiClient.getList(
          user.role === 'teacher' || user.role === 'admin' ? '/doubts' : '/doubts/my',
        ),
      );
    } catch (e) {
      console.error('Failed to refresh doubts:', e);
    }
  };

  const value = useMemo(() => ({
    questions, setQuestions,
    tests, setTests,
    batches, setBatches,
    students, setStudents,
    teachers, setTeachers,
    doubts, setDoubts,
    testResults, setTestResults,
    loading, refreshTests, refreshDoubts
  }), [questions, tests, batches, students, teachers, doubts, testResults, loading]);

  return (
    <AppDataContext.Provider value={value}>
      {children}
    </AppDataContext.Provider>
  );
};
