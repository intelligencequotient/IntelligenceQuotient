import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { supabaseMock } from '../../test-utils/supabase-mock';

jest.mock('../../config/supabase.config', () => ({
  supabase: supabaseMock,
}));

import { BatchesService } from './batches.service';

const BATCH_ID = 'batch-1';
const OWNER = { id: 'teacher-1', role: 'teacher' };
const INTRUDER = { id: 'teacher-2', role: 'teacher' };
const ADMIN = { id: 'admin-1', role: 'admin' };

/** The batch row the ownership check reads. */
const ownedBatch = () =>
  supabaseMock.queueResult('batches', { data: { id: BATCH_ID, name: 'JEE 2026', created_by: OWNER.id } });

describe('BatchesService', () => {
  let service: BatchesService;

  beforeEach(() => {
    supabaseMock.reset();
    jest.clearAllMocks();
    service = new BatchesService();
  });

  /**
   * `findAll` scoped its results to `created_by`, but every other method took a
   * bare batch id with no check at all — so one teacher could read another's
   * student roster, rename their batch, add students to it, or delete it.
   */
  describe.each([
    ['findOne', (s: BatchesService, u: any) => s.findOne(BATCH_ID, u)],
    ['update', (s: BatchesService, u: any) => s.update(BATCH_ID, { name: 'hijacked' }, u)],
    ['remove', (s: BatchesService, u: any) => s.remove(BATCH_ID, u)],
    ['getStudents', (s: BatchesService, u: any) => s.getStudents(BATCH_ID, u)],
    ['addStudent', (s: BatchesService, u: any) => s.addStudent(BATCH_ID, 'student-1', u)],
    ['removeStudent', (s: BatchesService, u: any) => s.removeStudent(BATCH_ID, 'student-1', u)],
  ])('%s', (_name, call) => {
    it("refuses another teacher's batch", async () => {
      ownedBatch();
      await expect(call(service, INTRUDER)).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('404s when the batch does not exist', async () => {
      supabaseMock.queueResult('batches', { data: null });
      await expect(call(service, OWNER)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('findAll', () => {
    it('returns only the caller’s batches for a teacher', async () => {
      supabaseMock.queueResult('batches', { data: [] });
      await service.findAll(OWNER);
      // The scoping is a query filter; assert the call shape rather than data.
      expect(supabaseMock.calls).toEqual([{ table: 'batches', op: 'select', payload: undefined }]);
    });

    it('lets an admin see every batch', async () => {
      supabaseMock.queueResult('batches', { data: [{ id: BATCH_ID }] });
      await expect(service.findAll(ADMIN)).resolves.toHaveLength(1);
    });
  });

  describe('update', () => {
    it('writes only name and subject_focus, never created_by', async () => {
      ownedBatch();
      supabaseMock.queueResult('batches', { data: { id: BATCH_ID } });

      await service.update(
        BATCH_ID,
        { name: 'Renamed', created_by: INTRUDER.id } as any,
        OWNER,
      );

      const write = supabaseMock.calls.find((c) => c.op === 'update');
      expect(write?.payload).toEqual({ name: 'Renamed' });
    });

    it('rejects an empty patch rather than issuing a no-op write', async () => {
      ownedBatch();
      await expect(service.update(BATCH_ID, {}, OWNER)).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('addStudent', () => {
    it('refuses to put a teacher account into a student batch', async () => {
      ownedBatch();
      supabaseMock.queueResult('users', { data: { id: 'teacher-9', role: 'teacher' } });

      await expect(service.addStudent(BATCH_ID, 'teacher-9', OWNER)).rejects.toThrow(
        /only student accounts/i,
      );
    });

    it('404s for an unknown student', async () => {
      ownedBatch();
      supabaseMock.queueResult('users', { data: null });

      await expect(service.addStudent(BATCH_ID, 'nobody', OWNER)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('adds a genuine student', async () => {
      ownedBatch();
      supabaseMock.queueResult('users', { data: { id: 'student-1', role: 'student' } });
      supabaseMock.queueResult('batch_students', { data: { batch_id: BATCH_ID } });

      await expect(service.addStudent(BATCH_ID, 'student-1', OWNER)).resolves.toBeDefined();
    });
  });

  describe('remove', () => {
    it('clears membership rows before deleting the batch', async () => {
      ownedBatch();
      supabaseMock.queueResult('batch_students', { data: null });
      supabaseMock.queueResult('batches', { data: null });

      await service.remove(BATCH_ID, OWNER);

      const deletes = supabaseMock.calls.filter((c) => c.op === 'delete').map((c) => c.table);
      expect(deletes).toEqual(['batch_students', 'batches']);
    });
  });
});
