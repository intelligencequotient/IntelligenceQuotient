import { Injectable, Logger } from '@nestjs/common';
import { supabase } from '../../config/supabase.config';

/**
 * Spaced repetition (SM-2) + lightweight performance prediction.
 *
 * Both `spaced_repetition_state` and `predictions` were being READ by
 * AnalyticsService but nothing ever wrote them, so every student's "weak topics"
 * and risk flags were permanently empty. This service is invoked after each
 * graded attempt and fills them in.
 *
 * SM-2 reference: repetitions / ease factor / interval, with quality 0-5.
 */

const MIN_EASE = 1.3;
const DEFAULT_EASE = 2.5;

/** Below this accuracy (with enough evidence) a student is flagged at risk. */
const RISK_ACCURACY_THRESHOLD = 50;
const RISK_MIN_SAMPLE = 5;

interface GradedAnswer {
  question_id: string;
  is_correct: boolean | null;
  time_spent_seconds: number | null;
  subject: string;
  topic: string | null;
  marks: number;
}

@Injectable()
export class SpacedRepetitionService {
  private readonly logger = new Logger(SpacedRepetitionService.name);

  /**
   * Recomputes SRS state and predictions for one student after an attempt.
   * Never throws — analytics must not be able to fail a submission.
   */
  async processAttempt(attemptId: string, studentId: string): Promise<void> {
    try {
      const answers = await this.loadGradedAnswers(attemptId);
      if (!answers.length) return;

      await this.updateSrsState(studentId, answers);
      await this.recomputePredictions(studentId);
    } catch (e: any) {
      this.logger.error(`SRS update failed for attempt ${attemptId}: ${e?.message}`);
    }
  }

  private async loadGradedAnswers(attemptId: string): Promise<GradedAnswer[]> {
    const { data } = await supabase
      .from('answers')
      .select(
        'question_id, is_correct, time_spent_seconds, questions(subject, topic, marks)',
      )
      .eq('attempt_id', attemptId);

    return (data || []).map((a: any) => ({
      question_id: a.question_id,
      is_correct: a.is_correct,
      time_spent_seconds: a.time_spent_seconds,
      subject: a.questions?.subject || 'Unknown',
      topic: a.questions?.topic || null,
      marks: Number(a.questions?.marks) || 4,
    }));
  }

  /**
   * Maps an answer onto SM-2's 0-5 quality scale.
   * A correct answer that took a long time scores lower than a confident one.
   */
  private quality(answer: GradedAnswer): number {
    if (answer.is_correct === null) return 1; // Skipped entirely — weakest signal.
    if (!answer.is_correct) return 2;

    const seconds = Number(answer.time_spent_seconds) || 0;
    if (seconds > 0 && seconds <= 45) return 5;
    if (seconds > 0 && seconds <= 120) return 4;
    return 3;
  }

