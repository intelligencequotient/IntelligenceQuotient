import { BadRequestException } from '@nestjs/common';
import { TestsService } from './tests.service';
import { supabase } from '../../config/supabase.config';

jest.mock('../../config/supabase.config', () => ({
  supabase: { from: jest.fn() },
}));

/** Chainable + thenable stand-in for a Supabase query builder. */
function makeBuilder(result: any) {
  const builder: any = {};
  const chainMethods = [
    'select', 'insert', 'update', 'delete', 'upsert',
    'eq', 'ilike', 'in', 'range', 'order', 'limit', 'single',
  ];
  for (const m of chainMethods) {
    builder[m] = jest.fn(() => builder);
  }
  builder.then = (resolve: any) => Promise.resolve(result).then(resolve);
  return builder;
}

/** Route `supabase.from(table)` to a per-table builder, recording each call. */
function mockTables(map: Record<string, any>) {
  const calls: string[] = [];
  (supabase.from as jest.Mock).mockImplementation((table: string) => {
    calls.push(table);
    return map[table] ?? makeBuilder({ data: [], error: null });
  });
  return calls;
}

describe('TestsService', () => {
  let service: TestsService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new TestsService();
  });

  // ─── create ───────────────────────────────────────────────────────────────

  describe('create', () => {
    it('always starts a new test as a draft owned by the creator', async () => {
      const builder = makeBuilder({ data: { id: 't1' }, error: null });
      (supabase.from as jest.Mock).mockReturnValue(builder);

      await service.create({ title: 'Mock #1', status: 'published' }, 'teacher-1');

      const inserted = builder.insert.mock.calls[0][0];
      expect(inserted.status).toBe('draft');
      expect(inserted.created_by).toBe('teacher-1');
    });
  });

  // ─── addQuestions ─────────────────────────────────────────────────────────

  describe('addQuestions', () => {
    it('replaces the existing set and numbers questions in order', async () => {
      const testQuestions = makeBuilder({
        data: [{ marks_override: null, questions: { marks: 4 } }, { marks_override: 6, questions: { marks: 4 } }],
        error: null,
      });
      const tests = makeBuilder({ data: null, error: null });
      mockTables({ test_questions: testQuestions, tests });

      const res = await service.addQuestions('t1', ['qA', 'qB']);

      // Old rows cleared before new ones land
      expect(testQuestions.delete).toHaveBeenCalled();
      const rows = testQuestions.insert.mock.calls[0][0];
      expect(rows).toEqual([
        { test_id: 't1', question_id: 'qA', question_order: 1 },
        { test_id: 't1', question_id: 'qB', question_order: 2 },
      ]);
      // 4 (default) + 6 (override)
      expect(res.total_marks).toBe(10);
    });

    it('clears the test and zeroes marks when given an empty list', async () => {
      const testQuestions = makeBuilder({ data: [], error: null });
      const tests = makeBuilder({ data: null, error: null });
      mockTables({ test_questions: testQuestions, tests });

      const res = await service.addQuestions('t1', []);

      expect(testQuestions.delete).toHaveBeenCalled();
      expect(testQuestions.insert).not.toHaveBeenCalled();
      expect(tests.update).toHaveBeenCalledWith({ total_marks: 0 });
      expect(res.total_marks).toBe(0);
    });

    it('tolerates a null question list without crashing', async () => {
      const testQuestions = makeBuilder({ data: [], error: null });
      const tests = makeBuilder({ data: null, error: null });
      mockTables({ test_questions: testQuestions, tests });

      await expect(service.addQuestions('t1', null as any)).resolves.toMatchObject({
        total_marks: 0,
      });
    });
  });

  // ─── publish ──────────────────────────────────────────────────────────────

  describe('publish', () => {
    it('flips status to published', async () => {
      const builder = makeBuilder({ data: { id: 't1', status: 'published' }, error: null });
      (supabase.from as jest.Mock).mockReturnValue(builder);

      await service.publish('t1');

      expect(builder.update).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'published' }),
      );
      expect(builder.eq).toHaveBeenCalledWith('id', 't1');
    });
  });

  // ─── assign ───────────────────────────────────────────────────────────────

  describe('assign', () => {
    const schedule = {
      scheduled_start: '2026-08-01T09:00:00.000Z',
      scheduled_end: '2026-08-01T10:00:00.000Z',
    };

    it('creates one assignment per student across every selected batch', async () => {
      const batchStudents = makeBuilder({
        data: [{ student_id: 's1' }, { student_id: 's2' }],
        error: null,
      });
      const testAssignments = makeBuilder({ error: null });
      mockTables({ batch_students: batchStudents, test_assignments: testAssignments });

      const res = await service.assign('t1', { batch_ids: ['b1'], ...schedule });

      const rows = testAssignments.insert.mock.calls[0][0];
      expect(rows).toHaveLength(2);
      expect(rows[0]).toMatchObject({
        test_id: 't1',
        batch_id: 'b1',
        student_id: 's1',
        ...schedule,
      });
      expect(res.message).toContain('2 students');
    });

    it('clears previous assignments so re-publishing does not stack duplicates', async () => {
      const batchStudents = makeBuilder({ data: [{ student_id: 's1' }], error: null });
      const testAssignments = makeBuilder({ error: null });
      mockTables({ batch_students: batchStudents, test_assignments: testAssignments });

      await service.assign('t1', { batch_ids: ['b1'], ...schedule });

      expect(testAssignments.delete).toHaveBeenCalled();
      expect(testAssignments.eq).toHaveBeenCalledWith('test_id', 't1');
    });

    it('rejects assigning to batches that have no students', async () => {
      const batchStudents = makeBuilder({ data: [], error: null });
      const testAssignments = makeBuilder({ error: null });
      mockTables({ batch_students: batchStudents, test_assignments: testAssignments });

      await expect(
        service.assign('t1', { batch_ids: ['b1'], ...schedule }),
      ).rejects.toBeInstanceOf(BadRequestException);

      // Nothing should have been deleted or written
      expect(testAssignments.delete).not.toHaveBeenCalled();
      expect(testAssignments.insert).not.toHaveBeenCalled();
    });
  });

  // ─── student-facing reads ─────────────────────────────────────────────────

  describe('getTestQuestionsForStudent', () => {
    it('never selects the correct answer', async () => {
      const builder = makeBuilder({ data: [], error: null });
      (supabase.from as jest.Mock).mockReturnValue(builder);

      await service.getTestQuestionsForStudent('t1');

      const selectArg = builder.select.mock.calls[0][0] as string;
      expect(selectArg).not.toContain('correct_answer');
    });
  });

  describe('getStudentTests', () => {
    it('inner-joins tests so unpublished ones are filtered out, not nulled', async () => {
      const builder = makeBuilder({ data: [], error: null });
      (supabase.from as jest.Mock).mockReturnValue(builder);

      await service.getStudentTests('s1');

      const selectArg = builder.select.mock.calls[0][0] as string;
      expect(selectArg).toContain('tests!inner');
      expect(builder.eq).toHaveBeenCalledWith('tests.status', 'published');
      expect(builder.eq).toHaveBeenCalledWith('student_id', 's1');
    });
  });
});
