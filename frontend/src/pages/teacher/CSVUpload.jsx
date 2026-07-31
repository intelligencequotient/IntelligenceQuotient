import React, { useState, useEffect } from 'react';
import { UploadCloud, FileText, CheckCircle, AlertCircle, ArrowRight, Download, Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { apiClient } from '../../api/client';
import { useAppData } from '../../context/AppDataContext';
import './CSVUpload.css';

const pdfLoadingMessages = [
  'Extracting pages from PDF...',
  'Slicing question images...',
  'Running layout analysis...',
  'Prompting Groq AI for classification...',
  'Determining Subjects and Topics...',
  'Uploading extracted images to Supabase Storage...',
  'Finalizing database insertion...',
];

const CSV_HEADERS = 'question,optA,optB,optC,optD,correct,difficulty,subject,topic,marks';
const CSV_SAMPLE =
  'What is Newton\'s Third Law?,Action=Reaction,F=ma,Inertia,Gravity,A,easy,Physics,Laws of Motion,4';

const CSVUpload = () => {
  const navigate = useNavigate();
  const { setQuestions } = useAppData();

  const [dragActive, setDragActive] = useState(false);
  const [file, setFile] = useState(null);
  const [mode, setMode] = useState(null); // 'csv' | 'pdf'

  const [isProcessing, setIsProcessing] = useState(false);
  const [loadingMsgIndex, setLoadingMsgIndex] = useState(0);

  const [previewRows, setPreviewRows] = useState(null); // CSV preview before commit
  const [isImporting, setIsImporting] = useState(false);
  const [results, setResults] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let interval;
    if (isProcessing && mode === 'pdf') {
      interval = setInterval(() => {
        setLoadingMsgIndex((prev) => (prev + 1) % pdfLoadingMessages.length);
      }, 3500);
    } else {
      setLoadingMsgIndex(0);
    }
    return () => clearInterval(interval);
  }, [isProcessing, mode]);

  const resetAll = () => {
    setFile(null);
    setMode(null);
    setPreviewRows(null);
    setResults(null);
    setError(null);
  };

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') setDragActive(true);
    else if (e.type === 'dragleave') setDragActive(false);
  };

  const refreshQuestionBank = async () => {
    try {
      const updated = await apiClient.get('/questions?limit=100');
      if (updated?.data) setQuestions(updated.data);
    } catch {
      /* non-fatal — the bank page refetches on mount anyway */
    }
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
      setMode('pdf');
      setIsProcessing(true);
      try {
        formData.append('examType', 'jee');
        const data = await apiClient.post('/questions/bulk-upload-pdf', formData);
        setResults(data);
        await refreshQuestionBank();
      } catch (err) {
        setError(err.message || 'Network error while processing PDF');
      } finally {
        setIsProcessing(false);
      }
      return;
    }

    if (name.endsWith('.csv')) {
      setMode('csv');
      setIsProcessing(true);
      try {
        // Backend parses and validates, but does NOT save yet
        const rows = await apiClient.post('/questions/bulk-upload', formData);
        if (!Array.isArray(rows) || rows.length === 0) {
          setError('No rows found in that CSV. Check that it has a header row.');
        } else {
          setPreviewRows(rows);
        }
      } catch (err) {
        setError(err.message || 'Failed to parse CSV');
      } finally {
        setIsProcessing(false);
      }
      return;
    }

    setError('Unsupported file type. Please upload a .csv or .pdf file.');
    setFile(null);
  };

  const handleConfirmImport = async () => {
    if (!previewRows) return;
    setIsImporting(true);
    setError(null);
    try {
      const res = await apiClient.post('/questions/bulk-confirm', { rows: previewRows });
      setResults({ processed: previewRows.length, inserted: res.inserted ?? 0 });
      setPreviewRows(null);
      await refreshQuestionBank();
    } catch (err) {
      setError(err.message || 'Failed to import questions');
    } finally {
      setIsImporting(false);
    }
  };

  const handleDownloadTemplate = (e) => {
    e.preventDefault();
    const blob = new Blob([`${CSV_HEADERS}\n${CSV_SAMPLE}\n`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'question_upload_template.csv';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files?.[0]) processFile(e.dataTransfer.files[0]);
  };

  const handleFileChange = (e) => {
    if (e.target.files?.[0]) processFile(e.target.files[0]);
  };

  const validCount = previewRows ? previewRows.filter((r) => r.valid).length : 0;
  const invalidCount = previewRows ? previewRows.length - validCount : 0;

  const showDropzone = !isProcessing && !previewRows && !results;

  return (
    <div className="csv-upload">
      <header className="page-header">
        <h1>Bulk Upload (CSV / PDF)</h1>
        <p>Upload a standard CSV or an exam PDF to extract and add multiple questions.</p>
      </header>

      {error && (
        <div className="error-alert" style={{ color: '#dc2626', marginBottom: '1rem' }}>{error}</div>
      )}

      {isProcessing && (
        <div className="processing-state" style={{ textAlign: 'center', padding: '4rem 2rem' }}>
          <Loader2 size={48} className="spinner" style={{ animation: 'spin 2s linear infinite', color: '#6366f1', marginBottom: '1rem' }} />
          {mode === 'pdf' ? (
            <>
              <h2>AI is reading your PDF...</h2>
              <p style={{ color: '#64748b', fontSize: '1.1rem', marginTop: '0.5rem', fontWeight: 500, minHeight: '1.5rem' }}>
                {pdfLoadingMessages[loadingMsgIndex]}
              </p>
              <p style={{ color: '#94a3b8', fontSize: '0.9rem', marginTop: '1rem' }}>
                This takes about 1-2 minutes depending on the PDF size. Please don't close this tab.
              </p>
            </>
          ) : (
            <h2>Parsing your CSV...</h2>
          )}
        </div>
      )}

      {showDropzone && (
        <div className="upload-section">
          <div className="template-download">
            <p>Don't have the template?</p>
            <a href="#" className="download-link" onClick={handleDownloadTemplate}>
              <Download size={16} /> Download CSV Template
            </a>
          </div>

          <form className="drag-drop-zone" onDragEnter={handleDrag} onSubmit={(e) => e.preventDefault()}>
            <input type="file" id="input-file-upload" accept=".csv,.pdf" onChange={handleFileChange} />
            <label id="label-file-upload" htmlFor="input-file-upload" className={dragActive ? 'drag-active' : ''}>
              <div className="upload-prompt">
                <div className="upload-icon-wrapper"><UploadCloud size={48} /></div>
                <h3>Drag and drop your CSV or PDF file here</h3>
                <p>or click to browse your files (Max 5MB)</p>
              </div>
            </label>
            {dragActive && (
              <div className="drag-file-element" onDragEnter={handleDrag} onDragLeave={handleDrag} onDragOver={handleDrag} onDrop={handleDrop}></div>
            )}
          </form>
        </div>
      )}

      {/* ─── CSV preview: nothing is saved until the teacher confirms ─── */}
      {!isProcessing && previewRows && (
        <div className="parsed-section">
          <div className="file-info-bar">
            <div className="file-details">
              <FileText size={24} className="text-accent" />
              <div>
                <span className="file-name">{file?.name}</span>
                <span className="file-meta">
                  {previewRows.length} rows parsed · {validCount} valid
                  {invalidCount > 0 && ` · ${invalidCount} will be skipped`}
                </span>
              </div>
            </div>
            <button className="btn-outline-small" onClick={resetAll}>Cancel</button>
          </div>

          <div className="preview-container" style={{ overflowX: 'auto', marginTop: '1rem' }}>
            <table className="bank-table" style={{ width: '100%' }}>
              <thead>
                <tr>
                  <th style={{ width: '40px' }}>#</th>
                  <th>Question</th>
                  <th>Subject</th>
                  <th>Topic</th>
                  <th>Difficulty</th>
                  <th>Answer</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {previewRows.map((row, idx) => (
                  <tr key={idx} style={{ backgroundColor: row.valid ? undefined : '#fef2f2' }}>
                    <td>{idx + 1}</td>
                    <td style={{ maxWidth: '360px' }}>{row.question_text || <em>(empty)</em>}</td>
                    <td>{row.subject || '—'}</td>
                    <td>{row.topic || '—'}</td>
                    <td>{row.difficulty || '—'}</td>
                    <td>
                      {row.correct_answer?.index >= 0
                        ? row.options?.[row.correct_answer.index] || ['A', 'B', 'C', 'D'][row.correct_answer.index]
                        : '—'}
                    </td>
                    <td>
                      {row.valid ? (
                        <span style={{ color: '#16a34a', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                          <CheckCircle size={14} /> Valid
                        </span>
                      ) : (
                        <span style={{ color: '#dc2626', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                          <AlertCircle size={14} /> {row.errorMsg || 'Invalid'}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="bottom-actions" style={{ marginTop: '1rem' }}>
            <button
              className="btn-primary"
              onClick={handleConfirmImport}
              disabled={isImporting || validCount === 0}
            >
              {isImporting ? 'Importing…' : `Import ${validCount} Question${validCount === 1 ? '' : 's'}`}
              <ArrowRight size={18} />
            </button>
          </div>
        </div>
      )}

      {/* ─── Success summary ─── */}
      {!isProcessing && results && (
        <div className="parsed-section">
          <div className="file-info-bar">
            <div className="file-details">
              <FileText size={24} className="text-accent" />
              <div>
                <span className="file-name">{file?.name || 'uploaded_document'}</span>
                <span className="file-meta">
                  <CheckCircle size={14} style={{ display: 'inline', marginRight: '4px', verticalAlign: 'middle' }} />
                  Processed {results.processed} questions · Inserted {results.inserted} into the Question Bank
                </span>
              </div>
            </div>
            <button className="btn-outline-small" onClick={resetAll}>Upload Another</button>
          </div>

          <div className="preview-container" style={{ padding: '2rem', textAlign: 'center' }}>
            <h2 style={{ marginBottom: '1rem' }}>Import complete</h2>
            <p>
              {results.inserted} question{results.inserted === 1 ? '' : 's'} added to your Question Bank
              {results.processed > results.inserted &&
                ` (${results.processed - results.inserted} skipped).`}
            </p>
          </div>

          <div className="bottom-actions">
            <button className="btn-primary" onClick={() => navigate('/teacher/question-bank')}>
              View Question Bank <ArrowRight size={18} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default CSVUpload;
