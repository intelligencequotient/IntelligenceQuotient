import { Injectable } from '@nestjs/common';
import { supabase } from '../../config/supabase.config';
import { fetchAll, fetchAllIn } from '../../common/db/query.util';
import { CacheService } from '../../common/cache/cache.service';

/** Cohort figures move slowly and are read from every teacher dashboard load. */
const COHORT_TTL_SECONDS = Number(process.env.COHORT_TTL_SECONDS) || 120;
const COHORT_CACHE_PREFIX = 'analytics:cohort:';

@Injectable()
export class AnalyticsService {
  constructor(private readonly cache: CacheService) {}

  /** Student's own analytics — for AnalyticsHub page */
  async getStudentAnalytics(studentId: string) {
    // Fetch all submitted attempts
    const attempts = await fetchAll<any>(() =>
      supabase
        .from('attempts')
        .select('id, total_score, started_at, submitted_at, tests(title, total_marks)')
        .eq('student_id', studentId)
        .eq('status', 'submitted')
        .order('submitted_at', { ascending: true }),
    );

    const attemptIds = attempts.map((a) => a.id);

    // Per-question accuracy.
    // NOTE: this previously filtered with .eq('attempts.student_id', …), which
    // PostgREST rejects because `attempts` is not embedded in the select — the
    // error was swallowed and every breakdown came back empty. Filter by the
    // student's own attempt ids instead, chunked and paged: a year of testing is
    // easily more than the 1000 answer rows a single response will return.
    const answers = await fetchAllIn<any>(attemptIds, (idChunk) =>
      supabase
        .from('answers')
        .select('is_correct, time_spent_seconds, questions(subject, topic, difficulty)')
        .in('attempt_id', idChunk),
    );

    // Build subject + topic breakdowns
    const subjectMap: Record<string, { correct: number; total: number }> = {};
    const topicMap: Record<string, { subject: string; correct: number; total: number }> = {};
    let totalTimeSeconds = 0;
    let timedAnswers = 0;

    for (const ans of answers) {
      const q = ans.questions;
      const subject = q?.subject || 'Unknown';
      const topic = q?.topic;

      if (!subjectMap[subject]) subjectMap[subject] = { correct: 0, total: 0 };
      subjectMap[subject].total += 1;
      if (ans.is_correct) subjectMap[subject].correct += 1;

      if (topic) {
        const key = `${subject}::${topic}`;
        if (!topicMap[key]) topicMap[key] = { subject, correct: 0, total: 0 };
        topicMap[key].total += 1;
        if (ans.is_correct) topicMap[key].correct += 1;
      }

      const secs = Number(ans.time_spent_seconds) || 0;
      if (secs > 0) {
        totalTimeSeconds += secs;
        timedAnswers += 1;
      }
    }

    const subjectBreakdown = Object.entries(subjectMap).map(([subject, stats]) => ({
      subject,
      accuracy: stats.total > 0 ? Math.round((stats.correct / stats.total) * 100) : 0,
      totalAnswered: stats.total,
    }));

    const topicBreakdown = Object.entries(topicMap)
      .map(([key, stats]) => ({
        topic: key.split('::')[1],
        subject: stats.subject,
        accuracy: stats.total > 0 ? Math.round((stats.correct / stats.total) * 100) : 0,
        totalAnswered: stats.total,
      }))
      .sort((a, b) => a.accuracy - b.accuracy);

    const totalAnswered = Object.values(subjectMap).reduce((s, v) => s + v.total, 0);
    const totalCorrect = Object.values(subjectMap).reduce((s, v) => s + v.correct, 0);

    // Score history for chart
    const scoreHistory = attempts.map((a) => ({
      title: a.tests?.title,
      score: a.total_score,
      maxScore: a.tests?.total_marks,
      date: a.submitted_at,
    }));

    // Spaced repetition state
    const { data: srState } = await supabase
      .from('spaced_repetition_state')
      .select('priority_weight, mastery_level, questions(subject, topic, question_text)')
      .eq('student_id', studentId)
      .order('priority_weight', { ascending: false })
      .limit(10);

    // AI predictions
    const { data: predictions } = await supabase
      .from('predictions')
      .select('subject, topic, predicted_score, risk_flag, computed_at')
      .eq('student_id', studentId)
      .order('computed_at', { ascending: false })
      .limit(100);

    return {
      testsAttempted: attempts.length,
      totalScore: attempts.reduce((s, a: any) => s + (Number(a.total_score) || 0), 0),
      avgAccuracy: totalAnswered > 0 ? Math.round((totalCorrect / totalAnswered) * 100) : 0,
      avgSecondsPerQuestion: timedAnswers > 0 ? Math.round(totalTimeSeconds / timedAnswers) : 0,
      subjectBreakdown,
      topicBreakdown,
      // Weakest five topics with enough evidence to be meaningful.
      weakTopics: topicBreakdown.filter((t) => t.totalAnswered >= 3).slice(0, 5),
      scoreHistory,
      spacedRepetition: srState || [],
      predictions: predictions || [],
    };
  }

