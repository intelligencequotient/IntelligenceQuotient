import { Module } from '@nestjs/common';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';
import { SpacedRepetitionService } from './spaced-repetition.service';

@Module({
  controllers: [AnalyticsController],
  providers: [AnalyticsService, SpacedRepetitionService],
  // AttemptsModule pulls SpacedRepetitionService in to update state after grading.
  exports: [SpacedRepetitionService],
})
export class AnalyticsModule {}
