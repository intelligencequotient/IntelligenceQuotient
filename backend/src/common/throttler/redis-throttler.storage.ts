import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ThrottlerStorage, ThrottlerStorageService } from '@nestjs/throttler';
// Not re-exported from the package root, only from its own module.
import type { ThrottlerStorageRecord } from '@nestjs/throttler/dist/throttler-storage-record.interface';
import Redis from 'ioredis';

/**
 * Redis-backed throttler storage.
 *
 * The default storage is a Map inside one process. Run three API replicas and
 * the effective limit silently becomes three times what was configured, and a
 * client bouncing between replicas is metered independently on each. This keeps
 * the counters in Redis so the limit means what it says however many instances
 * are running.
 *
 * When REDIS_URL is unset — single-instance and local development — it delegates
 * to Nest's in-memory storage, which is correct for that topology. If Redis
 * fails at runtime it falls back to memory rather than rejecting traffic: a
 * cache outage must not become an availability outage during an exam.
 */
@Injectable()
export class RedisThrottlerStorage implements ThrottlerStorage, OnModuleDestroy {
  private readonly logger = new Logger(RedisThrottlerStorage.name);
  private readonly memory = new ThrottlerStorageService();
  private redis: Redis | null = null;
  private healthy = false;

  constructor() {
    const url = process.env.REDIS_URL;
    if (!url) {
      this.logger.log('REDIS_URL not set — throttling counters are per-instance.');
      return;
    }

    try {
      this.redis = new Redis(url, {
        maxRetriesPerRequest: 1,
        retryStrategy: (times) => (times > 5 ? null : Math.min(times * 200, 2000)),
        // A separate logical DB would be cleaner, but the key prefix is enough
        // to keep throttle counters out of the cache's way.
        keyPrefix: 'throttle:',
      });
      this.redis.on('ready', () => {
        this.healthy = true;
        this.logger.log('Redis throttler storage connected.');
      });
      this.redis.on('error', (e) => {
        if (this.healthy) this.logger.warn(`Redis throttler error: ${e.message}`);
        this.healthy = false;
      });
      this.redis.on('end', () => {
        this.healthy = false;
      });
    } catch (e: any) {
      this.logger.warn(`Redis throttler init failed (${e?.message}) — using memory.`);
      this.redis = null;
    }
  }

  async onModuleDestroy() {
    this.memory.onApplicationShutdown?.();
    if (this.redis) {
      try {
        await this.redis.quit();
      } catch {
        this.redis.disconnect();
      }
    }
  }

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): Promise<ThrottlerStorageRecord> {
    if (!this.redis || !this.healthy) {
      return this.memory.increment(key, ttl, limit, blockDuration, throttlerName);
    }

    try {
      return await this.incrementInRedis(key, ttl, limit, blockDuration, throttlerName);
    } catch (e: any) {
      this.logger.warn(`Redis throttler read failed (${e?.message}) — using memory this call.`);
      return this.memory.increment(key, ttl, limit, blockDuration, throttlerName);
    }
  }

  /**
   * Counter and block flag are maintained in one round-trip.
   *
   * `ttl` and `blockDuration` arrive in milliseconds; Redis PEXPIRE and PTTL
   * work in the same unit, so no conversion is needed.
   */
  private async incrementInRedis(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): Promise<ThrottlerStorageRecord> {
    const hitsKey = `${throttlerName}:${key}`;
    const blockKey = `${throttlerName}:${key}:blocked`;

    const script = `
      local blockTtl = redis.call('PTTL', KEYS[2])
      if blockTtl > 0 then
        return { redis.call('GET', KEYS[1]) or ARGV[2], 0, 1, blockTtl }
      end

      local hits = redis.call('INCR', KEYS[1])
      if hits == 1 then
        redis.call('PEXPIRE', KEYS[1], ARGV[1])
      end
      local ttlLeft = redis.call('PTTL', KEYS[1])

      if hits > tonumber(ARGV[2]) then
        redis.call('SET', KEYS[2], 1, 'PX', ARGV[3])
        return { hits, ttlLeft, 1, tonumber(ARGV[3]) }
      end

      return { hits, ttlLeft, 0, 0 }
    `;

    const [totalHits, timeToExpire, isBlocked, timeToBlockExpire] = (await this.redis!.eval(
      script,
      2,
      hitsKey,
      blockKey,
      String(ttl),
      String(limit),
      String(blockDuration > 0 ? blockDuration : ttl),
    )) as [number, number, number, number];

    return {
      totalHits: Number(totalHits) || 0,
      // Nest expects seconds remaining, Redis gave us milliseconds.
      timeToExpire: Math.ceil(Math.max(0, Number(timeToExpire)) / 1000),
      isBlocked: Number(isBlocked) === 1,
      timeToBlockExpire: Math.ceil(Math.max(0, Number(timeToBlockExpire)) / 1000),
    };
  }
}
