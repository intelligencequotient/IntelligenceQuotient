import { Controller, Get, Param, ParseUUIDPipe, Query, UseGuards } from '@nestjs/common';
import { ApiPropertyOptional, ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';
import { AnalyticsService } from './analytics.service';
import { SpacedRepetitionService } from './spaced-repetition.service';
import { SupabaseAuthGuard } from '../../common/guards/supabase-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

class RevisionQueryDto {
  @ApiPropertyOptional({ default: 20, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

class CohortQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  batchId?: string;
}

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
  getDueQuestions(@CurrentUser() user, @Query() query: RevisionQueryDto) {
    return this.srsService.getDueQuestions(user.id, query.limit || 20);
  }

  @ApiOperation({ summary: '[Teacher] Get cohort overview analytics' })
  @UseGuards(RolesGuard) @Roles('teacher', 'admin')
  @Get('cohort')
  getCohort(@Query() query: CohortQueryDto) {
    return this.analyticsService.getCohortAnalytics(query.batchId);
  }

  @ApiOperation({ summary: '[Teacher] Get individual student analytics' })
  @UseGuards(RolesGuard) @Roles('teacher', 'admin')
  @Get('student/:id')
  getStudentAnalytics(@Param('id', ParseUUIDPipe) id: string) {
    return this.analyticsService.getStudentAnalyticsForTeacher(id);
  }
}
