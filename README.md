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
Run every file in `backend/migrations/` in order, in the Supabase SQL Editor.
All are idempotent — safe to re-run.

| Migration | What it does |
|---|---|
| `001_security_indexes_and_features.sql` | RLS on every user-data table, base indexes, negative-marking and QA-review columns, spaced-repetition / predictions / lectures tables |
| `002` – `004` | Test format columns, `assigned_to`, the `test_teachers` junction table |
| `005_exam_session_sync.sql` | Answer palette state, `attempt_violations`, one assignment row per (test, student) |
| `006_scale_indexes.sql` | Indexes for the queries that only hurt at cohort scale — rank/percentile counts, per-question breakdowns, assignment lookups |
| `007_test_paper_pattern.sql` | Separates a test's paper pattern (`jee_main`, `custom`) from the `test_type` enum. Without it patterns are not stored, but test creation still works |
| `008_question_type_taxonomy.sql` | Lets `questions.q_type` hold every type the PDF pipeline detects, and indexes the Subject → Topic → Question Type drill-down. Without it, uploading a paper containing numerical or multi-correct questions can fail on an enum column |

**The proctored exam module needs its own schema.** Run `exam/backend/schema.sql`
and then `exam/backend/migrations/001_exam_hardening.sql`. Until you do,
"Start Test" reaches the exam app and fails there — the API answers 503 and logs
which files to run, because `exam_sessions` does not exist yet.

The hardening migration is **not optional**: `schema.sql` grants
`FOR ALL USING (true)` on the exam tables, which makes them readable and
writable by anyone holding the publishable anon key — every student, from the
browser console.

Then copy `.env.example` to `.env` (repo root) and `backend/.env`, and fill in
your Supabase and Groq keys.

### 1. Start everything

The platform is **four** services, not two — the proctored exam module is a
separate app on its own ports. Starting only some of them is the usual reason
"Start Test" fails to launch.

| Service | Port | Directory |
|---|---|---|
| Portal API | 3000 | `backend` |
| Portal web | 5173 | `frontend` |
| Exam API | 3001 | `exam/backend` |
| Exam web | 5175 | `exam/frontend` |

From the repo root, once:

```bash
npm run install:all
```

Then to run all four together:

```bash
npm run dev
```

*Python 3 with `PyMuPDF`, `Pillow` and `groq` must be on PATH for the PDF pipeline —
see `backend/scripts/pdf-processor/requirements.txt`.*

To run one at a time instead: `npm run dev:api`, `dev:web`, `dev:exam-api`, `dev:exam-web`.

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

## 📈 Running at cohort scale (~1000 students)

**Set `REDIS_URL` before running more than one API instance.** Three things
depend on it and degrade quietly without it:

| Without Redis | What breaks |
|---|---|
| Throttler counters are per-process | The configured limit is silently multiplied by the replica count |
| Socket.IO rooms are per-process | A doubt reply sent on replica A never reaches a student connected to replica B |
| The attempt sweeper has no lock | Every replica independently scans and grades the same abandoned attempts |

With it set, `docker compose up --scale backend=3` is safe.

Other things worth knowing when the platform is carrying a real cohort:

- **Rate limits are per user, not per IP.** An exam hall behind one NAT address
  used to share a single bucket; `THROTTLE_LIMIT` (default 300/min) now applies
  to each student. Unauthenticated routes still bucket by IP, which is where
  throttling is a security control rather than a fairness one.
- **`trust proxy` is on** (`TRUST_PROXY`, default 1). Set it to the number of
  proxy hops in front of the API so the client IP is read correctly.
- **Collection endpoints are paginated.** `/tests`, `/users/students`,
  `/users/admin/all`, `/lectures`, `/doubts` and `/doubts/my` answer
  `{ data, total, page, limit, totalPages }`. The frontend's `toList()` helper
  accepts either that or a bare array.
- **Reads that can exceed 1000 rows are paged internally.** Supabase caps a
  response at `db-max-rows` without signalling truncation, so leaderboards,
  analytics and result pages go through `fetchAll` / `fetchAllIn`
  (`backend/src/common/db/query.util.ts`) rather than a single select.
- **Swagger is off in production.** Set `ENABLE_SWAGGER=true` to expose it
  deliberately. Health probes use `/api/health`.

---

## ✅ Completed Features

