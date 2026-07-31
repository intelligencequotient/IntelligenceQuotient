import { Controller, Get, Post, Delete, Param, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { LecturesService } from './lectures.service';
import { SupabaseAuthGuard } from '../../common/guards/supabase-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Lectures')
@ApiBearerAuth()
@UseGuards(SupabaseAuthGuard)
@Controller('api/lectures')
export class LecturesController {
  constructor(private readonly lecturesService: LecturesService) {}

  @ApiOperation({ summary: 'List lectures (filterable by subject/topic)' })
  @Get()
  findAll(@Query('subject') subject?: string, @Query('topic') topic?: string) {
    return this.lecturesService.findAll({ subject, topic });
  }

  @ApiOperation({ summary: '[Teacher] Add a lecture' })
  @UseGuards(RolesGuard) @Roles('teacher', 'admin')
  @Post()
  create(@Body() body: any, @CurrentUser() user) {
    return this.lecturesService.create(body, user.id);
  }

  @ApiOperation({ summary: '[Teacher] Delete a lecture' })
  @UseGuards(RolesGuard) @Roles('teacher', 'admin')
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.lecturesService.remove(id);
  }

  @ApiOperation({ summary: 'Get ordered syllabus for a subject' })
  @Get('/syllabus/:subject')
  getSyllabus(@Param('subject') subject: string) {
    return this.lecturesService.getSyllabus(subject);
  }
}
