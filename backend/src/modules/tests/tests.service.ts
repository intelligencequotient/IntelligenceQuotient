import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { supabase } from '../../config/supabase.config';

@Injectable()
export class TestsService {
  /** List all tests */
  async findAll(teacherId: string, status?: string) {
    let query = supabase
      .from('tests')
      .select(`
        id, title, description, subject, t_type, status, duration_minutes,
        total_marks, negative_marking, negative_marks, created_at, created_by,
        test_teachers(teacher_id, subject, users(id, full_name, email)),
        test_questions(question_id, questions(*))
      `)
      .order('created_at', { ascending: false });

    if (status) query = query.eq('status', status);

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return data;
  }


  /** Create a new test (starts as 'draft') */
  async create(body: any, teacherId: string) {
    // Strip frontend-only field before inserting
    const { teacher_ids, assigned_to, ...testBody } = body as any;

    const { data, error } = await supabase
      .from('tests')
      .insert({ ...testBody, created_by: teacherId, status: 'draft' })
      .select()
      .single();
    if (error) throw new Error(error.message);

    // Optionally assign teachers right away
    const ids: string[] = Array.isArray(teacher_ids) ? teacher_ids : [];
    if (ids.length > 0) {
      await supabase.from('test_teachers').insert(
        ids.map(tid => ({ test_id: data.id, teacher_id: tid }))
      );
    }

    return data;
  }

  /** [Admin] Set the full list of teachers assigned to a test (replaces previous list) */
  async assignTeachers(testId: string, teacherIds: string[]) {
    // Delete existing assignments for this test
    const { error: delError } = await supabase
      .from('test_teachers')
      .delete()
      .eq('test_id', testId);
    if (delError) throw new Error(delError.message);

    // Insert the new list (empty array = unassign all)
    if (teacherIds.length > 0) {
      const { error: insError } = await supabase
        .from('test_teachers')
        .insert(teacherIds.map(tid => ({ test_id: testId, teacher_id: tid })));
      if (insError) throw new Error(insError.message);
    }

    // Return updated test with teachers
    const { data, error } = await supabase
      .from('tests')
      .select('id, title, test_teachers(teacher_id, users(id, full_name, email))')
      .eq('id', testId)
      .single();
    if (error) throw new Error(error.message);
    return data;
  }

