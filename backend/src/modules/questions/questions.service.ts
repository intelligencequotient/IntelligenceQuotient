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
    review_status?: string;
    page?: number;
    limit?: number;
  }, user?: any) {
    const page = Math.max(Number(filters.page) || 1, 1);
    // Cap the page size so a hand-crafted ?limit=100000 cannot pull the whole bank.
    const limit = Math.min(Math.max(Number(filters.limit) || 20, 1), 200);
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    // Enforce Subject-Based Access Control
    if (user && user.role === 'teacher' && user.subject && user.subject !== 'All') {
      filters.subject = user.subject;
    }

    let query = supabase
      .from('questions')
      .select(
        'id, subject, topic, subtopic, difficulty, q_type, question_text, options, correct_answer, marks, created_at, image_url, review_status, source',
        { count: 'exact' },
      )
      .eq('is_active', true)
      .range(from, to)
      .order('created_at', { ascending: false });

    // Only approved questions are usable by default; the review queue asks for
    // 'pending' explicitly, and 'all' is available for an unfiltered browse.
    if (filters.review_status === 'all') {
      // no filter
    } else if (filters.review_status) {
      query = query.eq('review_status', filters.review_status);
    } else {
      query = query.eq('review_status', 'approved');
    }

    if (filters.subject)    query = query.ilike('subject', filters.subject);
    if (filters.difficulty) query = query.eq('difficulty', filters.difficulty);
    if (filters.q_type)     query = query.eq('q_type', filters.q_type);
    if (filters.topic)      query = query.ilike('topic', `%${filters.topic}%`);
    if (filters.search)     query = query.ilike('question_text', `%${this.escapeLike(filters.search)}%`);

    const { data, error, count } = await query;
    if (error) throw new Error(error.message);

    const total = count ?? 0;
    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
      hasMore: to + 1 < total,
    };
  }

  /** Neutralises PostgREST LIKE wildcards so a search for "100%" is not a prefix match. */
  private escapeLike(value: string): string {
    return value.replace(/[%_\\]/g, (m) => `\\${m}`);
  }

  /**
   * Questions awaiting manual verification — the QA queue for the AI pipeline.
   * Extraction is good but not perfect, so nothing reaches a live test until a
   * human has confirmed the text and answer key.
   */
  async getReviewQueue(filters: { subject?: string; page?: number; limit?: number }, user?: any) {
    return this.findAll({ ...filters, review_status: 'pending' }, user);
  }

  /** Approve a question (optionally correcting it in the same call). */
  async approve(id: string, reviewerId: string, corrections?: Record<string, any>) {
    const payload: Record<string, any> = {
      ...(corrections || {}),
      review_status: 'approved',
      reviewed_by: reviewerId,
      reviewed_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from('questions')
      .update(payload)
      .eq('id', id)
      .select()
      .single();

    if (error) throw new Error(error.message);
    if (!data) throw new NotFoundException('Question not found');
    return data;
  }

  /** Reject a question — kept for audit, but hidden from the bank. */
  async reject(id: string, reviewerId: string) {
    const { data, error } = await supabase
      .from('questions')
      .update({
        review_status: 'rejected',
        is_active: false,
        reviewed_by: reviewerId,
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw new Error(error.message);
    if (!data) throw new NotFoundException('Question not found');
    return data;
  }

  /** Approve many at once — the common case after skimming a freshly parsed PDF. */
  async bulkApprove(ids: string[], reviewerId: string) {
    if (!ids?.length) return { approved: 0 };

    const { data, error } = await supabase
      .from('questions')
      .update({
        review_status: 'approved',
        reviewed_by: reviewerId,
        reviewed_at: new Date().toISOString(),
      })
      .in('id', ids)
      .select('id');

    if (error) throw new Error(error.message);
    return { approved: data?.length || 0 };
  }

  /** Soft-delete many questions in one call (bulk selection in the Question Bank). */
  async bulkRemove(ids: string[]) {
    if (!ids?.length) return { deleted: 0 };

    const { data, error } = await supabase
      .from('questions')
      .update({ is_active: false })
      .in('id', ids)
      .select('id');

    if (error) throw new Error(error.message);
    return { deleted: data?.length || 0 };
  }

  /** Create one question — hand-written questions need no review. */
  async create(body: any, teacherId: string) {
    const { data, error } = await supabase
      .from('questions')
      .insert({
        source: 'manual',
        review_status: 'approved',
        ...body,
        created_by: teacherId,
      })
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
    // CSV rows are author-supplied and already previewed in the UI, so they go
    // straight in as approved — unlike PDF extraction, nothing was guessed.
    const validRows = rows
      .filter((r) => r.valid)
      .map(({ valid, errorMsg, ...rest }) => ({
        ...rest,
        created_by: teacherId,
        source: 'csv',
        review_status: 'approved',
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
