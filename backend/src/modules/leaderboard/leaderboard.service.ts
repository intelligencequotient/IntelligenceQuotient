import { ForbiddenException, Injectable } from '@nestjs/common';
import { supabase } from '../../config/supabase.config';
import { CacheService } from '../../common/cache/cache.service';
import { fetchAll } from '../../common/db/query.util';

/**
 * Rankings are derived by aggregating every submitted attempt, which is far too
 * expensive to redo on each request. Results are cached with a short TTL —
 * a leaderboard that is up to 5 minutes stale is fine, a slow one is not.
 */
const LEADERBOARD_TTL_SECONDS = Number(process.env.LEADERBOARD_TTL_SECONDS) || 300;

const CACHE_PREFIX = 'leaderboard:';

export interface RankedStudent {
  rank: number;
  id: string;
  name: string;
  totalScore: number;
  testCount: number;
  bestScore: number;
}

@Injectable()
export class LeaderboardService {
  constructor(private readonly cache: CacheService) {}

  /**
   * Builds the full ranking once, then serves slices from it.
   * (The previous implementation ran the same query twice and threw the first
   * result away, then re-scanned the whole table for every `getMyRank` call.)
   */
  private async buildRanking(): Promise<RankedStudent[]> {
    return this.cache.wrap(`${CACHE_PREFIX}global`, LEADERBOARD_TTL_SECONDS, async () => {
      // Paged. A single select returns at most PostgREST's `db-max-rows` (1000)
      // and says nothing about having truncated — so once the platform passed
      // 1000 submitted attempts the leaderboard was quietly built from a
      // partial table and everyone's rank was wrong.
      const data = await fetchAll<any>(() =>
        supabase
          .from('attempts')
          .select('student_id, total_score, users(id, full_name)')
          .eq('status', 'submitted')
          .order('id', { ascending: true }),
      );

      const totals = new Map<
        string,
        { id: string; name: string; totalScore: number; testCount: number; bestScore: number }
      >();

      for (const attempt of data) {
        const id = attempt.student_id;
        const score = Number(attempt.total_score) || 0;
        const name = (attempt.users as any)?.full_name || 'Unknown';

        const entry = totals.get(id) ?? {
          id,
          name,
          totalScore: 0,
          testCount: 0,
          bestScore: 0,
        };
        entry.totalScore += score;
        entry.testCount += 1;
        entry.bestScore = Math.max(entry.bestScore, score);
        totals.set(id, entry);
      }

      // Ties share a rank (standard competition ranking: 1, 2, 2, 4).
      const sorted = Array.from(totals.values()).sort((a, b) => b.totalScore - a.totalScore);

      let lastScore: number | null = null;
      let lastRank = 0;
      return sorted.map((student, idx) => {
        const rank = student.totalScore === lastScore ? lastRank : idx + 1;
        lastScore = student.totalScore;
        lastRank = rank;
        return { rank, ...student };
      });
    });
  }

  /** Global leaderboard — all students ranked by total score */
  async getGlobal(page = 1, limit = 50) {
    const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 200);
    const safePage = Math.max(Number(page) || 1, 1);
    const from = (safePage - 1) * safeLimit;

    const ranking = await this.buildRanking();

    return {
      data: ranking.slice(from, from + safeLimit),
      total: ranking.length,
      page: safePage,
      limit: safeLimit,
    };
  }

  /**
   * Confirms the caller may see this batch's rankings.
   *
   * The route took only a batch id, so any student could enumerate other
   * cohorts' names and scores by guessing ids. Staff see any batch; a student
   * sees only a batch they are in.
   */
  async assertCanViewBatch(batchId: string, user: { id: string; role?: string }): Promise<void> {
    if (user.role === 'teacher' || user.role === 'admin') return;

    const { data: membership } = await supabase
      .from('batch_students')
      .select('batch_id')
      .eq('batch_id', batchId)
      .eq('student_id', user.id)
      .maybeSingle();

    if (!membership) {
      throw new ForbiddenException('You are not a member of this batch.');
    }
  }

  /** Leaderboard scoped to one batch */
  async getBatch(batchId: string) {
    return this.cache.wrap(
      `${CACHE_PREFIX}batch:${batchId}`,
      LEADERBOARD_TTL_SECONDS,
      async () => {
        const batchStudents = await fetchAll<{ student_id: string }>(() =>
          supabase.from('batch_students').select('student_id').eq('batch_id', batchId),
        );

        const studentIds = new Set(batchStudents.map((b) => b.student_id));
        if (!studentIds.size) return [];

        // Reuse the global aggregate rather than re-querying attempts.
        const ranking = await this.buildRanking();

        let lastScore: number | null = null;
        let lastRank = 0;
        return ranking
          .filter((s) => studentIds.has(s.id))
          .map((student, idx) => {
            const rank = student.totalScore === lastScore ? lastRank : idx + 1;
            lastScore = student.totalScore;
            lastRank = rank;
            return { ...student, rank };
          });
      },
    );
  }

  /** The logged-in student's rank plus two neighbours either side */
  async getMyRank(studentId: string) {
    const ranking = await this.buildRanking();
    const myIdx = ranking.findIndex((s) => s.id === studentId);

    if (myIdx === -1) {
      return { rank: null, totalStudents: ranking.length, neighbors: [] };
    }

    const start = Math.max(0, myIdx - 2);
    const end = Math.min(ranking.length, myIdx + 3);

    return {
      rank: ranking[myIdx].rank,
      totalScore: ranking[myIdx].totalScore,
      totalStudents: ranking.length,
      neighbors: ranking.slice(start, end).map((s) => ({ ...s, isMe: s.id === studentId })),
    };
  }

  /** Called after a submission so a fresh score shows up without waiting for the TTL. */
  async invalidate(): Promise<void> {
    await this.cache.invalidate(CACHE_PREFIX);
  }
}
