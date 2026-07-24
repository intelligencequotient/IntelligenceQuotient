# EduCommand — Backend Implementation Plan
### NestJS + PostgreSQL + Socket.IO for 1,000–1,200 Students

A fully detailed backend plan for the **EduCommand** EdTech platform, reverse-engineered from the React frontend. This covers every route, every database table, every real-time event, and the complete project structure.

---

## 1. Technology Stack Decision

| Layer | Technology | Why |
|---|---|---|
| **Framework** | **NestJS** (not plain Express) | Structured, modular, scales cleanly, built-in DI, guards, pipes, interceptors |
| **Language** | TypeScript | Same as frontend, type-safe, matches NestJS best practices |
| **Database** | **PostgreSQL** | Relational, ACID-compliant, perfect for student/test/batch data |
| **ORM** | **TypeORM** | Native NestJS integration, migrations, entity decorators |
| **Real-time** | **Socket.IO** (`@nestjs/websockets`) | Doubt chat room requires bidirectional real-time messaging |
| **Auth** | **JWT + Passport** (`@nestjs/passport`, `passport-jwt`) | Stateless, scalable, role-based access |
| **File Uploads** | **Multer** (`@nestjs/platform-express`) | CSV & PDF file handling |
| **CSV Parsing** | **csv-parser** | Stream-based, memory-efficient |
| **PDF Parsing** | **pdf-parse** | Extract questions from PDF uploads |
| **Caching** | **Redis** (`@nestjs/cache-manager`) | Leaderboard, session, rate-limiting |
| **Validation** | **class-validator + class-transformer** | DTO validation on all endpoints |
| **Testing** | **Jest** (built-in with NestJS) | Unit + integration tests |
| **API Docs** | **Swagger** (`@nestjs/swagger`) | Auto-generate OpenAPI docs |

---

## 2. Project Structure

```
backend/
├── src/
│   ├── main.ts                        # App bootstrap, CORS, Swagger, Socket.IO
│   ├── app.module.ts                  # Root module
│   │
│   ├── config/
│   │   ├── database.config.ts         # TypeORM config
│   │   ├── jwt.config.ts              # JWT secret, expiry
│   │   └── redis.config.ts            # Redis connection
│   │
│   ├── common/
│   │   ├── guards/
│   │   │   ├── jwt-auth.guard.ts      # Protect routes
│   │   │   └── roles.guard.ts         # Role-based access (student/teacher/admin)
│   │   ├── decorators/
│   │   │   ├── roles.decorator.ts     # @Roles('teacher')
│   │   │   └── current-user.decorator.ts  # @CurrentUser()
│   │   ├── interceptors/
│   │   │   └── transform.interceptor.ts   # Standardize all API responses
│   │   ├── filters/
│   │   │   └── http-exception.filter.ts   # Global error handler
│   │   └── dto/
│   │       └── pagination.dto.ts          # Reusable page/limit DTO
│   │
│   ├── modules/
│   │   ├── auth/                      # Login, JWT, token refresh
│   │   ├── users/                     # Student + Teacher profiles
│   │   ├── batches/                   # Batch management
│   │   ├── questions/                 # Question bank CRUD + bulk upload
│   │   ├── tests/                     # Test construction & scheduling
│   │   ├── attempts/                  # Student exam attempts & submissions
│   │   ├── analytics/                 # Student + cohort analytics
│   │   ├── leaderboard/               # Rankings + score computation
│   │   ├── doubts/                    # Doubt queue + real-time chat
│   │   └── uploads/                   # CSV/PDF file processing
│   │
│   └── database/
│       ├── migrations/                # TypeORM migration files
│       └── seeds/                     # Seed data for demo credentials
│
├── .env                               # Environment variables
├── package.json
├── tsconfig.json
└── ormconfig.ts                       # TypeORM CLI config
```

---

## 3. Database Schema (PostgreSQL)

