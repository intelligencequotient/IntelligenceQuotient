import { Injectable, NotFoundException } from '@nestjs/common';
import { supabase } from '../../config/supabase.config';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const csvParser = require('csv-parser');
import { Readable } from 'stream';

@Injectable()
export class QuestionsService {
  /** List all active questions with optional filters */
  async findAll(filters: {
    subject?: string;
    difficulty?: string;
    q_type?: string;
    topic?: string;
    search?: string;
    page?: number;
    limit?: number;
  }, user?: any) {
    const page = filters.page || 1;
    const limit = filters.limit || 20;
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    // Enforce Subject-Based Access Control
    if (user && user.role === 'teacher' && user.subject && user.subject !== 'All') {
      filters.subject = user.subject;
    }

    let query = supabase
      .from('questions')
      .select('id, subject, topic, subtopic, difficulty, q_type, question_text, options, correct_answer, marks, created_at, image_url', { count: 'exact' })
      .eq('is_active', true)
      .range(from, to)
      .order('created_at', { ascending: false });

    if (filters.subject)    query = query.eq('subject', filters.subject);
    if (filters.difficulty) query = query.eq('difficulty', filters.difficulty);
    if (filters.q_type)     query = query.eq('q_type', filters.q_type);
    if (filters.topic)      query = query.ilike('topic', `%${filters.topic}%`);
    if (filters.search)     query = query.ilike('question_text', `%${filters.search}%`);

    const { data, error, count } = await query;
    if (error) throw new Error(error.message);

    return { data, total: count, page, limit };
  }

  /** Create one question */
  async create(body: any, teacherId: string) {
    const { data, error } = await supabase
      .from('questions')
      .insert({ ...body, created_by: teacherId })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data;
  }

  /** Get one question (includes correct_answer — teacher only) */
  async findOne(id: string) {
    const { data, error } = await supabase
      .from('questions')
      .select('*')
      .eq('id', id)
      .single();
    if (error || !data) throw new NotFoundException('Question not found');
    return data;
  }

  /** Edit a question */
  async update(id: string, body: any) {
    const { data, error } = await supabase
      .from('questions')
      .update(body)
      .eq('id', id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data;
  }

  /** Soft-delete: set is_active = false */
  async remove(id: string) {
    const { error } = await supabase
      .from('questions')
      .update({ is_active: false })
      .eq('id', id);
    if (error) throw new Error(error.message);
    return { message: 'Question deleted successfully' };
  }

  /** Duplicate a question */
  async duplicate(id: string, teacherId: string) {
    const { data: original } = await supabase
      .from('questions')
      .select('*')
      .eq('id', id)
      .single();

    if (!original) throw new NotFoundException('Question not found');

    const { id: _id, created_at, ...rest } = original;
    const { data, error } = await supabase
      .from('questions')
      .insert({ ...rest, created_by: teacherId })
      .select()
      .single();

    if (error) throw new Error(error.message);
    return data;
  }

  /** Parse CSV file and return preview rows (does not save to DB yet) */
  async parseCSV(fileBuffer: Buffer): Promise<any[]> {
    return new Promise((resolve, reject) => {
      const results: any[] = [];
      const stream = Readable.from(fileBuffer.toString());

      stream
        .pipe(csvParser())
        .on('data', (row) => {
          // Expected CSV columns: question,optA,optB,optC,optD,correct,difficulty,subject,topic
          const valid =
            !!row.question && !!row.correct && !!row.difficulty && !!row.subject && !!row.topic;

          results.push({
            question_text: row.question || '',
            options: [row.optA || '', row.optB || '', row.optC || '', row.optD || ''],
            correct_answer: { index: ['A', 'B', 'C', 'D'].indexOf(row.correct?.toUpperCase()) },
            difficulty: (row.difficulty || 'medium').toLowerCase(),
            subject: row.subject || '',
            topic: row.topic || '',
            q_type: 'single_correct',
            marks: parseFloat(row.marks) || 4,
            valid,
            errorMsg: !valid ? 'Missing required fields' : null,
          });
        })
        .on('end', () => resolve(results))
        .on('error', reject);
    });
  }

  /** Confirm CSV parse — bulk insert valid rows to DB */
  async bulkInsert(rows: any[], teacherId: string) {
    const validRows = rows
      .filter((r) => r.valid)
      .map(({ valid, errorMsg, ...rest }) => ({ ...rest, created_by: teacherId }));

    if (!validRows.length) return { inserted: 0 };

    const { data, error } = await supabase
      .from('questions')
      .insert(validRows)
      .select('id');

    if (error) throw new Error(error.message);
    return { inserted: data?.length || 0 };
  }
}
