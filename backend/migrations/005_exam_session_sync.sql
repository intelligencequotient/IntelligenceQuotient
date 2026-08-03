-- ============================================================================
--  EduCommand / IQ — Migration 005
--  Makes the admin -> student -> secure-exam handoff actually hold together.
--
--  HOW TO RUN
--    Supabase Dashboard -> SQL Editor -> paste this file -> Run.
--    Idempotent: safe to run more than once.
--
--  WHY
--    1. The exam UI tracks a per-question palette state (answered / marked /
--       not_visited). Nothing persisted it, so a resumed attempt came back with
--       a blank palette even though the answers were still there.
--    2. Proctoring violations were posted to a service that does not own this
--       flow, against a table keyed on `exam_sessions` — a table the portal
--       never writes to. Violations now hang off `attempts`, like everything
--       else in this flow.
--    3. `test_assignments` had no uniqueness, so a student who belongs to two
--       batches that were both assigned the same test got two rows. Every read
--       used `.single()`, which fails on two rows — the dashboard listed the
--       test but starting it returned "You are not assigned to this test".
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. Palette state for a resumed attempt
-- ---------------------------------------------------------------------------
alter table public.answers
  add column if not exists status text not null default 'not_visited';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'answers_status_check'
  ) then
    alter table public.answers add constraint answers_status_check
      check (status in ('not_visited', 'not_answered', 'answered', 'marked', 'answered_marked'));
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Proctoring violations, keyed on the attempt the portal actually creates
-- ---------------------------------------------------------------------------
create table if not exists public.attempt_violations (
  id          uuid primary key default gen_random_uuid(),
  attempt_id  uuid not null references public.attempts(id) on delete cascade,
  student_id  uuid not null references public.users(id) on delete cascade,
  type        text not null,
  detail      text,
  created_at  timestamptz not null default now()
);

create index if not exists idx_attempt_violations_attempt
  on public.attempt_violations (attempt_id, created_at);

alter table public.attempt_violations enable row level security;

-- The backend uses the service role key and bypasses RLS; these policies are
-- defence-in-depth for the case where a publishable key leaks.
drop policy if exists attempt_violations_self_read on public.attempt_violations;
create policy attempt_violations_self_read on public.attempt_violations
  for select using (student_id = auth.uid());

drop policy if exists attempt_violations_staff_read on public.attempt_violations;
create policy attempt_violations_staff_read on public.attempt_violations
  for select using (public.is_staff());

-- ---------------------------------------------------------------------------
-- 3. One assignment row per (test, student)
-- ---------------------------------------------------------------------------

-- Collapse existing duplicates first: keep the widest window, drop the rest.
with ranked as (
  select id,
         row_number() over (
           partition by test_id, student_id
           order by scheduled_start asc nulls first, scheduled_end desc nulls last, id
         ) as rn
  from public.test_assignments
)
delete from public.test_assignments ta
using ranked r
where ta.id = r.id and r.rn > 1;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'test_assignments_test_student_unique'
  ) then
    alter table public.test_assignments
      add constraint test_assignments_test_student_unique unique (test_id, student_id);
  end if;
end $$;

commit;
