import { AttemptsService } from './attempts.service';
import { supabase } from '../../config/supabase.config';

jest.mock('../../config/supabase.config', () => ({
  supabase: { from: jest.fn() },
}));

function makeBuilder(result: any) {
  const builder: any = {};
  for (const m of [
    'select', 'insert', 'update', 'delete', 'upsert',
    'eq', 'ilike', 'in', 'range', 'order', 'limit', 'single',
  ]) {
    builder[m] = jest.fn(() => builder);
  }
  builder.then = (resolve: any) => Promise.resolve(result).then(resolve);
  return builder;
}

function mockTables(map: Record<string, any>) {
  (supabase.from as jest.Mock).mockImplementation(
    (table: string) => map[table] ?? makeBuilder({ data: [], error: null }),
  );
}

/**
 * q1 answered correctly, q2 answered incorrectly, q3 never answered.
 * q2 carries a marks_override of 6 to prove overrides win over the question's
 * own marks value.
 */
const submitTables = () => ({
  attempts: makeBuilder({
    data: {
      id: 'a1',
      test_id: 't1',
      status: 'in_progress',
      started_at: new Date(Date.now() - 60_000).toISOString(),
    },
    error: null,
  }),
  test_questions: makeBuilder({
    data: [
      { question_id: 'q1', marks_override: null, questions: { correct_answer: { index: 1 }, marks: 4 } },
      { question_id: 'q2', marks_override: 6, questions: { correct_answer: { index: 0 }, marks: 4 } },
      { question_id: 'q3', marks_override: null, questions: { correct_answer: { index: 2 }, marks: 4 } },
    ],
    error: null,
  }),
  answers: makeBuilder({
    data: [
      { question_id: 'q1', selected_answer: { index: 1 } },
      { question_id: 'q2', selected_answer: { index: 3 } },
    ],
    error: null,
  }),
});

describe('AttemptsService', () => {
  let service: AttemptsService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new AttemptsService();
  });

  describe('submitAttempt', () => {
    it('grades against the stored correct answers and honours marks overrides', async () => {
      mockTables(submitTables());

      const res = await service.submitAttempt('a1', 'student-1');

      expect(res.score).toBe(4);
      expect(res.maxScore).toBe(14); // 4 + 6 (override) + 4
      expect(res.correct).toBe(1);
      expect(res.incorrect).toBe(1);
      expect(res.unattempted).toBe(1);
    });

    it('writes every graded question in a single upsert, not one update per row', async () => {
      const tables = submitTables();
      mockTables(tables);

      await service.submitAttempt('a1', 'student-1');

      expect(tables.answers.upsert).toHaveBeenCalledTimes(1);
      expect(tables.answers.update).not.toHaveBeenCalled();
      expect(tables.answers.upsert.mock.calls[0][0]).toHaveLength(3);
      expect(tables.answers.upsert.mock.calls[0][1]).toEqual({
        onConflict: 'attempt_id,question_id',
      });
    });

    it('persists a row for unattempted questions so they survive into the review', async () => {
      const tables = submitTables();
      mockTables(tables);

      await service.submitAttempt('a1', 'student-1');

      const rows = tables.answers.upsert.mock.calls[0][0];
      const q3 = rows.find((r: any) => r.question_id === 'q3');

      expect(q3).toBeDefined();
      expect(q3.is_correct).toBeNull();
      expect(q3.selected_answer).toBeNull();
    });

    it('marks the attempt submitted and records the auto-submit flag', async () => {
      const tables = submitTables();
      mockTables(tables);

      const res = await service.submitAttempt('a1', 'student-1', true);

      expect(tables.attempts.update).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'submitted', auto_submitted: true }),
      );
      expect(res.autoSubmitted).toBe(true);
    });

    it('refuses to grade an attempt that was already submitted', async () => {
      mockTables({
        ...submitTables(),
        attempts: makeBuilder({ data: { id: 'a1', test_id: 't1', status: 'submitted' }, error: null }),
      });

      await expect(service.submitAttempt('a1', 'student-1')).rejects.toThrow(/already submitted/i);
    });
  });
});
