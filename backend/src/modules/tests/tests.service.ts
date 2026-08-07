import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { supabase } from '../../config/supabase.config';
import { throwSupabaseError } from '../../common/db/supabase-error';
import {
  fetchAll,
  fetchAllIn,
  ID_CHUNK_SIZE,
  insertInBatches,
  runInChunks,
} from '../../common/db/query.util';
import {
  AssignTestDto,
  CreateTestDto,
  SaveFullTestDto,
  UpdateTestDto,
} from './dto/test.dto';

/** Allowance for client clock skew, matching AttemptsService. */
const CLOCK_GRACE_SECONDS = 30;

export interface Requester {
  id: string;
  role?: string;
  subject?: string;
}

/** Columns a client may set on a test. Everything else is server-derived. */
const WRITABLE_COLUMNS = [
  'title',
  'description',
  'subject',
  'duration_minutes',
  'negative_marking',
  'negative_marks',
  'instructions',
] as const;

/**
 * Members of the `public.test_type` enum. Anything outside this set is rejected
 * by Postgres with 22P02, so it is mapped rather than passed through.
 */
const TEST_TYPE_VALUES = ['quiz', 'mock_test', 'assignment', 'exam'] as const;

/** Patterns `tests.paper_pattern` accepts (see migration 007). */
const PAPER_PATTERNS = ['jee_main', 'jee_advanced', 'neet', 'custom'] as const;

/**
 * The console sends the exam *pattern* in `t_type` — 'jee_main', 'custom' — but
 * the column is an enum of test *kinds*. They are different axes: a JEE Main
 * mock and a custom mock are both `mock_test`, yet they have different section
 * layouts and different publish rules. This maps a pattern onto the enum; the
 * pattern itself is stored separately in `paper_pattern`.
 */
const PATTERN_TO_TYPE: Record<string, (typeof TEST_TYPE_VALUES)[number]> = {
  jee_main: 'mock_test',
  jee_advanced: 'mock_test',
  neet: 'mock_test',
  custom: 'quiz',
};

@Injectable()
export class TestsService {
  private readonly logger = new Logger(TestsService.name);

  /** Whether migration 007 has been applied. Probed lazily, then remembered. */
  private hasPaperPattern: boolean | null = null;

  // ── Authorisation ───────────────────────────────────────────────────────────

  /**
   * Confirms the caller may administer this test, and 404s when it does not exist.
   *
   * The previous guard was `if (test && test.created_by !== user.id) throw` —
   * which silently allowed the operation when the lookup returned nothing, and
   * was skipped entirely whenever `user` was undefined.
   */
  private async assertCanManage(testId: string, user: Requester): Promise<any> {
    const { data: test } = await supabase
      .from('tests')
      .select('id, created_by, status')
      .eq('id', testId)
      .single();

    if (!test) throw new NotFoundException('Test not found');
    if (user.role === 'admin') return test;
    if (test.created_by === user.id) return test;

    // A teacher assigned to fill this paper may work on it too.
    const { data: collaborator } = await supabase
      .from('test_teachers')
      .select('teacher_id')
      .eq('test_id', testId)
      .eq('teacher_id', user.id)
      .maybeSingle();

    if (collaborator) return test;
    throw new ForbiddenException('You do not have access to this test.');
  }

  /**
   * Confirms a student is assigned this test and that the exam window is open.
   *
   * `GET /api/tests/:id` and `GET /api/tests/:id/questions` used to take only an
   * id, so any logged-in student could pull down the full question paper for any
   * test — including one scheduled for next week, or one assigned to a different
   * batch entirely. Returns the merged window for the caller.
   */
  private async assertStudentMaySit(
    testId: string,
    studentId: string,
    { requireOpen = true } = {},
  ): Promise<void> {
    const { data: test } = await supabase
      .from('tests')
      .select('id, status')
      .eq('id', testId)
      .single();

    if (!test) throw new NotFoundException('Test not found');
    if (test.status !== 'published') {
      throw new ForbiddenException('This test is not available.');
    }

    const { data: rows, error } = await supabase
      .from('test_assignments')
      .select('scheduled_start, scheduled_end')
      .eq('test_id', testId)
      .eq('student_id', studentId);

    if (error) throw new Error(error.message);
    if (!rows?.length) throw new ForbiddenException('You are not assigned to this test.');

    if (!requireOpen) return;

    // Widest window across every batch the student sits in.
    const starts = rows.map((r) => (r.scheduled_start ? new Date(r.scheduled_start).getTime() : null));
    const ends = rows.map((r) => (r.scheduled_end ? new Date(r.scheduled_end).getTime() : null));
    const opensAt = starts.includes(null) ? null : Math.min(...(starts as number[]));
    const closesAt = ends.includes(null) ? null : Math.max(...(ends as number[]));

    const now = Date.now();
    const grace = CLOCK_GRACE_SECONDS * 1000;

    if (opensAt !== null && now < opensAt - grace) {
      throw new ForbiddenException(
        `This test opens at ${new Date(opensAt).toISOString()}.`,
      );
    }
    if (closesAt !== null && now > closesAt + grace) {
      throw new ForbiddenException('The window for this test has closed.');
    }
  }

