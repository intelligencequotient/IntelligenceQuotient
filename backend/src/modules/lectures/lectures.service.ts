import { Injectable } from '@nestjs/common';
import { supabase } from '../../config/supabase.config';

@Injectable()
export class LecturesService {
  async findAll(filters: { subject?: string; topic?: string }) {
    let query = supabase
      .from('lectures')
      .select('id, subject, topic, title, drive_url, duration_minutes, created_at')
      .order('created_at', { ascending: false });

    if (filters.subject) query = query.eq('subject', filters.subject);
    if (filters.topic)   query = query.ilike('topic', `%${filters.topic}%`);

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return data;
  }

  async create(body: any, teacherId: string) {
    const { data, error } = await supabase
      .from('lectures')
      .insert({ ...body, uploaded_by: teacherId })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data;
  }

  async remove(id: string) {
    const { error } = await supabase.from('lectures').delete().eq('id', id);
    if (error) throw new Error(error.message);
    return { message: 'Lecture deleted' };
  }

  async getSyllabus(subject: string) {
    const { data, error } = await supabase
      .from('syllabus_items')
      .select('*')
      .eq('subject', subject)
      .order('order_index', { ascending: true });
    if (error) throw new Error(error.message);
    return data;
  }
}
