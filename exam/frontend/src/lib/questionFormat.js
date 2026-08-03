/**
 * Translates a question row from the question bank into the shape the exam UI
 * renders.
 *
 * The bank stores `q_type` using the values the admin's Test Initiation presets
 * speak (`single_correct`, `multi_correct`, `integer`), while the exam
 * components were written against the mock papers, which use `type` with the
 * values `mcq` / `msq` / `nat`. Nothing bridged the two, so a real test rendered
 * the question text with no options and no keypad underneath it — the student
 * could read the paper but had no way to answer it.
 *
 * The bank also has no `section` column. JEE splits objective questions
 * (Section A) from numerical ones (Section B), so the section is derived from
 * the question type rather than invented.
 */

const MCQ_TYPES = ['mcq', 'single_correct', 'single', 'scq'];
const MSQ_TYPES = ['msq', 'multi_correct', 'multiple_correct', 'multi', 'multiple'];
const NAT_TYPES = ['nat', 'integer', 'numerical', 'numeric', 'int'];

/** `q_type` (or `type`) -> the three shapes QuestionPanel knows how to render. */
export function normaliseQuestionType(raw, question = {}) {
  const key = String(raw || '').trim().toLowerCase();

  if (MCQ_TYPES.includes(key)) return 'mcq';
  if (MSQ_TYPES.includes(key)) return 'msq';
  if (NAT_TYPES.includes(key)) return 'nat';

  // Unknown or missing type: infer from the payload. A question with options is
  // answered by picking one; a question without any can only be typed in.
  return Array.isArray(question.options) && question.options.length > 0 ? 'mcq' : 'nat';
}

/** Section A = objective, Section B = numerical. Matches the JEE Main pattern. */
export function sectionForType(type) {
  return type === 'nat' ? 'B' : 'A';
}

/**
 * Maps one `test_questions` row from `GET /tests/:id/questions` into a question
 * the exam components can render.
 */
export function normaliseQuestion(row) {
  const question = row?.questions || row || {};
  const type = normaliseQuestionType(question.q_type ?? question.type, question);

  return {
    ...question,
    type,
    section: question.section || sectionForType(type),
    subject: question.subject || 'General',
    marks: row?.marks_override ?? question.marks ?? 4,
  };
}

/** The whole paper, in the order the teacher arranged it. */
export function normalisePaper(rows) {
  return (rows || []).map(normaliseQuestion);
}

/** Distinct subjects in paper order — the exam's subject tabs are built from this. */
export function subjectsInPaper(questions) {
  return [...new Set((questions || []).map((q) => q.subject).filter(Boolean))];
}

/** Distinct sections within one subject, in A→B order. */
export function sectionsInSubject(questions, subject) {
  const sections = new Set(
    (questions || []).filter((q) => q.subject === subject).map((q) => q.section).filter(Boolean),
  );
  return [...sections].sort();
}
