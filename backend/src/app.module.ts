import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { CacheModule } from './common/cache/cache.module';
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

@Module({
  imports: [
    // Load .env file globally
    ConfigModule.forRoot({ isGlobal: true }),

    // Rate limiting: max 100 requests per minute per IP
    ThrottlerModule.forRoot([{
      ttl: 60000,
      limit: 100,
    }]),

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
  providers: [
    // ThrottlerModule only supplies configuration — without this the limits
    // were never actually enforced on any route.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
