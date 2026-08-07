import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, ThrottlerStorage } from '@nestjs/throttler';
import { CacheModule } from './common/cache/cache.module';
import { HealthController } from './common/health/health.controller';
import { RedisThrottlerStorage } from './common/throttler/redis-throttler.storage';
import { UserThrottlerGuard } from './common/throttler/user-throttler.guard';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { BatchesModule } from './modules/batches/batches.module';
import { QuestionsModule } from './modules/questions/questions.module';
import { TestsModule } from './modules/tests/tests.module';
import { AttemptsModule } from './modules/attempts/attempts.module';
import { DoubtsModule } from './modules/doubts/doubts.module';
import { LecturesModule } from './modules/lectures/lectures.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { LeaderboardModule } from './modules/leaderboard/leaderboard.module';

/**
 * Default rate limit.
 *
 * Sized for an exam: a student saving an answer, toggling a flag and polling
 * their timer generates a steady trickle, and 300/minute leaves ample headroom
 * without letting a scripted client hammer the API. Counters are per user (see
 * UserThrottlerGuard), so a whole hall behind one NAT address no longer shares
 * a single bucket, and they live in Redis when REDIS_URL is set so the limit
 * survives horizontal scaling.
 */
const DEFAULT_THROTTLE_TTL_MS = 60_000;
const DEFAULT_THROTTLE_LIMIT = Number(process.env.THROTTLE_LIMIT) || 300;

@Module({
  imports: [
    // Load .env file globally
    ConfigModule.forRoot({ isGlobal: true }),

    ThrottlerModule.forRoot({
      throttlers: [{ ttl: DEFAULT_THROTTLE_TTL_MS, limit: DEFAULT_THROTTLE_LIMIT }],
    }),

    // Shared infrastructure (global — Redis-backed when REDIS_URL is set)
    CacheModule,

    // Feature modules
    AuthModule,
    UsersModule,
    BatchesModule,
    QuestionsModule,
    TestsModule,
    AttemptsModule,
    DoubtsModule,
    LecturesModule,
    AnalyticsModule,
    LeaderboardModule,
  ],
  controllers: [HealthController],
  providers: [
    // ThrottlerModule only supplies configuration — without a guard the limits
    // were never actually enforced on any route.
    { provide: APP_GUARD, useClass: UserThrottlerGuard },
    // Replaces the default in-process Map so limits hold across replicas.
    { provide: ThrottlerStorage, useClass: RedisThrottlerStorage },
  ],
})
export class AppModule {}
