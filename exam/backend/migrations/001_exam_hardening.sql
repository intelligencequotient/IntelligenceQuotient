-- ============================================================================
--  Secure Exam Module — Migration 001 (hardening)
--
--  HOW TO RUN
--    Supabase Dashboard -> SQL Editor -> paste this file -> Run.
--    Idempotent: safe to run more than once. Run it after schema.sql.
--
--  WHY
--    1. schema.sql granted `FOR ALL USING (true)` on all three exam tables.
--       RLS policies apply to the `anon` and `authenticated` roles — the service
--       role bypasses RLS entirely and never needed them — so those policies did
--       not protect the service, they opened the tables to anyone holding the
--       publishable anon key. That is every student, and it means reading or
--       rewriting somebody else's live exam session from the browser console.
--    2. `exam_sessions` had no uniqueness on (student_id, exam_id), so a
--       double-clicked "Start" created two sessions for the same paper and the
--       `maybeSingle()` read that looks for an existing one then errors outright.
--    3. The violation counter and response lookups had no supporting index.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. Replace the permissive policies with owner-scoped ones
-- ---------------------------------------------------------------------------
drop policy if exists "Service Role full access to exam_sessions"  on public.exam_sessions;
drop policy if exists "Service Role full access to exam_responses" on public.exam_responses;
drop policy if exists "Service Role full access to exam_violations" on public.exam_violations;

alter table public.exam_sessions   enable row level security;
alter table public.exam_responses  enable row level security;
alter table public.exam_violations enable row level security;

-- A student may read their own sessions and nothing else. All writes go through
-- the API, which uses the service role key and bypasses RLS; there is
-- deliberately no insert/update policy for `authenticated`.
create policy exam_sessions_self_read on public.exam_sessions
  for select using (student_id = auth.uid());

create policy exam_responses_self_read on public.exam_responses
  for select using (
    exists (
      select 1 from public.exam_sessions s
      where s.id = exam_responses.session_id and s.student_id = auth.uid()
    )
  );

create policy exam_violations_self_read on public.exam_violations
  for select using (
    exists (
      select 1 from public.exam_sessions s
      where s.id = exam_violations.session_id and s.student_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- 2. One session per (student, exam)
-- ---------------------------------------------------------------------------

-- Collapse any duplicates a racing start already created: keep the earliest.
with ranked as (
  select id,
         row_number() over (
           partition by student_id, exam_id order by started_at asc, id
         ) as rn
  from public.exam_sessions
)
delete from public.exam_sessions es
using ranked r
where es.id = r.id and r.rn > 1;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'exam_sessions_student_exam_unique'
  ) then
    alter table public.exam_sessions
      add constraint exam_sessions_student_exam_unique unique (student_id, exam_id);
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 3. Indexes for the hot reads
-- ---------------------------------------------------------------------------
create index if not exists idx_exam_sessions_student
  on public.exam_sessions (student_id, exam_id);

create index if not exists idx_exam_sessions_open
  on public.exam_sessions (status, ends_at) where status = 'in_progress';

create index if not exists idx_exam_responses_session
  on public.exam_responses (session_id);

-- Backs the `count(*) where session_id = ?` the violation limiter runs on every
-- strike; without it each proctoring event scanned the whole table.
create index if not exists idx_exam_violations_session
  on public.exam_violations (session_id);

commit;
