import React, { useState, useEffect, useRef } from 'react';
import { UploadCloud, FileText, CheckCircle, ArrowRight, Download, AlertTriangle, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { io } from 'socket.io-client';
import { apiClient } from '../../api/client';
import MathText from '../../components/MathText';
import './CSVUpload.css';

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:3000';

const CSV_TEMPLATE =
  'question,optA,optB,optC,optD,correct,difficulty,subject,topic,marks\n' +
  '"What is Newton\'s Third Law?","Action=Reaction","F=ma","Inertia","Gravity",A,easy,Physics,Laws of Motion,4\n';

/** Column values the extractor files questions under, in reading order. */
const Q_TYPE_LABELS = {
  single_correct: 'Single correct',
  multi_correct: 'Multiple correct',
  numerical: 'Numerical',
  assertion: 'Assertion / Reason',
};

/**
 * Bulk upload for CSV and PDF.
 *
 * PDF runs through the Python extraction pipeline and reports genuine progress
 * over a websocket (it used to show a rotating list of invented messages).
 * CSV is parsed server-side into a preview which the teacher confirms before
 * anything is written — those endpoints existed but were never called.
 */
const CSVUpload = () => {
  const navigate = useNavigate();

  const [dragActive, setDragActive] = useState(false);
  const [file, setFile] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(null);
  const [results, setResults] = useState(null);
  const [error, setError] = useState(null);

  // CSV preview state
  const [previewRows, setPreviewRows] = useState(null);
  const [confirming, setConfirming] = useState(false);

  const socketRef = useRef(null);

  // Subscribe to this user's upload room for live progress.
  useEffect(() => {
    const token = localStorage.getItem('access_token');
    if (!token) return;

    const socket = io(SOCKET_URL, { auth: { token: `Bearer ${token}` } });
    socketRef.current = socket;

    socket.on('connect', () => socket.emit('uploads:subscribe'));
    socket.on('uploads:progress', (payload) => {
      setProgress(payload);
      if (payload.stage === 'failed') {
        setError(payload.error || 'Processing failed.');
        setIsProcessing(false);
      }
    });

    return () => {
      socket.emit('uploads:unsubscribe');
      socket.close();
    };
  }, []);

  const reset = () => {
    setFile(null);
    setResults(null);
    setError(null);
    setProgress(null);
    setPreviewRows(null);
  };

  const downloadTemplate = () => {
    const blob = new Blob([CSV_TEMPLATE], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'question_template.csv';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const processFile = async (selectedFile) => {
    setFile(selectedFile);
    setError(null);
    setResults(null);
    setPreviewRows(null);

    const name = selectedFile.name.toLowerCase();
    const formData = new FormData();
    formData.append('file', selectedFile);

    if (name.endsWith('.pdf')) {
      setIsProcessing(true);
      setProgress({ stage: 'queued', message: 'Uploading document…', percent: 1 });
      formData.append('examType', 'jee');
      try {
        const data = await apiClient.post('/questions/bulk-upload-pdf', formData);
        setResults({ ...data, kind: 'pdf' });
      } catch (err) {
        setError(err.message || 'Network error while processing the PDF.');
      } finally {
        setIsProcessing(false);
      }
      return;
    }

    if (name.endsWith('.csv')) {
      setIsProcessing(true);
      try {
        // Returns a preview only — nothing is saved until the teacher confirms.
        const rows = await apiClient.post('/questions/bulk-upload', formData);
        setPreviewRows(Array.isArray(rows) ? rows : []);
      } catch (err) {
        setError(err.message || 'Could not parse that CSV.');
      } finally {
        setIsProcessing(false);
      }
      return;
    }

    setError('Unsupported file type. Please upload a .csv or .pdf file.');
    setFile(null);
  };

  const confirmCsv = async () => {
    if (!previewRows?.length) return;
    setConfirming(true);
    try {
      const res = await apiClient.post('/questions/bulk-confirm', { rows: previewRows });
      setResults({ kind: 'csv', processed: previewRows.length, inserted: res.inserted });
      setPreviewRows(null);
    } catch (err) {
      setError(err.message || 'Failed to save questions.');
    } finally {
      setConfirming(false);
    }
  };

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') setDragActive(true);
    else if (e.type === 'dragleave') setDragActive(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files?.[0]) processFile(e.dataTransfer.files[0]);
  };

  const validCount = previewRows?.filter((r) => r.valid).length ?? 0;
  const invalidCount = (previewRows?.length ?? 0) - validCount;
  const percent = progress?.percent >= 0 ? progress.percent : null;

  return (
    <div className="csv-upload">
      <header className="page-header">
        <h1>Bulk Upload (CSV / PDF)</h1>
        <p>Upload a CSV of questions, or a PDF exam paper for AI extraction.</p>
      </header>

      {isProcessing && (
        <div className="upload-progress-panel">
          <h2>{progress?.stage === 'queued' ? 'Uploading…' : 'Processing your file'}</h2>
          <p className="upload-progress-msg">{progress?.message || 'Working…'}</p>

          <div className="upload-progress-track">
            <div
              className={`upload-progress-fill ${percent === null ? 'indeterminate' : ''}`}
              style={percent !== null ? { width: `${percent}%` } : undefined}
            />
          </div>
          {percent !== null && <span className="upload-progress-pct">{percent}%</span>}

          <p className="upload-progress-note">
            PDF extraction takes 1–2 minutes depending on the document. Please keep this tab open.
          </p>
        </div>
      )}

      {!isProcessing && error && (
        <div className="upload-alert error">
          <AlertTriangle size={18} />
          <span>{error}</span>
          <button onClick={() => setError(null)}><X size={16} /></button>
        </div>
      )}

      {!isProcessing && !results && !previewRows && (
        <div className="upload-section">
          <div className="template-download">
            <p>Don't have the template?</p>
            <button className="download-link" onClick={downloadTemplate}>
              <Download size={16} /> Download CSV Template
            </button>
          </div>

          <form className="drag-drop-zone" onDragEnter={handleDrag} onSubmit={(e) => e.preventDefault()}>
            <input
              type="file"
              id="input-file-upload"
              accept=".csv,.pdf"
              onChange={(e) => e.target.files?.[0] && processFile(e.target.files[0])}
            />
            <label id="label-file-upload" htmlFor="input-file-upload" className={dragActive ? 'drag-active' : ''}>
              <div className="upload-prompt">
                <div className="upload-icon-wrapper"><UploadCloud size={48} /></div>
                <h3>Drag and drop your CSV or PDF here</h3>
                <p>or click to browse your files</p>
              </div>
            </label>
            {dragActive && (
              <div
                className="drag-file-element"
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={handleDrop}
              />
            )}
          </form>
        </div>
      )}

      {!isProcessing && previewRows && (
        <div className="parsed-section">
          <div className="file-info-bar">
            <div className="file-details">
              <FileText size={24} className="text-accent" />
              <div>
                <span className="file-name">{file?.name}</span>
                <span className="file-meta">
                  {validCount} valid
                  {invalidCount > 0 && <> · <strong className="csv-invalid">{invalidCount} with errors</strong></>}
                </span>
              </div>
            </div>
            <button className="btn-outline-small" onClick={reset}>Cancel</button>
          </div>

          <div className="csv-preview-wrap">
            <table className="csv-preview-table">
              <thead>
                <tr>
                  <th></th><th>Question</th><th>Subject</th><th>Topic</th>
                  <th>Difficulty</th><th>Answer</th><th>Marks</th>
                </tr>
              </thead>
              <tbody>
                {previewRows.map((row, i) => (
                  <tr key={i} className={row.valid ? '' : 'csv-row-invalid'}>
                    <td>
                      {row.valid
                        ? <CheckCircle size={15} className="csv-ok" />
                        : <AlertTriangle size={15} className="csv-warn" />}
                    </td>
                    <td className="csv-qtext"><MathText text={row.question_text} /></td>
                    <td>{row.subject}</td>
                    <td>{row.topic}</td>
                    <td>{row.difficulty}</td>
                    <td>{['A', 'B', 'C', 'D'][row.correct_answer?.index] ?? '—'}</td>
                    <td>{row.marks}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {invalidCount > 0 && (
            <p className="csv-note">
              Rows with errors are missing a required field and will be skipped.
            </p>
          )}

          <div className="bottom-actions">
            <button className="btn-primary" onClick={confirmCsv} disabled={!validCount || confirming}>
              {confirming ? 'Saving…' : `Import ${validCount} question${validCount === 1 ? '' : 's'}`}
              <ArrowRight size={18} />
            </button>
          </div>
        </div>
      )}

      {!isProcessing && results && (
        <div className="parsed-section">
          <div className="file-info-bar">
            <div className="file-details">
              <FileText size={24} className="text-accent" />
              <div>
                <span className="file-name">{file?.name || 'uploaded document'}</span>
                <span className="file-meta">
                  <CheckCircle size={14} style={{ display: 'inline', marginRight: 4, verticalAlign: 'middle' }} />
                  Processed {results.processed} · Inserted {results.inserted}
                </span>
              </div>
            </div>
            <button className="btn-outline-small" onClick={reset}>Upload Another</button>
          </div>

          <div className="preview-container upload-success">
            <h2>Success</h2>
            {results.kind === 'pdf' ? (
              <>
                <p>
                  Extraction is complete. Because the AI infers the text, topic, question type and
                  answer key, these {results.inserted} question(s) are waiting in the{' '}
                  <strong>Review Queue</strong> and will not appear in tests until you approve them.
                </p>
                {results.byType && Object.keys(results.byType).length > 0 && (
                  <ul className="upload-type-breakdown">
                    {Object.entries(results.byType).map(([type, count]) => (
                      <li key={type}>
                        <strong>{count}</strong> {Q_TYPE_LABELS[type] || type}
                      </li>
                    ))}
                  </ul>
                )}
              </>
            ) : (
              <p>{results.inserted} question(s) were added to your Question Bank.</p>
            )}
          </div>

          <div className="bottom-actions">
            {results.kind === 'pdf' ? (
              <button className="btn-primary" onClick={() => navigate('/teacher/review-queue')}>
                Go to Review Queue <ArrowRight size={18} />
              </button>
            ) : (
              <button className="btn-primary" onClick={() => navigate('/teacher/question-bank')}>
                View Question Bank <ArrowRight size={18} />
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default CSVUpload;
