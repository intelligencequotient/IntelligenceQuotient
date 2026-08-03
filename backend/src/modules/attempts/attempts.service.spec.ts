import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { supabaseMock } from '../../test-utils/supabase-mock';

// Must be mocked before the service is imported, since it captures the client at module load.
jest.mock('../../config/supabase.config', () => ({
  supabase: supabaseMock,
}));

import { AttemptsService } from './attempts.service';

const srsStub = { processAttempt: jest.fn().mockResolvedValue(undefined) } as any;
const cacheStub = { invalidate: jest.fn().mockResolvedValue(undefined) } as any;

const STUDENT = 'student-1';
const TEST_ID = 'test-1';
const ATTEMPT_ID = 'attempt-1';

/** A test row whose window is still open. */
const openAttempt = (startedMinutesAgo = 5) => ({
  id: ATTEMPT_ID,
  test_id: TEST_ID,
  student_id: STUDENT,
  status: 'in_progress',
  started_at: new Date(Date.now() - startedMinutesAgo * 60_000).toISOString(),
});

describe('AttemptsService', () => {
  let service: AttemptsService;

  beforeEach(() => {
    supabaseMock.reset();
    jest.clearAllMocks();
    service = new AttemptsService(srsStub, cacheStub);
  });

  describe('startAttempt', () => {
    /** Assignment rows come back as a list — a student can be in several batches. */
    const assignments = (...rows: any[]) => supabaseMock.queueResult('test_assignments', { data: rows });

    it('refuses a test the student is not assigned', async () => {
      assignments();

      await expect(service.startAttempt(TEST_ID, STUDENT)).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('refuses to open before the scheduled start', async () => {
      assignments({
        id: 'a1',
        scheduled_start: new Date(Date.now() + 60 * 60_000).toISOString(),
        scheduled_end: new Date(Date.now() + 120 * 60_000).toISOString(),
      });

      await expect(service.startAttempt(TEST_ID, STUDENT)).rejects.toThrow(/opens at/i);
    });

    it('refuses to open after the window has closed', async () => {
      assignments({
        id: 'a1',
        scheduled_start: new Date(Date.now() - 180 * 60_000).toISOString(),
        scheduled_end: new Date(Date.now() - 60 * 60_000).toISOString(),
      });

      await expect(service.startAttempt(TEST_ID, STUDENT)).rejects.toThrow(/window .* closed/i);
    });

    // The dashboard listed the test but starting it said "not assigned": a student
    // in two batches had two assignment rows, and `.single()` errors on the second.
    it('starts when the student is assigned via more than one batch', async () => {
      assignments(
        {
          id: 'a1',
          scheduled_start: new Date(Date.now() - 10 * 60_000).toISOString(),
          scheduled_end: new Date(Date.now() + 10 * 60_000).toISOString(),
        },
        {
          id: 'a2',
          scheduled_start: new Date(Date.now() - 5 * 60_000).toISOString(),
          scheduled_end: new Date(Date.now() + 5 * 60_000).toISOString(),
        },
      );
      supabaseMock.queueResult('attempts', { data: null });                    // no prior attempt
      supabaseMock.queueResult('tests', { data: { duration_minutes: 60 } });
      supabaseMock.queueResult('attempts', { data: { id: ATTEMPT_ID } });      // insert

      const result = await service.startAttempt(TEST_ID, STUDENT);

      expect(result.attemptId).toBe(ATTEMPT_ID);
      expect(result.resumed).toBe(false);
    });

    // Overlapping batch windows merge to the widest: open at the earliest start,
    // close at the latest end. A student inside either window can sit the test.
    it('merges several assignment windows into the widest one', async () => {
      assignments(
        {
          id: 'a1',
          scheduled_start: new Date(Date.now() + 30 * 60_000).toISOString(), // not open yet
          scheduled_end: new Date(Date.now() + 90 * 60_000).toISOString(),
        },
        {
          id: 'a2',
          scheduled_start: new Date(Date.now() - 30 * 60_000).toISOString(), // already open
          scheduled_end: new Date(Date.now() + 30 * 60_000).toISOString(),
        },
      );
      supabaseMock.queueResult('attempts', { data: null });
      supabaseMock.queueResult('tests', { data: { duration_minutes: 60 } });
      supabaseMock.queueResult('attempts', { data: { id: ATTEMPT_ID } });

      await expect(service.startAttempt(TEST_ID, STUDENT)).resolves.toMatchObject({
        attemptId: ATTEMPT_ID,
      });
    });

    it('rejects a second attempt once submitted', async () => {
      assignments({ id: 'a1', scheduled_start: null, scheduled_end: null });
      supabaseMock.queueResult('attempts', { data: { id: ATTEMPT_ID, status: 'submitted' } });

      await expect(service.startAttempt(TEST_ID, STUDENT)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('returns saved answers when resuming an open attempt', async () => {
      assignments({ id: 'a1', scheduled_start: null, scheduled_end: null });
      supabaseMock.queueResult('attempts', { data: openAttempt(10) });
      supabaseMock.queueResult('tests', { data: { duration_minutes: 60 } });
      supabaseMock.queueResult('answers', {
        data: [
          {
            question_id: 'q1',
            selected_answer: { index: 2 },
            status: 'answered_marked',
            flagged_for_doubt: true,
          },
        ],
      });

      const result = await service.startAttempt(TEST_ID, STUDENT);

      expect(result.resumed).toBe(true);
      expect(result.savedAnswers).toHaveLength(1);
      // The palette state must survive a resume, not just the answer itself.
      expect(result.savedAnswers[0].status).toBe('answered_marked');
      // ~50 minutes of a 60 minute exam should remain.
      expect(result.timeLeftSeconds).toBeGreaterThan(2900);
      expect(result.timeLeftSeconds).toBeLessThanOrEqual(3000);
    });
  });

  describe('saveAnswer', () => {
    it('rejects a write after the deadline has passed', async () => {
      // Started 90 minutes ago on a 60 minute test.
      supabaseMock.queueResult('attempts', { data: openAttempt(90) });
      supabaseMock.queueResult('tests', { data: { duration_minutes: 60 } });

      await expect(
        service.saveAnswer(ATTEMPT_ID, STUDENT, {
          question_id: 'q1',
          selected_answer: { index: 1 },
          time_spent_seconds: 10,
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('saves while the window is still open', async () => {
      supabaseMock.queueResult('attempts', { data: openAttempt(5) });
      supabaseMock.queueResult('tests', { data: { duration_minutes: 60 } });
      supabaseMock.queueResult('answers', { data: null, error: null });

      await expect(
        service.saveAnswer(ATTEMPT_ID, STUDENT, {
          question_id: 'q1',
          selected_answer: { index: 1 },
          status: 'answered_marked',
          time_spent_seconds: 10,
        }),
      ).resolves.toEqual({ saved: true, status: 'answered_marked' });
    });

    it('falls back to a derived status rather than storing junk', async () => {
      supabaseMock.queueResult('attempts', { data: openAttempt(5) });
      supabaseMock.queueResult('tests', { data: { duration_minutes: 60 } });
      supabaseMock.queueResult('answers', { data: null, error: null });

      await expect(
        service.saveAnswer(ATTEMPT_ID, STUDENT, {
          question_id: 'q1',
          selected_answer: null,
          status: 'definitely-not-a-status',
          time_spent_seconds: 10,
        }),
      ).resolves.toEqual({ saved: true, status: 'not_answered' });
    });
  });

  // Migration 005 adds answers.status and attempt_violations. Until it is run,
  // the exam must keep working rather than 500-ing on every answer.
  describe('when migration 005 has not been applied', () => {
    const missingColumn = { message: 'column answers.status does not exist', code: '42703' };
    const missingTable = { message: "Could not find the table 'public.attempt_violations'", code: 'PGRST205' };

    it('still saves the answer when answers.status is missing', async () => {
      supabaseMock.queueResult('attempts', { data: openAttempt(5) });
      supabaseMock.queueResult('tests', { data: { duration_minutes: 60 } });
      supabaseMock.queueResult('answers', { data: null, error: missingColumn });
      // The retry re-reads the window, then writes without the status column.
      supabaseMock.queueResult('attempts', { data: openAttempt(5) });
      supabaseMock.queueResult('tests', { data: { duration_minutes: 60 } });
      supabaseMock.queueResult('answers', { data: null, error: null });

      await expect(
        service.saveAnswer(ATTEMPT_ID, STUDENT, {
          question_id: 'q1',
          selected_answer: { index: 1 },
          status: 'answered',
          time_spent_seconds: 10,
        }),
      ).resolves.toEqual({ saved: true, status: 'answered' });
    });

    it('reports violations as degraded rather than failing the request', async () => {
      supabaseMock.queueResult('attempts', { data: openAttempt(5) });
      supabaseMock.queueResult('attempt_violations', { data: null, error: missingTable });

      await expect(
        service.logViolation(ATTEMPT_ID, STUDENT, { type: 'tab_hidden' }),
      ).resolves.toEqual({ terminated: false, strikes: 0, limit: 3, degraded: true });
    });
  });

  describe('logViolation', () => {
    const queueStrike = (count: number) => {
      supabaseMock.queueResult('attempts', { data: openAttempt(5) });     // ownership lookup
      supabaseMock.queueResult('attempt_violations', { data: null });     // insert
      supabaseMock.queueResult('attempt_violations', { count });          // running total
    };

    it('warns but does not terminate below the limit', async () => {
      queueStrike(2);

      await expect(service.logViolation(ATTEMPT_ID, STUDENT, { type: 'tab_hidden' })).resolves.toEqual(
        { terminated: false, strikes: 2, limit: 3 },
      );
    });

    it('terminates and grades the attempt on the third strike', async () => {
      queueStrike(3);
      // gradeAndFinalise reads the duration, marking scheme, paper and answers.
      supabaseMock.queueResult('tests', { data: { duration_minutes: 60 } });
      supabaseMock.queueResult('tests', { data: { negative_marking: false, negative_marks: 0 } });
      supabaseMock.queueResult('test_questions', { data: [] });
      supabaseMock.queueResult('answers', { data: [] });
      supabaseMock.queueResult('attempts', { data: { id: ATTEMPT_ID } });

      const result = await service.logViolation(ATTEMPT_ID, STUDENT, { type: 'fullscreen_exit' });

      expect(result.terminated).toBe(true);
      // The attempt must not be left dangling open — it is graded on the spot.
      expect(srsStub.processAttempt).toHaveBeenCalledWith(ATTEMPT_ID, STUDENT);
    });

    it("refuses to touch another student's attempt", async () => {
      supabaseMock.queueResult('attempts', { data: null });

      await expect(
        service.logViolation(ATTEMPT_ID, 'someone-else', { type: 'tab_hidden' }),
      ).rejects.toThrow(/not found/i);
    });
  });

  describe('toggleFlag', () => {
    it("refuses to touch another student's attempt", async () => {
      // Ownership is enforced by the student_id filter — no row comes back.
      supabaseMock.queueResult('attempts', { data: null });

      await expect(service.toggleFlag(ATTEMPT_ID, 'someone-else', 'q1', true)).rejects.toThrow(
        /not found/i,
      );
    });
  });

  describe('submitAttempt — grading', () => {
    /** Queues everything gradeAndFinalise reads, in order. */
    const queueGrading = (opts: {
      negativeMarking?: boolean;
      negativeMarks?: number;
      testQuestions: any[];
      studentAnswers: any[];
    }) => {
      supabaseMock.queueResult('attempts', { data: openAttempt(10) });        // submitAttempt lookup
      supabaseMock.queueResult('tests', { data: { duration_minutes: 60 } });  // duration
      supabaseMock.queueResult('tests', {                                     // marking scheme
        data: {
          negative_marking: opts.negativeMarking ?? false,
          negative_marks: opts.negativeMarks ?? 0,
        },
      });
      supabaseMock.queueResult('test_questions', { data: opts.testQuestions });
      supabaseMock.queueResult('answers', { data: opts.studentAnswers });
      // One update per question, then the final attempts update.
      opts.testQuestions.forEach(() => supabaseMock.queueResult('answers', { data: null }));
      supabaseMock.queueResult('attempts', { data: { id: ATTEMPT_ID } });
    };

    it('awards marks for correct answers only', async () => {
      queueGrading({
        testQuestions: [
          { question_id: 'q1', marks_override: null, questions: { correct_answer: { index: 0 }, marks: 4 } },
          { question_id: 'q2', marks_override: null, questions: { correct_answer: { index: 1 }, marks: 4 } },
          { question_id: 'q3', marks_override: null, questions: { correct_answer: { index: 2 }, marks: 4 } },
        ],
        studentAnswers: [
          { question_id: 'q1', selected_answer: { index: 0 } }, // correct
          { question_id: 'q2', selected_answer: { index: 3 } }, // wrong
          // q3 unattempted
        ],
      });

      const result = await service.submitAttempt(ATTEMPT_ID, STUDENT);

      expect(result.score).toBe(4);
      expect(result.correct).toBe(1);
      expect(result.incorrect).toBe(1);
      expect(result.unattempted).toBe(1);
      expect(result.maxScore).toBe(12);
    });

    it('applies negative marking to wrong answers but never to skipped ones', async () => {
      queueGrading({
        negativeMarking: true,
        negativeMarks: 1,
        testQuestions: [
          { question_id: 'q1', marks_override: null, questions: { correct_answer: { index: 0 }, marks: 4 } },
          { question_id: 'q2', marks_override: null, questions: { correct_answer: { index: 1 }, marks: 4 } },
          { question_id: 'q3', marks_override: null, questions: { correct_answer: { index: 2 }, marks: 4 } },
        ],
        studentAnswers: [
          { question_id: 'q1', selected_answer: { index: 0 } }, // +4
          { question_id: 'q2', selected_answer: { index: 3 } }, // -1
          // q3 skipped -> 0
        ],
      });

      const result = await service.submitAttempt(ATTEMPT_ID, STUDENT);

      expect(result.score).toBe(3);
      expect(result.negativeMarking).toBe(true);
    });

    it('marks a late submission as auto-submitted and clamps the reported time', async () => {
      supabaseMock.queueResult('attempts', { data: openAttempt(120) }); // 2h into a 1h test
      supabaseMock.queueResult('tests', { data: { duration_minutes: 60 } });
      supabaseMock.queueResult('tests', { data: { negative_marking: false, negative_marks: 0 } });
      supabaseMock.queueResult('test_questions', { data: [] });
      supabaseMock.queueResult('answers', { data: [] });
      supabaseMock.queueResult('attempts', { data: { id: ATTEMPT_ID } });

      const result = await service.submitAttempt(ATTEMPT_ID, STUDENT, false);

      expect(result.autoSubmitted).toBe(true);
      expect(result.timeTakenSeconds).toBe(3600);
    });

    it('matches numeric answers regardless of formatting', async () => {
      queueGrading({
        testQuestions: [
          { question_id: 'q1', marks_override: null, questions: { correct_answer: { value: '2.50' }, marks: 4 } },
        ],
        studentAnswers: [{ question_id: 'q1', selected_answer: { value: ' 2.5 ' } }],
      });

      const result = await service.submitAttempt(ATTEMPT_ID, STUDENT);
      expect(result.correct).toBe(1);
    });

    it('treats multi-select answers as order-insensitive', async () => {
      queueGrading({
        testQuestions: [
          { question_id: 'q1', marks_override: null, questions: { correct_answer: { indices: [0, 2] }, marks: 4 } },
        ],
        studentAnswers: [{ question_id: 'q1', selected_answer: { indices: [2, 0] } }],
      });

      const result = await service.submitAttempt(ATTEMPT_ID, STUDENT);
      expect(result.correct).toBe(1);
    });

    it('refuses to submit an attempt twice', async () => {
      supabaseMock.queueResult('attempts', {
        data: { ...openAttempt(), status: 'submitted' },
      });

      await expect(service.submitAttempt(ATTEMPT_ID, STUDENT)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('updates spaced repetition and drops the cached leaderboard', async () => {
      queueGrading({
        testQuestions: [
          { question_id: 'q1', marks_override: null, questions: { correct_answer: { index: 0 }, marks: 4 } },
        ],
        studentAnswers: [{ question_id: 'q1', selected_answer: { index: 0 } }],
      });

      await service.submitAttempt(ATTEMPT_ID, STUDENT);

      expect(srsStub.processAttempt).toHaveBeenCalledWith(ATTEMPT_ID, STUDENT);
      expect(cacheStub.invalidate).toHaveBeenCalledWith('leaderboard:');
    });
  });
});
