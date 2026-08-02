import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { supabase } from '../../config/supabase.config';
import { CreateDoubtDto, MAX_MESSAGE_LENGTH } from './dto/doubt.dto';

/** The authenticated caller, as attached by SupabaseAuthGuard / the socket handshake. */
export interface Requester {
  id: string;
  role?: string;
}

/** Ownership columns needed to make an access decision. */
interface DoubtOwnership {
  id: string;
  student_id: string;
  accepted_by: string | null;
  status: string;
}

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/** Only these image types may be stored — the bucket is public, so HTML/SVG would be stored XSS. */
const ALLOWED_IMAGE_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
};

/** Confirms the bytes really are the image type the client claims. */
function sniffImageMime(buffer: Buffer): string | null {
  if (!buffer || buffer.length < 12) return null;
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
  if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])))
    return 'image/png';
  const head6 = buffer.subarray(0, 6).toString('latin1');
  if (head6 === 'GIF87a' || head6 === 'GIF89a') return 'image/gif';
  if (
    buffer.subarray(0, 4).toString('latin1') === 'RIFF' &&
    buffer.subarray(8, 12).toString('latin1') === 'WEBP'
  )
    return 'image/webp';
  return null;
}

@Injectable()
export class DoubtsService {
  // ── Access control ──────────────────────────────────────────────────────────

  /** Loads the ownership columns for a doubt, or 404s. */
  private async loadOwnership(doubtId: string): Promise<DoubtOwnership> {
    const { data, error } = await supabase
      .from('doubts')
      .select('id, student_id, accepted_by, status')
      .eq('id', doubtId)
      .single();
    if (error || !data) throw new NotFoundException('Doubt not found');
    return data as DoubtOwnership;
  }

  /**
   * Read access: the student who raised it, the teacher who owns it, any admin,
   * plus any teacher while the doubt is still an unclaimed item in the queue.
   */
  private canRead(doubt: DoubtOwnership, user: Requester): boolean {
    if (user.role === 'admin') return true;
    if (doubt.student_id === user.id) return true;
    if (doubt.accepted_by && doubt.accepted_by === user.id) return true;
    if (user.role === 'teacher' && !doubt.accepted_by && doubt.status === 'pending') return true;
    return false;
  }

  /** Write access: only the student who raised it and the teacher/admin who owns it. */
  private canWrite(doubt: DoubtOwnership, user: Requester): boolean {
    if (doubt.student_id === user.id) return true;
    if (doubt.accepted_by && doubt.accepted_by === user.id) return true;
    if (user.role === 'admin') return true;
    return false;
  }

  async assertCanRead(doubtId: string, user: Requester): Promise<DoubtOwnership> {
    const doubt = await this.loadOwnership(doubtId);
    if (!this.canRead(doubt, user)) {
      throw new ForbiddenException('You do not have access to this doubt.');
    }
    return doubt;
  }

  async assertCanWrite(doubtId: string, user: Requester): Promise<DoubtOwnership> {
    const doubt = await this.loadOwnership(doubtId);
    if (!this.canWrite(doubt, user)) {
      throw new ForbiddenException('You are not a participant in this doubt.');
    }
    return doubt;
  }

  /** Non-throwing variant used by the WebSocket gateway. */
  async checkAccess(
    doubtId: string,
    user: Requester,
  ): Promise<{ canRead: boolean; canWrite: boolean }> {
    try {
      const doubt = await this.loadOwnership(doubtId);
      return { canRead: this.canRead(doubt, user), canWrite: this.canWrite(doubt, user) };
    } catch {
      return { canRead: false, canWrite: false };
    }
  }

  // ── Doubt lifecycle ─────────────────────────────────────────────────────────

