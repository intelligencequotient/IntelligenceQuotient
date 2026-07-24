import { Injectable } from '@nestjs/common';
import { supabase } from '../../config/supabase.config';

@Injectable()
export class LeaderboardService {
  /** Global leaderboard — all students ranked by total score */
  async getGlobal(page = 1, limit = 50) {
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    // Sum total_score per student across all submitted attempts
    const { data, error } = await supabase
      .from('attempts')
      .select('student_id, users(id, full_name)')
      .eq('status', 'submitted');

    if (error) throw new Error(error.message);

    // Aggregate scores per student
    const scoreMap = new Map<string, { name: string; totalScore: number; testCount: number }>();
    for (const a of data || []) {
      const sid = a.student_id;
      const name = (a.users as any)?.full_name || 'Unknown';
      if (!scoreMap.has(sid)) {
        scoreMap.set(sid, { name, totalScore: 0, testCount: 0 });
      }
      const entry = scoreMap.get(sid)!;
      entry.testCount += 1;
    }

    // Re-fetch with scores
    const { data: scored } = await supabase
      .from('attempts')
      .select('student_id, total_score, users(id, full_name)')
      .eq('status', 'submitted');

    const finalMap = new Map<string, { id: string; name: string; totalScore: number; testCount: number }>();
    for (const a of scored || []) {
      const sid = a.student_id;
      const name = (a.users as any)?.full_name || 'Unknown';
      if (!finalMap.has(sid)) {
        finalMap.set(sid, { id: sid, name, totalScore: 0, testCount: 0 });
      }
      const entry = finalMap.get(sid)!;
      entry.totalScore += Number(a.total_score) || 0;
      entry.testCount += 1;
    }

    // Sort by total score descending and add rank
    const sorted = Array.from(finalMap.values())
      .sort((a, b) => b.totalScore - a.totalScore)
      .map((s, idx) => ({ rank: idx + 1, ...s }));

    return {
      data: sorted.slice(from, to + 1),
      total: sorted.length,
      page,
      limit,
    };
  }

  /** Get leaderboard for a specific batch */
  async getBatch(batchId: string) {
    const { data: batchStudents } = await supabase
      .from('batch_students')
      .select('student_id')
      .eq('batch_id', batchId);

    const studentIds = (batchStudents || []).map((b: any) => b.student_id);
    if (!studentIds.length) return [];

    const { data: scored } = await supabase
      .from('attempts')
      .select('student_id, total_score, users(id, full_name)')
      .in('student_id', studentIds)
      .eq('status', 'submitted');

    const finalMap = new Map<string, { id: string; name: string; totalScore: number }>();
    for (const a of scored || []) {
      const sid = a.student_id;
      const name = (a.users as any)?.full_name || 'Unknown';
      if (!finalMap.has(sid)) finalMap.set(sid, { id: sid, name, totalScore: 0 });
      finalMap.get(sid)!.totalScore += Number(a.total_score) || 0;
    }

    return Array.from(finalMap.values())
      .sort((a, b) => b.totalScore - a.totalScore)
      .map((s, idx) => ({ rank: idx + 1, ...s }));
  }

  /** Get the logged-in student's rank + 2 students above and below */
  async getMyRank(studentId: string) {
    const result = await this.getGlobal(1, 10000);
    const myIdx = result.data.findIndex((s) => s.id === studentId);
    if (myIdx === -1) return { rank: null, neighbors: [] };

    const start = Math.max(0, myIdx - 2);
    const end = Math.min(result.data.length, myIdx + 3);

    return {
      rank: myIdx + 1,
      totalStudents: result.total,
      neighbors: result.data.slice(start, end).map((s) => ({
        ...s,
        isMe: s.id === studentId,
      })),
    };
  }
}