### 3.1 — `users` table
```sql
CREATE TABLE users (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        VARCHAR(100) NOT NULL,
  email       VARCHAR(150) UNIQUE NOT NULL,
  password    VARCHAR(255) NOT NULL,           -- bcrypt hash
  role        VARCHAR(20) NOT NULL,             -- 'student' | 'teacher' | 'admin'
  avatar_url  VARCHAR(500),
  is_active   BOOLEAN DEFAULT TRUE,
  created_at  TIMESTAMP DEFAULT NOW(),
  updated_at  TIMESTAMP DEFAULT NOW()
);
```

### 3.2 — `student_profiles` table
```sql
CREATE TABLE student_profiles (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID REFERENCES users(id) ON DELETE CASCADE,
  batch_id    UUID REFERENCES batches(id),
  rank        INTEGER,
  total_score INTEGER DEFAULT 0,
  practices   INTEGER DEFAULT 0,
  tests_taken INTEGER DEFAULT 0,
  accuracy    DECIMAL(5,2) DEFAULT 0,
  speed       DECIMAL(5,2) DEFAULT 0,
  status      VARCHAR(20) DEFAULT 'Active',    -- 'Active' | 'At Risk'
  created_at  TIMESTAMP DEFAULT NOW()
);
```

### 3.3 — `batches` table
```sql
CREATE TABLE batches (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name           VARCHAR(200) NOT NULL,
  status         VARCHAR(50) DEFAULT 'Active', -- 'Active' | 'Intensive' | 'Archived'
  student_count  INTEGER DEFAULT 0,
  start_date     DATE,
  end_date       DATE,
  teacher_id     UUID REFERENCES users(id),
  created_at     TIMESTAMP DEFAULT NOW()
);
```

### 3.4 — `questions` table
```sql
CREATE TABLE questions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subject      VARCHAR(50) NOT NULL,            -- 'Physics' | 'Chemistry' | 'Mathematics' | 'Biology'
  text         TEXT NOT NULL,
  type         VARCHAR(50) DEFAULT 'Single Choice',
  difficulty   VARCHAR(20) NOT NULL,             -- 'Easy' | 'Medium' | 'Hard'
  options      JSONB NOT NULL,                   -- ["opt A", "opt B", "opt C", "opt D"]
  correct      INTEGER NOT NULL,                 -- 0-indexed: 0=A, 1=B, 2=C, 3=D
  solution     TEXT,                             -- Explanation
  image_url    VARCHAR(500),                     -- Optional image attachment
  created_by   UUID REFERENCES users(id),
  times_used   INTEGER DEFAULT 0,
  last_used_at TIMESTAMP,
  created_at   TIMESTAMP DEFAULT NOW()
);
```

### 3.5 — `tests` table
```sql
CREATE TABLE tests (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title            VARCHAR(200) NOT NULL,
  subject          VARCHAR(50),
  duration_seconds INTEGER NOT NULL,             -- e.g. 3600 for 60 mins
  total_marks      INTEGER NOT NULL,
  negative_marking BOOLEAN DEFAULT FALSE,
  negative_marks   DECIMAL(4,2) DEFAULT 0,
  scheduled_at     TIMESTAMP,
  status           VARCHAR(20) DEFAULT 'Draft', -- 'Draft' | 'Published' | 'Completed'
  created_by       UUID REFERENCES users(id),
  created_at       TIMESTAMP DEFAULT NOW()
);
```

### 3.6 — `test_questions` (join table)
```sql
CREATE TABLE test_questions (
  test_id     UUID REFERENCES tests(id) ON DELETE CASCADE,
  question_id UUID REFERENCES questions(id),
  position    INTEGER NOT NULL,                  -- Question order in the test
  marks       DECIMAL(5,2) DEFAULT 4,
  PRIMARY KEY (test_id, question_id)
);
```

### 3.7 — `test_batches` (join table)
```sql
CREATE TABLE test_batches (
  test_id  UUID REFERENCES tests(id) ON DELETE CASCADE,
  batch_id UUID REFERENCES batches(id),
  PRIMARY KEY (test_id, batch_id)
);
```

