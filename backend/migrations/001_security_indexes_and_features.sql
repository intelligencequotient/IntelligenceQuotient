-- ============================================================================
--  EduCommand / IQ — Migration 001
--  Row Level Security, performance indexes, and columns for the new features.
--
--  HOW TO RUN
--    Supabase Dashboard -> SQL Editor -> paste this file -> Run.
--    It is idempotent: safe to run more than once.
--
--  IMPORTANT — why enabling RLS does not break the API
--    The NestJS backend connects with the SERVICE ROLE key, which bypasses RLS
--    entirely. These policies exist as defence-in-depth: if the anon/publishable
--    key ever leaks, a client still cannot read another student's answers or the
--    answer key. Nothing in the backend needs to change.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 0. Extensions
-- ---------------------------------------------------------------------------
create extension if not exists pg_trgm;

-- ---------------------------------------------------------------------------
-- 1. New columns
-- ---------------------------------------------------------------------------

-- Negative marking is currently only stored in the test description string.
-- These columns make it a real, gradable property (read by AttemptsService).
alter table public.tests add column if not exists negative_marking boolean not null default false;
alter table public.tests add column if not exists negative_marks   numeric(4,2) not null default 0;

-- Admin "Test Initiation" posts these two fields.
alter table public.tests add column if not exists subject      text;
alter table public.tests add column if not exists instructions text;

-- Manual QA / approval queue for AI-extracted questions.
-- Existing rows are grandfathered in as 'approved' so nothing disappears.
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'questions' and column_name = 'review_status'
  ) then
    alter table public.questions add column review_status text not null default 'approved';
    alter table public.questions add constraint questions_review_status_check
      check (review_status in ('pending', 'approved', 'rejected'));
  end if;
end $$;

alter table public.questions add column if not exists reviewed_by  uuid references public.users(id);
alter table public.questions add column if not exists reviewed_at  timestamptz;
alter table public.questions add column if not exists source       text;   -- 'manual' | 'csv' | 'pdf'

-- ---------------------------------------------------------------------------
-- 2. Integrity constraints the application logic already assumes
-- ---------------------------------------------------------------------------

-- AttemptsService upserts on (attempt_id, question_id).
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'answers_attempt_question_unique'
  ) then
    alter table public.answers
      add constraint answers_attempt_question_unique unique (attempt_id, question_id);
  end if;
end $$;

-- One attempt per student per test.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'attempts_student_test_unique'
  ) then
    alter table public.attempts
      add constraint attempts_student_test_unique unique (student_id, test_id);
  end if;
end $$;

-- A student should not be assigned the same test twice.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'test_assignments_test_student_unique'
  ) then
    alter table public.test_assignments
      add constraint test_assignments_test_student_unique unique (test_id, student_id);
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 3. Performance indexes
-- ---------------------------------------------------------------------------

-- Question Bank filtering — the composite covers the common
-- "active questions for subject X at difficulty Y" query.
create index if not exists idx_questions_active_subject_difficulty
  on public.questions (is_active, subject, difficulty);
create index if not exists idx_questions_topic        on public.questions (topic);
create index if not exists idx_questions_q_type       on public.questions (q_type);
create index if not exists idx_questions_created_at   on public.questions (created_at desc);
create index if not exists idx_questions_review_status on public.questions (review_status)
  where review_status <> 'approved';

-- Free-text search uses ILIKE '%...%', which only an index of this kind can serve.
create index if not exists idx_questions_text_trgm
  on public.questions using gin (question_text gin_trgm_ops);

-- Attempts & grading
create index if not exists idx_attempts_student   on public.attempts (student_id);
create index if not exists idx_attempts_test      on public.attempts (test_id, status);
create index if not exists idx_attempts_open      on public.attempts (status) where status = 'in_progress';
create index if not exists idx_answers_attempt    on public.answers (attempt_id);
create index if not exists idx_answers_question   on public.answers (question_id);

-- Test wiring
create index if not exists idx_test_questions_test    on public.test_questions (test_id, question_order);
create index if not exists idx_test_assignments_stud  on public.test_assignments (student_id);
create index if not exists idx_test_assignments_test  on public.test_assignments (test_id);
create index if not exists idx_tests_status           on public.tests (status, created_at desc);

-- Doubts queue & chat
create index if not exists idx_doubts_student    on public.doubts (student_id, created_at desc);
create index if not exists idx_doubts_queue      on public.doubts (status, accepted_by, created_at);
create index if not exists idx_doubt_messages    on public.doubt_messages (doubt_id, sent_at);

-- Batches
create index if not exists idx_batch_students_batch on public.batch_students (batch_id);
create index if not exists idx_batch_students_stud  on public.batch_students (student_id);
create index if not exists idx_batches_created_by   on public.batches (created_by);

-- ---------------------------------------------------------------------------
-- 4. Helper functions for RLS (security definer -> can read users table)
-- ---------------------------------------------------------------------------

