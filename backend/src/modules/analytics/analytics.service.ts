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

    // Fetch per-question answer accuracy.
    // NOTE: `attempts!inner` must be part of the select — filtering on
    // `attempts.student_id` without embedding the relation is rejected by
    // PostgREST and silently returned an empty breakdown.
    const { data: answers } = await supabase
      .from('answers')
      .select('is_correct, attempts!inner(student_id), questions(subject, topic, difficulty)')
      .eq('attempts.student_id', studentId);

    // Build subject breakdown
    const subjectMap: Record<string, { correct: number; total: number }> = {};
    for (const ans of answers || []) {
      const subject = (ans.questions as any)?.subject || 'Unknown';
      if (!subjectMap[subject]) subjectMap[subject] = { correct: 0, total: 0 };
      subjectMap[subject].total += 1;
      if (ans.is_correct) subjectMap[subject].correct += 1;
    }

    const subjectBreakdown = Object.entries(subjectMap).map(([subject, stats]) => ({
      subject,
      accuracy: stats.total > 0 ? Math.round((stats.correct / stats.total) * 100) : 0,
      totalAnswered: stats.total,
    }));

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
      subjectBreakdown,
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

    if (!studentIds.length) {
      return {
        totalStudents: 0,
        avgScore: 0,
        avgPercentage: 0,
        atRiskCount: 0,
        totalAttempts: 0,
        scoreTrend: [],
        distribution: [],
        missedTopics: [],
      };
    }

    // Get all submitted attempts for these students
    const { data: attempts } = await supabase
      .from('attempts')
      .select('student_id, total_score, submitted_at, tests(id, title, total_marks)')
      .in('student_id', studentIds)
      .eq('status', 'submitted')
      .order('submitted_at', { ascending: true });

    const rows = attempts || [];

    const avgScore =
      rows.length > 0
        ? Math.round(rows.reduce((sum, a) => sum + (Number(a.total_score) || 0), 0) / rows.length)
        : 0;

    // Percentage is the only fair way to compare across tests with different totals
    const pct = (a: any) => {
      const max = Number((a.tests as any)?.total_marks) || 0;
      return max > 0 ? (Number(a.total_score) || 0) / max * 100 : 0;
    };

    const avgPercentage =
      rows.length > 0 ? Math.round(rows.reduce((s, a) => s + pct(a), 0) / rows.length) : 0;

    // Average score per test, in submission order — drives the trend line
    const perTest = new Map<string, { title: string; sum: number; n: number }>();
    for (const a of rows) {
      const test = a.tests as any;
      if (!test?.id) continue;
      if (!perTest.has(test.id)) perTest.set(test.id, { title: test.title, sum: 0, n: 0 });
      const entry = perTest.get(test.id)!;
      entry.sum += pct(a);
      entry.n += 1;
    }
    const scoreTrend = Array.from(perTest.values()).map((t) => ({
      name: t.title,
      score: Math.round(t.sum / t.n),
      attempts: t.n,
    }));

    // Histogram of attempt percentages
    const buckets = [
      { range: '0-20', count: 0 },
      { range: '21-40', count: 0 },
      { range: '41-60', count: 0 },
      { range: '61-80', count: 0 },
      { range: '81-100', count: 0 },
    ];
    for (const a of rows) {
      const p = pct(a);
      const idx = p <= 20 ? 0 : p <= 40 ? 1 : p <= 60 ? 2 : p <= 80 ? 3 : 4;
      buckets[idx].count += 1;
    }

    // Topics this cohort gets wrong most often
    const { data: answerRows } = await supabase
      .from('answers')
      .select('is_correct, attempts!inner(student_id), questions!inner(topic, subject, difficulty)')
      .in('attempts.student_id', studentIds);

    const topicMap = new Map<
      string,
      { topic: string; subject: string; difficulty: string; wrong: number; total: number }
    >();
    for (const ans of answerRows || []) {
      const q = (ans as any).questions;
      if (!q?.topic) continue;
      // Unattempted rows (is_correct === null) aren't evidence of a misconception
      if (ans.is_correct === null || ans.is_correct === undefined) continue;

      const key = `${q.subject}::${q.topic}`;
      if (!topicMap.has(key)) {
        topicMap.set(key, {
          topic: q.topic,
          subject: q.subject,
          difficulty: q.difficulty,
          wrong: 0,
          total: 0,
        });
      }
      const entry = topicMap.get(key)!;
      entry.total += 1;
      if (ans.is_correct === false) entry.wrong += 1;
    }

    const missedTopics = Array.from(topicMap.values())
      .filter((t) => t.total >= 3) // ignore topics with too little signal
      .map((t) => ({
        topic: t.topic,
        subject: t.subject,
        difficulty: t.difficulty,
        wrongPercent: Math.round((t.wrong / t.total) * 100),
        sampleSize: t.total,
      }))
      .sort((a, b) => b.wrongPercent - a.wrongPercent)
      .slice(0, 5);

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
      avgPercentage,
      atRiskCount,
      totalAttempts: rows.length,
      scoreTrend,
      distribution: buckets,
      missedTopics,
    };
  }

  /** Specific student analytics — for StudentProfileDetail teacher view */
  async getStudentAnalyticsForTeacher(studentId: string) {
    return this.getStudentAnalytics(studentId);
  }
}
