import { Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { resolve } from 'path';

dotenv.config({ path: resolve(process.cwd(), '.env') });

@Injectable()
export class AppService {
  private supabase: SupabaseClient;

  constructor() {
    const supabaseUrl = process.env.SUPABASE_URL?.trim();
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error(
        'FATAL: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in exam/backend/.env. ' +
        'The exam backend cannot start without valid Supabase credentials.'
      );
    }

    this.supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }

  getHello(): string {
    return 'Secure Exam Backend API is running!';
  }

  async startSession(examId: string, studentId: string) {
    const { data: testData, error: testError } = await this.supabase
      .from('tests')
      .select('duration_minutes, title, total_questions')
      .eq('id', examId)
      .single();

    if (testError || !testData) throw new NotFoundException('Test not found');

    const { data: existingSession } = await this.supabase
      .from('exam_sessions')
      .select('*')
      .eq('exam_id', examId)
      .eq('student_id', studentId)
      .in('status', ['in_progress'])
      .single();

    if (existingSession) {
      return {
        sessionId: existingSession.id,
        startedAt: existingSession.started_at,
        endsAt: existingSession.ends_at,
        testDetails: testData
      };
    }

    const startedAt = new Date();
    const endsAt = new Date(startedAt.getTime() + (testData.duration_minutes || 60) * 60 * 1000);

    const { data: newSession, error: createError } = await this.supabase
      .from('exam_sessions')
      .insert({
        student_id: studentId,
        exam_id: examId,
        started_at: startedAt.toISOString(),
        ends_at: endsAt.toISOString(),
        status: 'in_progress'
      })
      .select()
      .single();

    if (createError) throw new InternalServerErrorException('Failed to create session');

    return {
      sessionId: newSession.id,
      startedAt: newSession.started_at,
      endsAt: newSession.ends_at,
      testDetails: testData
    };
  }

  async heartbeat(sessionId: string) {
    const { data: session, error } = await this.supabase
      .from('exam_sessions')
      .select('ends_at, status')
      .eq('id', sessionId)
      .single();

    if (error || !session) throw new NotFoundException('Exam session not found');

    const endsAt = new Date(session.ends_at).getTime();
    const now = Date.now();
    const remainingSeconds = Math.max(0, Math.floor((endsAt - now) / 1000));

    if (remainingSeconds <= 0 && session.status === 'in_progress') {
      await this.submitSession(sessionId, true);
      return { remainingSeconds: 0, status: 'auto_submitted' };
    }

    return { remainingSeconds, status: session.status };
  }

  async saveResponse(sessionId: string, payload: any) {
    const { question_id, selected_answer, status, time_spent_seconds } = payload;
    
    const { error } = await this.supabase
      .from('exam_responses')
      .upsert({
        session_id: sessionId,
        question_id,
        selected_answer,
        status,
        time_spent_seconds,
        last_updated_at: new Date().toISOString()
      }, { onConflict: 'session_id,question_id' });

    if (error) throw new InternalServerErrorException('Failed to save response');
    return { success: true };
  }

  async logViolation(sessionId: string, payload: any) {
    const { error } = await this.supabase
      .from('exam_violations')
      .insert({
        session_id: sessionId,
        type: payload.type,
        duration_ms: payload.duration_ms
      });

    if (error) throw new InternalServerErrorException('Failed to log violation');

    const { count } = await this.supabase
      .from('exam_violations')
      .select('*', { count: 'exact', head: true })
      .eq('session_id', sessionId);

    if (count !== null && count >= 3) {
      await this.supabase
        .from('exam_sessions')
        .update({ status: 'violation_terminated', submitted_at: new Date().toISOString() })
        .eq('id', sessionId);
      return { success: true, terminated: true };
    }

    return { success: true, terminated: false };
  }

  async submitSession(sessionId: string, autoSubmitted: boolean = false) {
    const { error } = await this.supabase
      .from('exam_sessions')
      .update({
        status: autoSubmitted ? 'auto_submitted' : 'submitted',
        submitted_at: new Date().toISOString()
      })
      .eq('id', sessionId);

    if (error) throw new InternalServerErrorException('Failed to submit exam');
    return { success: true };
  }
}
