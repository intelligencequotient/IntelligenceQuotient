import { Injectable, NotFoundException } from '@nestjs/common';
import { supabase } from '../../config/supabase.config';

@Injectable()
export class UsersService {
  /** Get own profile */
  async getProfile(userId: string) {
    const { data, error } = await supabase
      .from('users')
      .select('id, full_name, email, role, created_at')
      .eq('id', userId)
      .single();
    if (error || !data) throw new NotFoundException('User not found');
    return data;
  }

  /** Update own name */
  async updateProfile(userId: string, body: { full_name: string }) {
    const { data, error } = await supabase
      .from('users')
      .update({ full_name: body.full_name, updated_at: new Date().toISOString() })
      .eq('id', userId)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data;
  }

  /** List all students — for StudentCRM page */
  async listStudents(filters: { search?: string; batchId?: string }) {
    // Get all students with their batch info
    let query = supabase
      .from('users')
      .select(`
        id, full_name, email, role, created_at,
        batch_students(batch_id, batches(name))
      `)
      .eq('role', 'student')
      .order('full_name', { ascending: true });

    if (filters.search) {
      query = query.ilike('full_name', `%${filters.search}%`);
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    // If batchId filter, filter after query
    let students = data || [];
    if (filters.batchId) {
      students = students.filter((s: any) =>
        s.batch_students?.some((bs: any) => bs.batch_id === filters.batchId),
      );
    }

    if (!students.length) return students;

    // Attach performance stats in two batch queries rather than N+1 per student
    const ids = students.map((s: any) => s.id);

    const [{ data: attempts }, { data: risks }] = await Promise.all([
      supabase
        .from('attempts')
        .select('student_id, total_score, submitted_at, tests(total_marks)')
        .in('student_id', ids)
        .eq('status', 'submitted'),
      supabase
        .from('predictions')
        .select('student_id')
        .in('student_id', ids)
        .eq('risk_flag', true),
    ]);

    const statsMap = new Map<
      string,
      { testsTaken: number; pctSum: number; lastActive: string | null }
    >();

    for (const a of attempts || []) {
      const sid = (a as any).student_id;
      if (!statsMap.has(sid)) statsMap.set(sid, { testsTaken: 0, pctSum: 0, lastActive: null });
      const entry = statsMap.get(sid)!;

      const max = Number((a as any).tests?.total_marks) || 0;
      entry.pctSum += max > 0 ? (Number(a.total_score) || 0) / max * 100 : 0;
      entry.testsTaken += 1;

      const submitted = (a as any).submitted_at;
      if (submitted && (!entry.lastActive || submitted > entry.lastActive)) {
        entry.lastActive = submitted;
      }
    }

    const atRisk = new Set((risks || []).map((r: any) => r.student_id));

    return students.map((s: any) => {
      const stats = statsMap.get(s.id);
      return {
        ...s,
        testsTaken: stats?.testsTaken || 0,
        avgPercentage: stats?.testsTaken ? Math.round(stats.pctSum / stats.testsTaken) : null,
        lastActive: stats?.lastActive || null,
        status: atRisk.has(s.id) ? 'At Risk' : 'Active',
      };
    });
  }

  /** Get one student's full profile — for StudentProfileDetail page */
  async getStudentProfile(studentId: string) {
    const { data: user, error } = await supabase
      .from('users')
      .select(`
        id, full_name, email, role, created_at,
        batch_students(batch_id, joined_at, batches(name, subject_focus))
      `)
      .eq('id', studentId)
      .eq('role', 'student')
      .single();

    if (error || !user) throw new NotFoundException('Student not found');

    // Also get their attempt summary
    const { data: attempts } = await supabase
      .from('attempts')
      .select('id, total_score, status, started_at, submitted_at, tests(title)')
      .eq('student_id', studentId)
      .eq('status', 'submitted')
      .order('submitted_at', { ascending: false })
      .limit(10);

    return { ...user, recentAttempts: attempts || [] };
  }
}