### 3.8 — `test_attempts` table
```sql
CREATE TABLE test_attempts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id    UUID REFERENCES users(id),
  test_id       UUID REFERENCES tests(id),
  answers       JSONB,                           -- { "0": 2, "1": 1, ... } (qIndex → selectedOption)
  flagged       JSONB,                           -- [0, 3, 7] (flagged question indices)
  score         DECIMAL(8,2),
  max_score     DECIMAL(8,2),
  correct       INTEGER,
  incorrect     INTEGER,
  unattempted   INTEGER,
  accuracy      DECIMAL(5,2),
  time_taken_s  INTEGER,                         -- seconds
  status        VARCHAR(20) DEFAULT 'In Progress', -- 'In Progress' | 'Submitted'
  started_at    TIMESTAMP DEFAULT NOW(),
  submitted_at  TIMESTAMP,
  UNIQUE (student_id, test_id)                   -- one attempt per student per test
);
```

### 3.9 — `doubts` table
```sql
CREATE TABLE doubts (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id  UUID REFERENCES users(id),
  teacher_id  UUID REFERENCES users(id),         -- assigned teacher
  subject     VARCHAR(50) NOT NULL,
  snippet     TEXT NOT NULL,                      -- initial doubt description
  status      VARCHAR(20) DEFAULT 'Waiting',      -- 'Waiting' | 'Connected' | 'Resolved'
  created_at  TIMESTAMP DEFAULT NOW(),
  resolved_at TIMESTAMP
);
```

### 3.10 — `doubt_messages` table
```sql
CREATE TABLE doubt_messages (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doubt_id   UUID REFERENCES doubts(id) ON DELETE CASCADE,
  sender_id  UUID REFERENCES users(id),
  sender_role VARCHAR(20) NOT NULL,              -- 'student' | 'teacher'
  text        TEXT,
  image_url   VARCHAR(500),
  sent_at     TIMESTAMP DEFAULT NOW()
);
```

---

## 4. API Modules — Detailed Endpoints

### 4.1 — Auth Module (`/api/auth`)

| Method | Endpoint | Guard | Description |
|--------|----------|-------|-------------|
| `POST` | `/auth/login` | Public | Email + password → returns JWT token + user object |
| `POST` | `/auth/refresh` | Public | Refresh token → new access token |
| `POST` | `/auth/logout` | JWT | Invalidate refresh token |
| `GET`  | `/auth/me` | JWT | Get currently logged-in user |

**`POST /auth/login` Request Body:**
```json
{ "email": "student@edu.com", "password": "student123", "role": "student" }
```
**`POST /auth/login` Response:**
```json
{
  "accessToken": "eyJhbGci...",
  "refreshToken": "...",
  "user": { "id": "uuid", "name": "Alex Carter", "email": "...", "role": "student" }
}
```

> **Frontend change needed:** Replace `localStorage.setItem('mock_token', ...)` in `LoginPage.jsx` with a real `POST /auth/login` API call. Store JWT in `localStorage` as `auth_token`.

---

### 4.2 — Users Module (`/api/users`)

| Method | Endpoint | Guard | Description |
|--------|----------|-------|-------------|
| `GET` | `/users/profile` | JWT | Get own full profile |
| `PATCH` | `/users/profile` | JWT | Update name, avatar |
| `PATCH` | `/users/profile/password` | JWT | Change password |
| `GET` | `/users/students` | Teacher | List all students (paginated) |
| `GET` | `/users/students/:id` | Teacher | Get single student profile detail |
| `PATCH` | `/users/students/:id` | Teacher | Update student status (Active/At Risk) |
| `DELETE` | `/users/students/:id` | Admin | Delete student account |

---

### 4.3 — Batches Module (`/api/batches`)

| Method | Endpoint | Guard | Description |
|--------|----------|-------|-------------|
| `GET` | `/batches` | Teacher | List all batches |
| `POST` | `/batches` | Teacher | Create a new batch |
| `GET` | `/batches/:id` | Teacher | Get single batch details |
| `PATCH` | `/batches/:id` | Teacher | Update batch info |
| `DELETE` | `/batches/:id` | Teacher | Archive/delete batch |
| `POST` | `/batches/:id/students` | Teacher | Add students to a batch |
| `DELETE` | `/batches/:id/students/:studentId` | Teacher | Remove student from batch |
| `GET` | `/batches/:id/students` | Teacher | List students in a batch |

