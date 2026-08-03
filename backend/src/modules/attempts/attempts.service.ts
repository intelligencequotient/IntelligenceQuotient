import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { supabase } from '../../config/supabase.config';
import { SpacedRepetitionService } from '../analytics/spaced-repetition.service';
import { CacheService } from '../../common/cache/cache.service';

/** Clock skew allowance so a student whose machine is a few seconds fast is not punished. */
const CLOCK_GRACE_SECONDS = 30;

/** Three strikes and the attempt is finalised. Mirrors the exam UI's warning counter. */
const VIOLATION_LIMIT = 3;

/** Palette states the exam UI tracks per question. Anything else is rejected. */
const ANSWER_STATUSES = [
  'not_visited',
  'not_answered',
  'answered',
  'marked',
  'answered_marked',
] as const;

interface AttemptWindow {
  attemptId: string;
  testId: string;
  status: string;
  startedAt: Date;
  expiresAt: Date;
  durationMinutes: number;
}

/** Marking scheme resolved from the test row (columns are optional — see the migration). */
interface MarkingScheme {
  negativeMarking: boolean;
  negativeMarks: number;
}

@Injectable()
export class AttemptsService {
  private readonly logger = new Logger(AttemptsService.name);

  /**
   * Whether migration 005 has been applied. Probed lazily on first use and then
   * remembered, so a database that is a migration behind degrades instead of
   * failing every answer save with a 500.
   */
  private hasAnswerStatus: boolean | null = null;
  private hasViolationsTable: boolean | null = null;

  constructor(
    private readonly srsService: SpacedRepetitionService,
    private readonly cache: CacheService,
  ) {}

  // ── Helpers ─────────────────────────────────────────────────────────────────

  /** True when PostgREST is telling us the column or table simply is not there. */
  private isMissingSchema(error: any): boolean {
    if (!error) return false;
    const code = String(error.code || '');
    if (code === 'PGRST204' || code === 'PGRST205' || code === '42703' || code === '42P01') {
      return true;
    }
    return /does not exist|schema cache/i.test(String(error.message || ''));
  }

  private warnMigrationMissing(what: string) {
    this.logger.warn(
      `${what} is missing — run backend/migrations/005_exam_session_sync.sql. ` +
        'Running degraded until then.',
    );
  }

  /**
   * Loads an attempt together with the deadline derived from the test duration.
   * The deadline is always computed server-side from `started_at` — the client
   * never gets to say how much time is left.
   */
  private async loadWindow(attemptId: string, studentId: string): Promise<AttemptWindow> {
    const { data: attempt } = await supabase
      .from('attempts')
      .select('id, test_id, status, started_at')
      .eq('id', attemptId)
      .eq('student_id', studentId)
      .single();

    if (!attempt) throw new NotFoundException('Attempt not found');

    const { data: test } = await supabase
      .from('tests')
      .select('duration_minutes')
      .eq('id', attempt.test_id)
      .single();

    const durationMinutes = test?.duration_minutes || 60;
    const startedAt = new Date(attempt.started_at || Date.now());
    const expiresAt = new Date(startedAt.getTime() + durationMinutes * 60 * 1000);

    return {
      attemptId: attempt.id,
      testId: attempt.test_id,
      status: attempt.status,
      startedAt,
      expiresAt,
      durationMinutes,
    };
  }

  /** True once the server-side deadline has passed (with a small grace period). */
  private isExpired(window: AttemptWindow): boolean {
    return Date.now() > window.expiresAt.getTime() + CLOCK_GRACE_SECONDS * 1000;
  }

  /** Reads the marking scheme defensively — the columns may not exist on older schemas. */
  private async getMarkingScheme(testId: string): Promise<MarkingScheme> {
    const { data } = await supabase.from('tests').select('*').eq('id', testId).single();

    const row: any = data || {};
    return {
      negativeMarking: row.negative_marking === true,
      negativeMarks: Number(row.negative_marks) || 0,
    };
  }