  /** Submit a new doubt */
  async create(studentId: string, body: CreateDoubtDto) {
    // A student may only route a doubt to a real teacher/admin.
    if (body.teacher_id) {
      const { data: teacher } = await supabase
        .from('users')
        .select('id, role')
        .eq('id', body.teacher_id)
        .single();
      if (!teacher || !['teacher', 'admin'].includes(teacher.role)) {
        throw new BadRequestException('Selected teacher is not available.');
      }
    }

    if (body.question_id) {
      const { data: question } = await supabase
        .from('questions')
        .select('id')
        .eq('id', body.question_id)
        .single();
      if (!question) throw new BadRequestException('Question not found.');
    }

    // An attempt can only be referenced by the student who owns it.
    if (body.attempt_id) {
      const { data: attempt } = await supabase
        .from('attempts')
        .select('id, student_id')
        .eq('id', body.attempt_id)
        .single();
      if (!attempt) throw new BadRequestException('Attempt not found.');
      if (attempt.student_id !== studentId) {
        throw new ForbiddenException('That attempt does not belong to you.');
      }
    }

    const payload = {
      student_id: studentId,
      question_id: body.question_id,
      attempt_id: body.attempt_id,
      snippet: body.snippet,
      status: body.teacher_id ? 'accepted' : 'pending',
      accepted_by: body.teacher_id || null,
    };

    const { data, error } = await supabase
      .from('doubts')
      .insert(payload)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data;
  }

  /** Student's own doubts history */
  async getMyDoubts(studentId: string) {
    const { data, error } = await supabase
      .from('doubts')
      .select(`
        id, status, created_at, resolved_at, accepted_by,
        questions(id, question_text, subject, topic),
        teacher:users!doubts_accepted_by_fkey(id, full_name)
      `)
      .eq('student_id', studentId)
      .order('created_at', { ascending: false });
    if (error) throw new Error(error.message);
    return data;
  }

  /**
   * Teacher: doubts queue — unclaimed pending doubts plus the caller's own.
   * Admins see everything.
   */
  async findAll(user: Requester, status?: string) {
    let query = supabase
      .from('doubts')
      .select(`
        id, status, created_at, resolved_at,
        student:users!doubts_student_id_fkey(id, full_name),
        questions(id, question_text, subject, topic),
        teacher:users!doubts_accepted_by_fkey(id, full_name)
      `)
      .order('created_at', { ascending: true });

    if (user.role !== 'admin') {
      query = query.or(`accepted_by.is.null,accepted_by.eq.${user.id}`);
    }

    if (status) query = query.eq('status', status);

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return data;
  }

  /** Get one doubt */
  async findOne(id: string, user: Requester) {
    await this.assertCanRead(id, user);

    const { data, error } = await supabase
      .from('doubts')
      .select(`
        id, status, created_at, resolved_at,
        student:users!doubts_student_id_fkey(id, full_name, email),
        questions(id, question_text, subject, topic, options, correct_answer),
        teacher:users!doubts_accepted_by_fkey(id, full_name)
      `)
      .eq('id', id)
      .single();
    if (error || !data) throw new NotFoundException('Doubt not found');

    // Never hand the answer key to a student.
    if (user.role === 'student' && data.questions) {
      const questions: any = data.questions;
      if (Array.isArray(questions)) {
        questions.forEach((q: any) => delete q.correct_answer);
      } else {
        delete questions.correct_answer;
      }
    }

    return data;
  }

  /** Teacher accepts a doubt (takes ownership) */
  async accept(id: string, user: Requester) {
    const doubt = await this.loadOwnership(id);

    // Already mine — accepting again is a no-op, not an error.
    if (doubt.accepted_by === user.id) return doubt;

    // Only an unclaimed doubt can be claimed; admins may reassign.
    if (doubt.accepted_by && user.role !== 'admin') {
      throw new ConflictException('This doubt has already been accepted by another teacher.');
    }

    let query = supabase
      .from('doubts')
      .update({ accepted_by: user.id, status: 'accepted' })
      .eq('id', id);

    // Guards against two teachers accepting at the same instant.
    if (user.role !== 'admin') query = query.is('accepted_by', null);

    const { data, error } = await query.select().single();

    if (error || !data) {
      throw new ConflictException('This doubt has already been accepted by another teacher.');
    }
    return data;
  }

