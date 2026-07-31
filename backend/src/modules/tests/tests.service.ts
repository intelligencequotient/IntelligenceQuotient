import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { supabase } from '../../config/supabase.config';

@Injectable()
export class TestsService {
  /** List all tests for a teacher */
  async findAll(teacherId: string, status?: string) {
    let query = supabase
      .from('tests')
      .select('id, title, description, t_type, status, duration_minutes, total_marks, created_at')
      .eq('created_by', teacherId)
      .order('created_at', { ascending: false });

    if (status) query = query.eq('status', status);

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return data;
  }

  /** Create a new test (starts as 'draft') */
  async create(body: any, teacherId: string) {
    const { data, error } = await supabase
      .from('tests')
      .insert({ ...body, created_by: teacherId, status: 'draft' })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data;
  }

  /** Get test details + its questions */
  async findOne(id: string) {
    const { data, error } = await supabase
      .from('tests')
      .select(`
        id, title, description, t_type, status, duration_minutes, total_marks, created_at,
        test_questions(question_order, marks_override, questions(id, subject, topic, question_text, options, difficulty, q_type))
      `)
      .eq('id', id)
      .single();
    if (error || !data) throw new NotFoundException('Test not found');
    return data;
  }

  /** Update a draft test */
  async update(id: string, body: any) {
    const { data, error } = await supabase
      .from('tests')
      .update({ ...body, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data;
  }

  /** Delete a draft test */
  async remove(id: string) {
    const { error } = await supabase.from('tests').delete().eq('id', id);
    if (error) throw new Error(error.message);
    return { message: 'Test deleted' };
  }

  /** Add questions to test (Step 2 of TestConstructor) */
  async addQuestions(testId: string, questionIds: string[]) {
    const ids = questionIds || [];

    // Replace the whole set: clear first, then re-insert in order
    await supabase.from('test_questions').delete().eq('test_id', testId);

    if (ids.length) {
      const rows = ids.map((qId, idx) => ({
        test_id: testId,
        question_id: qId,
        question_order: idx + 1,
      }));
      const { error } = await supabase.from('test_questions').insert(rows);
      if (error) throw new Error(error.message);
    } else {
      // No questions left on the test — zero out its marks and stop here
      await supabase.from('tests').update({ total_marks: 0 }).eq('id', testId);
      return { message: 'Questions updated', total_marks: 0 };
    }

    // Recalculate total_marks
    const { data: questions } = await supabase
      .from('test_questions')
      .select('marks_override, questions(marks)')
      .eq('test_id', testId);

    const totalMarks = (questions || []).reduce((sum: number, tq: any) => {
      return sum + (tq.marks_override || tq.questions?.marks || 4);
    }, 0);

    await supabase.from('tests').update({ total_marks: totalMarks }).eq('id', testId);

    return { message: 'Questions updated', total_marks: totalMarks };
  }

  /** Publish a test (makes it visible to students) */
  async publish(id: string) {
    const { data, error } = await supabase
      .from('tests')
      .update({ status: 'published', updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data;
  }

  /** Assign test to batches with a schedule */
  async assign(testId: string, body: {
    batch_ids: string[];
    scheduled_start: string;
    scheduled_end: string;
  }) {
    // For each batch, get its students, then create one assignment per student
    const assignments: any[] = [];

    for (const batchId of body.batch_ids) {
      const { data: batchStudents } = await supabase
        .from('batch_students')
        .select('student_id')
        .eq('batch_id', batchId);

      for (const bs of (batchStudents || [])) {
        assignments.push({
          test_id: testId,
          batch_id: batchId,
          student_id: bs.student_id,
          scheduled_start: body.scheduled_start,
          scheduled_end: body.scheduled_end,
        });
      }
    }

    if (!assignments.length) {
      throw new BadRequestException('No students found in the selected batches');
    }

    // Re-assigning replaces the previous schedule rather than stacking duplicates
    await supabase.from('test_assignments').delete().eq('test_id', testId);

    const { error } = await supabase.from('test_assignments').insert(assignments);
    if (error) throw new Error(error.message);

    return { message: `Test assigned to ${assignments.length} students` };
  }

  /** Get tests available for a student (based on their assignment) */
  async getStudentTests(studentId: string) {
    // NOTE: `!inner` is required — without it PostgREST returns the assignment
    // row with a null `tests` object instead of filtering it out, which would
    // leak unpublished tests into the student's list.
    const { data, error } = await supabase
      .from('test_assignments')
      .select(`
        id, scheduled_start, scheduled_end,
        tests!inner(id, title, description, t_type, duration_minutes, total_marks, status)
      `)
      .eq('student_id', studentId)
      .eq('tests.status', 'published')
      .order('scheduled_start', { ascending: true });

    if (error) throw new Error(error.message);
    return data;
  }

  /**
   * Get test questions for a student — NEVER returns correct_answer!
   * correct_answer is only used by backend on submission.
   */
  async getTestQuestionsForStudent(testId: string) {
    const { data, error } = await supabase
      .from('test_questions')
      .select(`
        question_order, marks_override,
        questions(id, subject, topic, question_text, options, difficulty, q_type, image_url, marks)
      `)
      .eq('test_id', testId)
      .order('question_order', { ascending: true });

    if (error) throw new Error(error.message);
    return data;
  }

  /** Get all student results for a test (teacher view) */
  async getResults(testId: string) {
    const { data, error } = await supabase
      .from('attempts')
      .select(`
        id, total_score, status, started_at, submitted_at, auto_submitted,
        users(id, full_name, email)
      `)
      .eq('test_id', testId)
      .eq('status', 'submitted')
      .order('total_score', { ascending: false });

    if (error) throw new Error(error.message);
    return data;
  }
}
