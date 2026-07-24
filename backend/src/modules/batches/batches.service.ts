import { Injectable, NotFoundException } from '@nestjs/common';
import { supabase } from '../../config/supabase.config';

@Injectable()
export class BatchesService {
  async findAll(teacherId: string) {
    const { data, error } = await supabase
      .from('batches')
      .select('id, name, subject_focus, created_at, batch_students(count)')
      .eq('created_by', teacherId)
      .order('created_at', { ascending: false });
    if (error) throw new Error(error.message);
    return data;
  }

  async create(body: { name: string; subject_focus?: string }, teacherId: string) {
    const { data, error } = await supabase
      .from('batches')
      .insert({ name: body.name, subject_focus: body.subject_focus, created_by: teacherId })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data;
  }

  async findOne(id: string) {
    const { data, error } = await supabase
      .from('batches')
      .select('id, name, subject_focus, created_at, batch_students(student_id, joined_at, users(id, full_name, email))')
      .eq('id', id)
      .single();
    if (error || !data) throw new NotFoundException('Batch not found');
    return data;
  }

  async update(id: string, body: { name?: string; subject_focus?: string }) {
    const { data, error } = await supabase
      .from('batches')
      .update(body)
      .eq('id', id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data;
  }

  async remove(id: string) {
    const { error } = await supabase.from('batches').delete().eq('id', id);
    if (error) throw new Error(error.message);
    return { message: 'Batch deleted successfully' };
  }

  async getStudents(batchId: string) {
    const { data, error } = await supabase
      .from('batch_students')
      .select('student_id, joined_at, users(id, full_name, email)')
      .eq('batch_id', batchId);
    if (error) throw new Error(error.message);
    return data;
  }

  async addStudent(batchId: string, studentId: string) {
    const { data, error } = await supabase
      .from('batch_students')
      .insert({ batch_id: batchId, student_id: studentId })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data;
  }

  async removeStudent(batchId: string, studentId: string) {
    const { error } = await supabase
      .from('batch_students')
      .delete()
      .eq('batch_id', batchId)
      .eq('student_id', studentId);
    if (error) throw new Error(error.message);
    return { message: 'Student removed from batch' };
  }
}