  /** Teacher marks a doubt as resolved */
  async resolve(id: string, user: Requester) {
    const doubt = await this.loadOwnership(id);
    if (doubt.accepted_by !== user.id && user.role !== 'admin') {
      throw new ForbiddenException('Only the teacher handling this doubt can resolve it.');
    }

    const { data, error } = await supabase
      .from('doubts')
      .update({ status: 'resolved', resolved_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data;
  }

  // ── Chat ────────────────────────────────────────────────────────────────────

  /** Get all chat messages for a doubt */
  async getMessages(doubtId: string, user: Requester) {
    await this.assertCanRead(doubtId, user);

    const { data, error } = await supabase
      .from('doubt_messages')
      .select('id, message_text, sent_at, users(id, full_name, role)')
      .eq('doubt_id', doubtId)
      .order('sent_at', { ascending: true });
    if (error) throw new Error(error.message);
    return data;
  }

  /** Persist a chat message after checking the sender belongs to the conversation. */
  async sendMessage(doubtId: string, user: Requester, messageText: string) {
    await this.assertCanWrite(doubtId, user);
    return this.persistMessage(doubtId, user.id, messageText);
  }

  /**
   * Inserts a message. Callers MUST have already authorised the sender —
   * assertCanWrite() or checkAccess() — before calling this.
   */
  async persistMessage(doubtId: string, senderId: string, messageText: string) {
    const text = (messageText ?? '').trim();
    if (!text) throw new BadRequestException('Message cannot be empty.');
    if (text.length > MAX_MESSAGE_LENGTH) {
      throw new BadRequestException(`Message exceeds ${MAX_MESSAGE_LENGTH} characters.`);
    }

    const { data, error } = await supabase
      .from('doubt_messages')
      .insert({ doubt_id: doubtId, sender_id: senderId, message_text: text })
      .select('id, message_text, sent_at, doubt_id')
      .single();
    if (error) throw new Error(error.message);
    return data;
  }

  /** Upload an image, store in Supabase Storage, save URL as a chat message */
  async uploadImage(doubtId: string, user: Requester, file: Express.Multer.File) {
    await this.assertCanWrite(doubtId, user);

    if (!file || !file.buffer?.length) throw new BadRequestException('No file provided');
    if (file.size > MAX_IMAGE_BYTES) {
      throw new BadRequestException('Image must be 5 MB or smaller.');
    }

    // Trust the bytes, not the declared mime type or the client's filename.
    const sniffed = sniffImageMime(file.buffer);
    if (!sniffed || !ALLOWED_IMAGE_TYPES[sniffed]) {
      throw new BadRequestException('Only JPG, PNG, GIF and WEBP images are supported.');
    }

    // Path is built entirely from server-controlled values — no traversal via
    // the original filename, and the doubtId is a validated UUID.
    const fileName = `doubts/${doubtId}/${randomUUID()}.${ALLOWED_IMAGE_TYPES[sniffed]}`;

    const { error: uploadError } = await supabase.storage
      .from('question-images')
      .upload(fileName, file.buffer, {
        contentType: sniffed,
        // Chat attachments never change once uploaded.
        cacheControl: '31536000',
        upsert: false,
      });

    if (uploadError) throw new Error(`Storage upload failed: ${uploadError.message}`);

    const { data: urlData } = supabase.storage.from('question-images').getPublicUrl(fileName);
    const imageUrl = urlData.publicUrl;

    // Save as a chat message with special image prefix so frontend can render it
    const data = await this.persistMessage(doubtId, user.id, `[IMAGE]:${imageUrl}`);
    return { ...data, imageUrl };
  }

  /** Delete a doubt (only admin, teacher or the student who created it can delete) */
  async remove(doubtId: string, user: Requester) {
    const doubt = await this.loadOwnership(doubtId);
    if (user.role !== 'admin' && user.role !== 'teacher' && doubt.student_id !== user.id) {
      throw new ForbiddenException('Only admins, teachers, or the creator can delete this doubt.');
    }

    // Delete associated messages first to satisfy foreign key constraints
    await supabase.from('doubt_messages').delete().eq('doubt_id', doubtId);

    // Delete the doubt
    const { error } = await supabase.from('doubts').delete().eq('id', doubtId);
    if (error) throw new Error(error.message);
    
    return { success: true };
  }
}