create or replace function public.current_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.users where id = auth.uid();
$$;

create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_role() in ('teacher', 'admin'), false);
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_role() = 'admin', false);
$$;

-- ---------------------------------------------------------------------------
-- 5. Row Level Security
--    Enable on every table holding user data. service_role bypasses all of this.
-- ---------------------------------------------------------------------------

alter table public.users             enable row level security;
alter table public.batches           enable row level security;
alter table public.batch_students    enable row level security;
alter table public.questions         enable row level security;
alter table public.tests             enable row level security;
alter table public.test_questions    enable row level security;
alter table public.test_assignments  enable row level security;
alter table public.attempts          enable row level security;
alter table public.answers           enable row level security;
alter table public.doubts            enable row level security;
alter table public.doubt_messages    enable row level security;

-- Drop-then-create so the file can be re-run.
drop policy if exists users_self_read      on public.users;
drop policy if exists users_staff_read     on public.users;
drop policy if exists users_self_update    on public.users;
create policy users_self_read   on public.users for select using (id = auth.uid());
create policy users_staff_read  on public.users for select using (public.is_staff());
create policy users_self_update on public.users for update using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists batches_staff_all on public.batches;
create policy batches_staff_all on public.batches for all using (public.is_staff()) with check (public.is_staff());

drop policy if exists batch_students_staff_all on public.batch_students;
drop policy if exists batch_students_self_read on public.batch_students;
create policy batch_students_staff_all on public.batch_students for all
  using (public.is_staff()) with check (public.is_staff());
create policy batch_students_self_read on public.batch_students for select
  using (student_id = auth.uid());

-- Questions: staff manage them. Students never select from this table directly —
-- the API strips correct_answer before it reaches them.
drop policy if exists questions_staff_all on public.questions;
create policy questions_staff_all on public.questions for all
  using (public.is_staff()) with check (public.is_staff());

drop policy if exists tests_staff_all       on public.tests;
drop policy if exists tests_student_read    on public.tests;
create policy tests_staff_all on public.tests for all
  using (public.is_staff()) with check (public.is_staff());
-- A student may see a test only if it is published AND assigned to them.
create policy tests_student_read on public.tests for select using (
  status = 'published'
  and exists (
    select 1 from public.test_assignments ta
    where ta.test_id = tests.id and ta.student_id = auth.uid()
  )
);

drop policy if exists test_questions_staff_all on public.test_questions;
create policy test_questions_staff_all on public.test_questions for all
  using (public.is_staff()) with check (public.is_staff());

drop policy if exists test_assignments_staff_all  on public.test_assignments;
drop policy if exists test_assignments_self_read  on public.test_assignments;
create policy test_assignments_staff_all on public.test_assignments for all
  using (public.is_staff()) with check (public.is_staff());
create policy test_assignments_self_read on public.test_assignments for select
  using (student_id = auth.uid());

-- Attempts: a student sees only their own; staff see all (for results pages).
drop policy if exists attempts_self_read   on public.attempts;
drop policy if exists attempts_staff_read  on public.attempts;
create policy attempts_self_read  on public.attempts for select using (student_id = auth.uid());
create policy attempts_staff_read on public.attempts for select using (public.is_staff());

-- Answers: reachable only through an attempt the caller owns.
drop policy if exists answers_self_read  on public.answers;
drop policy if exists answers_staff_read on public.answers;
create policy answers_self_read on public.answers for select using (
  exists (
    select 1 from public.attempts a
    where a.id = answers.attempt_id and a.student_id = auth.uid()
  )
);
create policy answers_staff_read on public.answers for select using (public.is_staff());

-- Doubts: the student who raised it, the teacher who owns it, any admin,
-- plus any teacher while it is still an unclaimed item in the queue.
drop policy if exists doubts_participant_read on public.doubts;
drop policy if exists doubts_participant_write on public.doubts;
create policy doubts_participant_read on public.doubts for select using (
  student_id = auth.uid()
  or accepted_by = auth.uid()
  or public.is_admin()
  or (public.current_role() = 'teacher' and accepted_by is null and status = 'pending')
);
create policy doubts_participant_write on public.doubts for update using (
  student_id = auth.uid() or accepted_by = auth.uid() or public.is_admin()
);

drop policy if exists doubt_messages_participant_read on public.doubt_messages;
drop policy if exists doubt_messages_participant_send on public.doubt_messages;
create policy doubt_messages_participant_read on public.doubt_messages for select using (
  exists (
    select 1 from public.doubts d
    where d.id = doubt_messages.doubt_id
      and (d.student_id = auth.uid() or d.accepted_by = auth.uid() or public.is_admin())
  )
);
create policy doubt_messages_participant_send on public.doubt_messages for insert with check (
  sender_id = auth.uid()
  and exists (
    select 1 from public.doubts d
    where d.id = doubt_messages.doubt_id
      and (d.student_id = auth.uid() or d.accepted_by = auth.uid() or public.is_admin())
  )
);

