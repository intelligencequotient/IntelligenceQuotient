import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AnalyticsService } from './analytics.service';
import { SupabaseAuthGuard } from '../../common/guards/supabase-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Analytics')
@ApiBearerAuth()
@UseGuards(SupabaseAuthGuard)
@Controller('api/analytics')
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @ApiOperation({ summary: '[Student] Get own analytics — for AnalyticsHub page' })
  @UseGuards(RolesGuard) @Roles('student')
  @Get('me')
  getMyAnalytics(@CurrentUser() user) {
    return this.analyticsService.getStudentAnalytics(user.id);
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
