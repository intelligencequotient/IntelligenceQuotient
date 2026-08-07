import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { supabaseMock } from '../../test-utils/supabase-mock';

// Must be mocked before the service is imported, since it captures the client at module load.
jest.mock('../../config/supabase.config', () => ({
  supabase: supabaseMock,
}));

import { TestsService } from './tests.service';

const TEST_ID = '11111111-1111-4111-8111-111111111111';
const STUDENT = { id: 'student-1', role: 'student' };
const TEACHER = { id: 'teacher-1', role: 'teacher' };
const OTHER_TEACHER = { id: 'teacher-2', role: 'teacher' };
const ADMIN = { id: 'admin-1', role: 'admin' };

const minutesFromNow = (m: number) => new Date(Date.now() + m * 60_000).toISOString();

describe('TestsService', () => {
  let service: TestsService;

  beforeEach(() => {
    supabaseMock.reset();
    jest.clearAllMocks();
    service = new TestsService();
  });

  /**
   * The paper is exactly as sensitive as the attempt. `GET /tests/:id/questions`
   * used to take nothing but an id, so any logged-in student could pull down the
   * full question paper for a test they were not assigned — or one scheduled for
   * next week — simply by knowing its id.
   */
  describe('getTestQuestionsForStudent', () => {
    const publishedTest = () => supabaseMock.queueResult('tests', { data: { id: TEST_ID, status: 'published' } });

    it('refuses a student who has no assignment', async () => {
      publishedTest();
      supabaseMock.queueResult('test_assignments', { data: [] });

      await expect(service.getTestQuestionsForStudent(TEST_ID, STUDENT.id)).rejects.toThrow(
        /not assigned/i,
      );
    });

    it('refuses to hand over the paper before the window opens', async () => {
      publishedTest();
      supabaseMock.queueResult('test_assignments', {
        data: [{ scheduled_start: minutesFromNow(60), scheduled_end: minutesFromNow(120) }],
      });

      await expect(service.getTestQuestionsForStudent(TEST_ID, STUDENT.id)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('refuses once the window has closed', async () => {
      publishedTest();
      supabaseMock.queueResult('test_assignments', {
        data: [{ scheduled_start: minutesFromNow(-180), scheduled_end: minutesFromNow(-60) }],
      });

      await expect(service.getTestQuestionsForStudent(TEST_ID, STUDENT.id)).rejects.toThrow(
        /closed/i,
      );
    });

    it('refuses a test that is still a draft', async () => {
      supabaseMock.queueResult('tests', { data: { id: TEST_ID, status: 'draft' } });

      await expect(service.getTestQuestionsForStudent(TEST_ID, STUDENT.id)).rejects.toThrow(
        /not available/i,
      );
    });

    it('serves the paper inside the window, without correct answers', async () => {
      publishedTest();
      supabaseMock.queueResult('test_assignments', {
        data: [{ scheduled_start: minutesFromNow(-10), scheduled_end: minutesFromNow(50) }],
      });
      supabaseMock.queueResult('test_questions', {
        data: [{ question_order: 1, questions: { id: 'q1', question_text: 'What?' } }],
      });

      const paper = await service.getTestQuestionsForStudent(TEST_ID, STUDENT.id);

      expect(paper).toHaveLength(1);
      expect(JSON.stringify(paper)).not.toContain('correct_answer');
    });

    // A student in two batches gets the widest window, not the narrowest.
    it('merges several assignment windows and allows the union', async () => {
      publishedTest();
      supabaseMock.queueResult('test_assignments', {
        data: [
          { scheduled_start: minutesFromNow(30), scheduled_end: minutesFromNow(90) },
          { scheduled_start: minutesFromNow(-30), scheduled_end: minutesFromNow(30) },
        ],
      });
      supabaseMock.queueResult('test_questions', { data: [] });

      await expect(service.getTestQuestionsForStudent(TEST_ID, STUDENT.id)).resolves.toEqual([]);
    });
  });

  describe('findOne', () => {
    it('routes a student through the assignment check', async () => {
      supabaseMock.queueResult('tests', { data: { id: TEST_ID, status: 'published' } });
      supabaseMock.queueResult('test_assignments', { data: [] });

      await expect(service.findOne(TEST_ID, STUDENT)).rejects.toThrow(/not assigned/i);
    });

    it("refuses a teacher who neither created the test nor collaborates on it", async () => {
      supabaseMock.queueResult('tests', { data: { id: TEST_ID, created_by: TEACHER.id } });
      supabaseMock.queueResult('test_teachers', { data: null });

      await expect(service.findOne(TEST_ID, OTHER_TEACHER)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });
  });

  /**
   * The old guard read `if (test && test.created_by !== user.id) throw`, which
   * let the operation through whenever the lookup returned nothing — so an
   * unknown id was treated as authorised rather than as a 404.
   */
  describe('ownership checks', () => {
    it('404s on a test that does not exist rather than allowing the write', async () => {
      supabaseMock.queueResult('tests', { data: null });

      await expect(service.update(TEST_ID, { title: 'x' }, TEACHER)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it("refuses to let one teacher edit another teacher's test", async () => {
      supabaseMock.queueResult('tests', { data: { id: TEST_ID, created_by: TEACHER.id } });

      await expect(service.update(TEST_ID, { title: 'x' }, OTHER_TEACHER)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('lets an admin through', async () => {
      supabaseMock.queueResult('tests', { data: { id: TEST_ID, created_by: TEACHER.id } });
      supabaseMock.queueResult('tests', { data: { id: TEST_ID, title: 'x' } });

      await expect(service.update(TEST_ID, { title: 'x' }, ADMIN)).resolves.toMatchObject({
        id: TEST_ID,
      });
    });

    it('lets the creator manage their own test', async () => {
      supabaseMock.queueResult('tests', { data: { id: TEST_ID, created_by: TEACHER.id } });
      supabaseMock.queueResult('tests', { data: { id: TEST_ID, title: 'x' } });

      await expect(service.update(TEST_ID, { title: 'x' }, TEACHER)).resolves.toMatchObject({
        id: TEST_ID,
      });
    });
  });

  /**
   * Papers are initiated by an admin, who then assigns teachers to fill in the
   * questions for their subject. Being assigned has to let you do that job and
   * nothing more — it must not also confer the power to rename, reschedule,
   * republish or delete somebody else's exam.
   */
  describe('assigned teachers can contribute but not administer', () => {
    /** The ownership lookup, then the `test_teachers` membership lookup. */
    const assignedCollaborator = () => {
      supabaseMock.queueResult('tests', { data: { id: TEST_ID, created_by: ADMIN.id } });
      supabaseMock.queueResult('test_teachers', { data: { teacher_id: OTHER_TEACHER.id } });
    };

    /** Ownership lookup only — administer-level never consults test_teachers. */
    const adminOwnedTest = () =>
      supabaseMock.queueResult('tests', { data: { id: TEST_ID, created_by: ADMIN.id } });

    it('lets an assigned teacher add questions', async () => {
      assignedCollaborator();
      supabaseMock.queueResult('test_questions', { data: [] }); // existing links
      supabaseMock.queueResult('questions', {
        data: [{ id: 'q1', subject: 'Physics', review_status: 'approved', is_active: true }],
      });
      supabaseMock.queueResult('test_questions', { data: null }); // delete
      supabaseMock.queueResult('test_questions', { data: null }); // insert
      supabaseMock.queueResult('test_questions', { data: [] }); // recalc marks
      supabaseMock.queueResult('tests', { data: null }); // total_marks write

      await expect(
        service.addQuestions(TEST_ID, ['q1'], { ...OTHER_TEACHER, subject: 'Physics' }),
      ).resolves.toMatchObject({ message: 'Questions updated' });
    });

    it('lets an assigned teacher read the paper', async () => {
      assignedCollaborator();
      supabaseMock.queueResult('tests', { data: [] }); // paper_pattern probe
      supabaseMock.queueResult('tests', { data: { id: TEST_ID } });

      await expect(service.findOne(TEST_ID, OTHER_TEACHER)).resolves.toMatchObject({
        id: TEST_ID,
      });
    });

    it.each([
      ['rename it', (s: TestsService) => s.update(TEST_ID, { title: 'hijacked' }, OTHER_TEACHER)],
      ['publish it', (s: TestsService) => s.publish(TEST_ID, OTHER_TEACHER)],
      ['delete it', (s: TestsService) => s.remove(TEST_ID, OTHER_TEACHER)],
      [
        'reschedule it',
        (s: TestsService) => s.assign(TEST_ID, { batch_ids: [] } as any, OTHER_TEACHER),
      ],
    ])('does not let an assigned teacher %s', async (_name, call) => {
      adminOwnedTest();

      await expect(call(service)).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  /**
   * `update` used to spread the request body straight into the UPDATE, so a
   * teacher could rewrite `created_by`, flip `status` to published without going
   * through the publish route, or set `total_marks` to anything they liked.
   */
  describe('mass assignment', () => {
    it('writes only the columns a client is allowed to set', async () => {
      supabaseMock.queueResult('tests', { data: { id: TEST_ID, created_by: TEACHER.id } });
      supabaseMock.queueResult('tests', { data: { id: TEST_ID } });

      await service.update(
        TEST_ID,
        {
          title: 'New title',
          // None of these are writable columns.
          created_by: 'someone-else',
          status: 'published',
          total_marks: 999,
        } as any,
        TEACHER,
      );

      const write = supabaseMock.calls.find((c) => c.table === 'tests' && c.op === 'update');
      expect(write?.payload).toMatchObject({ title: 'New title' });
      expect(write?.payload).not.toHaveProperty('created_by');
      expect(write?.payload).not.toHaveProperty('status');
      expect(write?.payload).not.toHaveProperty('total_marks');
    });

    it('zeroes negative_marks when the scheme is switched off', async () => {
      supabaseMock.queueResult('tests', { data: { id: TEST_ID, created_by: TEACHER.id } });
      supabaseMock.queueResult('tests', { data: { id: TEST_ID } });

      await service.update(TEST_ID, { negative_marking: false, negative_marks: 5 }, TEACHER);

      const write = supabaseMock.calls.find((c) => c.table === 'tests' && c.op === 'update');
      expect(write?.payload).toMatchObject({ negative_marking: false, negative_marks: 0 });
    });
  });

  /**
   * `tests.t_type` is the `public.test_type` enum (quiz | mock_test | assignment
   * | exam), but the admin console has always sent an exam *pattern* there.
   * Postgres answered `22P02 invalid input value for enum test_type: "jee_main"`
   * and every "Create Test Shell" failed.
   */
  describe('test type vs paper pattern', () => {
    const created = () => supabaseMock.queueResult('tests', { data: { id: TEST_ID } });

    it.each([
      ['jee_main', 'mock_test'],
      ['jee_advanced', 'mock_test'],
      ['neet', 'mock_test'],
      ['custom', 'quiz'],
    ])('maps the %s pattern onto the %s enum member', async (pattern, expectedType) => {
      created();

      await service.create({ title: 'T', duration_minutes: 60, t_type: pattern } as any, TEACHER);

      const write = supabaseMock.calls.find((c) => c.op === 'insert');
      expect(write?.payload).toMatchObject({ t_type: expectedType, paper_pattern: pattern });
    });

    it('passes a genuine enum member straight through, with no pattern', async () => {
      created();

      await service.create({ title: 'T', duration_minutes: 60, t_type: 'quiz' } as any, TEACHER);

      const write = supabaseMock.calls.find((c) => c.op === 'insert');
      expect(write?.payload).toMatchObject({ t_type: 'quiz' });
      expect(write?.payload).not.toHaveProperty('paper_pattern');
    });

    it('prefers an explicit paper_pattern over t_type', async () => {
      created();

      await service.create(
        { title: 'T', duration_minutes: 60, t_type: 'quiz', paper_pattern: 'jee_main' } as any,
        TEACHER,
      );

      const write = supabaseMock.calls.find((c) => c.op === 'insert');
      expect(write?.payload).toMatchObject({ t_type: 'mock_test', paper_pattern: 'jee_main' });
    });

    // Better a 400 naming the options than a 500 the caller cannot act on.
    it('rejects an unknown value with a message listing what is accepted', async () => {
      await expect(
        service.create({ title: 'T', duration_minutes: 60, t_type: 'gate_2027' } as any, TEACHER),
      ).rejects.toThrow(/Unknown test type "gate_2027".*quiz.*jee_main/s);
    });

    it('omits t_type entirely when the client sent none', async () => {
      created();

      await service.create({ title: 'T', duration_minutes: 60 } as any, TEACHER);

      const write = supabaseMock.calls.find((c) => c.op === 'insert');
      expect(write?.payload).not.toHaveProperty('t_type');
    });

    // A database that has not run migration 007 should still create tests.
    it('retries without paper_pattern when the column does not exist', async () => {
      supabaseMock.queueResult('tests', {
        data: null,
        error: { code: '42703', message: 'column "paper_pattern" does not exist' },
      });
      supabaseMock.queueResult('tests', { data: { id: TEST_ID } });

      await expect(
        service.create({ title: 'T', duration_minutes: 60, t_type: 'jee_main' } as any, TEACHER),
      ).resolves.toMatchObject({ id: TEST_ID });

      const writes = supabaseMock.calls.filter((c) => c.op === 'insert');
      expect(writes).toHaveLength(2);
      // First attempt carried it; the retry dropped it but kept the mapped enum.
      expect(writes[0].payload).toHaveProperty('paper_pattern');
      expect(writes[1].payload).not.toHaveProperty('paper_pattern');
      expect(writes[1].payload).toMatchObject({ t_type: 'mock_test' });
    });

    it('surfaces a genuine enum rejection as a 400, not a 500', async () => {
      supabaseMock.queueResult('tests', {
        data: null,
        error: { code: '22P02', message: 'invalid input value for enum test_type: "bogus"' },
      });

      await expect(
        service.create({ title: 'T', duration_minutes: 60, t_type: 'quiz' } as any, TEACHER),
      ).rejects.toMatchObject({ status: 400 });
    });
  });

  /**
   * Reads have to know whether migration 007 has run before they name the
   * column, because naming one that does not exist fails the entire query —
   * which is how `GET /tests` started returning "Failed to load tests".
   */
  describe('paper_pattern column probe', () => {
    const listQuery = () =>
      supabaseMock.queueResult('tests', { data: [], count: 0 });

    /** The select list of the main list query (the probe is the call before it). */
    const listColumns = () => {
      const selects = supabaseMock.calls.filter((c) => c.table === 'tests' && c.op === 'select');
      return selects[selects.length - 1]?.columns ?? '';
    };

    it('omits the column when the migration has not been run', async () => {
      supabaseMock.queueResult('tests', {
        data: null,
        error: { code: '42703', message: 'column tests.paper_pattern does not exist' },
      });
      listQuery();

      await service.findAll(TEACHER, {});

      expect(listColumns()).not.toContain('paper_pattern');
    });

    it('includes the column once the migration has been run', async () => {
      supabaseMock.queueResult('tests', { data: [] }); // probe succeeds
      listQuery();

      await service.findAll(TEACHER, {});

      expect(listColumns()).toContain('paper_pattern');
    });

    /**
     * The original probe used `{ head: true }`. A HEAD response carries no body,
     * so PostgREST's error payload never arrives and postgrest-js reports
     * `{ message: '' }` with no code — which read as "no problem, the column is
     * there", and every subsequent list query 42703'd.
     */
    it('falls back to omitting the column when the probe is inconclusive', async () => {
      supabaseMock.queueResult('tests', { data: null, error: { message: '' } });
      listQuery();

      await service.findAll(TEACHER, {});

      expect(listColumns()).not.toContain('paper_pattern');
    });

    it('caches a definite answer instead of re-probing on every read', async () => {
      supabaseMock.queueResult('tests', {
        data: null,
        error: { code: '42703', message: 'column tests.paper_pattern does not exist' },
      });
      listQuery();
      listQuery();

      await service.findAll(TEACHER, {});
      const afterFirst = supabaseMock.calls.length;
      await service.findAll(TEACHER, {});

      // Second call issues only the list query — no second probe.
      expect(supabaseMock.calls.length - afterFirst).toBe(1);
    });

    // An outage must not latch the column off for the lifetime of the process.
    it('re-probes after an inconclusive result', async () => {
      supabaseMock.queueResult('tests', { data: null, error: { message: 'network down' } });
      listQuery();
      supabaseMock.queueResult('tests', { data: [] }); // probe succeeds this time
      listQuery();

      await service.findAll(TEACHER, {});
      expect(listColumns()).not.toContain('paper_pattern');

      await service.findAll(TEACHER, {});
      expect(listColumns()).toContain('paper_pattern');
    });
  });

  describe('publish', () => {
    it('refuses to publish a paper with no questions on it', async () => {
      supabaseMock.queueResult('tests', { data: { id: TEST_ID, created_by: TEACHER.id } });
      supabaseMock.queueResult('test_questions', { count: 0 });

      await expect(service.publish(TEST_ID, TEACHER)).rejects.toThrow(/at least one question/i);
    });
  });
});