  /**
   * Cohort analytics — for CohortAnalytics page (teacher view).
   *
   * Cached: every teacher hitting their dashboard used to scan the whole
   * attempts table, and the id lists involved (one per student in the institute)
   * were long enough to overflow the request URL outright at cohort scale.
   */
  async getCohortAnalytics(batchId?: string) {
    return this.cache.wrap(
      `${COHORT_CACHE_PREFIX}${batchId || 'all'}`,
      COHORT_TTL_SECONDS,
      () => this.computeCohortAnalytics(batchId),
    );
  }

  private async computeCohortAnalytics(batchId?: string) {
    let studentIds: string[];

    if (batchId) {
      const members = await fetchAll<{ student_id: string }>(() =>
        supabase.from('batch_students').select('student_id').eq('batch_id', batchId),
      );
      const memberIds = [...new Set(members.map((m) => m.student_id))];
      if (!memberIds.length) {
        return { totalStudents: 0, avgScore: 0, atRiskCount: 0, totalAttempts: 0 };
      }

      // Confirm they are still student accounts, chunked so the URL stays sane.
      const students = await fetchAllIn<{ id: string }>(memberIds, (idChunk) =>
        supabase.from('users').select('id').eq('role', 'student').in('id', idChunk),
      );
      studentIds = students.map((s) => s.id);
    } else {
      const students = await fetchAll<{ id: string }>(() =>
        supabase.from('users').select('id').eq('role', 'student'),
      );
      studentIds = students.map((s) => s.id);
    }

    if (!studentIds.length) {
      return { totalStudents: 0, avgScore: 0, atRiskCount: 0, totalAttempts: 0 };
    }

    const attempts = await fetchAllIn<any>(studentIds, (idChunk) =>
      supabase
        .from('attempts')
        .select('student_id, total_score, tests(total_marks)')
        .in('student_id', idChunk)
        .eq('status', 'submitted'),
    );

    const avgScore = attempts.length
      ? Math.round(
          attempts.reduce((sum, a) => sum + (Number(a.total_score) || 0), 0) / attempts.length,
        )
      : 0;

    const riskStudents = await fetchAllIn<{ student_id: string }>(studentIds, (idChunk) =>
      supabase
        .from('predictions')
        .select('student_id')
        .in('student_id', idChunk)
        .eq('risk_flag', true),
    );

    return {
      totalStudents: studentIds.length,
      avgScore,
      atRiskCount: new Set(riskStudents.map((r) => r.student_id)).size,
      totalAttempts: attempts.length,
    };
  }

  /** Specific student analytics — for StudentProfileDetail teacher view */
  async getStudentAnalyticsForTeacher(studentId: string) {
    return this.getStudentAnalytics(studentId);
  }

  /** Called after a submission so a fresh score is not masked by a stale cohort. */
  async invalidateCohortCache(): Promise<void> {
    await this.cache.invalidate(COHORT_CACHE_PREFIX);
  }
}
