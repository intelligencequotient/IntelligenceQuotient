import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
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
})
export class AppModule {}
