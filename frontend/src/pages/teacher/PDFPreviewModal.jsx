import React from 'react';
import { useNavigate } from 'react-router-dom';
import { X, Download, Printer } from 'lucide-react';
import './PDFPreviewModal.css';

const PDFPreviewModal = () => {
  const navigate = useNavigate();

  const handleClose = () => {
    navigate(-1); // Go back to previous page (likely test constructor or csv upload)
  };

  const handlePrint = () => {
    window.print();
  };

  const handleDownload = () => {
    // Mock download behavior
    const link = document.createElement('a');
    link.href = 'data:text/plain;charset=utf-8,' + encodeURIComponent('Mock PDF Content');
    link.download = 'Exam_Preview.pdf';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="pdf-preview-page">
      <div className="preview-toolbar">
        <div className="toolbar-left">
          <h2>Document Preview</h2>
          <span className="badge">Print Layout</span>
        </div>
        <div className="toolbar-right">
          <button className="btn-outline" onClick={handleClose}>Back to Edit</button>
          <button className="btn-primary" onClick={handlePrint}><Printer size={18} /> Print</button>
          <button className="btn-primary" onClick={handleDownload}><Download size={18} /> Download PDF</button>
          <button className="icon-close" onClick={handleClose}><X size={24} /></button>
        </div>
      </div>

      <div className="pdf-document-container">
        <div className="pdf-page">
          {/* Header */}
          <div className="exam-header">
            <div className="institution-info">
              <h1>EduCommand Academy</h1>
              <p>Excellence in Education</p>
            </div>
            
            <div className="exam-meta-box">
              <div className="exam-title-row">
                <h2>Weekly Mock Test #4</h2>
                <span className="exam-subject">Physics</span>
              </div>
              <div className="exam-details-row">
                <span><strong>Duration:</strong> 60 Minutes</span>
                <span><strong>Total Marks:</strong> 100</span>
                <span><strong>Date:</strong> 24 Oct 2023</span>
              </div>
            </div>
            
            <div className="student-fill-info">
              <div className="fill-line"><span>Name:</span><div className="line"></div></div>
              <div className="fill-line"><span>Batch:</span><div className="line"></div></div>
              <div className="fill-line"><span>Date:</span><div className="line"></div></div>
            </div>
            
            <div className="instructions">
              <strong>Instructions:</strong>
              <ul>
                <li>All questions are compulsory.</li>
                <li>Each correct answer carries 4 marks.</li>
                <li>1 mark will be deducted for each incorrect answer.</li>
              </ul>
            </div>
          </div>

          <hr className="divider" />

          {/* Questions */}
          <div className="questions-section">
            <div className="question-item">
              <div className="q-number">Q1.</div>
              <div className="q-content">
                <p>Calculate the derivative of f(x) = 3x² + 5x - 2 with respect to x.</p>
                <div className="options-grid">
                  <div className="option">(A) 6x + 5</div>
                  <div className="option">(B) 3x + 5</div>
                  <div className="option">(C) 6x - 2</div>
                  <div className="option">(D) x² + 5</div>
                </div>
              </div>
            </div>

            <div className="question-item">
              <div className="q-number">Q2.</div>
              <div className="q-content">
                <p>A particle moves along a straight line such that its displacement s at time t is given by s = t³ - 6t² + 3t + 4. Find the velocity when the acceleration is zero.</p>
                <div className="options-grid">
                  <div className="option">(A) -9 m/s</div>
                  <div className="option">(B) 3 m/s</div>
                  <div className="option">(C) 12 m/s</div>
                  <div className="option">(D) 0 m/s</div>
                </div>
              </div>
            </div>

            <div className="question-item">
              <div className="q-number">Q3.</div>
              <div className="q-content">
                <p>What is the SI unit of Force?</p>
                <div className="options-grid">
                  <div className="option">(A) Joule</div>
                  <div className="option">(B) Newton</div>
                  <div className="option">(C) Watt</div>
                  <div className="option">(D) Pascal</div>
                </div>
              </div>
            </div>
          </div>
          
          <div className="page-footer">
            <span>EduCommand - Internal Use Only</span>
            <span>Page 1 of 4</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PDFPreviewModal;
