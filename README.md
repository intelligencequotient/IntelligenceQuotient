# Intelligence Quotient (IQ)

A full-stack assessment platform for coaching institutes. Teachers build a question bank
(manually, by CSV, or by auto-parsing PDF exam papers with AI), assemble those questions
into tests, and assign them to batches. Students take the tests in a locked exam interface,
get instantly graded results, and track their performance through analytics and a
leaderboard. A real-time doubt system connects the two sides over WebSockets.

---

## Project Structure

| Path | What it is |
|---|---|
| `/backend` | NestJS API — REST routes, Supabase access, Socket.IO gateway, and the PDF pipeline runner. |
| `/frontend` | React (Vite) SPA — both the Teacher Portal and the Student Portal. |
| `/backend/scripts/pdf-processor` | **Canonical** Python scripts (`extract.py`, `classify.py`) invoked by the backend. |
| `/pdf proccesor` | Standalone/experimental copy of the Python pipeline with its own `requirements.txt`. Kept for local iteration — **the backend does not read from here**. |
| `/temp` (gitignored) | Ephemeral per-run working directory for PDF processing. |

> ⚠️ The two Python copies have drifted apart. Edit `backend/scripts/pdf-processor/` for
> anything the API actually executes.

---

## Tech Stack

**Backend** — NestJS 11, Supabase (Postgres + Auth + Storage), Socket.IO, Swagger,
class-validator, Multer, csv-parser, Jest.

**Frontend** — React 19, Vite, React Router, Recharts, lucide-react, socket.io-client, Vitest.

**Pipeline** — Python 3, PyMuPDF, Groq API (LLM classification with keyword fallback).

---

## Getting Started

### Prerequisites
- Node.js 20+
- Python 3.10+ with PyMuPDF (`pip install -r "pdf proccesor/requirements.txt"`)
- A Supabase project (Postgres + Auth + a `question-images` storage bucket)
- A Groq API key (for AI question classification)

### Environment

`backend/.env`

```
SUPABASE_URL=https://<project>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
GROQ_API_KEY=<groq-key>          # read by the Python classifier
PORT=3000
FRONTEND_URL=http://localhost:5173
```

`frontend/.env` — optional, only prefills the login form in development:

```
VITE_DEMO_TEACHER_EMAIL=
VITE_DEMO_TEACHER_PASSWORD=
VITE_DEMO_STUDENT_EMAIL=
VITE_DEMO_STUDENT_PASSWORD=
```

> The service-role key bypasses RLS. Keep it server-side only — never expose it to the frontend.

### Run

```bash
# API on :3000  (Swagger at /api/docs)
cd backend && npm install && npm run start:dev

# SPA on :5173
cd frontend && npm install && npm run dev
```

The frontend currently points at `http://localhost:3000/api` hardcoded in
`frontend/src/api/client.js` — change it there for other environments.

### Test

```bash
cd backend && npm test        # Jest — 44 service tests
cd frontend && npm test       # Vitest
```

---

## Architecture Notes

**Auth.** Supabase Auth issues the JWT. The backend verifies it in `SupabaseAuthGuard` and
re-reads the user's role **from the database**, never from the token payload or the client.
`RolesGuard` + `@Roles()` enforce teacher/student separation per route. The Socket.IO
gateway performs the same verification on connect — clients cannot self-declare identity.

**Authorization without RLS.** RLS is not yet enabled. Every ownership check currently lives
in the service layer (e.g. a student may only read their own attempt). This is the single
biggest security gap — see the roadmap.

**Grading.** On submit, `AttemptsService` grades every question on the test in one pass and
writes all rows in a single `upsert`, including questions the student never touched
(`is_correct = null`). Answer keys are never sent to the client: `getTestQuestionsForStudent()`
explicitly omits `correct_answer`.

**Data flow.** Frontend pages call the REST API directly via `apiClient`. Multi-source pages
use `Promise.allSettled` so one failing endpoint degrades a single card rather than blanking
the screen.

---

## API Surface

All routes are prefixed `/api` and require a bearer token unless noted.

| Module | Routes |
|---|---|
| **auth** | `POST /auth/login` (public), `POST /auth/refresh`, `GET /auth/me` |
| **users** | `GET|PATCH /users/profile`, `GET /users/students`, `GET /users/students/:id` |
| **questions** | full CRUD, `POST /questions/:id/duplicate`, `POST /questions/bulk-upload` (validate), `POST /questions/bulk-confirm` (insert), `POST /questions/bulk-upload-pdf` |
| **tests** | CRUD, `PATCH /tests/:id/publish`, `POST /tests/:id/questions`, `POST /tests/:id/assign`, `GET /tests/:id/results`, `GET /tests/available`, `GET /tests/:id/questions` |
| **attempts** | `POST /attempts/start/:testId`, `PATCH /attempts/:id/answer`, `PATCH /attempts/:id/flag`, `POST /attempts/:id/submit`, `GET /attempts/my`, `GET /attempts/:id` |
| **analytics** | `GET /analytics/me`, `GET /analytics/cohort`, `GET /analytics/student/:id` |
| **leaderboard** | `GET /leaderboard`, `GET /leaderboard/me`, `GET /leaderboard/batch/:batchId` |
| **batches** | CRUD + `GET|POST /batches/:id/students`, `DELETE /batches/:id/students/:studentId` |
| **doubts** | `POST /doubts`, `GET /doubts`, `GET /doubts/my`, `PATCH /doubts/:id/accept`, `PATCH /doubts/:id/resolve`, `GET|POST /doubts/:id/messages` |
| **lectures** | `GET|POST /lectures`, `DELETE /lectures/:id`, `GET /lectures/syllabus/:subject` |

