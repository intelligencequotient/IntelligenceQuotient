import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';

/**
 * Small TTL cache used for expensive read-mostly aggregates (leaderboard, cohort stats).
 *
 * Backed by Redis when REDIS_URL is set, otherwise by an in-process Map. The
 * in-memory mode is correct for a single instance; once the API is scaled to
 * more than one process, set REDIS_URL so every instance shares the same view.
 */
@Injectable()
export class CacheService implements OnModuleDestroy {
  private readonly logger = new Logger(CacheService.name);
  private readonly memory = new Map<string, { value: string; expiresAt: number }>();
  private redis: Redis | null = null;
  private redisHealthy = false;

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

  async get<T>(key: string): Promise<T | null> {
    if (this.redis && this.redisHealthy) {
      try {
        const raw = await this.redis.get(key);
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

    if (this.redis && this.redisHealthy) {
      try {
        await this.redis.set(key, raw, 'EX', ttlSeconds);
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

    if (this.redis && this.redisHealthy) {
      try {
        // SCAN rather than KEYS so a large keyspace does not block Redis.
        let cursor = '0';
        do {
          const [next, keys] = await this.redis.scan(cursor, 'MATCH', `${prefix}*`, 'COUNT', 200);
          cursor = next;
          if (keys.length) await this.redis.del(...keys);
        } while (cursor !== '0');
      } catch {
        // Best effort — the TTL will expire the entry anyway.
      }
    }
  }

  /** Read-through helper: return the cached value or compute, store and return it. */
  async wrap<T>(key: string, ttlSeconds: number, produce: () => Promise<T>): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== null) return cached;

    const fresh = await produce();
    await this.set(key, fresh, ttlSeconds);
    return fresh;
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
