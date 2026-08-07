import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { supabaseMock } from '../../test-utils/supabase-mock';

jest.mock('../../config/supabase.config', () => ({
  supabase: supabaseMock,
}));

import { QuestionsService } from './questions.service';

const QID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const QID_2 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

const PHYSICS_TEACHER = { id: 'teacher-1', role: 'teacher', subject: 'Physics' };
const ALL_SUBJECTS_TEACHER = { id: 'teacher-2', role: 'teacher', subject: 'All' };
const ADMIN = { id: 'admin-1', role: 'admin', subject: 'All' };

describe('QuestionsService', () => {
  let service: QuestionsService;

  beforeEach(() => {
    supabaseMock.reset();
    jest.clearAllMocks();
    service = new QuestionsService();
  });

  /**
   * `findAll` has always narrowed reads to the teacher's subject, but every
   * write path took only an id — so a Physics teacher could edit or delete the
   * Chemistry bank outright, using ids visible on any shared test.
   */
  describe('subject scoping on writes', () => {
    it("refuses to update a question outside the teacher's subject", async () => {
      supabaseMock.queueResult('questions', { data: [{ id: QID, subject: 'Chemistry' }] });

      await expect(
        service.update(QID, { question_text: 'rewritten' }, PHYSICS_TEACHER),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('allows an in-subject update', async () => {
      supabaseMock.queueResult('questions', { data: [{ id: QID, subject: 'Physics' }] });
      supabaseMock.queueResult('questions', { data: { id: QID } });

      await expect(
        service.update(QID, { question_text: 'rewritten' }, PHYSICS_TEACHER),
      ).resolves.toMatchObject({ id: QID });
    });

    // The bank stores "Physics"; a token can carry "physics".
    it('matches the subject case-insensitively', async () => {
      supabaseMock.queueResult('questions', { data: [{ id: QID, subject: 'physics' }] });
      supabaseMock.queueResult('questions', { data: { id: QID } });

      await expect(service.update(QID, { marks: 4 }, PHYSICS_TEACHER)).resolves.toBeDefined();
    });

    it('refuses to delete out of subject', async () => {
      supabaseMock.queueResult('questions', { data: [{ id: QID, subject: 'Mathematics' }] });

      await expect(service.remove(QID, PHYSICS_TEACHER)).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('refuses to approve out of subject', async () => {
      supabaseMock.queueResult('questions', { data: [{ id: QID, subject: 'Chemistry' }] });

      await expect(service.approve(QID, PHYSICS_TEACHER)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('rejects a bulk operation if any single id is out of subject', async () => {
      supabaseMock.queueResult('questions', {
        data: [
          { id: QID, subject: 'Physics' },
          { id: QID_2, subject: 'Chemistry' },
        ],
      });

      await expect(
        service.bulkRemove([QID, QID_2], PHYSICS_TEACHER),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('404s rather than leaking whether an unknown id exists', async () => {
      supabaseMock.queueResult('questions', { data: [] });

      await expect(service.remove(QID, PHYSICS_TEACHER)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('leaves an unscoped teacher unrestricted', async () => {
      supabaseMock.queueResult('questions', { data: { id: QID } });

      await expect(service.remove(QID, ALL_SUBJECTS_TEACHER)).resolves.toBeDefined();
      // No ownership lookup was needed, so the only call is the write itself.
      expect(supabaseMock.calls.filter((c) => c.op === 'select')).toHaveLength(0);
    });

    it('leaves an admin unrestricted', async () => {
      supabaseMock.queueResult('questions', { data: { id: QID } });
      await expect(service.remove(QID, ADMIN)).resolves.toBeDefined();
    });

    it("refuses to file a question under another teacher's subject", async () => {
      supabaseMock.queueResult('questions', { data: [{ id: QID, subject: 'Physics' }] });

      await expect(
        service.update(QID, { subject: 'Chemistry' }, PHYSICS_TEACHER),
      ).rejects.toThrow(/only file questions under Physics/i);
    });
  });

  /**
   * `create` spread the body after the defaults (`{ source, review_status,
   * ...body }`), so a teacher could post `review_status: 'approved'` on an
   * unreviewed question — or set `id`, `is_active`, `created_by`.
   */
  describe('mass assignment', () => {
    it('ignores client-supplied server-owned columns on create', async () => {
      supabaseMock.queueResult('questions', { data: { id: QID } });

      await service.create(
        {
          subject: 'Physics',
          question_text: 'What?',
          correct_answer: { index: 0 },
          id: 'chosen-by-client',
          review_status: 'rejected',
          created_by: 'someone-else',
          is_active: false,
        } as any,
        PHYSICS_TEACHER,
      );

      const write = supabaseMock.calls.find((c) => c.op === 'insert');
      expect(write?.payload).toMatchObject({
        review_status: 'approved',
        created_by: PHYSICS_TEACHER.id,
        is_active: true,
        source: 'manual',
      });
      expect(write?.payload).not.toHaveProperty('id');
    });

    it("refuses to create a question outside the teacher's subject", async () => {
      await expect(
        service.create(
          { subject: 'Chemistry', question_text: 'x', correct_answer: { index: 0 } } as any,
          PHYSICS_TEACHER,
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('drops non-writable keys from an approval correction', async () => {
      supabaseMock.queueResult('questions', { data: [{ id: QID, subject: 'Physics' }] });
      supabaseMock.queueResult('questions', { data: { id: QID } });

      await service.approve(QID, PHYSICS_TEACHER, { review_status: 'rejected', marks: 2 } as any);

      const write = supabaseMock.calls.find((c) => c.op === 'update');
      expect(write?.payload).toMatchObject({ marks: 2, review_status: 'approved' });
    });
  });

  describe('bulkInsert', () => {
    it('re-derives validity rather than trusting the flag the browser sent back', async () => {
      supabaseMock.queueResult('questions', { data: [{ id: QID }] });

      const result = await service.bulkInsert(
        [
          // Marked valid by the client but missing an answer key.
          { valid: true, subject: 'Physics', question_text: 'no key' } as any,
          {
            valid: false,
            subject: 'Physics',
            question_text: 'real one',
            correct_answer: { index: 1 },
          } as any,
        ],
        PHYSICS_TEACHER,
      );

      expect(result.inserted).toBe(1);
      const write = supabaseMock.calls.find((c) => c.op === 'insert');
      expect(write?.payload).toHaveLength(1);
      expect(write?.payload[0]).toMatchObject({ question_text: 'real one', source: 'csv' });
    });

    it("refuses an import outside the teacher's subject", async () => {
      await expect(
        service.bulkInsert(
          [{ subject: 'Biology', question_text: 'x', correct_answer: { index: 0 } } as any],
          PHYSICS_TEACHER,
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('parseCSV', () => {
    const csv = (body: string) => Buffer.from(body, 'utf8');

    it('flags rows with a bad answer letter instead of storing index -1', async () => {
      const rows = await service.parseCSV(
        csv(
          'question,optA,optB,optC,optD,correct,difficulty,subject,topic\n' +
            'Valid?,a,b,c,d,B,easy,Physics,Optics\n' +
            'Broken?,a,b,c,d,Z,easy,Physics,Optics\n',
        ),
      );

      expect(rows).toHaveLength(2);
      expect(rows[0]).toMatchObject({ valid: true, correct_answer: { index: 1 } });
      expect(rows[1].valid).toBe(false);
      expect(rows[1].errorMsg).toMatch(/correct must be/i);
    });

    it('stops accumulating past the row cap', async () => {
      const header = 'question,optA,optB,optC,optD,correct,difficulty,subject,topic\n';
      const body = Array.from({ length: 50 }, (_, i) => `Q${i},a,b,c,d,A,easy,Physics,Optics`).join('\n');

      const rows = await service.parseCSV(csv(header + body), 10);
      expect(rows).toHaveLength(10);
    });
  });
});