  /** Strips everything that is not a client-writable column. */
  private pickWritable(body: Record<string, any>): Record<string, any> {
    const out: Record<string, any> = {};
    for (const key of WRITABLE_COLUMNS) {
      if (body?.[key] !== undefined) out[key] = body[key];
    }
    // Negative marks only mean anything when the scheme is on.
    if (out.negative_marking === false) out.negative_marks = 0;

    Object.assign(out, this.resolveTypeAndPattern(body));
    return out;
  }

  /**
   * Works out the enum `t_type` and the `paper_pattern` from whatever the client
   * sent in either field.
   *
   * Accepts a pattern in `t_type` for compatibility with the existing console,
   * which has always used that field for 'jee_main' / 'custom'.
   */
  private resolveTypeAndPattern(body: Record<string, any>): Record<string, any> {
    const raw = String(body?.paper_pattern ?? body?.t_type ?? '').trim().toLowerCase();
    if (!raw) return {};

    // A genuine enum member: pass it through, no pattern implied.
    if ((TEST_TYPE_VALUES as readonly string[]).includes(raw)) {
      return { t_type: raw };
    }

    if ((PAPER_PATTERNS as readonly string[]).includes(raw)) {
      return { t_type: PATTERN_TO_TYPE[raw], paper_pattern: raw };
    }

    throw new BadRequestException(
      `Unknown test type "${raw}". Expected one of: ${[...TEST_TYPE_VALUES, ...PAPER_PATTERNS].join(', ')}.`,
    );
  }

  /**
   * Retries a write without `paper_pattern` when migration 007 has not been run.
   *
   * Same approach AttemptsService takes for migration 005: a database one
   * migration behind degrades instead of failing every test creation.
   */
  private async insertTest(row: Record<string, any>): Promise<any> {
    const { data, error } = await supabase.from('tests').insert(row).select().single();
    if (!error) {
      if (this.hasPaperPattern === null) this.hasPaperPattern = true;
      return data;
    }

    if ('paper_pattern' in row && this.isMissingColumn(error)) {
      if (this.hasPaperPattern === null) {
        this.hasPaperPattern = false;
        this.logger.warn(
          'tests.paper_pattern is missing — run backend/migrations/007_test_paper_pattern.sql. ' +
            'Paper patterns will not be stored until then.',
        );
      }
      const { paper_pattern: _dropped, ...withoutPattern } = row;
      const retry = await supabase.from('tests').insert(withoutPattern).select().single();
      if (retry.error) throwSupabaseError(retry.error, 'tests.insert');
      return retry.data;
    }

    throwSupabaseError(error, 'tests.insert');
  }

  /** True when PostgREST is saying the column simply is not there. */
  private isMissingColumn(error: any): boolean {
    const code = String(error?.code || '');
    if (code === 'PGRST204' || code === '42703') return true;
    return /column .* does not exist|schema cache/i.test(String(error?.message || ''));
  }

