-- ============================================================================
--  EduCommand / IQ — Migration 006
--  Indexes for the queries that only start to hurt at cohort scale (~1000
--  students sitting the same paper).
--
--  HOW TO RUN
--    Supabase Dashboard -> SQL Editor -> paste this file -> Run.
--    Idempotent: safe to run more than once.
--
--  WHY
--    Result pages, leaderboards and the per-attempt rank all reduce to counting
--    or scanning `attempts` filtered by test and status, and `answers` filtered
--    by attempt. With one row per student per test those are the tables that
--    grow fastest, and every one of these queries was doing a sequential scan.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- Rank + percentile: three COUNT(*) queries per result view, all of the form
--   where test_id = ? and status = 'submitted' and total_score > ?
-- Including total_score makes them index-only.
-- ---------------------------------------------------------------------------
create index if not exists idx_attempts_test_status_score
  on public.attempts (test_id, status, total_score);

-- The student's own history list, newest first.
create index if not exists idx_attempts_student_started
  on public.attempts (student_id, started_at desc);

-- Leaderboard aggregate: every submitted attempt, paged by primary key.
create index if not exists idx_attempts_submitted
  on public.attempts (status, id) where status = 'submitted';

-- ---------------------------------------------------------------------------
-- Grading writes one row per answered question and the result page reads them
-- all back; the per-question difficulty breakdown reads them across every
-- attempt on a test.
-- ---------------------------------------------------------------------------
create index if not exists idx_answers_attempt_question
  on public.answers (attempt_id, question_id);

create index if not exists idx_answers_question_correct
  on public.answers (question_id, is_correct);

-- ---------------------------------------------------------------------------
-- Assignment lookups run on every exam start and on every paper fetch.
-- ---------------------------------------------------------------------------
create index if not exists idx_test_assignments_student_test
  on public.test_assignments (student_id, test_id);

create index if not exists idx_test_assignments_test_window
  on public.test_assignments (test_id, scheduled_start, scheduled_end);

-- ---------------------------------------------------------------------------
-- Spaced repetition and predictions are rewritten after every submission.
-- ---------------------------------------------------------------------------
create index if not exists idx_srs_student_question
  on public.spaced_repetition_state (student_id, question_id);

create index if not exists idx_predictions_student_subject
  on public.predictions (student_id, subject);

-- ---------------------------------------------------------------------------
-- Proctoring: the strike counter runs `count(*) where attempt_id = ?` on every
-- violation event, and a tab-switching student can generate a lot of those.
-- ---------------------------------------------------------------------------
create index if not exists idx_attempt_violations_count
  on public.attempt_violations (attempt_id);

-- ---------------------------------------------------------------------------
-- Staff lists: the CRM pages sort by name within a role.
-- ---------------------------------------------------------------------------
create index if not exists idx_users_role_name
  on public.users (role, full_name);

commit;