  /**
   * The effective scheduled window for a student on a test.
   *
   * Returns null when the student has no assignment at all. When several rows
   * exist (one per batch), the windows are merged: the exam opens at the
   * earliest start any batch was given and closes at the latest end. A missing
   * bound means "unbounded" and wins over any explicit one.
   */
  private async resolveAssignmentWindow(
    testId: string,
    studentId: string,
  ): Promise<{ scheduled_start: string | null; scheduled_end: string | null } | null> {
    const { data: rows, error } = await supabase
      .from('test_assignments')
      .select('id, scheduled_start, scheduled_end')
      .eq('test_id', testId)
      .eq('student_id', studentId);

    if (error) throw new Error(error.message);
    if (!rows?.length) return null;

    let start: number | null = null;
    let end: number | null = null;
    let unboundedStart = false;
    let unboundedEnd = false;

    for (const row of rows) {
      if (!row.scheduled_start) unboundedStart = true;
      else {
        const t = new Date(row.scheduled_start).getTime();
        start = start === null ? t : Math.min(start, t);
      }

      if (!row.scheduled_end) unboundedEnd = true;
      else {
        const t = new Date(row.scheduled_end).getTime();
        end = end === null ? t : Math.max(end, t);
      }
    }

    return {
      scheduled_start: unboundedStart || start === null ? null : new Date(start).toISOString(),
      scheduled_end: unboundedEnd || end === null ? null : new Date(end).toISOString(),
    };
  }

  /** Rejects writes to an attempt that is finished or past its deadline. */
  private assertWritable(window: AttemptWindow) {
    if (window.status === 'submitted') {
      throw new BadRequestException('Test already submitted');
    }
    if (this.isExpired(window)) {
      throw new ForbiddenException(
        'Time is up for this attempt. Your answers can no longer be changed.',
      );
    }
  }

  // ── Lifecycle ───────────────────────────────────────────────────────────────