---

### 4.4 — Questions Module (`/api/questions`)

| Method | Endpoint | Guard | Description |
|--------|----------|-------|-------------|
| `GET` | `/questions` | Teacher | List all questions (paginated, filterable) |
| `POST` | `/questions` | Teacher | Add a single question |
| `GET` | `/questions/:id` | Teacher | Get a single question |
| `PATCH` | `/questions/:id` | Teacher | Edit a question |
| `DELETE` | `/questions/:id` | Teacher | Delete a question |
| `POST` | `/questions/:id/duplicate` | Teacher | Duplicate a question |
| `POST` | `/questions/bulk-upload` | Teacher | Upload CSV/PDF and import many questions |

**`GET /questions` Query Parameters:**
```
?subject=Physics&difficulty=Medium&type=Single+Choice&search=newton&page=1&limit=20
```

**`POST /questions` Request Body:**
```json
{
  "subject": "Physics",
  "text": "What is Newton's Third Law?",
  "type": "Single Choice",
  "difficulty": "Easy",
  "options": ["Action=Reaction", "F=ma", "Inertia", "Gravity"],
  "correct": 0,
  "solution": "Every action has an equal and opposite reaction."
}
```

---

### 4.5 — Tests Module (`/api/tests`)

| Method | Endpoint | Guard | Description |
|--------|----------|-------|-------------|
| `GET` | `/tests` | Teacher | List all tests (with status filter) |
| `POST` | `/tests` | Teacher | Create test (metadata + questions + target batches) |
| `GET` | `/tests/:id` | JWT | Get test details (student sees only published) |
| `PATCH` | `/tests/:id` | Teacher | Update a draft test |
| `DELETE` | `/tests/:id` | Teacher | Delete a draft test |
| `PATCH` | `/tests/:id/publish` | Teacher | Publish test (makes visible to target batches) |
| `GET` | `/tests/student/available` | Student | List tests available for logged-in student's batch |
| `GET` | `/tests/:id/questions` | Student | Get test questions (no correct answers revealed) |
| `GET` | `/tests/:id/results` | Teacher | Get all student results for a test |

**`POST /tests` Request Body:**
```json
{
  "title": "Weekly Mock Test #4",
  "subject": "Physics",
  "durationSeconds": 3600,
  "totalMarks": 100,
  "negativeMarking": true,
  "negativeMarks": 1,
  "scheduledAt": "2026-08-01T09:00:00Z",
  "targetBatchIds": ["uuid-batch-1", "uuid-batch-2"],
  "questionIds": ["uuid-q1", "uuid-q2", "uuid-q3"]
}
```

> **Critical security rule:** `GET /tests/:id/questions` must **NEVER** return the `correct` field. That field is only exposed at submission time by the backend.

---

### 4.6 — Attempts Module (`/api/attempts`)

This is the most critical module — it handles the live exam session.

| Method | Endpoint | Guard | Description |
|--------|----------|-------|-------------|
| `POST` | `/attempts/start/:testId` | Student | Start a test attempt. Returns attempt ID + server-side start time |
| `PATCH` | `/attempts/:attemptId/save` | Student | Auto-save current answers (called every 30s from frontend) |
| `POST` | `/attempts/:attemptId/submit` | Student | Final submission — backend calculates score |
| `GET` | `/attempts/my` | Student | Get all of student's own past attempts |
| `GET` | `/attempts/:attemptId/result` | Student | Get result of a specific attempt |
| `GET` | `/attempts/test/:testId` | Teacher | Get all student attempts for a test |

**`POST /attempts/start/:testId` Response:**
```json
{
  "attemptId": "uuid",
  "testId": "uuid",
  "startedAt": "2026-08-01T09:00:00.000Z",
  "expiresAt": "2026-08-01T10:00:00.000Z",
  "timeLeftSeconds": 3600
}
```

