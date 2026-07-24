import React, { useState, useEffect } from 'react';
import { UploadCloud, FileText, CheckCircle, ArrowRight, Download, Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { apiClient } from '../../api/client';
import { useAppData } from '../../context/AppDataContext';
import './CSVUpload.css';

const loadingMessages = [
  "Extracting pages from PDF...",
  "Slicing question images...",
  "Running OCR analysis...",
  "Prompting Groq AI for classification...",
  "Determining Subjects and Topics...",
  "Uploading extracted images to Supabase Storage...",
  "Finalizing database insertion..."
];

const CSVUpload = () => {
  const navigate = useNavigate();
  const { setQuestions } = useAppData();
  const [dragActive, setDragActive] = useState(false);
  const [file, setFile] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [loadingMsgIndex, setLoadingMsgIndex] = useState(0);
  const [results, setResults] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let interval;
    if (isProcessing) {
      interval = setInterval(() => {
        setLoadingMsgIndex((prev) => (prev + 1) % loadingMessages.length);
      }, 3500); // Change message every 3.5 seconds
    } else {
      setLoadingMsgIndex(0);
    }
    return () => clearInterval(interval);
  }, [isProcessing]);

  const handleDrag = function(e) {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const processFile = async (selectedFile) => {
    setFile(selectedFile);
    
    // If it's a PDF, send to our new AI Pipeline
    if (selectedFile.name.toLowerCase().endsWith('.pdf')) {
      setIsProcessing(true);
      setError(null);
      try {
        const formData = new FormData();
        formData.append('file', selectedFile);
        formData.append('examType', 'jee'); // Could be a dropdown in UI

        // apiClient automatically parses JSON and throws on error
        const data = await apiClient.post('/questions/bulk-upload-pdf', formData);
        setResults(data);
        
        // Refresh the global question bank state so it appears immediately!
        const updatedQuestions = await apiClient.get('/questions?limit=100');
        if (updatedQuestions && updatedQuestions.data) {
          setQuestions(updatedQuestions.data);
        }
      } catch (err) {
        setError(err.message || 'Network error while processing PDF');
      } finally {
        setIsProcessing(false);
      }
    } else {
      // Mock CSV parsing for now (as before)
      setTimeout(() => setResults({ processed: 4, inserted: 4 }), 1000);
    }
  };

  const handleDrop = function(e) {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      processFile(e.target.files[0]);
    }
  };

  return (
    <div className="csv-upload">
      <header className="page-header">
        <h1>Bulk Upload (CSV / PDF)</h1>
        <p>Upload a standard CSV or PDF file to quickly extract and add multiple questions.</p>
      </header>

      {isProcessing && (
        <div className="processing-state" style={{ textAlign: 'center', padding: '4rem 2rem' }}>
          <Loader2 size={48} className="spinner" style={{ animation: 'spin 2s linear infinite', color: '#6366f1', marginBottom: '1rem' }} />
          <h2>AI is reading your PDF...</h2>
          <p style={{ color: '#64748b', fontSize: '1.1rem', marginTop: '0.5rem', fontWeight: 500, minHeight: '1.5rem' }}>
            {loadingMessages[loadingMsgIndex]}
          </p>
          <p style={{ color: '#94a3b8', fontSize: '0.9rem', marginTop: '1rem' }}>
            This process takes about 1-2 minutes depending on the PDF size. Please don't close this tab.
          </p>
        </div>
      )}

      {!isProcessing && !results && (
        <div className="upload-section">
          {error && <div className="error-alert" style={{ color: 'red', marginBottom: '1rem' }}>{error}</div>}
          <div className="template-download">
            <p>Don't have the template?</p>
            <a href="#" className="download-link"><Download size={16} /> Download CSV Template</a>
          </div>

          <form className="drag-drop-zone" onDragEnter={handleDrag} onSubmit={(e) => e.preventDefault()}>
            <input type="file" id="input-file-upload" accept=".csv,.pdf" onChange={handleFileChange} />
            <label id="label-file-upload" htmlFor="input-file-upload" className={dragActive ? "drag-active" : ""}>
              <div className="upload-prompt">
                <div className="upload-icon-wrapper"><UploadCloud size={48} /></div>
                <h3>Drag and drop your CSV or PDF file here</h3>
                <p>or click to browse your files (Max 5MB)</p>
              </div>
            </label>
            {dragActive && <div className="drag-file-element" onDragEnter={handleDrag} onDragLeave={handleDrag} onDragOver={handleDrag} onDrop={handleDrop}></div>}
          </form>
        </div>
      )}
      
      {!isProcessing && results && (
        <div className="parsed-section">
          <div className="file-info-bar">
            <div className="file-details">
              <FileText size={24} className="text-accent" />
              <div>
                <span className="file-name">{file?.name || 'uploaded_document'}</span>
                <span className="file-meta">
                  <CheckCircle size={14} style={{ display: 'inline', marginRight: '4px', verticalAlign: 'middle' }}/>
                  Processed {results.processed} questions • Inserted {results.inserted} to Question Bank
                </span>
              </div>
            </div>
            <button className="btn-outline-small" onClick={() => { setFile(null); setResults(null); }}>Upload Another</button>
          </div>

          <div className="preview-container" style={{ padding: '2rem', textAlign: 'center' }}>
            <h2 style={{ marginBottom: '1rem' }}>Success!</h2>
            <p>The AI has finished extracting and classifying the questions from your PDF. The images have been uploaded to Supabase Storage and the records have been added to your Question Bank.</p>
          </div>

          <div className="bottom-actions">
            <button className="btn-primary" onClick={() => navigate('/teacher/question-bank')}>View Question Bank <ArrowRight size={18} /></button>
          </div>
        </div>
      )}
    </div>
  );
};

export default CSVUpload;