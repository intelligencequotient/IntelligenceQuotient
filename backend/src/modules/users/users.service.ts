import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { supabase, createUserAuthClient } from '../../config/supabase.config';
import { fetchAllIn } from '../../common/db/query.util';
import {
  AdminCreateUserDto,
  AdminUserListQueryDto,
  ChangePasswordDto,
  StudentListQueryDto,
} from './dto/user.dto';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

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
      .update({ full_name: body.full_name.trim(), updated_at: new Date().toISOString() })
      .eq('id', userId)
      .select('id, full_name, email, role')
      .single();
    if (error) throw new Error(error.message);
    return data;
  }

  /**
   * Change own password.
   *
   * The current password is verified first, and always — this used to be
   * conditional on the client bothering to send one, so omitting the field was
   * enough to change the password with nothing but a live access token.
   *
   * Verification runs on a throwaway anon client: `signInWithPassword` attaches
   * a session to whichever client it is called on, and doing that on the shared
   * service-role singleton would have leaked one user's session into other
   * in-flight requests.
   */
  async updatePassword(userId: string, body: ChangePasswordDto) {
    const { data: user } = await supabase
      .from('users')
      .select('email')
      .eq('id', userId)
      .single();

    if (!user?.email) throw new NotFoundException('User not found');

    if (body.currentPassword === body.newPassword) {
      throw new BadRequestException('Your new password must be different from the current one.');
    }

    const authClient = createUserAuthClient();
    const { error: signInError } = await authClient.auth.signInWithPassword({
      email: user.email,
      password: body.currentPassword,
    });

    // Drop the session immediately — it is only ever used as a password check.
    await authClient.auth.signOut({ scope: 'local' }).catch(() => undefined);

    if (signInError) {
      throw new BadRequestException('Current password is incorrect');
    }

    const { error } = await supabase.auth.admin.updateUserById(userId, {
      password: body.newPassword,
    });
    if (error) throw new BadRequestException(error.message);

    return { success: true, message: 'Password updated successfully' };
  }

  /**
   * List students — for the StudentCRM page.
   *
   * Paginated at the database rather than in memory: a 1000-student roster came
   * back in one response (past PostgREST's row cap) and then drove a second
   * query with 1000 ids in the URL, which fails outright with 414.
   */
  async listStudents(filters: StudentListQueryDto) {
    const page = Math.max(Number(filters.page) || 1, 1);
    const limit = Math.min(Math.max(Number(filters.limit) || 50, 1), 200);
    const from = (page - 1) * limit;

    // Batch filtering has to happen in the database, not after paging — page 1
    // of "batch X" would otherwise only show whichever of the first 50 students
    // happened to be in it. It also has to avoid the obvious shortcut of reading
    // the batch's member ids and passing them to `.in('id', …)`: a 400-student
    // batch is ~15 KB of UUIDs in the query string, and the request 414s rather
    // than returning a short answer. Querying *from* the membership table with
    // an inner join keeps the filter server-side and the URL constant-length.
    const { students, total, error } = filters.batchId
      ? await this.pageStudentsInBatch(filters.batchId, filters.search, from, limit)
      : await this.pageAllStudents(filters.search, from, limit);

    if (error) throw new Error(error);
    if (!students.length) {
      return { data: [], total, page, limit, totalPages: 1 };
    }

    // One aggregate query per page rather than N per-student queries — and only
    // ever `limit` ids wide, so the request URL stays well inside every limit.
    const studentIds = students.map((s: any) => s.id);
    const attempts = await fetchAllIn<any>(studentIds, (idChunk) =>
      supabase
        .from('attempts')
        .select('student_id, total_score, status, submitted_at, started_at, tests(total_marks)')
        .in('student_id', idChunk),
    );

    const statsByStudent = new Map<
      string,
      { testsTaken: number; totalPercent: number; lastActiveAt: string | null }
    >();

    for (const attempt of attempts) {
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

    return {
      data: students.map((student: any) => {
        const stats = statsByStudent.get(student.id);
        const testsTaken = stats?.testsTaken ?? 0;
        const avg = testsTaken > 0 ? stats!.totalPercent / testsTaken : null;
        return {
          ...student,
          testsTaken,
          avgScorePercent: avg === null ? null : Math.round(avg),
          lastActiveAt: stats?.lastActiveAt ?? null,
          // "At risk" mirrors the analytics threshold: enough evidence, low average.
          status: testsTaken >= 2 && (avg ?? 100) < 40 ? 'At Risk' : 'Active',
        };
      }),
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  /** One page of every student, newest-name-first, filtered by name. */
  private async pageAllStudents(search: string | undefined, from: number, limit: number) {
    let query = supabase
      .from('users')
      .select(
        `
        id, full_name, email, role, created_at,
        batch_students(batch_id, batches(name))
      `,
        { count: 'exact' },
      )
      .eq('role', 'student')
      .order('full_name', { ascending: true })
      .range(from, from + limit - 1);

    if (search) query = query.ilike('full_name', `%${this.escapeLike(search)}%`);

    const { data, error, count } = await query;
    return { students: data || [], total: count ?? 0, error: error?.message };
  }

  /**
   * One page of the students in a single batch.
   *
   * Reads from `batch_students` with an inner join rather than filtering `users`
   * by a list of member ids, so both the filter and the pagination stay in the
   * database and the request URL does not grow with the size of the batch.
   */
  private async pageStudentsInBatch(
    batchId: string,
    search: string | undefined,
    from: number,
    limit: number,
  ) {
    let query = supabase
      .from('batch_students')
      .select(
        `
        student_id,
        users!inner(id, full_name, email, role, created_at)
      `,
        { count: 'exact' },
      )
      .eq('batch_id', batchId)
      .eq('users.role', 'student')
      .order('student_id', { ascending: true })
      .range(from, from + limit - 1);

    if (search) query = query.ilike('users.full_name', `%${this.escapeLike(search)}%`);

    const { data, error, count } = await query;
    if (error) return { students: [], total: 0, error: error.message };

    // Flatten back to the shape the caller (and the CRM page) expects.
    const students = (data || [])
      .map((row: any) => row.users)
      .filter(Boolean)
      .sort((a: any, b: any) => String(a.full_name).localeCompare(String(b.full_name)));

    return { students, total: count ?? students.length, error: undefined };
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

  /**
   * List teachers.
   *
   * Staff-only: this is a roster of names and work emails, and it used to be
   * readable by any logged-in student. Students who need to route a doubt get
   * the reduced projection below instead.
   */
  async listTeachers() {
    const { data, error } = await supabase
      .from('users')
      .select('id, full_name, email, role, created_at')
      .eq('role', 'teacher')
      .order('full_name', { ascending: true });

    if (error) throw new Error(error.message);
    return data || [];
  }

  /** Teacher picker for the doubt form — names only, no contact details. */
  async listTeachersForStudents() {
    const { data, error } = await supabase
      .from('users')
      .select('id, full_name')
      .eq('role', 'teacher')
      .order('full_name', { ascending: true });

    if (error) throw new Error(error.message);
    return data || [];
  }

  // ─── Admin-only methods ────────────────────────────────────────────────────

  /** [Admin] List all users (students + teachers) with optional search/role filter */
  async listAllUsers(filters: AdminUserListQueryDto) {
    const page = Math.max(Number(filters.page) || 1, 1);
    const limit = Math.min(Math.max(Number(filters.limit) || 50, 1), 200);
    const from = (page - 1) * limit;

    let query = supabase
      .from('users')
      .select('id, full_name, email, role, created_at', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(from, from + limit - 1);

    if (filters.role && filters.role !== 'all') {
      query = query.eq('role', filters.role);
    }
    if (filters.search) {
      // The search term is spliced into PostgREST's own filter grammar, so it
      // must be escaped: an unescaped comma or parenthesis used to let a caller
      // append arbitrary filter clauses to the query.
      const safe = this.escapeOrFilter(filters.search);
      query = query.or(`full_name.ilike.%${safe}%,email.ilike.%${safe}%`);
    }

    const { data, error, count } = await query;
    if (error) throw new Error(error.message);

    const total = count ?? 0;
    return {
      data: data || [],
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  /** [Admin] Create a new teacher or student account */
  async adminCreateUser(body: AdminCreateUserDto) {
    const email = body.email.trim().toLowerCase();

    // Create auth user
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password: body.password,
      email_confirm: true,
      user_metadata: {
        full_name: body.full_name,
        ...(body.role === 'teacher' && body.subject ? { subject: body.subject } : {}),
      },
    });

    if (authError) throw new BadRequestException(authError.message);
    const userId = authData.user.id;

    // Insert into public.users table
    const { data, error } = await supabase
      .from('users')
      .insert({
        id: userId,
        full_name: body.full_name,
        email,
        role: body.role,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select('id, full_name, email, role, created_at')
      .single();

    if (error) {
      // Roll back auth user if DB insert fails
      await supabase.auth.admin.deleteUser(userId).catch(() => undefined);
      throw new BadRequestException(error.message);
    }

    return data;
  }

  /** [Admin] Reset any user's password directly (no current-password check) */
  async adminResetPassword(userId: string, newPassword: string) {
    const { data: target } = await supabase
      .from('users')
      .select('id')
      .eq('id', userId)
      .single();
    if (!target) throw new NotFoundException('User not found');

    const { error } = await supabase.auth.admin.updateUserById(userId, {
      password: newPassword,
    });
    if (error) throw new BadRequestException(error.message);

    // Any session opened with the old password is no longer trustworthy.
    await supabase.auth.admin
      .signOut(userId, 'global')
      .catch(() => this.logger.warn(`Could not revoke sessions for ${userId} after a reset.`));

    return { success: true, message: 'Password reset successfully' };
  }

  /** [Admin] Delete a user from auth + DB */
  async adminDeleteUser(userId: string, actingAdminId: string) {
    // Locking yourself out of the admin portal is never the intent.
    if (userId === actingAdminId) {
      throw new ForbiddenException('You cannot delete your own account.');
    }

    const { data: target } = await supabase
      .from('users')
      .select('id, role')
      .eq('id', userId)
      .single();
    if (!target) throw new NotFoundException('User not found');

    // Delete from users table first
    await supabase.from('users').delete().eq('id', userId);
    // Delete from auth
    const { error } = await supabase.auth.admin.deleteUser(userId);
    if (error) throw new Error(error.message);
    return { success: true };
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────

  /** Neutralises LIKE wildcards so a search for "100%" is a literal search. */
  private escapeLike(value: string): string {
    return value.replace(/[%_\\]/g, (m) => `\\${m}`);
  }

  /**
   * Escapes a value being spliced into a PostgREST `or=(...)` expression.
   *
   * The grammar separates conditions on commas and groups with parentheses, and
   * treats a double quote as a value delimiter — all of which have to go before
   * the term can be embedded safely.
   */
  private escapeOrFilter(value: string): string {
    return this.escapeLike(value).replace(/[(),"']/g, '');
  }
}
