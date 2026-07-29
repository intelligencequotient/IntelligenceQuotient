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
          
          setQuestions(results[0].status === 'fulfilled' ? (results[0].value.data || []) : []);
          setTests(results[1].status === 'fulfilled' ? (results[1].value || []) : []);
          setBatches(results[2].status === 'fulfilled' ? (results[2].value || []) : []);
          setStudents(results[3].status === 'fulfilled' ? (results[3].value || []) : []);
          setDoubts(results[4].status === 'fulfilled' ? (results[4].value || []) : []);
          setTeachers(results[5].status === 'fulfilled' ? (results[5].value || []) : []);
        } else if (user.role === 'student') {
          const results = await Promise.allSettled([
            apiClient.get('/tests/available'),
            apiClient.get('/doubts/my'),
            apiClient.get('/users/teachers')
          ]);
          setTests(results[0].status === 'fulfilled' ? (results[0].value || []) : []);
          setDoubts(results[1].status === 'fulfilled' ? (results[1].value || []) : []);
          setTeachers(results[2].status === 'fulfilled' ? (results[2].value || []) : []);
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
      if (user.role === 'teacher' || user.role === 'admin') {
        const tests = await apiClient.get('/tests');
        setTests(tests || []);
      } else {
        const tests = await apiClient.get('/tests/available');
        setTests(tests || []);
      }
    } catch (e) {
      console.error('Failed to refresh tests:', e);
    }
  };

  const refreshDoubts = async () => {
    try {
      const userStr = localStorage.getItem('user');
      if (!userStr) return;
      const user = JSON.parse(userStr);
      if (user.role === 'teacher' || user.role === 'admin') {
        const doubts = await apiClient.get('/doubts');
        setDoubts(doubts || []);
      } else {
        const doubts = await apiClient.get('/doubts/my');
        setDoubts(doubts || []);
      }
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
