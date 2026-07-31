# Intelligent Question Bank (IQ)

A full-stack application designed to streamline the assessment process for teachers. It automatically parses PDF question papers, extracts text and diagrams, classifies questions by Subject and Topic using AI, and presents them in an interactive Teacher Portal.

## Project Structure
- **/backend**: NestJS application handling API routes, database operations (Supabase), and spawning the Python PDF processing pipeline.
- **/frontend**: React application (Vite) containing the Teacher Portal (Question Bank, Batch Management, Doubts, etc.).
- **/pdf proccesor**: Python scripts (`extract.py`, `classify.py`) for scraping PDFs using PyMuPDF and Groq.
- **/temp** (ignored): Ephemeral directory used by the backend during PDF processing runs.

---

## ✅ Completed Features
- **PDF Extraction Pipeline**: Fully functional Python script (`extract.py`) that uses PyMuPDF to intelligently parse questions, isolate diagram bounding boxes, and crop them perfectly while excluding trailing answers.
- **AI Classification**: Integration with Groq's API (`classify.py`) to automatically categorize parsed questions by Subject and Topic using LLMs, with an automatic fallback to local keyword classification on rate limits.
- **Database Architecture**: Supabase integration set up with a functional `questions` schema, handling JSONB answer keys, and a `question-images` storage bucket.
- **Teacher Portal Frontend**: A modern React (Vite) dashboard featuring:
  - **Question Bank**: A searchable, filterable data grid to view extracted questions, complete with a dedicated Answer column and a click-to-enlarge Image Lightbox.
  - **CSV/PDF Upload UI**: A dedicated interface for uploading exam files to trigger the backend processing pipeline.
- **Resilient Data Fetching**: Frontend context providers optimized with `Promise.allSettled` to prevent single-endpoint failures from crashing the app.
- **Real-Time Live Doubts System**: 
  - **Student Portal**: Modal to raise custom doubts, real-time status tracking (Waiting, Connected, Resolved), and persistent live chat.
  - **Teacher Portal**: Real-time queue to monitor incoming doubts, accept ownership, and launch live video sessions (via Jitsi links).
  - **WebSocket Architecture**: Full Socket.io integration ensuring UI state (acceptances, resolutions, new messages) updates instantly across all connected clients without refreshing.

---

## 📝 Comprehensive To-Do Checklist

### **Frontend (UI / UX)**
- [ ] **Upload Progress & Websockets**: Implement real-time websockets (Socket.io) or Server-Sent Events (SSE) to display a live progress bar during the 1-2 minute PDF extraction process.
- [ ] **Question Bank Actions**: fully wire up the `Edit`, `Duplicate`, and `Delete` functionalities in the Question Bank grid.
- [ ] **Bulk Selection**: Add checkboxes to the Question Bank table to allow selecting multiple questions for bulk deletion or adding to a Test.
- [ ] **Advanced Filtering**: Add subtopic filters, date-range filters, and text search to the Question Bank.
- [ ] **Server-Side Pagination**: Hook up backend pagination properly into the Question Bank UI to handle tens of thousands of questions without lagging the browser.
- [ ] **Test Constructor Module**: Build the full drag-and-drop interface for creating and managing custom assessments, exporting them back as PDFs or assigning them digitally.
- [ ] **Student CRM / Analytics**: Build the dashboard pages for Cohort Analytics and Student management.
- [ ] **Responsive Design**: Ensure the entire teacher dashboard is fully responsive on tablets and mobile devices.

### **Backend & PDF Pipeline**
- [ ] **Background Queues (BullMQ)**: Offload the heavy PDF processing pipeline to a Redis-backed background job queue so API requests don't hang or time out.
- [ ] **Vision API Integration**: Upgrade the extraction script to fall back to a Vision LLM (like GPT-4o or Claude 3.5 Sonnet) for questions where pure text-extraction fails (e.g. complex chemistry diagrams).
- [ ] **Rate Limiting & Key Rotation**: Improve the Groq API rate limit handling. Implement round-robin key rotation and automated backoff queues to avoid dropping questions.
- [ ] **Robust Temp File Cleanup**: Ensure that all temporary PDF runs and images are aggressively cleaned up, using cron jobs if necessary to sweep abandoned temp directories.
- [ ] **LaTeX / MathML Support**: Render LaTeX equations properly in the frontend instead of relying purely on image crops for math formulas.
- [ ] **Manual Override / QA Flow**: Create an approval queue for AI-extracted questions where teachers can manually verify or fix the parsed text before it hits the live Question Bank.

### **Database (Supabase)**
- [ ] **Row Level Security (RLS)**: Enforce strict RLS policies on the `questions`, `tests`, and `doubts` tables to guarantee teachers can only access their own institution's data.
- [ ] **Database Indexes**: Add proper indexing on `subject`, `topic`, and `difficulty` columns to speed up querying in the Question Bank.
- [ ] **Storage Buckets Rules**: Set up proper cache-control headers, max-age, and restrictive access rules for the `question-images` bucket.

### **Testing (Quality Assurance)**
- [ ] **Unit Tests (Backend)**: Write Jest tests for all NestJS services and controllers (especially `QuestionsService` and `PdfProcessorService`).
- [ ] **Unit Tests (Frontend)**: Write Vitest/React Testing Library tests for complex components like the Data Table and File Uploader.
- [ ] **Python Pipeline Tests**: Add `pytest` test suites for `extract.py` and `classify.py` using mock PDFs to guarantee the regex and clustering logic doesn't break on edge cases.
- [ ] **Integration Tests**: Test the full API flow from uploading a mock PDF buffer to verifying the correct database inserts.
- [ ] **End-to-End (E2E) Tests**: Set up Cypress or Playwright to automate logging into the Teacher Portal, uploading a PDF, and verifying the new questions appear in the bank.
- [ ] **Load Testing**: Use Artillery or k6 to simulate multiple teachers uploading large PDFs simultaneously to test the queue robustness.

### **Deployment & DevOps**
- [ ] **Dockerization**: Create `Dockerfile`s and a `docker-compose.yml` for the frontend, backend, and the Python micro-environment.
- [ ] **CI/CD Pipeline**: Set up GitHub Actions to automatically run tests and linting on every pull request.
- [ ] **Production Hosting**: Deploy the backend to a scalable service (e.g., AWS ECS, Render, or Railway) and the frontend to Vercel/Netlify.
- [ ] **Environment Segregation**: Properly separate `.env` files and Supabase instances into `development`, `staging`, and `production`.

---
*This document serves as the master tracking list for all upcoming features, technical debt, and quality assurance tasks.*
