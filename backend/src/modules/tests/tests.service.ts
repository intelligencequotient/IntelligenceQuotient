import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { supabase } from '../../config/supabase.config';

@Injectable()
export class TestsService {
  /** List all tests */
  async findAll(teacherId: string, status?: string) {
    let query = supabase
      .from('tests')
      .select('id, title, description, t_type, status, duration_minutes, total_marks, created_at, created_by')
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
        id, title, description, t_type, status, duration_minutes, total_marks, created_at, created_by,
        test_questions(question_order, marks_override, questions(id, subject, topic, question_text, options, difficulty, q_type))
      `)
      .eq('id', id)
      .single();
    if (error || !data) throw new NotFoundException('Test not found');
    return data;
  }

  /** Update a draft test */
  async update(id: string, body: any, user?: any) {
    if (user) {
      const { data: test } = await supabase.from('tests').select('created_by').eq('id', id).single();
      if (test && test.created_by !== user.id) throw new BadRequestException('Only the initiator can update test metadata.');
    }
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
  async remove(id: string, user?: any) {
    if (user) {
      const { data: test } = await supabase.from('tests').select('created_by').eq('id', id).single();
      if (test && test.created_by !== user.id) throw new BadRequestException('Only the initiator can delete this test.');
    }
    const { error } = await supabase.from('tests').delete().eq('id', id);
    if (error) throw new Error(error.message);
    return { message: 'Test deleted' };
  }

  /** Add questions to test (Step 2 of TestConstructor) */
  async addQuestions(testId: string, questionIds: string[], user?: any) {
    if (!questionIds) questionIds = []; // Allow empty array to clear questions

    const { data: existingTestQuestions } = await supabase
      .from('test_questions')
      .select('question_id, questions(subject)')
      .eq('test_id', testId);
      
    const existingIds = (existingTestQuestions || []).map(tq => tq.question_id);

    if (user && user.role === 'teacher' && user.subject && user.subject !== 'All') {
      const addedIds = questionIds.filter(id => !existingIds.includes(id));
      const removedIds = existingIds.filter(id => !questionIds.includes(id));
      
      if (addedIds.length > 0) {
        const { data: qData, error: qError } = await supabase.from('questions').select('subject').in('id', addedIds);
        if (qError) throw new BadRequestException('Error validating added questions');
        if (qData.some(q => q.subject !== user.subject)) {
          throw new BadRequestException(`Access denied: You can only add ${user.subject} questions.`);
        }
      }
      
      if (removedIds.length > 0) {
        const { data: qData, error: qError } = await supabase.from('questions').select('subject').in('id', removedIds);
        if (qError) throw new BadRequestException('Error validating removed questions');
        if (qData.some(q => q.subject !== user.subject)) {
          throw new BadRequestException(`Access denied: You can only remove ${user.subject} questions.`);
        }
      }
    }

    const rows = questionIds.map((qId, idx) => ({
      test_id: testId,
      question_id: qId,
      question_order: idx + 1,
    }));

    // Delete old questions first, then re-insert
    await supabase.from('test_questions').delete().eq('test_id', testId);
    const { error } = await supabase.from('test_questions').insert(rows);
    if (error) throw new Error(error.message);

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
  async publish(id: string, user?: any) {
    if (user) {
      const { data: test } = await supabase.from('tests').select('created_by').eq('id', id).single();
      if (test && test.created_by !== user.id) throw new BadRequestException('Only the initiator can publish this test.');
    }
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
  }, user?: any) {
    if (user) {
      const { data: test } = await supabase.from('tests').select('created_by').eq('id', testId).single();
      if (test && test.created_by !== user.id) throw new BadRequestException('Only the initiator can assign this test.');
    }
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

    const { error } = await supabase.from('test_assignments').insert(assignments);
    if (error) throw new Error(error.message);

    return { message: `Test assigned to ${assignments.length} students` };
  }

  /** Get tests available for a student (based on their assignment) */
  async getStudentTests(studentId: string) {
    // Step 1: Get test_assignment rows for this student
    const { data: assignments, error: aErr } = await supabase
      .from('test_assignments')
      .select('id, scheduled_start, scheduled_end, test_id, batch_id')
      .eq('student_id', studentId)
      .order('scheduled_start', { ascending: true });

    if (aErr) throw new Error(aErr.message);
    if (!assignments || assignments.length === 0) return [];

    // Step 2: Fetch the tests separately (avoids triggering batch_students RLS)
    const testIds = [...new Set(assignments.map((a: any) => a.test_id))];
    const { data: tests, error: tErr } = await supabase
      .from('tests')
      .select('id, title, description, t_type, duration_minutes, total_marks, status')
      .in('id', testIds)
      .eq('status', 'published');

    if (tErr) throw new Error(tErr.message);

    // Step 3: Merge
    const testMap = new Map((tests || []).map((t: any) => [t.id, t]));
    return assignments
      .filter((a: any) => testMap.has(a.test_id))
      .map((a: any) => ({ ...a, tests: testMap.get(a.test_id) }));
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

  /**
   * Atomic operation to create a test, link questions, and assign batches in one go.
   */
  async saveFullTest(body: {
    title: string;
    description?: string;
    t_type?: string;
    duration_minutes: number;
    total_marks: number;
    status: 'draft' | 'published';
    question_ids: string[];
    batch_ids: string[];
    scheduled_start?: string;
    scheduled_end?: string;
  }, user: any) {
    const teacherId = user.id;
    
    // Validate question subjects if restricted
    if (body.question_ids && body.question_ids.length > 0) {
      if (user && user.role === 'teacher' && user.subject && user.subject !== 'All') {
        const { data: qData, error: qError } = await supabase
          .from('questions')
          .select('subject')
          .in('id', body.question_ids);
        
        if (qError) throw new BadRequestException('Error validating questions');
        if (qData.some(q => q.subject !== user.subject)) {
          throw new BadRequestException(`Access denied: You can only add ${user.subject} questions.`);
        }
      }
    }
    // 1. Create the test
    const { data: test, error: testError } = await supabase
      .from('tests')
      .insert({
        title: body.title,
        description: body.description,
        t_type: body.t_type || 'quiz',
        duration_minutes: body.duration_minutes,
        total_marks: body.total_marks,
        status: body.status,
        created_by: teacherId
      })
      .select()
      .single();

    if (testError) throw new Error(`Test creation failed: ${testError.message}`);

    const testId = test.id;

    // 2. Link questions
    if (body.question_ids && body.question_ids.length > 0) {
      const qRows = body.question_ids.map((qId, idx) => ({
        test_id: testId,
        question_id: qId,
        question_order: idx + 1
      }));
      const { error: qError } = await supabase.from('test_questions').insert(qRows);
      if (qError) throw new Error(`Failed to link questions: ${qError.message}`);
    }

    // 3. Assign to batches
    if (body.batch_ids && body.batch_ids.length > 0) {
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
            scheduled_start: body.scheduled_start || new Date().toISOString(),
            scheduled_end: body.scheduled_end || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
          });
        }
      }

      if (assignments.length > 0) {
        const { error: assignError } = await supabase.from('test_assignments').insert(assignments);
        if (assignError) throw new Error(`Failed to assign tests: ${assignError.message}`);
      }
    }

    return test;
  }
}
