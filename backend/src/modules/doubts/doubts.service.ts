import { Injectable, NotFoundException } from '@nestjs/common';
import { supabase } from '../../config/supabase.config';

@Injectable()
export class DoubtsService {
  /** Submit a new doubt */
  async create(studentId: string, body: { question_id?: string; attempt_id?: string; snippet?: string; subject?: string }) {
    const { data: doubt, error } = await supabase
      .from('doubts')
      .insert({ 
        student_id: studentId,
        question_id: body.question_id || null,
        attempt_id: body.attempt_id || null,
        status: 'pending' 
      })
      .select()
      .single();
    if (error) throw new Error(error.message);

    // If there is a text snippet, insert it as the first message since there is no snippet column
    if (body.snippet) {
      await supabase.from('doubt_messages').insert({
        doubt_id: doubt.id,
        sender_id: studentId,
        message_text: body.snippet
      });
    }
    
    return doubt;
  }

  /** Student's own doubts history */
  async getMyDoubts(studentId: string) {
    const { data, error } = await supabase
      .from('doubts')
      .select(`
        id, status, created_at, resolved_at,
        questions(id, question_text, subject, topic),
        users!doubts_accepted_by_fkey(full_name)
      `)
      .eq('student_id', studentId)
      .order('created_at', { ascending: false });
    if (error) throw new Error(error.message);
    return data;
  }

  /** Teacher: Get all doubts queue with optional status filter */
  async findAll(status?: string) {
    let query = supabase
      .from('doubts')
      .select(`
        id, status, created_at, resolved_at,
        student:users!doubts_student_id_fkey(id, full_name),
        questions(id, question_text, subject, topic),
        teacher:users!doubts_accepted_by_fkey(id, full_name)
      `)
      .order('created_at', { ascending: true });

    if (status) query = query.eq('status', status);

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return data;
  }

  /** Get one doubt */
  async findOne(id: string) {
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
    return data;
  }

  /** Teacher accepts a doubt (takes ownership) */
  async accept(id: string, teacherId: string) {
    const { data, error } = await supabase
      .from('doubts')
      .update({ accepted_by: teacherId, status: 'accepted' })
      .eq('id', id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data;
  }

  /** Teacher marks a doubt as resolved */
  async resolve(id: string) {
    const { data, error } = await supabase
      .from('doubts')
      .update({ status: 'resolved', resolved_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data;
  }

  /** Get all chat messages for a doubt */
  async getMessages(doubtId: string) {
    const { data, error } = await supabase
      .from('doubt_messages')
      .select('id, message_text, sent_at, users(id, full_name, role)')
      .eq('doubt_id', doubtId)
      .order('sent_at', { ascending: true });
    if (error) throw new Error(error.message);
    return data;
  }

  /** Send a message (REST fallback) */
  async sendMessage(doubtId: string, senderId: string, messageText: string, imageUrl?: string) {
    const finalMessageText = imageUrl ? `${messageText}|||IMG|||${imageUrl}` : messageText;
    const { data, error } = await supabase
      .from('doubt_messages')
      .insert({ doubt_id: doubtId, sender_id: senderId, message_text: finalMessageText })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data;
  }
}
