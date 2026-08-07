import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { randomUUID } from 'crypto';
import Redis from 'ioredis';

/**
 * Small TTL cache used for expensive read-mostly aggregates (leaderboard, cohort stats).
 *
 * Backed by Redis when REDIS_URL is set, otherwise by an in-process Map. The
 * in-memory mode is correct for a single instance; once the API is scaled to
 * more than one process, set REDIS_URL so every instance shares the same view
 * — and so `withLock` actually excludes across instances.
 */
@Injectable()
export class CacheService implements OnModuleDestroy {
  private readonly logger = new Logger(CacheService.name);
  private readonly memory = new Map<string, { value: string; expiresAt: number }>();
  private redis: Redis | null = null;
  private redisHealthy = false;

  /**
   * Recomputations already running, keyed by cache key.
   *
   * Without this, the moment a hot key expires every concurrent request misses
   * together and each one runs the expensive query — a thousand students
   * refreshing the leaderboard would issue a thousand full table scans. The
   * first caller computes; the rest await the same promise.
   */
  private readonly inFlight = new Map<string, Promise<any>>();

  /** Locks held by this process, so a crash-free release only clears our own. */
  private readonly memoryLocks = new Map<string, { token: string; expiresAt: number }>();

  constructor() {
    const url = process.env.REDIS_URL;
    if (!url) {
      this.logger.log('REDIS_URL not set — using in-memory cache.');
      return;
    }

    try {
      this.redis = new Redis(url, {
        maxRetriesPerRequest: 2,
        // Never let a cache outage take the API down: fail over to memory instead.
        retryStrategy: (times) => (times > 5 ? null : Math.min(times * 200, 2000)),
        lazyConnect: false,
      });

      this.redis.on('ready', () => {
        this.redisHealthy = true;
        this.logger.log('Redis cache connected.');
      });
      this.redis.on('error', (e) => {
        if (this.redisHealthy) this.logger.warn(`Redis error, falling back to memory: ${e.message}`);
        this.redisHealthy = false;
      });
      this.redis.on('end', () => {
        this.redisHealthy = false;
      });
    } catch (e: any) {
      this.logger.warn(`Redis init failed (${e?.message}) — using in-memory cache.`);
      this.redis = null;
    }
  }

  async onModuleDestroy() {
    if (this.redis) {
      try {
        await this.redis.quit();
      } catch {
        this.redis.disconnect();
      }
    }
  }

  /** True when a shared Redis is available — i.e. locks are cluster-wide. */
  get isDistributed(): boolean {
    return Boolean(this.redis && this.redisHealthy);
  }

  async get<T>(key: string): Promise<T | null> {
    if (this.isDistributed) {
      try {
        const raw = await this.redis!.get(key);
        return raw ? (JSON.parse(raw) as T) : null;
      } catch {
        // fall through to memory
      }
    }

    const hit = this.memory.get(key);
    if (!hit) return null;
    if (hit.expiresAt <= Date.now()) {
      this.memory.delete(key);
      return null;
    }
    return JSON.parse(hit.value) as T;
  }

  async set(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    const raw = JSON.stringify(value);

    if (this.isDistributed) {
      try {
        await this.redis!.set(key, raw, 'EX', ttlSeconds);
        return;
      } catch {
        // fall through to memory
      }
    }

    // Keep the in-memory map from growing without bound.
    if (this.memory.size > 500) this.pruneMemory();
    this.memory.set(key, { value: raw, expiresAt: Date.now() + ttlSeconds * 1000 });
  }

  /** Invalidate one key, or every key sharing a prefix. */
  async invalidate(prefix: string): Promise<void> {
    for (const key of this.memory.keys()) {
      if (key.startsWith(prefix)) this.memory.delete(key);
    }

    if (this.isDistributed) {
      try {
        // SCAN rather than KEYS so a large keyspace does not block Redis.
        let cursor = '0';
        do {
          const [next, keys] = await this.redis!.scan(cursor, 'MATCH', `${prefix}*`, 'COUNT', 200);
          cursor = next;
          if (keys.length) await this.redis!.del(...keys);
        } while (cursor !== '0');
      } catch {
        // Best effort — the TTL will expire the entry anyway.
      }
    }
  }

  /**
   * Read-through helper: return the cached value or compute, store and return it.
   * Concurrent misses on the same key share one computation.
   */
  async wrap<T>(key: string, ttlSeconds: number, produce: () => Promise<T>): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== null) return cached;

    const running = this.inFlight.get(key);
    if (running) return running as Promise<T>;

    const promise = (async () => {
      // Another waiter may have populated the key between our miss and here.
      const second = await this.get<T>(key);
      if (second !== null) return second;

      const fresh = await produce();
      await this.set(key, fresh, ttlSeconds);
      return fresh;
    })().finally(() => {
      this.inFlight.delete(key);
    });

    this.inFlight.set(key, promise);
    return promise;
  }

  /**
   * Runs `task` at most once across the cluster for the lifetime of the lock.
   *
   * Used by background jobs that every instance would otherwise run in parallel
   * — the attempt sweeper, most importantly, where duplicated work means several
   * processes racing to grade the same abandoned exams.
   *
   * Returns null when the lock was already held. Falls back to a process-local
   * lock when Redis is not configured, which is the correct behaviour for a
   * single-instance deployment.
   */
  async withLock<T>(
    key: string,
    ttlSeconds: number,
    task: () => Promise<T>,
  ): Promise<T | null> {
    const lockKey = `lock:${key}`;
    const token = randomUUID();

    if (!(await this.acquire(lockKey, token, ttlSeconds))) return null;

    try {
      return await task();
    } finally {
      await this.release(lockKey, token);
    }
  }

  private async acquire(lockKey: string, token: string, ttlSeconds: number): Promise<boolean> {
    if (this.isDistributed) {
      try {
        const ok = await this.redis!.set(lockKey, token, 'EX', ttlSeconds, 'NX');
        return ok === 'OK';
      } catch {
        // fall through to the local lock rather than skipping the job entirely
      }
    }

    const held = this.memoryLocks.get(lockKey);
    if (held && held.expiresAt > Date.now()) return false;
    this.memoryLocks.set(lockKey, { token, expiresAt: Date.now() + ttlSeconds * 1000 });
    return true;
  }

  private async release(lockKey: string, token: string): Promise<void> {
    const held = this.memoryLocks.get(lockKey);
    if (held?.token === token) this.memoryLocks.delete(lockKey);

    if (this.isDistributed) {
      try {
        // Compare-and-delete: never release a lock a slow predecessor lost to a
        // timeout and that someone else has since acquired.
        await this.redis!.eval(
          `if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end`,
          1,
          lockKey,
          token,
        );
      } catch {
        // The TTL will clear it.
      }
    }
  }

  private pruneMemory() {
    const now = Date.now();
    for (const [key, entry] of this.memory) {
      if (entry.expiresAt <= now) this.memory.delete(key);
    }
    // Still oversized: drop the oldest inserted entries.
    if (this.memory.size > 500) {
      const excess = this.memory.size - 400;
      let i = 0;
      for (const key of this.memory.keys()) {
        if (i++ >= excess) break;
        this.memory.delete(key);
      }
    }
  }
}
