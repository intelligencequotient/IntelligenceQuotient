import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { apiClient, captureTokenFromUrl, getToken } from '../api/client';
import { normalisePaper, subjectsInPaper } from '../lib/questionFormat';
import '../index.css';

/**
 * Offline demo papers. These two ids are not real tests — they exist so the
 * proctoring UI can be demonstrated without a live assessment.
 */
const previewConfigs = {
  'jee-main-preview': {
    title: 'JEE Main 2026 — Mock Test',
    duration: '3 Hours (180 minutes)',
    totalQuestions: 75,
    totalMarks: 300,
    sections: [
      { name: 'Section A (MCQ)', count: '20 per subject', marking: '+4 correct, −1 incorrect' },
      { name: 'Section B (Numerical)', count: '5 per subject', marking: '+4 correct, −1 incorrect (2026 pattern)' },
    ],
    subjects: 'Physics, Chemistry, Mathematics',
  },
  'jee-adv-preview': {
    title: 'JEE Advanced 2026 — Paper 1 Mock Test',
    duration: '3 Hours (180 minutes)',
    totalQuestions: 51,
    totalMarks: '~180 (varies by question type)',
    sections: [
      { name: 'MCQ (Single Correct)', count: '6 per subject', marking: '+3 correct, −1 incorrect' },
      { name: 'MSQ (Multiple Correct)', count: '6 per subject', marking: '+4 full, partial marks available' },
      { name: 'NAT (Numerical)', count: '5 per subject', marking: '+4 correct, no negative' },
    ],
    subjects: 'Physics, Chemistry, Mathematics',
  },
};

const TYPE_LABELS = {
  mcq: 'Objective — Single Correct',
  msq: 'Objective — Multiple Correct',
  nat: 'Numerical Answer',
};

/**
 * Turns the real test + its paper into the same shape the preview configs use,
 * so the instructions page describes the test the admin actually created.
 *
 * This page used to fall back to a generic "Secure Assessment / 60 Minutes / —
 * questions" card for every real test, because it only ever looked its testId up
 * in a hardcoded table and never called the API.
 */
function buildConfig(test, paper) {
  const negative = test.negative_marking
    ? `−${Number(test.negative_marks) || 0} per wrong answer`
    : 'no negative marking';

  // One row per question type actually present in the paper.
  const byType = new Map();
  for (const q of paper) {
    const entry = byType.get(q.type) || { count: 0, marks: new Set() };
    entry.count += 1;
    entry.marks.add(Number(q.marks) || 4);
    byType.set(q.type, entry);
  }

  const sections = [...byType.entries()].map(([type, entry]) => ({
    name: TYPE_LABELS[type] || type.toUpperCase(),
    count: `${entry.count} question${entry.count === 1 ? '' : 's'}`,
    marking: `+${[...entry.marks].sort((a, b) => a - b).join(' / ')} correct, ${negative}`,
  }));

  const subjects = subjectsInPaper(paper);

  return {
    title: test.title || 'Secure Assessment',
    description: test.description || '',
    duration: `${test.duration_minutes} minutes`,
    totalQuestions: paper.length,
    totalMarks: test.total_marks ?? '—',
    sections: sections.length ? sections : [{ name: 'Questions', count: '—', marking: negative }],
    subjects: subjects.length ? subjects.join(', ') : '—',
  };
}

const ExamLauncher = () => {
  const { testId } = useParams();
  const isPreview = Boolean(previewConfigs[testId]);

  const [config, setConfig] = useState(previewConfigs[testId] || null);
  const [loading, setLoading] = useState(!isPreview);
  const [error, setError] = useState('');

  useEffect(() => {
    captureTokenFromUrl();
  }, []);

  useEffect(() => {
    if (isPreview) return;

    let cancelled = false;

    (async () => {
      // captureTokenFromUrl has already run in the effect above.
      if (!getToken()) {
        if (!cancelled) {
          setError('No active session. Please launch this test from your dashboard.');
          setLoading(false);
        }
        return;
      }

      try {
        const [test, rawPaper] = await Promise.all([
          apiClient.get(`/tests/${testId}`),
          apiClient.get(`/tests/${testId}/questions`),
        ]);
        if (cancelled) return;
        setConfig(buildConfig(test, normalisePaper(rawPaper)));
      } catch (e) {
        if (!cancelled) setError(e.message || 'Could not load this test.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [testId, isPreview]);

  const handleStartExam = () => {
    const token = getToken();
    const url = `/exam/session/${testId}${token ? `#token=${token}` : ''}`;
    const examWin = window.open(url, '_blank', 'noopener,noreferrer');
    if (!examWin) {
      window.location.href = url;
    }
  };

  if (loading) {
    return (
      <div className="exam-launcher-container">
        <div className="launcher-card"><p>Loading test details…</p></div>
      </div>
    );
  }

  if (error || !config) {
    return (
      <div className="exam-launcher-container">
        <div className="launcher-card">
          <h2>Cannot open this test</h2>
          <p>{error || 'Test not found.'}</p>
          <div className="launcher-actions">
            <button className="btn-cancel" onClick={() => window.close()}>Close</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="exam-launcher-container">
      <div className="launcher-card">
        <h2>{config.title}</h2>
        <div className="instructions-content">
          {config.description && <p>{config.description}</p>}
          <p><strong>Duration:</strong> {config.duration}</p>
          <p><strong>Total Questions:</strong> {config.totalQuestions}</p>
          <p><strong>Total Marks:</strong> {config.totalMarks}</p>
          <p><strong>Subjects:</strong> {config.subjects}</p>
          <hr />
          <h3>Marking Scheme</h3>
          <table className="marking-table">
            <thead>
              <tr><th>Section</th><th>Questions</th><th>Marking</th></tr>
            </thead>
            <tbody>
              {config.sections.map((s, i) => (
                <tr key={i}><td>{s.name}</td><td>{s.count}</td><td>{s.marking}</td></tr>
              ))}
            </tbody>
          </table>
          <hr />
          <h3>Rules of the Exam</h3>
          <ul>
            <li>Do not switch tabs. This session is monitored.</li>
            <li>Do not exit fullscreen mode.</li>
            <li>Copy, paste, and right-click are disabled.</li>
            <li>If you violate these rules 3 times, your exam will be automatically terminated.</li>
          </ul>
          <p className="consent-text">By clicking below, you agree to these terms.</p>
        </div>
        <div className="launcher-actions">
          <button className="btn-cancel" onClick={() => window.close()}>Cancel</button>
          <button className="btn-start" onClick={handleStartExam}>I agree, begin test</button>
        </div>
      </div>
    </div>
  );
};

export default ExamLauncher;
