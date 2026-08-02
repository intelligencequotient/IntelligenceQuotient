import { Module } from '@nestjs/common';
import { AttemptsController } from './attempts.controller';
import { AttemptsService } from './attempts.service';
import { AttemptsSweeperService } from './attempts-sweeper.service';
import { AnalyticsModule } from '../analytics/analytics.module';

@Module({
  imports: [AnalyticsModule],
  controllers: [AttemptsController],
  providers: [AttemptsService, AttemptsSweeperService],
  exports: [AttemptsService],
})
export class AttemptsModule {}
