-- ============================================================================
--  EduCommand / IQ — Migration 008
--  Lets the PDF pipeline file questions by Subject -> Topic -> Question Type.
--
--  HOW TO RUN
--    Supabase Dashboard -> SQL Editor -> paste this file -> Run.
--    Idempotent: safe to run more than once.
--
--  WHY
--    The PDF processor used to write `q_type = 'single_correct'` for every
--    question it extracted, whatever the paper actually asked. A numerical
--    question therefore reached students as a four-option MCQ with placeholder
--    options — unanswerable — and the question bank could not be filtered by
--    answer format at all, so a JEE Advanced section that needs six
--    multi-correct questions had to be filled by reading each one.
--
--    classify.py now decides the type from the paper's own section banners,
--    its printed answer key and the classifier AI, and writes one of the four
--    values the API's write contract accepts (QUESTION_TYPES in
--    dto/question.dto.ts). Two things have to be true in the database for that
--    to land:
--
--      1. `questions.q_type` must accept all four values. Where it is an enum,
--         a value the type does not know fails the whole insert batch with
--         22P02 — the same class of failure migration 007 fixed for
--         `tests.t_type`.
--      2. Browsing the new hierarchy needs an index that matches it.
--
--  NOTE ON EXISTING ROWS
--    Questions extracted before this migration were all stored as
--    'single_correct' and the evidence for their real type was never kept, so
--    there is nothing to backfill from. They stay as they are; a reviewer
--    corrects them in the Review Queue.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Make sure every question type is a legal value
-- ---------------------------------------------------------------------------
-- Deliberately outside the transaction below: `alter type ... add value` may
-- not be used in the same transaction that goes on to write the new label.
do $$
declare
  type_name text;
  wanted    text;
begin
  -- The enum backing q_type, if it is an enum at all (it may be plain text).
  select t.typname
    into type_name
    from pg_attribute   a
    join pg_class       c on c.oid = a.attrelid
    join pg_namespace   n on n.oid = c.relnamespace
    join pg_type        t on t.oid = a.atttypid
   where n.nspname = 'public'
     and c.relname = 'questions'
     and a.attname = 'q_type'
     and t.typtype = 'e';

  if type_name is null then
    raise notice 'questions.q_type is not an enum — nothing to extend.';
    return;
  end if;

  foreach wanted in array array['single_correct', 'multi_correct', 'numerical', 'assertion']
  loop
    if not exists (
      select 1
        from pg_enum e
        join pg_type t on t.oid = e.enumtypid
       where t.typname = type_name
         and e.enumlabel = wanted
    ) then
      execute format('alter type public.%I add value %L', type_name, wanted);
      raise notice 'Added % to enum %', wanted, type_name;
    end if;
  end loop;
end $$;

begin;

-- ---------------------------------------------------------------------------
-- 2. Index for the Subject -> Topic -> Question Type drill-down
-- ---------------------------------------------------------------------------
-- Filling a paper's sections asks "approved Physics / Rotational Motion /
-- multi_correct questions". Migration 001 indexed those columns separately,
-- which makes Postgres pick one and filter the rest by hand; the composite
-- serves the whole predicate, and the leading column still serves a
-- subject-only or subject+topic query.
create index if not exists idx_questions_subject_topic_q_type
  on public.questions (subject, topic, q_type);

commit;
