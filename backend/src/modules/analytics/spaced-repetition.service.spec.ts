import { supabaseMock } from '../../test-utils/supabase-mock';

jest.mock('../../config/supabase.config', () => ({ supabase: supabaseMock }));

import { SpacedRepetitionService } from './spaced-repetition.service';

const STUDENT = 'student-1';
const ATTEMPT = 'attempt-1';

/** Grabs the rows handed to the first upsert against a table. */
const upsertPayload = (table: string) =>
  supabaseMock.calls.find((c) => c.table === table && c.op === 'upsert')?.payload;

describe('SpacedRepetitionService', () => {
  let service: SpacedRepetitionService;

  beforeEach(() => {
    supabaseMock.reset();
    service = new SpacedRepetitionService();
  });

  /** Queues the reads processAttempt performs, in order. */
  const queueAttempt = (answers: any[], history = answers) => {
    supabaseMock.queueResult('answers', { data: answers });            // loadGradedAnswers
    supabaseMock.queueResult('spaced_repetition_state', { data: [] }); // existing state
    supabaseMock.queueResult('spaced_repetition_state', { data: null });// upsert
    supabaseMock.queueResult('attempts', { data: [{ id: ATTEMPT }] }); // predictions: attempts
    supabaseMock.queueResult('answers', { data: history });            // predictions: answers
    supabaseMock.queueResult('predictions', { data: null });           // upsert
  };

  const answer = (over: Partial<any> = {}) => ({
    question_id: 'q1',
    is_correct: true,
    time_spent_seconds: 20,
    questions: { subject: 'Physics', topic: 'Kinematics', marks: 4 },
    ...over,
  });

  it('schedules a confidently-correct answer forward and raises mastery', async () => {
    queueAttempt([answer()]);

    await service.processAttempt(ATTEMPT, STUDENT);

    const rows = upsertPayload('spaced_repetition_state');
    expect(rows).toHaveLength(1);
    expect(rows[0].repetitions).toBe(1);
    expect(rows[0].interval_days).toBe(1);
    // Quality 5 pushes the ease factor above the 2.5 default.
    expect(rows[0].ease_factor).toBeGreaterThan(2.5);
    expect(rows[0].mastery_level).toBeGreaterThan(0);
  });

  it('resets the ladder when an answer is wrong', async () => {
    queueAttempt([answer({ is_correct: false })]);

    await service.processAttempt(ATTEMPT, STUDENT);

    const rows = upsertPayload('spaced_repetition_state');
    expect(rows[0].repetitions).toBe(0);
    expect(rows[0].interval_days).toBe(1);
    // A lapse must surface sooner than a success.
    expect(rows[0].priority_weight).toBeGreaterThan(5);
  });

  it('never lets the ease factor fall below the SM-2 floor', async () => {
    // A skipped answer is the harshest signal (quality 1).
    queueAttempt([answer({ is_correct: null, time_spent_seconds: 0 })]);

    await service.processAttempt(ATTEMPT, STUDENT);

    const rows = upsertPayload('spaced_repetition_state');
    expect(rows[0].ease_factor).toBeGreaterThanOrEqual(1.3);
  });

  it('flags a topic at risk only with enough evidence', async () => {
    // 6 answers, 1 correct -> ~17% accuracy over a sample of 6.
    const history = [
      answer({ is_correct: true }),
      ...Array.from({ length: 5 }, () => answer({ is_correct: false })),
    ];
    queueAttempt([answer()], history);

    await service.processAttempt(ATTEMPT, STUDENT);

    const rows = upsertPayload('predictions');
    const topicRow = rows.find((r: any) => r.topic === 'Kinematics');

    expect(topicRow.sample_size).toBe(6);
    expect(topicRow.accuracy).toBeCloseTo(16.67, 1);
    expect(topicRow.risk_flag).toBe(true);
  });

  it('does not flag risk on a small sample', async () => {
    const history = [answer({ is_correct: false }), answer({ is_correct: false })];
    queueAttempt([answer()], history);

    await service.processAttempt(ATTEMPT, STUDENT);

    const rows = upsertPayload('predictions');
    expect(rows.every((r: any) => r.risk_flag === false)).toBe(true);
  });

  it('rolls topics up into a subject-level row', async () => {
    queueAttempt([answer()], [answer(), answer({ questions: { subject: 'Physics', topic: 'Optics', marks: 4 } })]);

    await service.processAttempt(ATTEMPT, STUDENT);

    const rows = upsertPayload('predictions');
    const subjectRow = rows.find((r: any) => r.subject === 'Physics' && r.topic === null);

    expect(subjectRow).toBeDefined();
    expect(subjectRow.sample_size).toBe(2);
  });

  it('swallows database failures so grading is never blocked', async () => {
    supabaseMock.queueResult('answers', { data: null, error: { message: 'boom' } });

    await expect(service.processAttempt(ATTEMPT, STUDENT)).resolves.toBeUndefined();
  });
});
