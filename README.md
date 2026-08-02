# Intelligent Question Bank (IQ)

A full-stack application designed to streamline the assessment process for teachers. It automatically parses PDF question papers, extracts text and diagrams, classifies questions by Subject and Topic using AI, and presents them in an interactive Teacher Portal.

## Project Structure
- **/backend**: NestJS application handling API routes, database operations (Supabase), and spawning the Python PDF processing pipeline.
- **/frontend**: React application (Vite) containing the Teacher Portal (Question Bank, Batch Management, Doubts, etc.).
- **/pdf proccesor**: Python scripts (`extract.py`, `classify.py`) for scraping PDFs using PyMuPDF and Groq.
- **/temp** (ignored): Ephemeral directory used by the backend during PDF processing runs.

---

## 🚀 Quick Start (How to Run)

### 0. One-time database setup
Run `backend/migrations/001_security_indexes_and_features.sql` in the Supabase
SQL Editor. It adds Row Level Security, indexes, the negative-marking and
QA-review columns, and creates the spaced-repetition / predictions / lectures
tables. It is idempotent — safe to re-run.

Then copy `.env.example` to `.env` (repo root) and `backend/.env`, and fill in
your Supabase and Groq keys.

### 1. Start the Backend (NestJS)
```bash
cd backend && npm install && npm run start:dev
```
*Python 3 with `PyMuPDF`, `Pillow` and `groq` must be on PATH for the PDF pipeline —
see `backend/scripts/pdf-processor/requirements.txt`.*

### 2. Start the Frontend (React / Vite)
```bash
cd frontend && npm install && npm run dev
```

### Or run the whole stack with Docker
```bash
docker compose up --build
```
Frontend on `:8080`, API on `:3000`, Redis for cache. Postgres and Auth stay in Supabase.

### Tests
```bash
cd backend && npm test
```
```bash
cd frontend && npx vitest run
```

---

## ✅ Completed Features

**Security & correctness**
- Cryptographic JWT verification (JWKS + rotation, HS256 fallback), role always read from the DB
- Row Level Security on every user-data table, plus performance indexes (`migrations/001`)
- Server-enforced exam windows: scheduled start/end, deadline on every write, background sweeper that grades abandoned attempts
- Negative marking applied at grading time; answer-key comparison handles single, multi-select and numeric answers
- CORS allow-list in production, throttling actually enforced, session revoked on logout

**Features**
- **Auth**: login, silent token refresh, logout, forgot/reset password
- **Live doubts**: real-time chat with per-room authorization, typing indicators, image upload with content sniffing
- **Question Bank**: server-side pagination, bulk select/delete, real CRUD, LaTeX rendering (KaTeX)
- **QA review queue**: AI-extracted questions land as `pending` and cannot enter a test until a teacher approves them
- **PDF pipeline**: PyMuPDF extraction → Groq classification → vision-model fallback for unreadable questions → Supabase Storage, with live websocket progress
- **CSV upload**: server-side parse → preview with per-row validation → confirm
- **Test results** (teacher): scoreboard, cohort stats, per-question difficulty, CSV export
- **Analytics**: real subject/topic breakdowns, spaced repetition (SM-2) and risk predictions written after every submission
- **Lectures & syllabus** library
- **Admin portal**: user management, batch management, test initiation

**Student experience**
- Dashboard lists assigned tests and launches them; resumes a part-finished attempt with answers, flags and timing restored
- Post-test result: real score, cohort rank/percentile, subject breakdown and full answer review
- Analytics, Leaderboard, Subject pages and Lectures all read live data

**Secure exam module (`exam/`)**
- Bearer-token auth on every route; the student id comes from the verified token, never the request body
- Real question paper from the database (answer key never sent to the client)
- Server-side grading with negative marking; violations still terminate at three strikes

**Infra**
- Dockerfiles + `docker-compose.yml`, GitHub Actions CI (typecheck, lint, tests, image build)
- Redis-backed cache with in-memory fallback; leaderboard cached rather than recomputed per request
- 48 tests (22 main backend, 7 exam service, 19 frontend)

---

## 📝 Known Gaps

- **BullMQ is installed but unused** — PDF extraction still runs inside the HTTP request. Live websocket progress covers the UX, but a very large paper can still tie up a worker.
- **Self-registration is deliberately absent** — accounts are provisioned by an admin. Adding public signup to an exam platform would be a security regression.
- **The `exam/` sub-app is a second front end** for proctored mode. The in-app Assessment Arena is the default path; launch the proctored shell with `#token=<access_token>` in the URL fragment (see `exam/frontend/src/api/client.js`).
- **Load testing** (k6 / Artillery) has not been run — it needs a deployed target.
- Notification preferences were removed from Teacher Settings rather than left as non-functional toggles; there is no notification system behind them yet.

---
*This document serves as the master tracking list for all upcoming features, technical debt, and quality assurance tasks.*