  /**
   * START: Student begins an exam.
   * Enforces the scheduled window, then creates or resumes the attempt.
   */
  async startAttempt(testId: string, studentId: string) {
    // A student can sit in more than one batch, and both batches may have been
    // assigned the same test — which means more than one assignment row. Read
    // them all and merge into the widest window rather than using `.single()`,
    // which errors on the second row and reads as "not assigned".
    const assignment = await this.resolveAssignmentWindow(testId, studentId);

    if (!assignment) {
      throw new ForbiddenException('You are not assigned to this test');
    }

    // The scheduled window is authoritative — a student cannot start early or late.
    const now = Date.now();
    if (assignment.scheduled_start) {
      const opensAt = new Date(assignment.scheduled_start).getTime();
      if (now < opensAt - CLOCK_GRACE_SECONDS * 1000) {
        throw new ForbiddenException(
          `This test opens at ${new Date(assignment.scheduled_start).toLocaleString()}.`,
        );
      }
    }
    if (assignment.scheduled_end) {
      const closesAt = new Date(assignment.scheduled_end).getTime();
      if (now > closesAt + CLOCK_GRACE_SECONDS * 1000) {
        throw new ForbiddenException('The window for this test has closed.');
      }
    }

    // Check if already attempted. `maybeSingle` — a first-time student has no
    // row at all, and that is not an error.
    const { data: existing } = await supabase
      .from('attempts')
      .select('id, status, started_at')
      .eq('test_id', testId)
      .eq('student_id', studentId)
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    // If already submitted, reject
    if (existing?.status === 'submitted') {
      throw new BadRequestException('You have already submitted this test');
    }

    const { data: test } = await supabase
      .from('tests')
      .select('duration_minutes')
      .eq('id', testId)
      .single();

    if (!test) throw new NotFoundException('Test not found');

    // If in progress, resume it — and hand back everything needed to rehydrate the UI.
    if (existing?.status === 'in_progress') {
      const startedAt = new Date(existing.started_at || Date.now());
      const expiresAt = new Date(startedAt.getTime() + (test.duration_minutes || 60) * 60 * 1000);

      // The deadline may have passed while the student was away — finalise instead of resuming.
      if (Date.now() > expiresAt.getTime() + CLOCK_GRACE_SECONDS * 1000) {
        await this.submitAttempt(existing.id, studentId, true);
        throw new BadRequestException(
          'Your time for this test had already expired. The attempt was submitted automatically.',
        );
      }

      return {
        attemptId: existing.id,
        testId,
        resumed: true,
        startedAt: startedAt.toISOString(),
        expiresAt: expiresAt.toISOString(),
        timeLeftSeconds: Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000)),
        savedAnswers: await this.getSavedAnswers(existing.id),
      };
    }

    // Create new attempt
    const startedAt = new Date();
    const expiresAt = new Date(startedAt.getTime() + test.duration_minutes * 60 * 1000);

    const { data: attempt, error } = await supabase
      .from('attempts')
      .insert({
        test_id: testId,
        student_id: studentId,
        status: 'in_progress',
        started_at: startedAt.toISOString(),
      })
      .select()
      .single();

    if (error) throw new Error(error.message);

    return {
      attemptId: attempt.id,
      testId,
      resumed: false,
      startedAt: startedAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
      timeLeftSeconds: test.duration_minutes * 60,
      savedAnswers: [],
    };
  }

  /** Answers already saved for an attempt, so a resumed exam can restore its state. */
  async getSavedAnswers(attemptId: string) {
    const columns = 'question_id, selected_answer, flagged_for_doubt, time_spent_seconds';

    if (this.hasAnswerStatus !== false) {
      const { data, error } = await supabase
        .from('answers')
        .select(`${columns}, status`)
        .eq('attempt_id', attemptId);

      if (!error) {
        this.hasAnswerStatus = true;
        return data || [];
      }
      if (!this.isMissingSchema(error)) return [];

      this.hasAnswerStatus = false;
      this.warnMigrationMissing('answers.status');
    }

    // Migration 005 not applied: resume the answers, just not the palette state.
    const { data } = await supabase.from('answers').select(columns).eq('attempt_id', attemptId);
    return data || [];
  }

  /**
   * SAVE ANSWER: Upsert one question's answer during the exam.
   * Refused once the server-side deadline has passed.
   */
  async saveAnswer(
    attemptId: string,
    studentId: string,
    body: {
      question_id: string;
      selected_answer: any;
      status?: string;
      time_spent_seconds: number;
    },
  ) {
    const window = await this.loadWindow(attemptId, studentId);
    this.assertWritable(window);

    // The palette state travels with the answer. Without it, a resumed exam
    // showed every question as "not visited" even though the answers survived.
    const status = ANSWER_STATUSES.includes(body.status as any)
      ? body.status
      : body.selected_answer
        ? 'answered'
        : 'not_answered';

    const row: Record<string, any> = {
      attempt_id: attemptId,
      question_id: body.question_id,
      selected_answer: body.selected_answer,
      time_spent_seconds: Math.max(0, Number(body.time_spent_seconds) || 0),
    };
    if (this.hasAnswerStatus !== false) row.status = status;

    const { error } = await supabase
      .from('answers')
      .upsert(row, { onConflict: 'attempt_id,question_id' });

    if (error) {
      // The palette column is a nice-to-have; losing the answer itself is not.
      // On a database that has not run migration 005 yet, save it without.
      if (this.hasAnswerStatus === null && this.isMissingSchema(error)) {
        this.hasAnswerStatus = false;
        this.warnMigrationMissing('answers.status');
        return this.saveAnswer(attemptId, studentId, body);
      }
      throw new Error(error.message);
    }

    if (this.hasAnswerStatus === null) this.hasAnswerStatus = true;
    return { saved: true, status };
  }

  /**
   * PROCTORING: record one rule violation against the attempt.
   *
   * The strike count is held server-side — a student who reloads the tab does
   * not get a fresh set of lives. On the third strike the attempt is graded and
   * closed immediately, recorded as an auto-submission.
   */
  async logViolation(
    attemptId: string,
    studentId: string,
    body: { type?: string; detail?: string },
  ) {
    const { data: attempt } = await supabase
      .from('attempts')
      .select('id, test_id, status, started_at, student_id')
      .eq('id', attemptId)
      .eq('student_id', studentId)
      .single();

    if (!attempt) throw new NotFoundException('Attempt not found');

    // A violation after submission is noise, not a strike.
    if (attempt.status === 'submitted') {
      return { terminated: true, strikes: VIOLATION_LIMIT, limit: VIOLATION_LIMIT };
    }

    const { error } = await supabase.from('attempt_violations').insert({
      attempt_id: attemptId,
      student_id: studentId,
      type: (body?.type || 'unknown').slice(0, 64),
      detail: body?.detail ? String(body.detail).slice(0, 500) : null,
    });

    if (error) {
      // Without migration 005 there is nowhere to record strikes. Fall back to
      // the client's own counter rather than 500-ing mid-exam.
      if (this.isMissingSchema(error)) {
        if (this.hasViolationsTable === null) {
          this.hasViolationsTable = false;
          this.warnMigrationMissing('attempt_violations');
        }
        return { terminated: false, strikes: 0, limit: VIOLATION_LIMIT, degraded: true };
      }
      throw new Error(error.message);
    }

    this.hasViolationsTable = true;

    const { count } = await supabase
      .from('attempt_violations')
      .select('*', { count: 'exact', head: true })
      .eq('attempt_id', attemptId);

    const strikes = count ?? 0;
    const terminated = strikes >= VIOLATION_LIMIT;

    if (terminated) {
      this.logger.warn(`Attempt ${attemptId} terminated after ${strikes} violations.`);
      // Grade what they have rather than leaving the attempt dangling open.
      await this.gradeAndFinalise(attempt as any, true).catch((e) =>
        this.logger.error(`Failed to finalise terminated attempt ${attemptId}: ${e?.message}`),
      );
    }

    return { terminated, strikes, limit: VIOLATION_LIMIT };
  }

  /**
   * TOGGLE FLAG: Mark/unmark a question for doubt review.
   * Ownership is verified — a student can only flag their own attempt.
   */
  async toggleFlag(attemptId: string, studentId: string, questionId: string, flagged: boolean) {
    const window = await this.loadWindow(attemptId, studentId);
    this.assertWritable(window);

    // Upsert rather than update: a student may flag a question before answering it.
    const { error } = await supabase.from('answers').upsert(
      {
        attempt_id: attemptId,
        question_id: questionId,
        flagged_for_doubt: flagged,
      },
      { onConflict: 'attempt_id,question_id' },
    );

    if (error) throw new Error(error.message);
    return { flagged };
  }

  /**
   * SUBMIT: Grade the exam and finalize the attempt.
   * The score is calculated entirely on the backend from the stored answer key.
   */
  async submitAttempt(attemptId: string, studentId: string, autoSubmitted = false) {
    const { data: attempt } = await supabase
      .from('attempts')
      .select('id, test_id, status, started_at, student_id')
      .eq('id', attemptId)
      .eq('student_id', studentId)
      .single();

    if (!attempt) throw new NotFoundException('Attempt not found');
    if (attempt.status === 'submitted') throw new BadRequestException('Already submitted');

    return this.gradeAndFinalise(attempt, autoSubmitted);
  }

  /**
   * Shared grading path used by both an explicit submit and the expiry sweeper.
   * `attempt` must already be known to exist and be in progress.
   */
  private async gradeAndFinalise(
    attempt: { id: string; test_id: string; started_at: string; student_id: string },
    autoSubmitted: boolean,
  ) {
    const attemptId = attempt.id;

    const { data: test } = await supabase
      .from('tests')
      .select('duration_minutes')
      .eq('id', attempt.test_id)
      .single();

    const durationMinutes = test?.duration_minutes || 60;
    const startedAt = new Date(attempt.started_at || Date.now());
    const expiresAt = new Date(startedAt.getTime() + durationMinutes * 60 * 1000);

    // A submit that arrives after the deadline is recorded as an auto-submission.
    const lateSubmit = Date.now() > expiresAt.getTime() + CLOCK_GRACE_SECONDS * 1000;
    const effectiveAutoSubmit = autoSubmitted || lateSubmit;

    const scheme = await this.getMarkingScheme(attempt.test_id);

    // Questions in the test WITH their correct answers
    const { data: testQuestions } = await supabase
      .from('test_questions')
      .select('question_id, marks_override, questions(correct_answer, marks)')
      .eq('test_id', attempt.test_id);

    // Student's answers for this attempt
    const { data: studentAnswers } = await supabase
      .from('answers')
      .select('question_id, selected_answer')
      .eq('attempt_id', attemptId);

    const answerMap = new Map(
      (studentAnswers || []).map((a) => [a.question_id, a.selected_answer]),
    );

    let totalScore = 0;
    const answerUpdates: { attempt_id: string; question_id: string; is_correct: boolean | null }[] =
      [];

    for (const tq of testQuestions || []) {
      const questionId = tq.question_id;
      const correctAnswer = (tq.questions as any)?.correct_answer;
      const marks = Number(tq.marks_override || (tq.questions as any)?.marks || 4);
      const studentAnswer = answerMap.get(questionId);

      const attempted = studentAnswer !== undefined && studentAnswer !== null;
      const isCorrect = attempted && this.answersMatch(studentAnswer, correctAnswer);

      if (isCorrect) {
        totalScore += marks;
      } else if (attempted && scheme.negativeMarking) {
        totalScore -= scheme.negativeMarks;
      }

      answerUpdates.push({
        attempt_id: attemptId,
        question_id: questionId,
        is_correct: attempted ? isCorrect : null,
      });
    }

    for (const upd of answerUpdates) {
      await supabase
        .from('answers')
        .update({ is_correct: upd.is_correct })
        .eq('attempt_id', upd.attempt_id)
        .eq('question_id', upd.question_id);
    }

    const submittedAt = new Date();
    // Never report more time than the exam actually allowed.
    const rawSeconds = Math.floor((submittedAt.getTime() - startedAt.getTime()) / 1000);
    const timeTakenSeconds = Math.min(rawSeconds, durationMinutes * 60);

    const { error } = await supabase
      .from('attempts')
      .update({
        status: 'submitted',
        total_score: totalScore,
        submitted_at: submittedAt.toISOString(),
        auto_submitted: effectiveAutoSubmit,
      })
      .eq('id', attemptId)
      .select()
      .single();

    if (error) throw new Error(error.message);

    // Feed the graded answers into spaced repetition + predictions.
    // Awaited so the result page reflects fresh state, but it can never fail a submit.
    await this.srsService.processAttempt(attemptId, attempt.student_id);

    // A new score changes the rankings — drop the cached leaderboard.
    await this.cache.invalidate('leaderboard:').catch(() => undefined);

    const correct = answerUpdates.filter((a) => a.is_correct === true).length;
    const incorrect = answerUpdates.filter((a) => a.is_correct === false).length;
    const unattempted = answerUpdates.filter((a) => a.is_correct === null).length;
    const total = testQuestions?.length || 1;
    const maxScore = (testQuestions || []).reduce(
      (sum, tq) => sum + Number(tq.marks_override || (tq.questions as any)?.marks || 4),
      0,
    );

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
      autoSubmitted: effectiveAutoSubmit,
      negativeMarking: scheme.negativeMarking,
      negativeMarks: scheme.negativeMarks,
    };
  }

  /**
   * Compares a submitted answer against the stored key.
   * Handles `{ index }`, `{ value }` and multi-select `{ indices: [...] }` shapes.
   */
  private answersMatch(submitted: any, correct: any): boolean {
    if (submitted == null || correct == null) return false;

    // Multi-select: order-insensitive comparison.
    const subIdx = submitted?.indices;
    const corIdx = correct?.indices;
    if (Array.isArray(subIdx) || Array.isArray(corIdx)) {
      const a = [...(subIdx || [])].sort();
      const b = [...(corIdx || [])].sort();
      return a.length === b.length && a.every((v, i) => v === b[i]);
    }

    // Numerical / free-text: compare case-insensitively, trimmed.
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

  /**
   * Finalises every in-progress attempt whose deadline has passed.
   * Called by the sweeper so a student who closes the tab still gets graded.
   * Returns the number of attempts submitted.
   */
  async autoSubmitExpiredAttempts(): Promise<number> {
    const { data: open } = await supabase
      .from('attempts')
      .select('id, test_id, started_at, student_id, tests(duration_minutes)')
      .eq('status', 'in_progress');

    if (!open?.length) return 0;

    let submitted = 0;
    for (const attempt of open) {
      const durationMinutes = (attempt.tests as any)?.duration_minutes || 60;
      const startedAt = new Date(attempt.started_at || Date.now()).getTime();
      const expiresAt = startedAt + durationMinutes * 60 * 1000;

      if (Date.now() <= expiresAt + CLOCK_GRACE_SECONDS * 1000) continue;

      try {
        await this.gradeAndFinalise(
          {
            id: attempt.id,
            test_id: attempt.test_id,
            started_at: attempt.started_at,
            student_id: attempt.student_id,
          },
          true,
        );
        submitted += 1;
      } catch (e: any) {
        this.logger.error(`Failed to auto-submit attempt ${attempt.id}: ${e?.message}`);
      }
    }

    if (submitted > 0) {
      this.logger.log(`Auto-submitted ${submitted} expired attempt(s).`);
    }
    return submitted;
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
          questions(id, question_text, options, correct_answer, subject, topic, difficulty, marks)
        )
      `)
      .eq('id', attemptId)
      .eq('student_id', studentId)
      .single();

    if (error || !attempt) throw new NotFoundException('Attempt not found');

    // Only reveal the answer key once the attempt is finished.
    if (attempt.status !== 'submitted') {
      for (const ans of (attempt as any).answers || []) {
        if (ans.questions) delete ans.questions.correct_answer;
      }
      return { ...attempt, cohort: null };
    }

    return { ...attempt, cohort: await this.getCohortPosition(attempt) };
  }

  /**
   * Where this attempt sits among everyone who sat the same test.
   * Replaces the hardcoded rank/percentile the result page used to display.
   */
  private async getCohortPosition(attempt: any) {
    const score = Number(attempt.total_score) || 0;

    const { data: peers } = await supabase
      .from('attempts')
      .select('total_score')
      .eq('test_id', (attempt.tests as any)?.id)
      .eq('status', 'submitted');

    const scores = (peers || []).map((p: any) => Number(p.total_score) || 0);
    if (!scores.length) return null;

    // Standard competition ranking: everyone strictly above you, plus one.
    const above = scores.filter((s) => s > score).length;
    const below = scores.filter((s) => s < score).length;

    return {
      rank: above + 1,
      totalStudents: scores.length,
      // Percentage of the cohort scoring at or below this attempt.
      percentile: Math.round((below / scores.length) * 100),
      average: Number((scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(2)),
      highest: Math.max(...scores),
    };
  }
}