  /**
   * Whether `tests.paper_pattern` exists, probed once and then remembered.
   *
   * Reads have to know before they build a select list: naming a column that
   * does not exist fails the whole query, so on a database that has not run
   * migration 007 the test library would break rather than just omit a field.
   *
   * Two things this has to get right, both learned the hard way:
   *
   *  - The probe must NOT use `{ head: true }`. A HEAD response carries no
   *    body, so PostgREST's error payload never arrives and postgrest-js
   *    surfaces `{ message: '' }` with no code — indistinguishable from
   *    success to any inspection of the error. A one-row GET returns the real
   *    `42703`.
   *  - An inconclusive probe must fall back to *absent*. Omitting an optional
   *    column degrades gracefully; wrongly including one fails every read.
   */
  private async paperPatternAvailable(): Promise<boolean> {
    if (this.hasPaperPattern !== null) return this.hasPaperPattern;

    const { error } = await supabase.from('tests').select('paper_pattern').limit(1);

    if (!error) {
      this.hasPaperPattern = true;
      return true;
    }

    if (this.isMissingColumn(error)) {
      this.hasPaperPattern = false;
      this.logger.warn(
        'tests.paper_pattern is missing — run backend/migrations/007_test_paper_pattern.sql. ' +
          'Paper patterns will not be stored or returned until then.',
      );
      return false;
    }

    // Something else went wrong (a blip, a permissions change). Leave the result
    // uncached so the next call re-probes, and omit the column meanwhile.
    this.logger.warn(`Could not probe tests.paper_pattern: ${error.message}`);
    return false;
  }

  /** Appends `paper_pattern` to a select list only when the column exists. */
  private async withPattern(columns: string): Promise<string> {
    return (await this.paperPatternAvailable()) ? `${columns}, paper_pattern` : columns;
  }

  // ── Teacher reads ───────────────────────────────────────────────────────────

