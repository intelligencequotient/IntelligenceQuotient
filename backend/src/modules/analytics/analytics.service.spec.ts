import { AnalyticsService } from './analytics.service';
import { supabase } from '../../config/supabase.config';

jest.mock('../../config/supabase.config', () => ({
  supabase: { from: jest.fn() },
}));

/** Chainable + thenable stand-in for a Supabase query builder. */
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
  const seen: string[] = [];
  (supabase.from as jest.Mock).mockImplementation((table: string) => {
    seen.push(table);
    return map[table] ?? makeBuilder({ data: [], error: null });
  });
  return seen;
}

describe('AnalyticsService', () => {
  let service: AnalyticsService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new AnalyticsService();
  });

  describe('getStudentAnalytics', () => {
    it('embeds attempts!inner so the subject breakdown is not silently empty', async () => {
      const answers = makeBuilder({ data: [], error: null });
      mockTables({
        attempts: makeBuilder({ data: [], error: null }),
        answers,
        spaced_repetition_state: makeBuilder({ data: [], error: null }),
        predictions: makeBuilder({ data: [], error: null }),
      });

      await service.getStudentAnalytics('s1');

      // Filtering on attempts.student_id without embedding the relation is
      // rejected by PostgREST and used to return nothing at all.
      expect(answers.select.mock.calls[0][0]).toContain('attempts!inner');
      expect(answers.eq).toHaveBeenCalledWith('attempts.student_id', 's1');
    });
  });

  describe('getCohortAnalytics', () => {
    const cohortTables = () => ({
      users: makeBuilder({ data: [{ id: 's1' }, { id: 's2' }], error: null }),
      attempts: makeBuilder({
        data: [
          { student_id: 's1', total_score: 50, submitted_at: '2026-01-02', tests: { id: 't1', title: 'T1', total_marks: 100 } },
          { student_id: 's2', total_score: 20, submitted_at: '2026-01-03', tests: { id: 't1', title: 'T1', total_marks: 50 } },
        ],
        error: null,
      }),
      answers: makeBuilder({
        data: [
          { is_correct: false, questions: { topic: 'Optics', subject: 'Physics', difficulty: 'hard' } },
          { is_correct: false, questions: { topic: 'Optics', subject: 'Physics', difficulty: 'hard' } },
          { is_correct: true, questions: { topic: 'Optics', subject: 'Physics', difficulty: 'hard' } },
          { is_correct: null, questions: { topic: 'Optics', subject: 'Physics', difficulty: 'hard' } },
          { is_correct: false, questions: { topic: 'Algebra', subject: 'Mathematics', difficulty: 'easy' } },
        ],
        error: null,
      }),
      predictions: makeBuilder({ data: [{ student_id: 's1' }], error: null }),
    });

    it('averages by percentage so tests with different totals compare fairly', async () => {
      mockTables(cohortTables());
      const res = await service.getCohortAnalytics();

      expect(res.avgPercentage).toBe(45); // 50% and 40%
      expect(res.avgScore).toBe(35);      // raw mean, kept for compatibility
      expect(res.totalAttempts).toBe(2);
      expect(res.totalStudents).toBe(2);
    });

    it('builds a per-test trend line', async () => {
      mockTables(cohortTables());
      const res = await service.getCohortAnalytics();
      expect(res.scoreTrend).toEqual([{ name: 'T1', score: 45, attempts: 2 }]);
    });

    it('buckets attempt percentages into a distribution', async () => {
      mockTables(cohortTables());
      const res = await service.getCohortAnalytics();
      expect(res.distribution.map((d: any) => d.count)).toEqual([0, 1, 1, 0, 0]);
    });

    it('ranks missed topics, ignoring unattempted answers and thin samples', async () => {
      mockTables(cohortTables());
      const res = await service.getCohortAnalytics();

      expect(res.missedTopics).toHaveLength(1); // Algebra had only one answer
      expect(res.missedTopics[0]).toMatchObject({
        topic: 'Optics',
        sampleSize: 3, // the null (unattempted) answer must not count
        wrongPercent: 67,
      });
    });

    it('counts at-risk students from predictions', async () => {
      mockTables(cohortTables());
      const res = await service.getCohortAnalytics();
      expect(res.atRiskCount).toBe(1);
    });

    it('returns a complete zeroed shape when the cohort is empty', async () => {
      mockTables({ users: makeBuilder({ data: [], error: null }) });
      const res = await service.getCohortAnalytics();

      expect(res).toEqual({
        totalStudents: 0,
        avgScore: 0,
        avgPercentage: 0,
        atRiskCount: 0,
        totalAttempts: 0,
        scoreTrend: [],
        distribution: [],
        missedTopics: [],
      });
    });
  });
});
