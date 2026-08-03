-- ============================================================================
--  Migration 004 — test_teachers junction table (multi-teacher assignment)
--  Run in Supabase SQL Editor
-- ============================================================================

-- Junction table: one row per teacher assigned to a test
create table if not exists public.test_teachers (
  test_id    uuid not null references public.tests(id)    on delete cascade,
  teacher_id uuid not null references public.users(id)    on delete cascade,
  subject    text,                          -- optional: Physics / Chemistry / Mathematics
  assigned_at timestamptz not null default now(),
  primary key (test_id, teacher_id)
);

create index if not exists idx_test_teachers_test    on public.test_teachers (test_id);
create index if not exists idx_test_teachers_teacher on public.test_teachers (teacher_id);

-- RLS (service_role bypasses, same pattern as the rest of the schema)
alter table public.test_teachers enable row level security;

drop policy if exists test_teachers_staff_all on public.test_teachers;
create policy test_teachers_staff_all on public.test_teachers
  for all using (public.is_staff()) with check (public.is_staff());

-- Teachers can see their own assignments
drop policy if exists test_teachers_self_read on public.test_teachers;
create policy test_teachers_self_read on public.test_teachers
  for select using (teacher_id = auth.uid());
