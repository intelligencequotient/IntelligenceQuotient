-- ============================================================================
--  Migration 002 — Test Format columns
--  Run in Supabase SQL Editor
-- ============================================================================

alter table public.tests add column if not exists test_type       text default 'custom';
alter table public.tests add column if not exists preset_config   text;   -- JSON string of JEE preset
alter table public.tests add column if not exists custom_sections text;   -- JSON string of custom sections