Interactive docs: **http://localhost:3000/api/docs**

### Database tables

`users`, `batches`, `batch_students`, `questions`, `tests`, `test_questions`,
`test_assignments`, `attempts`, `answers`, `doubts`, `doubt_messages`, `lectures`,
`syllabus_items`, `predictions`, `spaced_repetition_state`.

> There is no version-controlled schema yet — the tables live only in the hosted Supabase
> project. Exporting them to `supabase/migrations/` is a priority.

---

## ✅ What Works End-to-End

### Teacher Portal
- **Question Bank** — server-side pagination, debounced search, subject/difficulty filters,
  and working create / edit / duplicate / soft-delete.
- **CSV Upload** — three-stage parse → preview → confirm. The validator reports *every*
  problem per row (missing text, bad difficulty, answer letter outside A–D, empty designated
  option) before anything is written, and the insert whitelists columns so a crafted CSV
  can't set `id` or other protected fields.
- **PDF Upload** — PyMuPDF extracts question text and crops diagram bounding boxes; Groq
  classifies each by subject and topic, falling back to local keyword matching on rate limits.
  Images land in the `question-images` bucket.
- **Test Constructor** — metadata → question picker → review, then publish and assign to
  batches in one flow. Re-assigning clears prior assignments instead of stacking duplicates.
- **Dashboard** — live KPIs for students, batches, published tests, pending doubts, and
  cohort average.
- **Cohort Analytics** — per-test average trend, score distribution histogram, and the
  topics the cohort most often gets wrong, all filterable by batch.
- **Student CRM** — searchable roster with tests taken, average score, last-active, and
  at-risk flag; drill down to an individual's score history and subject balance.
- **Batch Management** — create/delete batches, add and remove students.
- **Doubt Queue** — real-time incoming queue, accept ownership, chat, and launch a Jitsi
  video session.

### Student Portal
- **Dashboard** — real rank, tests submitted, weighted accuracy, and the actual list of
  assigned tests with correct Start / Resume / View Result state.
- **Assessment Arena** — locked exam layout, question palette, flagging, autosave per answer,
  and auto-submit when the timer expires.
- **Results** — score, pass/fail, rank, time taken, subject-wise accuracy, and a full answer
  review showing the student's choice against the correct one.
- **Analytics Hub** — score history, subject-strength radar, weak areas, revision priorities.
- **Leaderboard** — national rankings plus a "your standing" panel with neighbouring ranks.
- **Live Doubts** — raise a doubt, watch its status change in real time, and chat with the
  teacher who accepts it.

---

## 🚧 Known Gaps

### Not built yet
- **SubjectLanding** and **PDFPreviewModal** are static mockups.
- **Lectures** has a complete backend module but no UI.
- **Notification preferences** toggle in the browser only — nothing is persisted or delivered.
- **Password change** and **avatar upload** have no backend support; the forms were removed
  rather than left as no-ops.
- **Batch start/end dates** and **assigned teacher** aren't columns on `batches`.

### Technical debt
- [ ] **Row Level Security** — enable RLS on every table so a leaked token can't read
      another institution's data. Service-layer guards are the only protection today.
- [ ] **Schema in version control** — export the Supabase schema to migrations.
- [ ] **Background queue (BullMQ + Redis)** — PDF processing currently runs synchronously
      inside the request via `execAsync`, so uploads block for 1–2 minutes and can time out.
      Move it to a queue and stream progress over the existing Socket.IO connection.
- [ ] **Hardcoded API URL** — move `BASE_URL` in `frontend/src/api/client.js` to an env var.
- [ ] **Database indexes** on `questions(subject, topic, difficulty)` and the foreign keys
      analytics aggregates over.
- [ ] **Groq key rotation** — round-robin keys and backoff instead of dropping questions.
- [ ] **Temp file cleanup** — sweep abandoned `/temp/<runId>` directories on a cron.
- [ ] **Deduplicate the Python pipeline** — one canonical copy, not two divergent ones.
- [ ] **Vision LLM fallback** for pages where text extraction fails.
- [ ] **LaTeX/MathML rendering** instead of image crops for equations.
- [ ] **Manual QA queue** for teachers to verify AI-parsed questions before they go live.
- [ ] **Responsive design** for the teacher dashboard on tablet and mobile.

### Testing
- [x] Backend unit tests for `QuestionsService`, `TestsService`, `AnalyticsService`,
      `UsersService`, and `AttemptsService` (44 tests).
- [ ] Backend tests for controllers, guards, and `PdfProcessorService`.
- [ ] Frontend component tests (data grid, uploader, exam timer).
- [ ] `pytest` suites for `extract.py` / `classify.py` against fixture PDFs.
- [ ] Integration test: upload a PDF buffer → verify the resulting rows.
- [ ] E2E (Playwright): log in, build a test, take it as a student, check the result.
- [ ] Load testing for concurrent uploads once the queue exists.

### Deployment
- [ ] Dockerfiles + `docker-compose.yml` covering the Node and Python environments.
- [ ] GitHub Actions for lint + test on every PR.
- [ ] Production hosting (Render/Railway/ECS for the API, Vercel/Netlify for the SPA).
- [ ] Separate dev / staging / prod Supabase projects and `.env` files.

---

*This document is the master tracking list for features, technical debt, and QA.*
