import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { LecturesService } from './lectures.service';
import { SupabaseAuthGuard } from '../../common/guards/supabase-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CreateLectureDto, LectureQueryDto } from './dto/lecture.dto';

@ApiTags('Lectures')
@ApiBearerAuth()
@UseGuards(SupabaseAuthGuard)
@Controller('api/lectures')
export class LecturesController {
  constructor(private readonly lecturesService: LecturesService) {}

  @ApiOperation({ summary: 'List lectures (filterable by subject/topic)' })
  @Get()
  findAll(@Query() query: LectureQueryDto) {
    return this.lecturesService.findAll(query);
  }

  @ApiOperation({ summary: 'Get ordered syllabus for a subject' })
  @Get('syllabus/:subject')
  getSyllabus(@Param('subject') subject: string) {
    return this.lecturesService.getSyllabus(subject);
  }

  @ApiOperation({ summary: '[Teacher] Add a lecture' })
  @UseGuards(RolesGuard) @Roles('teacher', 'admin')
  @Post()
  create(@Body() body: CreateLectureDto, @CurrentUser() user) {
    return this.lecturesService.create(body, user.id);
  }

  @ApiOperation({ summary: '[Teacher] Delete a lecture you uploaded' })
  @UseGuards(RolesGuard) @Roles('teacher', 'admin')
  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user) {
    return this.lecturesService.remove(id, user);
  }
}
