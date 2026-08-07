import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { X, Printer, FileText } from 'lucide-react';
import { apiClient } from '../../api/client';
import MathText from '../../components/MathText';
import './PDFPreviewModal.css';

/**
 * Printable exam paper.
 *
 * This page used to render a fixed dummy paper ("Weekly Mock Test #4"), and its
 * "Download PDF" button produced a text file containing the literal string
 * "Mock PDF Content". It now renders a real test (`?testId=…`) and prints
 * through the browser, which is what actually produces a usable PDF.
 */
const PDFPreviewModal = () => {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const testId = params.get('testId');

  const [test, setTest] = useState(null);
  const [tests, setTests] = useState([]);
  const [showAnswers, setShowAnswers] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoading(true);
      setError('');
      try {
        if (testId) {
          const data = await apiClient.get(`/tests/${testId}`);
          if (!cancelled) setTest(data);
        } else {
          // No test chosen — offer a picker rather than a fake paper.
          const list = await apiClient.getList('/tests');
          if (!cancelled) setTests(list);
        }
      } catch (e) {
        if (!cancelled) setError(e.message || 'Could not load the test.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [testId]);

  const questions = (test?.test_questions || [])
    .slice()
    .sort((a, b) => (a.question_order || 0) - (b.question_order || 0));

  if (loading) return <div className="pdf-preview-page"><p className="pv-muted">Loading…</p></div>;

  // Picker shown when no test id was supplied.
  if (!testId) {
    return (
      <div className="pdf-preview-page">
        <div className="preview-toolbar">
          <div className="toolbar-left"><h2>Print a Test</h2></div>
          <div className="toolbar-right">
            <button className="icon-close" onClick={() => navigate(-1)}><X size={24} /></button>
          </div>
        </div>

        <div className="pv-picker">
          {error && <p className="pv-error">{error}</p>}
          {tests.length === 0 ? (
            <div className="pv-empty">
              <FileText size={38} />
              <p>No tests available to print yet.</p>
            </div>
          ) : (
            <ul className="pv-test-list">
              {tests.map((t) => (
                <li key={t.id}>
                  <button onClick={() => navigate(`/teacher/pdf-preview?testId=${t.id}`)}>
                    <span className="pv-test-title">{t.title}</span>
                    <span className="pv-muted pv-small">
                      {t.duration_minutes} min · {t.total_marks} marks · {t.status}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    );
  }

  if (error || !test) {
    return (
      <div className="pdf-preview-page">
        <p className="pv-error">{error || 'Test not found.'}</p>
        <button className="btn-outline" onClick={() => navigate('/teacher/test-library')}>
          Back to Test Library
        </button>
      </div>
    );
  }

  return (
    <div className="pdf-preview-page">
      {/* Toolbar is hidden when printing — see the @media print rules. */}
      <div className="preview-toolbar">
        <div className="toolbar-left">
          <h2>Document Preview</h2>
          <span className="badge">Print Layout</span>
        </div>
        <div className="toolbar-right">
          <label className="pv-toggle">
            <input
              type="checkbox"
              checked={showAnswers}
              onChange={(e) => setShowAnswers(e.target.checked)}
            />
            Answer key
          </label>
          <button className="btn-outline" onClick={() => navigate(-1)}>Back</button>
          <button className="btn-primary" onClick={() => window.print()}>
            <Printer size={18} /> Print / Save as PDF
          </button>
          <button className="icon-close" onClick={() => navigate(-1)}><X size={24} /></button>
        </div>
      </div>

      <div className="pdf-document-container">
        <div className="pdf-page">
          <div className="exam-header">
            <h1>{test.title}</h1>
            <div className="pv-header-meta">
              <span><strong>Duration:</strong> {test.duration_minutes} minutes</span>
              <span><strong>Maximum Marks:</strong> {test.total_marks}</span>
              {test.negative_marking && (
                <span><strong>Negative marking:</strong> −{test.negative_marks} per wrong answer</span>
              )}
            </div>
            {test.description && <p className="pv-desc">{test.description}</p>}
            <div className="pv-namebar">
              <span>Name: ________________________</span>
              <span>Roll No: ____________</span>
            </div>
          </div>

          {questions.length === 0 ? (
            <p className="pv-muted">This test has no questions yet.</p>
          ) : (
            <ol className="pv-questions">
              {questions.map((tq) => {
                const q = tq.questions || {};
                const marks = tq.marks_override || q.marks || 4;
                const correctIndex = q.correct_answer?.index;

                return (
                  <li key={q.id} className="pv-question">
                    <div className="pv-question-head">
                      <MathText as="div" className="pv-question-text" text={q.question_text || ''} />
                      <span className="pv-marks">[{marks}]</span>
                    </div>

                    {q.image_url && (
                      <img className="pv-question-image" src={q.image_url} alt="Question diagram" />
                    )}

                    {Array.isArray(q.options) && (
                      <ol className="pv-options">
                        {q.options.map((opt, idx) => (
                          <li key={idx} className={showAnswers && idx === correctIndex ? 'pv-correct' : ''}>
                            <span className="pv-opt-letter">({['a', 'b', 'c', 'd'][idx]})</span>
                            <MathText text={String(opt)} />
                          </li>
                        ))}
                      </ol>
                    )}
                  </li>
                );
              })}
            </ol>
          )}

          {showAnswers && questions.length > 0 && (
            <div className="pv-answer-key">
              <h3>Answer Key</h3>
              <div className="pv-key-grid">
                {questions.map((tq, i) => {
                  const idx = tq.questions?.correct_answer?.index;
                  const value = tq.questions?.correct_answer?.value;
                  return (
                    <span key={tq.questions?.id || i}>
                      {i + 1}. {value !== undefined ? value : (['a', 'b', 'c', 'd'][idx] ?? '—')}
                    </span>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default PDFPreviewModal;