  /**
   * List tests for the staff console.
   *
   * This used to select `test_questions(question_id, questions(*))` for *every*
   * test, which meant one page load serialised the whole question bank — full
   * question text, options and answer keys — for every test in the library. The
   * list only needs each question's subject, to show the per-subject counts, so
   * that is all it asks for now, and the response is paginated.
   */
  async findAll(user: Requester, filters: { status?: string; page?: number; limit?: number } = {}) {
    const page = Math.max(Number(filters.page) || 1, 1);
    const limit = Math.min(Math.max(Number(filters.limit) || 50, 1), 200);
    const from = (page - 1) * limit;

    const base = await this.withPattern(
      `id, title, description, subject, t_type, status, duration_minutes,
       total_marks, negative_marking, negative_marks, created_at, created_by`,
    );

    let query = supabase
      .from('tests')
      .select(
        `${base},
        test_teachers(teacher_id, subject, users(id, full_name, email)),
        test_questions(question_id, questions(subject))`,
        { count: 'exact' },
      )
      .order('created_at', { ascending: false })
      .range(from, from + limit - 1);

    if (filters.status) query = query.eq('status', filters.status);

    const { data, error, count } = await query;
    if (error) throw new Error(error.message);

    const total = count ?? 0;
    return {
      data: (data || []).map((t: any) => ({
        ...t,
        questionCount: t.test_questions?.length ?? 0,
        // Kept for the older callers that read snake_case.
        question_count: t.test_questions?.length ?? 0,
      })),
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  /**
   * Get test details + its questions.
   *
   * Staff see the paper; a student only sees it if they are assigned and the
   * window is open, and never sees `correct_answer`.
   */
  async findOne(id: string, user: Requester) {
    if (user.role === 'student') {
      await this.assertStudentMaySit(id, user.id);
    } else {
      await this.assertCanManage(id, user);
    }

    const base = await this.withPattern(
      `id, title, description, subject, t_type, status, duration_minutes, total_marks,
       negative_marking, negative_marks, created_at, created_by`,
    );

    const { data, error } = await supabase
      .from('tests')
      .select(
        `${base},
        test_questions(question_order, marks_override, questions(id, subject, topic, question_text, options, difficulty, q_type, marks, image_url))`,
      )
      .eq('id', id)
      .single();
    if (error || !data) throw new NotFoundException('Test not found');
    return data;
  }

  // ── Teacher writes ──────────────────────────────────────────────────────────

  /** Create a new test (starts as 'draft') */
  async create(body: CreateTestDto, user: Requester) {
    const data = await this.insertTest({
      ...this.pickWritable(body),
      created_by: user.id,
      status: 'draft',
      total_marks: 0,
    });

    // Optionally assign teachers right away
    const ids = Array.isArray(body.teacher_ids) ? body.teacher_ids : [];
    if (ids.length > 0) {
      const { error: teacherError } = await supabase
        .from('test_teachers')
        .insert(ids.map((tid) => ({ test_id: data.id, teacher_id: tid })));

      // The shell exists either way; a failed assignment is worth surfacing
      // rather than silently swallowing, which is what happened before.
      if (teacherError) {
        this.logger.error(
          `Test ${data.id} created but teacher assignment failed: ${teacherError.message}`,
        );
      }
    }

    return data;
  }

  /** [Admin] Set the full list of teachers assigned to a test (replaces previous list) */
  async assignTeachers(testId: string, teacherIds: string[]) {
    const { data: test } = await supabase.from('tests').select('id').eq('id', testId).single();
    if (!test) throw new NotFoundException('Test not found');

    const { error: delError } = await supabase
      .from('test_teachers')
      .delete()
      .eq('test_id', testId);
    if (delError) throw new Error(delError.message);

    if (teacherIds.length > 0) {
      const { error: insError } = await supabase
        .from('test_teachers')
        .insert(teacherIds.map((tid) => ({ test_id: testId, teacher_id: tid })));
      if (insError) throw new Error(insError.message);
    }

    const { data, error } = await supabase
      .from('tests')
      .select('id, title, test_teachers(teacher_id, users(id, full_name, email))')
      .eq('id', testId)
      .single();
    if (error) throw new Error(error.message);
    return data;
  }

  /** Update test metadata */
  async update(id: string, body: UpdateTestDto, user: Requester) {
    await this.assertCanManage(id, user);

    const { data, error } = await supabase
      .from('tests')
      .update({ ...this.pickWritable(body), updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data;
  }

  /** Delete a test and everything hanging off it */
  async remove(id: string, user: Requester) {
    await this.assertCanManage(id, user);

    // Manual cascade delete to satisfy foreign key constraints. Every id list is
    // chunked — a popular test has one attempt per student, and a thousand UUIDs
    // in a single `.in()` overflows the PostgREST request URL.
    const attempts = await fetchAll<{ id: string }>(() =>
      supabase.from('attempts').select('id').eq('test_id', id),
    );

    if (attempts.length) {
      const attemptIds = attempts.map((a) => a.id);
      await runInChunks(attemptIds, (ids) =>
        supabase.from('answers').delete().in('attempt_id', ids),
      );
      await runInChunks(attemptIds, (ids) =>
        supabase.from('attempt_violations').delete().in('attempt_id', ids),
      ).catch(() => undefined); // table only exists once migration 005 has run
    }

    await supabase.from('attempts').delete().eq('test_id', id);
    await supabase.from('test_assignments').delete().eq('test_id', id);
    await supabase.from('test_questions').delete().eq('test_id', id);
    await supabase.from('test_teachers').delete().eq('test_id', id);

    const { error } = await supabase.from('tests').delete().eq('id', id);
    if (error) throw new Error(error.message);

    return { message: 'Test deleted' };
  }

  /** Add questions to test (Step 2 of TestConstructor) */
  async addQuestions(testId: string, questionIds: string[], user: Requester) {
    await this.assertCanManage(testId, user);
    const ids = questionIds ?? []; // Allow empty array to clear questions

    const { data: existingTestQuestions } = await supabase
      .from('test_questions')
      .select('question_id')
      .eq('test_id', testId);

    const existingIds = (existingTestQuestions || []).map((tq) => tq.question_id);

    // Only approved questions may enter a live paper — that is the whole point
    // of the QA queue. Also enforces the teacher's subject scope.
    const touched = [
      ...ids.filter((id) => !existingIds.includes(id)),
      ...existingIds.filter((id) => !ids.includes(id)),
    ];
    await this.assertQuestionsUsable(ids, touched, user);

    const rows = ids.map((qId, idx) => ({
      test_id: testId,
      question_id: qId,
      question_order: idx + 1,
    }));

    await supabase.from('test_questions').delete().eq('test_id', testId);
    if (rows.length) {
      const { error } = await supabase.from('test_questions').insert(rows);
      if (error) throw new Error(error.message);
    }

    const totalMarks = await this.recalculateTotalMarks(testId);
    return { message: 'Questions updated', total_marks: totalMarks };
  }

  /**
   * Validates that the questions going onto a paper are approved and, for a
   * subject-scoped teacher, inside their subject.
   */
  private async assertQuestionsUsable(
    questionIds: string[],
    scopeCheckIds: string[],
    user: Requester,
  ): Promise<void> {
    const scoped =
      user.role === 'teacher' && user.subject && user.subject !== 'All' ? user.subject : null;

    const idsToLoad = [...new Set([...questionIds, ...scopeCheckIds])];
    if (!idsToLoad.length) return;

    const rows = await fetchAllIn<{ id: string; subject: string; review_status: string; is_active: boolean }>(
      idsToLoad,
      (idChunk) =>
        supabase.from('questions').select('id, subject, review_status, is_active').in('id', idChunk),
    );

    const byId = new Map(rows.map((r) => [r.id, r]));

    for (const id of questionIds) {
      const q = byId.get(id);
      if (!q) throw new BadRequestException(`Question ${id} does not exist.`);
      if (!q.is_active) throw new BadRequestException('A selected question has been deleted.');
      if (q.review_status !== 'approved') {
        throw new BadRequestException(
          'Every question on a test must be approved in the review queue first.',
        );
      }
    }

    if (scoped) {
      for (const id of scopeCheckIds) {
        const q = byId.get(id);
        if (q && String(q.subject).toLowerCase() !== scoped.toLowerCase()) {
          throw new ForbiddenException(`You can only add or remove ${scoped} questions.`);
        }
      }
    }
  }

  /** Sums the paper's marks and stores them on the test row. */
  private async recalculateTotalMarks(testId: string): Promise<number> {
    const questions = await fetchAll<{ marks_override: number | null; questions: any }>(() =>
      supabase
        .from('test_questions')
        .select('marks_override, questions(marks)')
        .eq('test_id', testId),
    );

    const totalMarks = questions.reduce(
      (sum, tq: any) => sum + Number(tq.marks_override || tq.questions?.marks || 4),
      0,
    );

    await supabase.from('tests').update({ total_marks: totalMarks }).eq('id', testId);
    return totalMarks;
  }

  /** Publish a test (makes it visible to students) */
  async publish(id: string, user: Requester) {
    await this.assertCanManage(id, user);

    // An empty paper published by accident is worse than a failed request.
    const { count } = await supabase
      .from('test_questions')
      .select('*', { count: 'exact', head: true })
      .eq('test_id', id);

    if (!count) {
      throw new BadRequestException('Add at least one question before publishing this test.');
    }

    const { data, error } = await supabase
      .from('tests')
      .update({ status: 'published', updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data;
  }

  /** Assign test to batches with a schedule */
  async assign(testId: string, body: AssignTestDto, user: Requester) {
    await this.assertCanManage(testId, user);
    this.assertWindowSane(body.scheduled_start, body.scheduled_end);

    const assignments = await this.buildAssignments(
      testId,
      body.batch_ids,
      body.scheduled_start,
      body.scheduled_end,
    );

    if (!assignments.length) {
      throw new BadRequestException('No students found in the selected batches');
    }

    await this.replaceAssignments(testId, assignments);
    return { message: `Test assigned to ${assignments.length} students` };
  }

  /**
   * One assignment row per student across all selected batches.
   *
   * `batch_students` is read per batch and paged: a 400-student batch used to
   * come back truncated at PostgREST's 1000-row cap once several batches were
   * selected at once.
   */
  private async buildAssignments(
    testId: string,
    batchIds: string[],
    scheduledStart?: string,
    scheduledEnd?: string,
  ): Promise<any[]> {
    const byStudent = new Map<string, any>();

    for (const batchId of batchIds) {
      const students = await fetchAll<{ student_id: string }>(() =>
        supabase.from('batch_students').select('student_id').eq('batch_id', batchId),
      );

      for (const bs of students) {
        // A student in two of the selected batches must still end up with exactly
        // one row — `test_assignments` is unique on (test_id, student_id).
        if (byStudent.has(bs.student_id)) continue;
        byStudent.set(bs.student_id, {
          test_id: testId,
          batch_id: batchId,
          student_id: bs.student_id,
          scheduled_start: scheduledStart ?? null,
          scheduled_end: scheduledEnd ?? null,
        });
      }
    }

    return [...byStudent.values()];
  }

  /** Clears the previous assignment set for these students, then writes the new one. */
  private async replaceAssignments(testId: string, assignments: any[]): Promise<void> {
    const studentIds = assignments.map((a) => a.student_id);

    await runInChunks(
      studentIds,
      (ids) => supabase.from('test_assignments').delete().eq('test_id', testId).in('student_id', ids),
      ID_CHUNK_SIZE,
    );

    await insertInBatches(assignments, (batch) =>
      supabase.from('test_assignments').insert(batch),
    );
  }

  private assertWindowSane(start?: string, end?: string) {
    if (start && end && new Date(end).getTime() <= new Date(start).getTime()) {
      throw new BadRequestException('The exam window must end after it starts.');
    }
  }

  // ── Student reads ───────────────────────────────────────────────────────────

  /** Get tests available for a student (based on their assignment) */
  async getStudentTests(studentId: string) {
    // Step 1: Get test_assignment rows for this student
    const assignments = await fetchAll<any>(() =>
      supabase
        .from('test_assignments')
        .select('id, scheduled_start, scheduled_end, test_id, batch_id')
        .eq('student_id', studentId)
        .order('scheduled_start', { ascending: true }),
    );

    if (!assignments.length) return [];

    // Step 2: Fetch the tests separately (avoids triggering batch_students RLS)
    const studentTestColumns = await this.withPattern(
      'id, title, description, t_type, duration_minutes, total_marks, status',
    );
    const testIds = [...new Set(assignments.map((a) => a.test_id))];
    const tests = await fetchAllIn<any>(testIds, (idChunk) =>
      supabase
        .from('tests')
        .select(studentTestColumns)
        .in('id', idChunk)
        .eq('status', 'published'),
    );

    // Step 3: Merge
    const testMap = new Map(tests.map((t) => [t.id, t]));
    return assignments
      .filter((a) => testMap.has(a.test_id))
      .map((a) => ({ ...a, tests: testMap.get(a.test_id) }));
  }

  /**
   * Get test questions for a student — NEVER returns correct_answer!
   * correct_answer is only used by backend on submission.
   *
   * Assignment and the scheduled window are both enforced here: fetching the
   * paper is exactly as sensitive as starting the attempt.
   */
  async getTestQuestionsForStudent(testId: string, studentId: string) {
    await this.assertStudentMaySit(testId, studentId);

    return fetchAll<any>(() =>
      supabase
        .from('test_questions')
        .select(`
          question_order, marks_override,
          questions(id, subject, topic, question_text, options, difficulty, q_type, image_url, marks)
        `)
        .eq('test_id', testId)
        .order('question_order', { ascending: true }),
    );
  }

  // ── Results ─────────────────────────────────────────────────────────────────

  /**
   * Full result set for a test (teacher view): the ranked scoreboard, cohort
   * summary stats, and a per-question breakdown showing which items the class
   * struggled with.
   */
  async getResults(testId: string, user: Requester) {
    await this.assertCanManage(testId, user);

    const { data: test } = await supabase
      .from('tests')
      .select('id, title, total_marks, duration_minutes')
      .eq('id', testId)
      .single();

    if (!test) throw new NotFoundException('Test not found');

    // Paged: a 1000-student cohort exceeds PostgREST's single-response cap, and
    // a truncated read here silently produced wrong ranks and averages.
    const rows = await fetchAll<any>(() =>
      supabase
        .from('attempts')
        .select(`
          id, total_score, status, started_at, submitted_at, auto_submitted,
          users(id, full_name, email)
        `)
        .eq('test_id', testId)
        .eq('status', 'submitted')
        .order('total_score', { ascending: false }),
    );

    const scores = rows.map((a: any) => Number(a.total_score) || 0);
    const maxMarks = Number(test.total_marks) || 0;

    const { count: assignedCount } = await supabase
      .from('test_assignments')
      .select('*', { count: 'exact', head: true })
      .eq('test_id', testId);

    const sorted = [...scores].sort((a, b) => a - b);
    const median = sorted.length
      ? sorted.length % 2
        ? sorted[(sorted.length - 1) / 2]
        : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
      : 0;

    const questionStats = await this.buildQuestionStats(rows.map((a: any) => a.id));

    return {
      test,
      summary: {
        submitted: rows.length,
        assigned: assignedCount ?? 0,
        notAttempted: Math.max(0, (assignedCount ?? 0) - rows.length),
        maxMarks,
        highest: scores.length ? Math.max(...scores) : 0,
        lowest: scores.length ? Math.min(...scores) : 0,
        average: scores.length
          ? Number((scores.reduce((s, v) => s + v, 0) / scores.length).toFixed(2))
          : 0,
        median: Number(median.toFixed(2)),
        autoSubmitted: rows.filter((a: any) => a.auto_submitted).length,
      },
      results: rows.map((a: any, idx: number) => ({
        ...a,
        rank: idx + 1,
        percentage: maxMarks > 0 ? Math.round(((Number(a.total_score) || 0) / maxMarks) * 100) : 0,
      })),
      questionStats,
    };
  }

  /** Per-question difficulty across everyone who sat the test. */
  private async buildQuestionStats(attemptIds: string[]): Promise<any[]> {
    if (!attemptIds.length) return [];

    // 1000 attempts x 90 questions is 90k answer rows: chunked by attempt id and
    // paged within each chunk.
    const answers = await fetchAllIn<any>(attemptIds, (idChunk) =>
      supabase
        .from('answers')
        .select('question_id, is_correct, questions(question_text, subject, topic)')
        .in('attempt_id', idChunk),
    );

    const byQuestion = new Map<string, any>();
    for (const ans of answers) {
      const id = ans.question_id;
      if (!byQuestion.has(id)) {
        byQuestion.set(id, {
          questionId: id,
          questionText: ans.questions?.question_text || '',
          subject: ans.questions?.subject || 'Unknown',
          topic: ans.questions?.topic || null,
          correct: 0,
          incorrect: 0,
          unattempted: 0,
        });
      }
      const stat = byQuestion.get(id);
      if (ans.is_correct === true) stat.correct += 1;
      else if (ans.is_correct === false) stat.incorrect += 1;
      else stat.unattempted += 1;
    }

    const stats = [...byQuestion.values()].map((stat) => {
      const answered = stat.correct + stat.incorrect;
      return { ...stat, accuracy: answered > 0 ? Math.round((stat.correct / answered) * 100) : 0 };
    });

    // Hardest first — that is what a teacher wants to re-teach.
    return stats.sort((a, b) => a.accuracy - b.accuracy);
  }

  // ── Constructor ─────────────────────────────────────────────────────────────

  /**
   * Create a test, link its questions and assign batches in one call.
   *
   * Supabase's REST API has no multi-statement transaction, so the steps are
   * ordered to fail safe: the test is created as a draft first and only becomes
   * `published` once its questions are in place. A failure part-way leaves a
   * draft the teacher can finish, never a published paper with no questions.
   */
  async saveFullTest(body: SaveFullTestDto, user: Requester) {
    const questionIds = body.question_ids ?? [];
    const batchIds = body.batch_ids ?? [];
    const targetStatus = body.status === 'published' ? 'published' : 'draft';

    this.assertWindowSane(body.scheduled_start, body.scheduled_end);
    await this.assertQuestionsUsable(questionIds, questionIds, user);

    if (targetStatus === 'published' && !questionIds.length) {
      throw new BadRequestException('Add at least one question before publishing this test.');
    }

    // 1. Create the test as a draft.
    const test = await this.insertTest({
      ...this.pickWritable(body),
      status: 'draft',
      total_marks: 0,
      created_by: user.id,
    });
    const testId = test.id;

    try {
      // 2. Link questions.
      if (questionIds.length) {
        const qRows = questionIds.map((qId, idx) => ({
          test_id: testId,
          question_id: qId,
          question_order: idx + 1,
        }));
        await insertInBatches(qRows, (batch) => supabase.from('test_questions').insert(batch));
      }

      const totalMarks = await this.recalculateTotalMarks(testId);

      // 3. Assign to batches.
      if (batchIds.length) {
        const assignments = await this.buildAssignments(
          testId,
          batchIds,
          body.scheduled_start,
          body.scheduled_end,
        );
        if (assignments.length) await this.replaceAssignments(testId, assignments);
      }

      // 4. Only now is it safe to publish.
      const { data: finalTest, error: statusError } = await supabase
        .from('tests')
        .update({ status: targetStatus, total_marks: totalMarks })
        .eq('id', testId)
        .select()
        .single();

      if (statusError) throw new Error(statusError.message);
      return finalTest;
    } catch (e: any) {
      // Roll the half-built test back so the library is not littered with
      // unusable drafts the teacher never asked for.
      await this.remove(testId, { id: user.id, role: 'admin' }).catch(() => undefined);
      throw e;
    }
  }
}
