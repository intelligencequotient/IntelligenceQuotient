import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AnalyticsService } from './analytics.service';
import { SpacedRepetitionService } from './spaced-repetition.service';
import { SupabaseAuthGuard } from '../../common/guards/supabase-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Analytics')
@ApiBearerAuth()
@UseGuards(SupabaseAuthGuard)
@Controller('api/analytics')
export class AnalyticsController {
  constructor(
    private readonly analyticsService: AnalyticsService,
    private readonly srsService: SpacedRepetitionService,
  ) {}

  @ApiOperation({ summary: '[Student] Get own analytics — for AnalyticsHub page' })
  @UseGuards(RolesGuard) @Roles('student')
  @Get('me')
  getMyAnalytics(@CurrentUser() user) {
    return this.analyticsService.getStudentAnalytics(user.id);
  }

  @ApiOperation({ summary: '[Student] Questions due for spaced-repetition revision' })
  @UseGuards(RolesGuard) @Roles('student')
  @Get('revision-due')
  getDueQuestions(@CurrentUser() user, @Query('limit') limit?: number) {
    return this.srsService.getDueQuestions(user.id, Number(limit) || 20);
  }

  @ApiOperation({ summary: '[Teacher] Get cohort overview analytics' })
  @UseGuards(RolesGuard) @Roles('teacher', 'admin')
  @Get('cohort')
  getCohort(@Query('batchId') batchId?: string) {
    return this.analyticsService.getCohortAnalytics(batchId);
  }

  @ApiOperation({ summary: '[Teacher] Get individual student analytics' })
  @UseGuards(RolesGuard) @Roles('teacher', 'admin')
  @Get('student/:id')
  getStudentAnalytics(@Param('id') id: string) {
    return this.analyticsService.getStudentAnalyticsForTeacher(id);
  }
}