-- ---------------------------------------------------------------------------
-- 6. Spaced repetition + predictions
--    These tables were read by AnalyticsService but never created/written.
-- ---------------------------------------------------------------------------

create table if not exists public.spaced_repetition_state (
  id               uuid primary key default gen_random_uuid(),
  student_id       uuid not null references public.users(id) on delete cascade,
  question_id      uuid not null references public.questions(id) on delete cascade,
  repetitions      integer     not null default 0,
  ease_factor      numeric(4,2) not null default 2.5,
  interval_days    integer     not null default 0,
  due_at           timestamptz not null default now(),
  mastery_level    numeric(4,3) not null default 0,   -- 0..1
  priority_weight  numeric(6,3) not null default 1,   -- higher = revise sooner
  last_reviewed_at timestamptz,
  updated_at       timestamptz not null default now(),
  unique (student_id, question_id)
);

create index if not exists idx_srs_student_priority
  on public.spaced_repetition_state (student_id, priority_weight desc);
create index if not exists idx_srs_due on public.spaced_repetition_state (student_id, due_at);

create table if not exists public.predictions (
  id              uuid primary key default gen_random_uuid(),
  student_id      uuid not null references public.users(id) on delete cascade,
  subject         text not null,
  topic           text,
  predicted_score numeric(6,2) not null default 0,
  accuracy        numeric(5,2) not null default 0,
  sample_size     integer not null default 0,
  risk_flag       boolean not null default false,
  computed_at     timestamptz not null default now(),
  unique (student_id, subject, topic)
);

create index if not exists idx_predictions_student on public.predictions (student_id);
create index if not exists idx_predictions_risk    on public.predictions (risk_flag) where risk_flag;

alter table public.spaced_repetition_state enable row level security;
alter table public.predictions             enable row level security;

drop policy if exists srs_self_read         on public.spaced_repetition_state;
drop policy if exists srs_staff_read        on public.spaced_repetition_state;
create policy srs_self_read  on public.spaced_repetition_state for select using (student_id = auth.uid());
create policy srs_staff_read on public.spaced_repetition_state for select using (public.is_staff());

drop policy if exists predictions_self_read  on public.predictions;
drop policy if exists predictions_staff_read on public.predictions;
create policy predictions_self_read  on public.predictions for select using (student_id = auth.uid());
create policy predictions_staff_read on public.predictions for select using (public.is_staff());

-- ---------------------------------------------------------------------------
-- 7. Lectures / syllabus (backend module existed, tables may not)
-- ---------------------------------------------------------------------------

create table if not exists public.lectures (
  id               uuid primary key default gen_random_uuid(),
  subject          text not null,
  topic            text,
  title            text not null,
  drive_url        text,
  duration_minutes integer,
  uploaded_by      uuid references public.users(id),
  created_at       timestamptz not null default now()
);

create table if not exists public.syllabus_items (
  id          uuid primary key default gen_random_uuid(),
  subject     text not null,
  topic       text not null,
  subtopic    text,
  order_index integer not null default 0,
  created_at  timestamptz not null default now()
);

create index if not exists idx_lectures_subject on public.lectures (subject, topic);
create index if not exists idx_syllabus_subject on public.syllabus_items (subject, order_index);

alter table public.lectures       enable row level security;
alter table public.syllabus_items enable row level security;

drop policy if exists lectures_read      on public.lectures;
drop policy if exists lectures_staff_write on public.lectures;
create policy lectures_read        on public.lectures for select using (auth.uid() is not null);
create policy lectures_staff_write on public.lectures for all
  using (public.is_staff()) with check (public.is_staff());

drop policy if exists syllabus_read on public.syllabus_items;
create policy syllabus_read on public.syllabus_items for select using (auth.uid() is not null);

-- ---------------------------------------------------------------------------
-- 8. Storage: question-images bucket
-- ---------------------------------------------------------------------------

-- Public read (question diagrams are embedded in <img> tags), writes via service role only.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'question-images',
  'question-images',
  true,
  5242880,                                              -- 5 MB
  array['image/png','image/jpeg','image/gif','image/webp']
)
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists question_images_public_read on storage.objects;
create policy question_images_public_read on storage.objects
  for select using (bucket_id = 'question-images');

-- No insert/update/delete policy is defined on purpose: only the service role
-- (the NestJS backend) may write, so clients cannot upload arbitrary files.

commit;

-- ---------------------------------------------------------------------------
-- POST-MIGRATION NOTE
--   Set Cache-Control on the bucket for CDN caching. Supabase applies the value
--   supplied at upload time; the backend now sends `cacheControl: '31536000'`.
--   Existing objects keep their old header until re-uploaded.
-- ---------------------------------------------------------------------------