**`PATCH /attempts/:attemptId/save` Request Body:**
```json
{
  "answers": { "0": 2, "1": 0, "3": 1 },
  "flagged": [2, 5]
}
```

**`POST /attempts/:attemptId/submit` Response:**
```json
{
  "testId": "uuid",
  "score": 64,
  "maxScore": 100,
  "correct": 17,
  "incorrect": 4,
  "unattempted": 4,
  "accuracy": 68.0,
  "timeTakenSeconds": 2847
}
```

> **Key backend logic:** On submit, the backend fetches `test_questions` with the real `correct` answers, compares with student's `answers` JSONB, and calculates the score. Frontend never sees correct answers during the exam.

---

### 4.7 — Analytics Module (`/api/analytics`)

| Method | Endpoint | Guard | Description |
|--------|----------|-------|-------------|
| `GET` | `/analytics/student/me` | Student | Student's own performance over time |
| `GET` | `/analytics/student/:id` | Teacher | Specific student's full analytics |
| `GET` | `/analytics/cohort` | Teacher | Batch-level cohort analytics |
| `GET` | `/analytics/cohort/:batchId` | Teacher | Specific batch analytics |
| `GET` | `/analytics/test/:testId` | Teacher | Per-test analytics (avg score, question-wise) |

**`GET /analytics/student/me` Response Shape:**
```json
{
  "totalScore": 2800,
  "testsAttempted": 14,
  "avgAccuracy": 72.5,
  "avgSpeed": 42,
  "subjectBreakdown": {
    "Physics":     { "accuracy": 68, "attempted": 45 },
    "Chemistry":   { "accuracy": 75, "attempted": 38 },
    "Mathematics": { "accuracy": 80, "attempted": 52 }
  },
  "recentTests": [
    { "testId": "...", "title": "Mock #4", "score": 64, "date": "2026-07-20" }
  ],
  "scoreHistory": [
    { "date": "2026-07-01", "score": 55 },
    { "date": "2026-07-10", "score": 62 },
    { "date": "2026-07-20", "score": 64 }
  ]
}
```

---

### 4.8 — Leaderboard Module (`/api/leaderboard`)

| Method | Endpoint | Guard | Description |
|--------|----------|-------|-------------|
| `GET` | `/leaderboard` | Student | All-India leaderboard (paginated, top 200) |
| `GET` | `/leaderboard/batch/:batchId` | Student | Batch-specific leaderboard |
| `GET` | `/leaderboard/me` | Student | Logged-in student's rank + neighbors |

**Implementation Note:** Leaderboard should be **cached in Redis** with a 5-minute TTL to avoid recalculating rank for every request. Rank is computed from `total_score` in `student_profiles`.

---

### 4.9 — Doubts Module (`/api/doubts`)

| Method | Endpoint | Guard | Description |
|--------|----------|-------|-------------|
| `POST` | `/doubts` | Student | Submit a new doubt |
| `GET` | `/doubts/my` | Student | Student's own doubts history |
| `GET` | `/doubts` | Teacher | All doubts queue (filterable by status) |
| `GET` | `/doubts/:id` | JWT | Get doubt details |
| `PATCH` | `/doubts/:id/assign` | Teacher | Assign doubt to self |
| `PATCH` | `/doubts/:id/resolve` | Teacher | Mark doubt as resolved |
| `GET` | `/doubts/:id/messages` | JWT | Get chat history for a doubt |
| `POST` | `/doubts/:id/messages` | JWT | Send a message (REST fallback) |

---

### 4.10 — Uploads Module (`/api/uploads`)

| Method | Endpoint | Guard | Description |
|--------|----------|-------|-------------|
| `POST` | `/uploads/questions/csv` | Teacher | Upload CSV → parse → return preview data |
| `POST` | `/uploads/questions/pdf` | Teacher | Upload PDF → parse → return preview data |
| `POST` | `/uploads/questions/confirm` | Teacher | Confirm parsed questions → bulk insert to DB |
| `GET` | `/uploads/template/csv` | Teacher | Download the CSV template file |

