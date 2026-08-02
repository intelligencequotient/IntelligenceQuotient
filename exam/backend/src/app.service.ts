import {
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { resolve } from 'path';

dotenv.config({ path: resolve(process.cwd(), '.env') });

/** Allowance for client clock skew, matching the main backend. */
const CLOCK_GRACE_SECONDS = 30;

/** Three strikes and the session is terminated. */
const VIOLATION_LIMIT = 3;

@Injectable()
export class AppService {
  private supabase: SupabaseClient;

  constructor() {
    const supabaseUrl = process.env.SUPABASE_URL?.trim();
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error(
        'FATAL: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in exam/backend/.env. ' +
        'The exam backend cannot start without valid Supabase credentials.'
      );
    }

    this.supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }

  // ── Ownership ──────────────────────────────────────────────────────────────

  /**
   * Loads a session and confirms it belongs to the caller.
   *
   * Every route goes through here. Without it, knowing a session UUID was enough
   * to read, answer or submit somebody else's exam.
   */
  private async loadOwnedSession(sessionId: string, studentId: string) {
    const { data: session, error } = await this.supabase
      .from('exam_sessions')
      .select('id, student_id, exam_id, started_at, ends_at, status, score')
      .eq('id', sessionId)
      .single();

    if (error || !session) throw new NotFoundException('Exam session not found');
    if (session.student_id !== studentId) {
      throw new ForbiddenException('This exam session does not belong to you.');
    }
    return session;
  }

  private isExpired(endsAt: string): boolean {
    return Date.now() > new Date(endsAt).getTime() + CLOCK_GRACE_SECONDS * 1000;
  }

  // ── Session lifecycle ──────────────────────────────────────────────────────

  async startSession(examId: string, studentId: string) {
    const { data: testData, error: testError } = await this.supabase
      .from('tests')
      .select('id, title, duration_minutes, total_marks, status, negative_marking, negative_marks')
      .eq('id', examId)
      .single();

    if (testError || !testData) throw new NotFoundException('Test not found');
    if (testData.status !== 'published') {
      throw new ForbiddenException('This test is not published.');
    }

    // The student must actually be assigned this test, within its window.
    const { data: assignment } = await this.supabase
      .from('test_assignments')
      .select('id, scheduled_start, scheduled_end')
      .eq('test_id', examId)
      .eq('student_id', studentId)
      .single();

    if (!assignment) throw new ForbiddenException('You are not assigned to this test.');

    const now = Date.now();
    if (assignment.scheduled_start &&
        now < new Date(assignment.scheduled_start).getTime() - CLOCK_GRACE_SECONDS * 1000) {
      throw new ForbiddenException('This test has not opened yet.');
    }
    if (assignment.scheduled_end &&
        now > new Date(assignment.scheduled_end).getTime() + CLOCK_GRACE_SECONDS * 1000) {
      throw new ForbiddenException('The window for this test has closed.');
    }

    const { data: existing } = await this.supabase
      .from('exam_sessions')
      .select('*')
      .eq('exam_id', examId)
      .eq('student_id', studentId)
      .maybeSingle();

    if (existing && existing.status !== 'in_progress') {
      throw new BadRequestException('You have already completed this exam.');
    }

    if (existing) {
      return {
        sessionId: existing.id,
        startedAt: existing.started_at,
        endsAt: existing.ends_at,
        resumed: true,
        testDetails: testData,
        savedResponses: await this.loadResponses(existing.id),
      };
    }

    const startedAt = new Date();
    const endsAt = new Date(startedAt.getTime() + (testData.duration_minutes || 60) * 60 * 1000);

    const { data: newSession, error: createError } = await this.supabase
      .from('exam_sessions')
      .insert({
        student_id: studentId,
        exam_id: examId,
        started_at: startedAt.toISOString(),
        ends_at: endsAt.toISOString(),
        status: 'in_progress',
      })
      .select()
      .single();

    if (createError) throw new InternalServerErrorException('Failed to create session');

    return {
      sessionId: newSession.id,
      startedAt: newSession.started_at,
      endsAt: newSession.ends_at,
      resumed: false,
      testDetails: testData,
      savedResponses: [],
    };
  }

  private async loadResponses(sessionId: string) {
    const { data } = await this.supabase
      .from('exam_responses')
      .select('question_id, selected_answer, status, time_spent_seconds')
      .eq('session_id', sessionId);
    return data || [];
  }

  /**
   * The real question paper — never includes `correct_answer`.
   * The shell previously rendered `jeeMainMockQuestions.slice(0, 3)` regardless
   * of which test was being sat.
   */
  async getQuestions(sessionId: string, studentId: string) {
    const session = await this.loadOwnedSession(sessionId, studentId);

    const { data, error } = await this.supabase
      .from('test_questions')
      .select(`
        question_order, marks_override,
        questions(id, subject, topic, question_text, options, difficulty, q_type, image_url, marks)
      `)
      .eq('test_id', session.exam_id)
      .order('question_order', { ascending: true });

    if (error) throw new InternalServerErrorException('Failed to load questions');

    return (data || []).map((row: any, idx: number) => ({
      id: row.questions?.id,
      order: row.question_order ?? idx + 1,
      subject: row.questions?.subject,
      topic: row.questions?.topic,
      question_text: row.questions?.question_text,
      options: row.questions?.options,
      image_url: row.questions?.image_url,
      difficulty: row.questions?.difficulty,
      type: row.questions?.q_type,
      marks: row.marks_override || row.questions?.marks || 4,
    }));
  }

  async heartbeat(sessionId: string, studentId: string) {
    const session = await this.loadOwnedSession(sessionId, studentId);

    const remainingSeconds = Math.max(
      0,
      Math.floor((new Date(session.ends_at).getTime() - Date.now()) / 1000),
    );

    if (remainingSeconds <= 0 && session.status === 'in_progress') {
      await this.submitSession(sessionId, studentId, true);
      return { remainingSeconds: 0, status: 'auto_submitted' };
    }

    return { remainingSeconds, status: session.status };
  }

  async saveResponse(sessionId: string, studentId: string, payload: any) {
    const session = await this.loadOwnedSession(sessionId, studentId);

    if (session.status !== 'in_progress') {
      throw new BadRequestException('This exam has already been submitted.');
    }
    // Answers cannot be changed once the clock has run out.
    if (this.isExpired(session.ends_at)) {
      throw new ForbiddenException('Time is up — your answers can no longer be changed.');
    }

    const { question_id, selected_answer, status, time_spent_seconds } = payload || {};
    if (!question_id) throw new BadRequestException('question_id is required');

    const { error } = await this.supabase
      .from('exam_responses')
      .upsert(
        {
          session_id: sessionId,
          question_id,
          selected_answer,
          status: status || 'answered',
          time_spent_seconds: Math.max(0, Number(time_spent_seconds) || 0),
          last_updated_at: new Date().toISOString(),
        },
        { onConflict: 'session_id,question_id' },
      );

    if (error) throw new InternalServerErrorException('Failed to save response');
    return { success: true };
  }

  async logViolation(sessionId: string, studentId: string, payload: any) {
    const session = await this.loadOwnedSession(sessionId, studentId);

    const { error } = await this.supabase.from('exam_violations').insert({
      session_id: sessionId,
      type: payload?.type,
      duration_ms: payload?.duration_ms,
    });

    if (error) throw new InternalServerErrorException('Failed to log violation');

    const { count } = await this.supabase
      .from('exam_violations')
      .select('*', { count: 'exact', head: true })
      .eq('session_id', sessionId);

    if (count !== null && count >= VIOLATION_LIMIT) {
      // Terminate, but still grade what was answered — the attempt happened.
      if (session.status === 'in_progress') {
        await this.gradeSession(sessionId, session.exam_id);
      }
      await this.supabase
        .from('exam_sessions')
        .update({ status: 'violation_terminated', submitted_at: new Date().toISOString() })
        .eq('id', sessionId);

      return { success: true, terminated: true, strikes: count };
    }

    return { success: true, terminated: false, strikes: count ?? 0 };
  }

  async submitSession(sessionId: string, studentId: string, autoSubmitted = false) {
    const session = await this.loadOwnedSession(sessionId, studentId);

    if (session.status !== 'in_progress') {
      // Idempotent: re-submitting returns the existing result rather than erroring.
      return { success: true, alreadySubmitted: true, score: session.score };
    }

    const result = await this.gradeSession(sessionId, session.exam_id);

    // A submit arriving after the deadline is recorded as an auto-submission.
    const late = this.isExpired(session.ends_at);

    const { error } = await this.supabase
      .from('exam_sessions')
      .update({
        status: autoSubmitted || late ? 'auto_submitted' : 'submitted',
        submitted_at: new Date().toISOString(),
        score: result.score,
      })
      .eq('id', sessionId);

    if (error) throw new InternalServerErrorException('Failed to submit exam');

    return { success: true, autoSubmitted: autoSubmitted || late, ...result };
  }

  /**
   * Grades a session against the stored answer key.
   *
   * `submitSession` previously only flipped a status column — the `score` field
   * in the schema was never written, so no exam taken here was ever marked.
   */
  private async gradeSession(sessionId: string, examId: string) {
    const { data: test } = await this.supabase
      .from('tests')
      .select('negative_marking, negative_marks')
      .eq('id', examId)
      .single();

    const negativeMarking = (test as any)?.negative_marking === true;
    const negativeMarks = Number((test as any)?.negative_marks) || 0;

    const { data: testQuestions } = await this.supabase
      .from('test_questions')
      .select('question_id, marks_override, questions(correct_answer, marks)')
      .eq('test_id', examId);

    const { data: responses } = await this.supabase
      .from('exam_responses')
      .select('question_id, selected_answer')
      .eq('session_id', sessionId);

    const responseMap = new Map(
      (responses || []).map((r: any) => [r.question_id, r.selected_answer]),
    );

    let score = 0;
    let correct = 0;
    let incorrect = 0;
    let unattempted = 0;
    let maxScore = 0;

    for (const tq of (testQuestions || []) as any[]) {
      const marks = Number(tq.marks_override || tq.questions?.marks || 4);
      maxScore += marks;

      const submitted = responseMap.get(tq.question_id);
      if (submitted === undefined || submitted === null) {
        unattempted += 1;
        continue;
      }

      if (this.answersMatch(submitted, tq.questions?.correct_answer)) {
        score += marks;
        correct += 1;
      } else {
        if (negativeMarking) score -= negativeMarks;
        incorrect += 1;
      }
    }

    const answered = correct + incorrect;
    return {
      score,
      maxScore,
      correct,
      incorrect,
      unattempted,
      accuracy: answered > 0 ? Math.round((correct / answered) * 100) : 0,
    };
  }

  /** Handles `{ index }`, `{ value }` and multi-select `{ indices: [...] }`. */
  private answersMatch(submitted: any, correct: any): boolean {
    if (submitted == null || correct == null) return false;

    const subIdx = submitted?.indices;
    const corIdx = correct?.indices;
    if (Array.isArray(subIdx) || Array.isArray(corIdx)) {
      const a = [...(subIdx || [])].sort();
      const b = [...(corIdx || [])].sort();
      return a.length === b.length && a.every((v, i) => v === b[i]);
    }

    if (correct?.value !== undefined && submitted?.value !== undefined) {
      const a = String(submitted.value).trim().toLowerCase();
      const b = String(correct.value).trim().toLowerCase();
      if (a === b) return true;
      const na = Number(a);
      const nb = Number(b);
      return Number.isFinite(na) && Number.isFinite(nb) && na === nb;
    }

    if (correct?.index !== undefined) {
      return Number(submitted?.index) === Number(correct.index);
    }

    return JSON.stringify(submitted) === JSON.stringify(correct);
  }

  /** Result summary, available once the session is finished. */
  async getResult(sessionId: string, studentId: string) {
    const session = await this.loadOwnedSession(sessionId, studentId);

    if (session.status === 'in_progress') {
      throw new BadRequestException('This exam has not been submitted yet.');
    }

    const { data: test } = await this.supabase
      .from('tests')
      .select('title, total_marks, duration_minutes')
      .eq('id', session.exam_id)
      .single();

    const { count: violations } = await this.supabase
      .from('exam_violations')
      .select('*', { count: 'exact', head: true })
      .eq('session_id', sessionId);

    // Regrade rather than trusting the stored value, so a result is always
    // consistent with the current answer key. `storedScore` is kept for audit.
    const graded = await this.gradeSession(sessionId, session.exam_id);

    return {
      sessionId,
      status: session.status,
      test,
      violations: violations ?? 0,
      storedScore: session.score,
      ...graded,
    };
  }
}
