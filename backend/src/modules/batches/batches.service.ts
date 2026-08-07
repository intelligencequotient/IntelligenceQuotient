import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { supabase } from '../../config/supabase.config';
import { fetchAll } from '../../common/db/query.util';
import { CreateBatchDto, UpdateBatchDto } from './dto/batch.dto';

export interface Requester {
  id: string;
  role?: string;
}

@Injectable()
export class BatchesService {
  /**
   * Confirms the caller owns this batch (or is an admin), and 404s otherwise.
   *
   * `findAll` scoped its results to `created_by`, but every other method took a
   * bare id with no check at all — so one teacher could read another's roster,
   * rename their batch, add students to it, or delete it outright.
   */
  private async assertCanManage(batchId: string, user: Requester) {
    const { data: batch } = await supabase
      .from('batches')
      .select('id, name, created_by')
      .eq('id', batchId)
      .single();

    if (!batch) throw new NotFoundException('Batch not found');
    if (user.role !== 'admin' && batch.created_by !== user.id) {
      throw new ForbiddenException('This batch belongs to another teacher.');
    }
    return batch;
  }

  async findAll(user: Requester) {
    let query = supabase
      .from('batches')
      .select('id, name, subject_focus, created_at, created_by, batch_students(count)')
      .order('created_at', { ascending: false });

    // Admins oversee the whole institute; a teacher sees their own batches.
    if (user.role !== 'admin') query = query.eq('created_by', user.id);

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return data;
  }

  async create(body: CreateBatchDto, user: Requester) {
    const { data, error } = await supabase
      .from('batches')
      .insert({
        name: body.name.trim(),
        subject_focus: body.subject_focus ?? null,
        created_by: user.id,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data;
  }

  async findOne(id: string, user: Requester) {
    await this.assertCanManage(id, user);

    const { data, error } = await supabase
      .from('batches')
      .select(
        'id, name, subject_focus, created_at, batch_students(student_id, joined_at, users(id, full_name, email))',
      )
      .eq('id', id)
      .single();
    if (error || !data) throw new NotFoundException('Batch not found');
    return data;
  }

  async update(id: string, body: UpdateBatchDto, user: Requester) {
    await this.assertCanManage(id, user);

    // Only the two editable fields — never created_by.
    const patch: Record<string, any> = {};
    if (body.name !== undefined) patch.name = body.name.trim();
    if (body.subject_focus !== undefined) patch.subject_focus = body.subject_focus;
    if (!Object.keys(patch).length) throw new BadRequestException('Nothing to update.');

    const { data, error } = await supabase
      .from('batches')
      .update(patch)
      .eq('id', id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data;
  }

  async remove(id: string, user: Requester) {
    await this.assertCanManage(id, user);

    // Membership rows reference the batch; clear them so the delete is not
    // rejected by the foreign key on a database without ON DELETE CASCADE.
    await supabase.from('batch_students').delete().eq('batch_id', id);

    const { error } = await supabase.from('batches').delete().eq('id', id);
    if (error) throw new Error(error.message);
    return { message: 'Batch deleted successfully' };
  }

  async getStudents(batchId: string, user: Requester) {
    await this.assertCanManage(batchId, user);

    // Paged: a large batch is exactly the case that hits PostgREST's row cap.
    return fetchAll<any>(() =>
      supabase
        .from('batch_students')
        .select('student_id, joined_at, users(id, full_name, email)')
        .eq('batch_id', batchId)
        .order('joined_at', { ascending: true }),
    );
  }

  async addStudent(batchId: string, studentId: string, user: Requester) {
    await this.assertCanManage(batchId, user);

    // Only actual students go into a batch — a stray teacher id here would end
    // up assigned tests and counted in every cohort statistic.
    const { data: student } = await supabase
      .from('users')
      .select('id, role')
      .eq('id', studentId)
      .single();

    if (!student) throw new NotFoundException('Student not found');
    if (student.role !== 'student') {
      throw new BadRequestException('Only student accounts can be added to a batch.');
    }

    const { data, error } = await supabase
      .from('batch_students')
      .upsert(
        { batch_id: batchId, student_id: studentId },
        { onConflict: 'batch_id,student_id', ignoreDuplicates: true },
      )
      .select()
      .maybeSingle();

    if (error) throw new Error(error.message);
    return data ?? { batch_id: batchId, student_id: studentId, alreadyMember: true };
  }

  async removeStudent(batchId: string, studentId: string, user: Requester) {
    await this.assertCanManage(batchId, user);

    const { error } = await supabase
      .from('batch_students')
      .delete()
      .eq('batch_id', batchId)
      .eq('student_id', studentId);
    if (error) throw new Error(error.message);
    return { message: 'Student removed from batch' };
  }
}
