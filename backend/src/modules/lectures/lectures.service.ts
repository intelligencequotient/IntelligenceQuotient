import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { supabase } from '../../config/supabase.config';
import { CreateLectureDto, LectureQueryDto } from './dto/lecture.dto';

export interface Requester {
  id: string;
  role?: string;
}

@Injectable()
export class LecturesService {
  async findAll(filters: LectureQueryDto) {
    const page = Math.max(Number(filters.page) || 1, 1);
    const limit = Math.min(Math.max(Number(filters.limit) || 50, 1), 200);
    const from = (page - 1) * limit;

    let query = supabase
      .from('lectures')
      .select('id, subject, topic, title, drive_url, duration_minutes, created_at', {
        count: 'exact',
      })
      .order('created_at', { ascending: false })
      .range(from, from + limit - 1);

    if (filters.subject) query = query.eq('subject', filters.subject);
    if (filters.topic) query = query.ilike('topic', `%${this.escapeLike(filters.topic)}%`);

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

  async create(body: CreateLectureDto, teacherId: string) {
    const { data, error } = await supabase
      .from('lectures')
      .insert({
        title: body.title.trim(),
        subject: body.subject,
        topic: body.topic ?? null,
        drive_url: body.drive_url,
        duration_minutes: body.duration_minutes ?? null,
        uploaded_by: teacherId,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data;
  }

  /** Only the teacher who uploaded a lecture — or an admin — may remove it. */
  async remove(id: string, user: Requester) {
    const { data: lecture } = await supabase
      .from('lectures')
      .select('id, uploaded_by')
      .eq('id', id)
      .single();

    if (!lecture) throw new NotFoundException('Lecture not found');
    if (user.role !== 'admin' && lecture.uploaded_by !== user.id) {
      throw new ForbiddenException('Only the teacher who uploaded this lecture can delete it.');
    }

    const { error } = await supabase.from('lectures').delete().eq('id', id);
    if (error) throw new Error(error.message);
    return { message: 'Lecture deleted' };
  }

  async getSyllabus(subject: string) {
    const { data, error } = await supabase
      .from('syllabus_items')
      .select('id, subject, topic, subtopic, order_index')
      .eq('subject', subject)
      .order('order_index', { ascending: true });
    if (error) throw new Error(error.message);
    return data;
  }

  private escapeLike(value: string): string {
    return value.replace(/[%_\\]/g, (m) => `\\${m}`);
  }
}
