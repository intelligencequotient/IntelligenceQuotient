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

    // Fetch per-question answer accuracy
    const { data: answers } = await supabase
      .from('answers')
      .select('is_correct, questions(subject, topic, difficulty)')
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
