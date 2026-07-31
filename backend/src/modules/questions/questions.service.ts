import { Injectable, NotFoundException } from '@nestjs/common';
import { supabase } from '../../config/supabase.config';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const csvParser = require('csv-parser');
import { Readable } from 'stream';

const VALID_DIFFICULTIES = ['easy', 'medium', 'hard'];

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
  }) {
    const page = filters.page || 1;
    const limit = filters.limit || 20;
    const from = (page - 1) * limit;
    const to = from + limit - 1;

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
      .insert({ is_active: true, ...body, created_by: teacherId })
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
          // Expected CSV columns: question,optA,optB,optC,optD,correct,difficulty,subject,topic,marks
          const options = [row.optA || '', row.optB || '', row.optC || '', row.optD || ''];
          const correctIndex = ['A', 'B', 'C', 'D'].indexOf(
            (row.correct || '').trim().toUpperCase(),
          );
          const difficulty = (row.difficulty || '').trim().toLowerCase();

          // Collect every problem so the teacher sees exactly what to fix
          const problems: string[] = [];
          if (!row.question?.trim()) problems.push('missing question text');
          if (!row.subject?.trim()) problems.push('missing subject');
          if (!row.topic?.trim()) problems.push('missing topic');
          if (correctIndex === -1) problems.push('correct answer must be A, B, C or D');
          if (!VALID_DIFFICULTIES.includes(difficulty)) {
            problems.push('difficulty must be easy, medium or hard');
          }
          if (correctIndex >= 0 && !options[correctIndex]?.trim()) {
            problems.push(`option ${row.correct?.trim().toUpperCase()} is empty`);
          }

          const valid = problems.length === 0;

          results.push({
            question_text: (row.question || '').trim(),
            options,
            correct_answer: { index: correctIndex },
            difficulty: valid ? difficulty : difficulty || 'medium',
            subject: (row.subject || '').trim(),
            topic: (row.topic || '').trim(),
            q_type: 'single_correct',
            marks: parseFloat(row.marks) || 4,
            is_active: true,
            valid,
            errorMsg: valid ? null : problems.join('; '),
          });
        })
        .on('end', () => resolve(results))
        .on('error', reject);
    });
  }

  /**
   * Confirm CSV parse — bulk insert valid rows to DB.
   * Fields are whitelisted rather than spread, so a tampered client payload
   * can't inject arbitrary columns.
   */
  async bulkInsert(rows: any[], teacherId: string) {
    const validRows = (rows || [])
      .filter((r) => r?.valid && r?.question_text && r?.correct_answer?.index >= 0)
      .map((r) => ({
        question_text: r.question_text,
        options: r.options,
        correct_answer: r.correct_answer,
        difficulty: VALID_DIFFICULTIES.includes(r.difficulty) ? r.difficulty : 'medium',
        subject: r.subject,
        topic: r.topic,
        q_type: r.q_type || 'single_correct',
        marks: Number(r.marks) || 4,
        is_active: true,
        created_by: teacherId,
      }));

    if (!validRows.length) return { inserted: 0 };

    const { data, error } = await supabase
      .from('questions')
      .insert(validRows)
      .select('id');

    if (error) throw new Error(error.message);
    return { inserted: data?.length || 0 };
  }
}
