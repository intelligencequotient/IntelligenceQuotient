import { Injectable } from '@nestjs/common';
import { supabase } from '../../config/supabase.config';

@Injectable()
export class AnalyticsService {
  /** Student's own analytics — for AnalyticsHub page */
  async getStudentAnalytics(studentId: string) {
    // Fetch all submitted attempts
    const { data: attempts } = await supabase
      .from('attempts')
      .select('id, total_score, started_at, submitted_at, tests(title, total_marks)')
      .eq('student_id', studentId)
      .eq('status', 'submitted')
      .order('submitted_at', { ascending: true });

    const attemptIds = (attempts || []).map((a: any) => a.id);

    // Per-question accuracy.
    // NOTE: this previously filtered with .eq('attempts.student_id', …), which
    // PostgREST rejects because `attempts` is not embedded in the select — the
    // error was swallowed and every breakdown came back empty. Filter by the
    // student's own attempt ids instead.
    const { data: answers, error: answersError } = attemptIds.length
      ? await supabase
          .from('answers')
          .select('is_correct, time_spent_seconds, questions(subject, topic, difficulty)')
          .in('attempt_id', attemptIds)
      : { data: [], error: null };

    if (answersError) throw new Error(answersError.message);

    // Build subject + topic breakdowns
    const subjectMap: Record<string, { correct: number; total: number }> = {};
    const topicMap: Record<string, { subject: string; correct: number; total: number }> = {};
    let totalTimeSeconds = 0;
    let timedAnswers = 0;

    for (const ans of answers || []) {
      const q = (ans as any).questions;
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

      const secs = Number((ans as any).time_spent_seconds) || 0;
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
    const scoreHistory = (attempts || []).map((a) => ({
      title: (a.tests as any)?.title,
      score: a.total_score,
      maxScore: (a.tests as any)?.total_marks,
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
      .order('computed_at', { ascending: false });

    return {
      testsAttempted: attempts?.length || 0,
      totalScore: (attempts || []).reduce((s, a: any) => s + (Number(a.total_score) || 0), 0),
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

  /** Cohort analytics — for CohortAnalytics page (teacher view) */
  async getCohortAnalytics(batchId?: string) {
    let studentQuery = supabase
      .from('users')
      .select('id')
      .eq('role', 'student');

    if (batchId) {
      const { data: bsIds } = await supabase
        .from('batch_students')
        .select('student_id')
        .eq('batch_id', batchId);
      const ids = (bsIds || []).map((b: any) => b.student_id);
      studentQuery = studentQuery.in('id', ids);
    }

    const { data: students } = await studentQuery;
    const studentIds = (students || []).map((s) => s.id);

    if (!studentIds.length) return { totalStudents: 0, avgScore: 0, subjectBreakdown: [] };

    // Get all submitted attempts for these students
    const { data: attempts } = await supabase
      .from('attempts')
      .select('student_id, total_score, tests(total_marks)')
      .in('student_id', studentIds)
      .eq('status', 'submitted');

    const avgScore =
      (attempts || []).length > 0
        ? Math.round(
            (attempts || []).reduce((sum, a) => sum + (Number(a.total_score) || 0), 0) /
              (attempts || []).length,
          )
        : 0;

    // At-risk count (students in predictions with risk_flag = true)
    const { data: riskStudents } = await supabase
      .from('predictions')
      .select('student_id')
      .in('student_id', studentIds)
      .eq('risk_flag', true);

    const atRiskCount = new Set((riskStudents || []).map((r: any) => r.student_id)).size;

    return {
      totalStudents: studentIds.length,
      avgScore,
      atRiskCount,
      totalAttempts: attempts?.length || 0,
    };
  }

  /** Specific student analytics — for StudentProfileDetail teacher view */
  async getStudentAnalyticsForTeacher(studentId: string) {
    return this.getStudentAnalytics(studentId);
  }
}
