import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { supabase } from '../../config/supabase.config';

@Injectable()
export class AttemptsService {
  /**
   * START: Student begins an exam.
   * Creates a row in `attempts` table and returns timing info.
   */
  async startAttempt(testId: string, studentId: string) {
    // Check if student is assigned this test
    const { data: assignment } = await supabase
      .from('test_assignments')
      .select('id, scheduled_start, scheduled_end')
      .eq('test_id', testId)
      .eq('student_id', studentId)
      .single();

    if (!assignment) {
      throw new ForbiddenException('You are not assigned to this test');
    }

    // Check if already attempted
    const { data: existing } = await supabase
      .from('attempts')
      .select('id, status')
      .eq('test_id', testId)
      .eq('student_id', studentId)
      .single();

    // If already submitted, reject
    if (existing?.status === 'submitted') {
      throw new BadRequestException('You have already submitted this test');
    }

    // If in progress, resume it
    if (existing?.status === 'in_progress') {
      const { data: test } = await supabase
        .from('tests')
        .select('duration_minutes')
        .eq('id', testId)
        .single();

      const startedAt = new Date(existing['started_at'] || Date.now());
      const expiresAt = new Date(startedAt.getTime() + (test?.duration_minutes || 60) * 60 * 1000);

      return {
        attemptId: existing.id,
        testId,
        resumed: true,
        startedAt: startedAt.toISOString(),
        expiresAt: expiresAt.toISOString(),
        timeLeftSeconds: Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000)),
      };
    }

    // Get test info
    const { data: test } = await supabase
      .from('tests')
      .select('duration_minutes')
      .eq('id', testId)
      .single();

    if (!test) throw new NotFoundException('Test not found');

    // Create new attempt
    const now = new Date();
    const expiresAt = new Date(now.getTime() + test.duration_minutes * 60 * 1000);

    const { data: attempt, error } = await supabase
      .from('attempts')
      .insert({
        test_id: testId,
        student_id: studentId,
        status: 'in_progress',
        started_at: now.toISOString(),
      })
      .select()
      .single();

    if (error) throw new Error(error.message);

    return {
      attemptId: attempt.id,
      testId,
      resumed: false,
      startedAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
      timeLeftSeconds: test.duration_minutes * 60,
    };
  }

  /**
   * SAVE ANSWER: Upsert one question's answer during the exam.
   * Called every time a student selects an option.
   */
  async saveAnswer(
    attemptId: string,
    studentId: string,
    body: {
      question_id: string;
      selected_answer: any;
      time_spent_seconds: number;
    },
  ) {
    // Verify the attempt belongs to this student
    const { data: attempt } = await supabase
      .from('attempts')
      .select('id, status')
      .eq('id', attemptId)
      .eq('student_id', studentId)
      .single();

    if (!attempt) throw new NotFoundException('Attempt not found');
    if (attempt.status === 'submitted') throw new BadRequestException('Test already submitted');

    // Upsert answer (insert or update if already exists)
    const { error } = await supabase.from('answers').upsert(
      {
        attempt_id: attemptId,
        question_id: body.question_id,
        selected_answer: body.selected_answer,
        time_spent_seconds: body.time_spent_seconds,
      },
      { onConflict: 'attempt_id,question_id' },
    );

    if (error) throw new Error(error.message);
    return { saved: true };
  }

  /**
   * TOGGLE FLAG: Mark/unmark a question for doubt review.
   */
  async toggleFlag(attemptId: string, questionId: string, flagged: boolean) {
    const { error } = await supabase
      .from('answers')
      .update({ flagged_for_doubt: flagged })
      .eq('attempt_id', attemptId)
      .eq('question_id', questionId);

    if (error) throw new Error(error.message);
    return { flagged };
  }

  /**
   * SUBMIT: Grade the exam and finalize the attempt.
   * This is the most important function — it calculates the score securely on the backend.
   */
  async submitAttempt(attemptId: string, studentId: string, autoSubmitted = false) {
    // Verify attempt
    const { data: attempt } = await supabase
      .from('attempts')
      .select('id, test_id, status, started_at')
      .eq('id', attemptId)
      .eq('student_id', studentId)
      .single();

    if (!attempt) throw new NotFoundException('Attempt not found');
    if (attempt.status === 'submitted') throw new BadRequestException('Already submitted');

    // Get all questions in the test WITH their correct answers
    const { data: testQuestions } = await supabase
      .from('test_questions')
      .select('question_id, marks_override, questions(correct_answer, marks)')
      .eq('test_id', attempt.test_id);

    // Get all student answers for this attempt
    const { data: studentAnswers } = await supabase
      .from('answers')
      .select('question_id, selected_answer')
      .eq('attempt_id', attemptId);

    const answerMap = new Map(
      (studentAnswers || []).map((a) => [a.question_id, a.selected_answer]),
    );

    // Grade each question
    let totalScore = 0;
    const answerUpdates: any[] = [];

    for (const tq of testQuestions || []) {
      const questionId = tq.question_id;
      const correctAnswer = (tq.questions as any)?.correct_answer;
      const marks = tq.marks_override || (tq.questions as any)?.marks || 4;
      const studentAnswer = answerMap.get(questionId);

      const isCorrect =
        studentAnswer !== undefined &&
        JSON.stringify(studentAnswer) === JSON.stringify(correctAnswer);

      if (isCorrect) totalScore += Number(marks);

      answerUpdates.push({
        attempt_id: attemptId,
        question_id: questionId,
        is_correct: studentAnswer !== undefined ? isCorrect : null,
      });
    }

    // Update all answer rows with is_correct
    for (const upd of answerUpdates) {
      await supabase
        .from('answers')
        .update({ is_correct: upd.is_correct })
        .eq('attempt_id', upd.attempt_id)
        .eq('question_id', upd.question_id);
    }

    const submittedAt = new Date();
    const timeTakenSeconds = Math.floor(
      (submittedAt.getTime() - new Date(attempt.started_at).getTime()) / 1000,
    );

    // Finalize attempt
    const { data: finalAttempt, error } = await supabase
      .from('attempts')
      .update({
        status: 'submitted',
        total_score: totalScore,
        submitted_at: submittedAt.toISOString(),
        auto_submitted: autoSubmitted,
      })
      .eq('id', attemptId)
      .select()
      .single();

    if (error) throw new Error(error.message);

    // Calculate stats for the result page
    const correct = answerUpdates.filter((a) => a.is_correct === true).length;
    const incorrect = answerUpdates.filter((a) => a.is_correct === false).length;
    const unattempted = answerUpdates.filter((a) => a.is_correct === null).length;
    const total = testQuestions?.length || 1;
    const maxScore = (testQuestions || []).reduce((sum, tq) => {
      return sum + Number(tq.marks_override || (tq.questions as any)?.marks || 4);
    }, 0);

    return {
      attemptId,
      testId: attempt.test_id,
      score: totalScore,
      maxScore,
      correct,
      incorrect,
      unattempted,
      accuracy: Math.round((correct / total) * 100),
      timeTakenSeconds,
      autoSubmitted,
    };
  }

  /** Get all of a student's past attempts */
  async getMyAttempts(studentId: string) {
    const { data, error } = await supabase
      .from('attempts')
      .select('id, status, total_score, started_at, submitted_at, tests(id, title, total_marks)')
      .eq('student_id', studentId)
      .order('started_at', { ascending: false });

    if (error) throw new Error(error.message);
    return data;
  }

  /** Get one attempt result — for the PostTestResult page */
  async getAttemptResult(attemptId: string, studentId: string) {
    const { data: attempt, error } = await supabase
      .from('attempts')
      .select(`
        id, status, total_score, started_at, submitted_at, auto_submitted,
        tests(id, title, total_marks, duration_minutes),
        answers(
          question_id, selected_answer, is_correct, time_spent_seconds, flagged_for_doubt,
          questions(id, question_text, options, correct_answer, subject, topic, difficulty)
        )
      `)
      .eq('id', attemptId)
      .eq('student_id', studentId)
      .single();

    if (error || !attempt) throw new NotFoundException('Attempt not found');
    return attempt;
  }
}