**CSV Parsing Logic:**
The CSV must follow this column format:
```
question,optA,optB,optC,optD,correct,difficulty,subject
```
The backend validates each row and returns a preview array with a `valid: true/false` and `errorMsg` field — matching exactly what the frontend `CSVUpload.jsx` already expects.

---

## 5. Real-Time Layer — Socket.IO (Doubt Chat)

The `DoubtChatRoom.jsx` and `LiveDoubtClient.jsx` require **real-time bidirectional messaging**.

### Gateway: `DoubtsGateway`

```
namespace: /doubts
```

### Events (Server → Client):
| Event | Payload | Description |
|-------|---------|-------------|
| `message:new` | `{ id, senderId, senderRole, text, imageUrl, sentAt }` | New chat message |
| `doubt:status` | `{ doubtId, status }` | Status change (Waiting → Connected → Resolved) |
| `typing:start` | `{ doubtId, senderRole }` | Typing indicator |
| `typing:stop`  | `{ doubtId, senderRole }` | Typing stopped |

### Events (Client → Server):
| Event | Payload | Description |
|-------|---------|-------------|
| `room:join` | `{ doubtId }` | Join a doubt chat room |
| `room:leave` | `{ doubtId }` | Leave a doubt chat room |
| `message:send` | `{ doubtId, text, imageUrl? }` | Send a message |
| `typing:start` | `{ doubtId }` | User started typing |
| `typing:stop` | `{ doubtId }` | User stopped typing |

### Connection Auth:
```
// Frontend connects with JWT in handshake
const socket = io('/doubts', {
  auth: { token: localStorage.getItem('auth_token') }
});
```
The gateway's `handleConnection` validates the JWT and extracts the user.

---

## 6. Authentication & Authorization

### JWT Strategy
- **Access Token:** 15 minutes expiry
- **Refresh Token:** 7 days expiry (stored in DB or Redis)
- Frontend stores `auth_token` in `localStorage`
- Every API request sends: `Authorization: Bearer <token>`

### Role Guards
```typescript
@Roles('teacher', 'admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Get('/batches')
getBatches() { ... }
```

Roles: `student | teacher | admin`

### Protected Route Mapping (matches `ProtectedRoute.jsx`):
| Frontend Route | Backend Guard |
|---|---|
| `/student/*` | Role = `student` |
| `/teacher/*` | Role = `teacher` OR `admin` |

---

## 7. NestJS Module Breakdown

Each module follows this structure:
```
module/
├── module.module.ts       # Imports, providers, exports
├── module.controller.ts   # Route handlers
├── module.service.ts      # Business logic
├── module.repository.ts   # DB queries (TypeORM)
├── dto/
│   ├── create-X.dto.ts    # Input validation
│   └── update-X.dto.ts
└── entities/
    └── X.entity.ts        # TypeORM entity = DB table
```

---

## 8. Environment Variables (`.env`)

```env
# App
PORT=3000
NODE_ENV=development
FRONTEND_URL=http://localhost:5173

# Database
DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=postgres
DB_PASSWORD=your_password
DB_NAME=educommand

# JWT
JWT_SECRET=your-very-long-secret-key
JWT_ACCESS_EXPIRY=15m
JWT_REFRESH_EXPIRY=7d

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# File Uploads
UPLOAD_DIR=./uploads
MAX_FILE_SIZE_MB=5

# Demo Credentials (matches frontend .env)
DEMO_STUDENT_EMAIL=student@edu.com
DEMO_STUDENT_PASSWORD=student123
DEMO_TEACHER_EMAIL=teacher@edu.com
DEMO_TEACHER_PASSWORD=teacher123
```

---

## 9. Scalability for 1,000–1,200 Students