  private async updateSrsState(studentId: string, answers: GradedAnswer[]) {
    const questionIds = answers.map((a) => a.question_id);

    const { data: existingRows } = await supabase
      .from('spaced_repetition_state')
      .select('question_id, repetitions, ease_factor, interval_days, mastery_level')
      .eq('student_id', studentId)
      .in('question_id', questionIds);

    const existing = new Map((existingRows || []).map((r: any) => [r.question_id, r]));

    const now = Date.now();
    const rows = answers.map((answer) => {
      const prev = existing.get(answer.question_id);
      const q = this.quality(answer);

      let repetitions = Number(prev?.repetitions) || 0;
      let ease = Number(prev?.ease_factor) || DEFAULT_EASE;
      let intervalDays = Number(prev?.interval_days) || 0;

      if (q < 3) {
        // Lapse: back to the start of the ladder.
        repetitions = 0;
        intervalDays = 1;
      } else {
        repetitions += 1;
        if (repetitions === 1) intervalDays = 1;
        else if (repetitions === 2) intervalDays = 6;
        else intervalDays = Math.round(intervalDays * ease) || 1;
      }

      // Standard SM-2 ease adjustment, floored so a hard item never goes negative.
      ease = Math.max(MIN_EASE, ease + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)));

      // Mastery is an exponential moving average of the normalised quality.
      const prevMastery = Number(prev?.mastery_level) || 0;
      const observed = q / 5;
      const mastery = Number((prevMastery * 0.7 + observed * 0.3).toFixed(3));

      const dueAt = new Date(now + intervalDays * 24 * 60 * 60 * 1000);

      // Higher weight = show me sooner. Weak items with short intervals float up.
      const priority = Number(((1 - mastery) * 10 + 1 / (intervalDays || 1)).toFixed(3));

      return {
        student_id: studentId,
        question_id: answer.question_id,
        repetitions,
        ease_factor: Number(ease.toFixed(2)),
        interval_days: intervalDays,
        due_at: dueAt.toISOString(),
        mastery_level: mastery,
        priority_weight: priority,
        last_reviewed_at: new Date(now).toISOString(),
        updated_at: new Date(now).toISOString(),
      };
    });

    const { error } = await supabase
      .from('spaced_repetition_state')
      .upsert(rows, { onConflict: 'student_id,question_id' });

    if (error) throw new Error(`SRS upsert failed: ${error.message}`);
  }

  /**
   * Rebuilds per-subject and per-topic predictions from the student's full
   * answer history. Cheap enough to redo on each submit and always consistent.
   */
  async recomputePredictions(studentId: string): Promise<void> {
    const { data: attempts } = await supabase
      .from('attempts')
      .select('id')
      .eq('student_id', studentId)
      .eq('status', 'submitted');

    const attemptIds = (attempts || []).map((a: any) => a.id);
    if (!attemptIds.length) return;

    const { data: answers } = await supabase
      .from('answers')
      .select('is_correct, questions(subject, topic, marks)')
      .in('attempt_id', attemptIds);

    if (!answers?.length) return;

    // key -> stats, for both "subject" and "subject::topic" granularity.
    const buckets = new Map<
      string,
      { subject: string; topic: string | null; correct: number; total: number; marks: number }
    >();

    const bump = (subject: string, topic: string | null, correct: boolean, marks: number) => {
      const key = `${subject}::${topic ?? ''}`;
      if (!buckets.has(key)) {
        buckets.set(key, { subject, topic, correct: 0, total: 0, marks: 0 });
      }
      const b = buckets.get(key)!;
      b.total += 1;
      b.marks += marks;
      if (correct) b.correct += 1;
    };

    for (const a of answers as any[]) {
      const subject = a.questions?.subject || 'Unknown';
      const topic = a.questions?.topic || null;
      const marks = Number(a.questions?.marks) || 4;
      const correct = a.is_correct === true;

      bump(subject, null, correct, marks); // subject-level roll-up
      if (topic) bump(subject, topic, correct, marks);
    }

    const rows = Array.from(buckets.values()).map((b) => {
      const accuracy = b.total > 0 ? (b.correct / b.total) * 100 : 0;
      return {
        student_id: studentId,
        subject: b.subject,
        topic: b.topic,
        // Expected marks if the student sat this bucket again at current accuracy.
        predicted_score: Number(((accuracy / 100) * b.marks).toFixed(2)),
        accuracy: Number(accuracy.toFixed(2)),
        sample_size: b.total,
        risk_flag: b.total >= RISK_MIN_SAMPLE && accuracy < RISK_ACCURACY_THRESHOLD,
        computed_at: new Date().toISOString(),
      };
    });

    const { error } = await supabase
      .from('predictions')
      .upsert(rows, { onConflict: 'student_id,subject,topic' });

    if (error) throw new Error(`Predictions upsert failed: ${error.message}`);
  }

  /** Questions due for revision, weakest first — powers the "practice weak topics" flow. */
  async getDueQuestions(studentId: string, limit = 20) {
    const { data, error } = await supabase
      .from('spaced_repetition_state')
      .select(
        'question_id, due_at, mastery_level, priority_weight, questions(id, subject, topic, question_text, difficulty, image_url)',
      )
      .eq('student_id', studentId)
      .lte('due_at', new Date().toISOString())
      .order('priority_weight', { ascending: false })
      .limit(limit);

    if (error) throw new Error(error.message);
    return data || [];
  }
}
