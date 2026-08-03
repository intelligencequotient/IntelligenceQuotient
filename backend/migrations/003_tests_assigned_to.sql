-- ============================================================================
--  Migration 003 — assigned_to on tests
--  Run in Supabase SQL Editor
-- ============================================================================

alter table public.tests
  add column if not exists assigned_to uuid references public.users(id);

-- Index so "find tests assigned to teacher X" is fast
create index if not exists idx_tests_assigned_to on public.tests (assigned_to);