### Why this architecture handles it:
| Concern | Solution |
|---|---|
| **Concurrent exam submissions** | Postgres `UNIQUE (student_id, test_id)` prevents duplicates; auto-save every 30s reduces final load |
| **Leaderboard queries** | Redis cache (5-min TTL) avoids N+1 DB queries |
| **Doubt real-time messages** | Socket.IO with Redis adapter allows horizontal scaling if needed |
| **Bulk question uploads** | CSV parsed as a stream, not loaded into memory at once |
| **DB connection pooling** | TypeORM pool size = 10–20 connections (ample for 1,200 students) |
| **Rate limiting** | `@nestjs/throttler` — 100 req/min per user |

### Estimated load profile:
- Peak: ~400 concurrent students during a scheduled test
- Requests per second during peak: ~50–100 req/s (well within Node.js range)
- Socket connections: ~400 (doubts); each connection is lightweight

---

## 10. Frontend Integration Changes Required

These minimal changes must be made to the existing React frontend to connect it to the real backend:

| File | Change |
|---|---|
| `LoginPage.jsx` | Replace `MOCK_CREDENTIALS` check with `POST /api/auth/login` fetch |
| `ProtectedRoute.jsx` | Read JWT from `auth_token` localStorage key; decode role from token |
| `AppDataContext.jsx` | Replace all `useState` mock data with `useEffect` API calls per module |
| `AssessmentArena.jsx` | Replace localStorage-only with `POST /api/attempts/start/:testId` on mount, auto-save to backend every 30s |
| `DoubtChatRoom.jsx` | Replace mock replies with real Socket.IO connection |
| `LiveDoubtClient.jsx` | Connect to `/doubts` Socket.IO namespace |

A shared `apiClient.ts` (Axios instance) should be created in the frontend with:
```ts
const api = axios.create({ baseURL: import.meta.env.VITE_API_URL });
api.interceptors.request.use(config => {
  config.headers.Authorization = `Bearer ${localStorage.getItem('auth_token')}`;
  return config;
});
```

---

## 11. Implementation Phases

### Phase 1 — Foundation (Week 1)
- [ ] Scaffold NestJS project with TypeScript
- [ ] Set up PostgreSQL + TypeORM entities + migrations
- [ ] Implement `Auth` module (login, JWT, refresh)
- [ ] Implement `Users` module (profile CRUD)
- [ ] Seed demo users (student & teacher accounts)
- [ ] Set up Swagger docs at `/api/docs`

### Phase 2 — Core Features (Week 2)
- [ ] `Batches` module (full CRUD)
- [ ] `Questions` module (full CRUD + search/filter)
- [ ] `Tests` module (create, publish, schedule)
- [ ] `Attempts` module (start, auto-save, submit, score calculation)

### Phase 3 — Real-time & Analytics (Week 3)
- [ ] `Doubts` module (REST endpoints)
- [ ] Socket.IO `DoubtsGateway` (real-time chat)
- [ ] `Analytics` module (student + cohort)
- [ ] `Leaderboard` module with Redis caching

### Phase 4 — Uploads & Polish (Week 4)
- [ ] `Uploads` module (CSV + PDF parsing)
- [ ] Rate limiting via `@nestjs/throttler`
- [ ] Global error handling + logging (Winston)
- [ ] Unit tests for critical services (Attempts, Auth)
- [ ] Integration tests for key API flows

---

## 12. Open Questions

> [!IMPORTANT]
> **Q1: Which deployment platform?** Railway / Render / AWS EC2 / DigitalOcean? This affects how Redis and PostgreSQL are provisioned.

> [!IMPORTANT]
> **Q2: File storage for question images & doubt attachments?** Local filesystem (for now) vs. Cloudinary / AWS S3? The `QuestionBank` has an "Add Image" button and `DoubtChatRoom` has a paperclip/attachment button.

> [!IMPORTANT]
> **Q3: Should students be able to self-register?** Currently login only. Do you need a `POST /auth/register` endpoint, or are student accounts created by teachers via CSV import?

> [!NOTE]
> **Q4: Admin panel?** The frontend has `allowedRoles={['teacher', 'admin']}` in `App.jsx`. Do you need a separate admin interface or is the teacher portal sufficient for now?

> [!NOTE]
> **Q5: Password reset / forgot password?** This requires an email service (Nodemailer + SMTP or Resend/SendGrid). Include it in scope?
