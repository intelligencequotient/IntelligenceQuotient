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
      supabaseMock.queueResult('test_teachers', { data: null });

      await expect(service.update(TEST_ID, { title: 'x' }, OTHER_TEACHER)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('allows a teacher assigned to the paper as a collaborator', async () => {
      supabaseMock.queueResult('tests', { data: { id: TEST_ID, created_by: TEACHER.id } });
      supabaseMock.queueResult('test_teachers', { data: { teacher_id: OTHER_TEACHER.id } });
      supabaseMock.queueResult('tests', { data: { id: TEST_ID, title: 'x' } });

      await expect(service.update(TEST_ID, { title: 'x' }, OTHER_TEACHER)).resolves.toMatchObject({
        id: TEST_ID,
      });
    });

    it('lets an admin through without a collaborator lookup', async () => {
      supabaseMock.queueResult('tests', { data: { id: TEST_ID, created_by: TEACHER.id } });
      supabaseMock.queueResult('tests', { data: { id: TEST_ID, title: 'x' } });

      await expect(service.update(TEST_ID, { title: 'x' }, ADMIN)).resolves.toMatchObject({
        id: TEST_ID,
      });
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

  describe('publish', () => {
    it('refuses to publish a paper with no questions on it', async () => {
      supabaseMock.queueResult('tests', { data: { id: TEST_ID, created_by: TEACHER.id } });
      supabaseMock.queueResult('test_questions', { count: 0 });

      await expect(service.publish(TEST_ID, TEACHER)).rejects.toThrow(/at least one question/i);
    });
  });
});