  /** Get test details + its questions */
  async findOne(id: string) {
    const { data, error } = await supabase
      .from('tests')
      .select(`
        id, title, description, subject, t_type, status, duration_minutes, total_marks,
        negative_marking, negative_marks, created_at, created_by,
        test_questions(question_order, marks_override, questions(id, subject, topic, question_text, options, difficulty, q_type, marks, image_url))
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

    // Manual cascade delete to satisfy foreign key constraints

    // 1. Delete answers associated with attempts of this test
    const { data: attempts } = await supabase.from('attempts').select('id').eq('test_id', id);
    if (attempts && attempts.length > 0) {
      const attemptIds = attempts.map((a: any) => a.id);
      // Supabase in() can handle arrays. If too large, it might fail, but fine for typical deletes.
      await supabase.from('answers').delete().in('attempt_id', attemptIds);
    }

    // 2. Delete attempts
    await supabase.from('attempts').delete().eq('test_id', id);

    // 3. Delete assignments
    await supabase.from('test_assignments').delete().eq('test_id', id);

    // 4. Delete questions association
    await supabase.from('test_questions').delete().eq('test_id', id);

    // 5. Delete teachers association
    await supabase.from('test_teachers').delete().eq('test_id', id);

    // Finally, delete the test itself
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

    // A student in two of the selected batches must still end up with exactly
    // one assignment row — `startAttempt` reads this per (test, student), and a
    // duplicate used to surface as "You are not assigned to this test".
    const deduped = this.dedupeAssignments(assignments);

    if (!deduped.length) {
      throw new BadRequestException('No students found in the selected batches');
    }

    // Manually handle upsert to avoid unique constraint requirements:
    // Delete existing assignments for this test and these students, then insert.
    const studentIds = deduped.map(d => d.student_id);
    
    // Split into smaller chunks if there are many students (PostgREST has URL length limits for .in())
    // Though usually batch sizes are small enough.
    if (studentIds.length > 0) {
      await supabase
        .from('test_assignments')
        .delete()
        .eq('test_id', testId)
        .in('student_id', studentIds);
    }

    const { error } = await supabase
      .from('test_assignments')
      .insert(deduped);
    if (error) throw new Error(error.message);

    return { message: `Test assigned to ${deduped.length} students` };
  }

  /** Collapses assignment rows to one per student, keeping the first batch seen. */
  private dedupeAssignments(rows: any[]): any[] {
    const byStudent = new Map<string, any>();
    for (const row of rows) {
      if (!byStudent.has(row.student_id)) byStudent.set(row.student_id, row);
    }
    return [...byStudent.values()];
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

  /**
   * Full result set for a test (teacher view): the ranked scoreboard, cohort
   * summary stats, and a per-question breakdown showing which items the class
   * struggled with.
   */
  async getResults(testId: string) {
    const { data: test } = await supabase
      .from('tests')
      .select('id, title, total_marks, duration_minutes')
      .eq('id', testId)
      .single();

    if (!test) throw new NotFoundException('Test not found');

    const { data: attempts, error } = await supabase
      .from('attempts')
      .select(`
        id, total_score, status, started_at, submitted_at, auto_submitted,
        users(id, full_name, email)
      `)
      .eq('test_id', testId)
      .eq('status', 'submitted')
      .order('total_score', { ascending: false });

    if (error) throw new Error(error.message);

    const rows = attempts || [];
    const scores = rows.map((a: any) => Number(a.total_score) || 0);
    const maxMarks = Number(test.total_marks) || 0;

    // How many students were expected to sit this test?
    const { count: assignedCount } = await supabase
      .from('test_assignments')
      .select('*', { count: 'exact', head: true })
      .eq('test_id', testId);

    const sorted = [...scores].sort((a, b) => a - b);
    const median = sorted.length
      ? sorted.length % 2
        ? sorted[(sorted.length - 1) / 2]
        : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
      : 0;

    // Per-question difficulty across everyone who sat the test.
    const attemptIds = rows.map((a: any) => a.id);
    const questionStats: any[] = [];

    if (attemptIds.length) {
      const { data: answers } = await supabase
        .from('answers')
        .select('question_id, is_correct, questions(question_text, subject, topic)')
        .in('attempt_id', attemptIds);

      const byQuestion = new Map<string, any>();
      for (const ans of (answers || []) as any[]) {
        const id = ans.question_id;
        if (!byQuestion.has(id)) {
          byQuestion.set(id, {
            questionId: id,
            questionText: ans.questions?.question_text || '',
            subject: ans.questions?.subject || 'Unknown',
            topic: ans.questions?.topic || null,
            correct: 0,
            incorrect: 0,
            unattempted: 0,
          });
        }
        const stat = byQuestion.get(id);
        if (ans.is_correct === true) stat.correct += 1;
        else if (ans.is_correct === false) stat.incorrect += 1;
        else stat.unattempted += 1;
      }

      for (const stat of byQuestion.values()) {
        const answered = stat.correct + stat.incorrect;
        questionStats.push({
          ...stat,
          accuracy: answered > 0 ? Math.round((stat.correct / answered) * 100) : 0,
        });
      }
      // Hardest first — that is what a teacher wants to re-teach.
      questionStats.sort((a, b) => a.accuracy - b.accuracy);
    }

    return {
      test,
      summary: {
        submitted: rows.length,
        assigned: assignedCount ?? 0,
        notAttempted: Math.max(0, (assignedCount ?? 0) - rows.length),
        maxMarks,
        highest: scores.length ? Math.max(...scores) : 0,
        lowest: scores.length ? Math.min(...scores) : 0,
        average: scores.length
          ? Number((scores.reduce((s, v) => s + v, 0) / scores.length).toFixed(2))
          : 0,
        median: Number(median.toFixed(2)),
        autoSubmitted: rows.filter((a: any) => a.auto_submitted).length,
      },
      results: rows.map((a: any, idx: number) => ({
        ...a,
        rank: idx + 1,
        percentage: maxMarks > 0 ? Math.round(((Number(a.total_score) || 0) / maxMarks) * 100) : 0,
      })),
      questionStats,
    };
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
    negative_marking?: boolean;
    negative_marks?: number;
    subject?: string;
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
        subject: body.subject,
        t_type: body.t_type || 'quiz',
        duration_minutes: body.duration_minutes,
        total_marks: body.total_marks,
        status: body.status,
        // Real columns now, so grading can actually apply the penalty.
        negative_marking: body.negative_marking === true,
        negative_marks: body.negative_marking ? Number(body.negative_marks) || 0 : 0,
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

      const deduped = this.dedupeAssignments(assignments);
      if (deduped.length > 0) {
        const studentIds = deduped.map((d: any) => d.student_id);
        // Delete existing assignments first, then insert (avoids upsert unique constraint requirement)
        await supabase
          .from('test_assignments')
          .delete()
          .eq('test_id', testId)
          .in('student_id', studentIds);

        const { error: assignError } = await supabase
          .from('test_assignments')
          .insert(deduped);
        if (assignError) throw new Error(`Failed to assign tests: ${assignError.message}`);
      }
    }

    return test;
  }
}