**Security & correctness**
- Cryptographic JWT verification (JWKS + rotation, HS256 fallback), role always read from the DB
- Row Level Security on every user-data table, plus performance indexes (`migrations/001`, `006`)
- Server-enforced exam windows: scheduled start/end, deadline on every write, background sweeper that grades abandoned attempts
- **Fetching a question paper requires an assignment and an open window** — the same check as starting the attempt, so a paper cannot be read ahead of time by id
- Negative marking applied at grading time; answer-key comparison handles single, multi-select and numeric answers
- Grading claims the attempt with a conditional update, so concurrent submits cannot double-grade or double-count
- Every write endpoint has a DTO; request bodies are never spread into a DB write, so server-owned columns (`created_by`, `status`, `review_status`, `total_marks`) are not client-writable
- Subject-scoped teachers are scoped on writes as well as reads — editing, deleting, approving and bulk operations all enforce it
- Batches, lectures and tests check ownership on every path, and a missing row is a 404 rather than an implicit pass
- **Creating a test is admin-only.** Papers are initiated centrally; teachers are assigned to fill in their subject's questions and can do only that — being a collaborator does not confer the power to rename, reschedule, republish or delete somebody else's exam. Enforced on the endpoints, not just by hiding the sidebar item
- The PDF pipeline spawns Python with an argv array, never a shell string; `examType` is matched against a fixed list
- Uploads are size- and type-limited, and PDFs are checked by magic bytes rather than the declared MIME type
- Changing your own password requires the current one, verified on an isolated auth client
- Unhandled errors return a correlation id, not the underlying Postgres message
- CORS allow-list in production for HTTP *and* WebSockets, throttling actually enforced per user, session revoked on logout

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
- Dashboard lists assigned tests and launches them; resumes a part-finished attempt with answers, flags, palette state, and timing restored
- Post-test result: real score, cohort rank/percentile, subject breakdown and full answer review
- Analytics, Leaderboard, Subject pages and Lectures all read live data
- Dynamic subject tabs generated based on the exam paper rather than hardcoded defaults

**Secure exam module (`exam/`)**
- End-to-end admin to student test assignment and secure exam handoff functioning seamlessly
- Bearer-token auth on every route; the student id comes from the verified token, never the request body
- Token refresh supported via URL fragment to prevent mid-exam expiration
- Real question paper from the database (answer key never sent to the client)
- Exam paper dynamically normalizes and renders different question formats (single correct, multi correct, numerical)
- Server-side grading with negative marking; numerical (NAT) answers graded accurately against their value
- Violations mapped correctly to the attempt record, terminating at three strikes

**Infra**
- Dockerfiles + `docker-compose.yml`, GitHub Actions CI (typecheck, lint, tests, image build)
- Redis-backed cache with in-memory fallback; leaderboard cached rather than recomputed per request, with single-flight so an expiring key does not stampede
- Redis-backed throttler storage and Socket.IO adapter, plus a distributed lock on the sweeper — the API scales horizontally
- Security headers on the API and a real CSP on the static frontend; `/api/health` for probes
- 155 tests (129 main backend, 7 exam service, 19 frontend)

---

## 📝 Known Gaps

- **BullMQ is installed but unused** — PDF extraction still runs inside the HTTP request. Live websocket progress covers the UX, but a very large paper can still tie up a worker.
- **Self-registration is deliberately absent** — accounts are provisioned by an admin. Adding public signup to an exam platform would be a security regression.
- **The `exam/` sub-app is a second front end** for proctored mode. The in-app Assessment Arena is the default path; launch the proctored shell with `#token=<access_token>` in the URL fragment (see `exam/frontend/src/api/client.js`).
- **Load testing** (k6 / Artillery) has not been run — it needs a deployed target. The scale work so far is structural (paging, chunking, batched writes, shared state in Redis); the numbers still need measuring against real infrastructure.
- **`react-router` carries an open advisory** (GHSA-qwww-vcr4-c8h2, CSRF bypass in RSC mode). There is no patched 7.x — the only forward fix is React Router 8, and `npm audit fix --force` proposes a *downgrade* to 7.11.0 instead. This app uses plain declarative `BrowserRouter` routing with no RSC/framework mode, so the vulnerable code path is not reachable; the v8 migration is worth scheduling on its own rather than folding into a security pass.
- **Tokens live in `localStorage`**, which means any XSS is a session compromise. Moving to httpOnly cookies needs a CSRF strategy and touches every request path, so it is a deliberate follow-up rather than an oversight.
- Notification preferences were removed from Teacher Settings rather than left as non-functional toggles; there is no notification system behind them yet.

---
*This document serves as the master tracking list for all upcoming features, technical debt, and quality assurance tasks.*
