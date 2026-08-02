import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
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

  /** Update password */
  async updatePassword(userId: string, body: { currentPassword?: string; newPassword: string }) {
    const { data: user } = await supabase.from('users').select('email').eq('id', userId).single();
    
    // Verify current password first if provided
    if (user?.email && body.currentPassword) {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: body.currentPassword,
      });
      if (signInError) {
        throw new BadRequestException('Current password is incorrect');
      }
    }

    // Update to new password using admin client
    const { error } = await supabase.auth.admin.updateUserById(userId, {
      password: body.newPassword,
    });
    if (error) throw new Error(error.message);
    return { success: true, message: 'Password updated successfully' };
  }

  /**
   * List all students — for the StudentCRM page.
   *
   * Also returns per-student attempt stats (tests taken, average score, last
   * activity). The CRM used to invent these client-side from a hash of the
   * user id, so "Last Active" was fiction.
   */
  async listStudents(filters: { search?: string; batchId?: string }) {
    let query = supabase
      .from('users')
      .select(`
        id, full_name, email, role, created_at,
        batch_students(batch_id, batches(name))
      `)
      .eq('role', 'student')
      .order('full_name', { ascending: true });

    if (filters.search) {
      // Escape LIKE wildcards so a literal % is not treated as a pattern.
      const safe = filters.search.replace(/[%_\\]/g, (m) => `\\${m}`);
      query = query.ilike('full_name', `%${safe}%`);
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    let students = data || [];
    if (filters.batchId) {
      students = students.filter((s: any) =>
        s.batch_students?.some((bs: any) => bs.batch_id === filters.batchId),
      );
    }

    if (!students.length) return [];

    // One aggregate query for the whole page rather than N per-student queries.
    const studentIds = students.map((s: any) => s.id);
    const { data: attempts } = await supabase
      .from('attempts')
      .select('student_id, total_score, status, submitted_at, started_at, tests(total_marks)')
      .in('student_id', studentIds);

    const statsByStudent = new Map<
      string,
      { testsTaken: number; totalPercent: number; lastActiveAt: string | null }
    >();

    for (const attempt of (attempts || []) as any[]) {
      const entry = statsByStudent.get(attempt.student_id) ?? {
        testsTaken: 0,
        totalPercent: 0,
        lastActiveAt: null,
      };

      const activity = attempt.submitted_at || attempt.started_at;
      if (activity && (!entry.lastActiveAt || activity > entry.lastActiveAt)) {
        entry.lastActiveAt = activity;
      }

      if (attempt.status === 'submitted') {
        const max = Number(attempt.tests?.total_marks) || 0;
        entry.testsTaken += 1;
        if (max > 0) {
          entry.totalPercent += ((Number(attempt.total_score) || 0) / max) * 100;
        }
      }

      statsByStudent.set(attempt.student_id, entry);
    }

    return students.map((student: any) => {
      const stats = statsByStudent.get(student.id);
      const testsTaken = stats?.testsTaken ?? 0;
      return {
        ...student,
        testsTaken,
        avgScorePercent: testsTaken > 0 ? Math.round(stats!.totalPercent / testsTaken) : null,
        lastActiveAt: stats?.lastActiveAt ?? null,
        // "At risk" mirrors the analytics threshold: enough evidence, low average.
        status: testsTaken >= 2 && (stats!.totalPercent / testsTaken) < 40 ? 'At Risk' : 'Active',
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

  /** List all teachers */
  async listTeachers() {
    const { data, error } = await supabase
      .from('users')
      .select('id, full_name, email, role, created_at')
      .eq('role', 'teacher')
      .order('full_name', { ascending: true });

    if (error) throw new Error(error.message);
    return data || [];
  }

  // ─── Admin-only methods ────────────────────────────────────────────────────

  /** [Admin] List all users (students + teachers) with optional search/role filter */
  async listAllUsers(filters: { search?: string; role?: string }) {
    let query = supabase
      .from('users')
      .select('id, full_name, email, role, created_at')
      .order('created_at', { ascending: false });

    if (filters.role && filters.role !== 'all') {
      query = query.eq('role', filters.role);
    }
    if (filters.search) {
      query = query.or(`full_name.ilike.%${filters.search}%,email.ilike.%${filters.search}%`);
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return data || [];
  }

  /** [Admin] Create a new teacher or student account */
  async adminCreateUser(body: {
    full_name: string;
    email: string;
    password: string;
    role: 'student' | 'teacher';
  }) {
    // Create auth user
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email: body.email,
      password: body.password,
      email_confirm: true,
      user_metadata: { full_name: body.full_name },
    });

    if (authError) throw new Error(authError.message);
    const userId = authData.user.id;

    // Insert into public.users table
    const { data, error } = await supabase
      .from('users')
      .insert({
        id: userId,
        full_name: body.full_name,
        email: body.email,
        role: body.role,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      // Roll back auth user if DB insert fails
      await supabase.auth.admin.deleteUser(userId);
      throw new Error(error.message);
    }

    return data;
  }

  /** [Admin] Reset any user's password directly (no current-password check) */
  async adminResetPassword(userId: string, newPassword: string) {
    const { error } = await supabase.auth.admin.updateUserById(userId, {
      password: newPassword,
    });
    if (error) throw new Error(error.message);
    return { success: true, message: 'Password reset successfully' };
  }

  /** [Admin] Delete a user from auth + DB */
  async adminDeleteUser(userId: string) {
    // Delete from users table first
    await supabase.from('users').delete().eq('id', userId);
    // Delete from auth
    const { error } = await supabase.auth.admin.deleteUser(userId);
    if (error) throw new Error(error.message);
    return { success: true };
  }
}
