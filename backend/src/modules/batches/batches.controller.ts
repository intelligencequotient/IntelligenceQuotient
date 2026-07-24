import { Controller, Get, Post, Patch, Delete, Param, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { BatchesService } from './batches.service';
import { SupabaseAuthGuard } from '../../common/guards/supabase-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Batches')
@ApiBearerAuth()
@UseGuards(SupabaseAuthGuard, RolesGuard)
@Roles('teacher', 'admin')
@Controller('api/batches')
export class BatchesController {
  constructor(private readonly batchesService: BatchesService) {}

  @ApiOperation({ summary: 'List all batches created by this teacher' })
  @Get()
  findAll(@CurrentUser() user) {
    return this.batchesService.findAll(user.id);
  }

  @ApiOperation({ summary: 'Create a new batch' })
  @Post()
  create(@Body() body: { name: string; subject_focus?: string }, @CurrentUser() user) {
    return this.batchesService.create(body, user.id);
  }

  @ApiOperation({ summary: 'Get one batch with its students' })
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.batchesService.findOne(id);
  }

  @ApiOperation({ summary: 'Update batch name or subject focus' })
  @Patch(':id')
  update(@Param('id') id: string, @Body() body: { name?: string; subject_focus?: string }) {
    return this.batchesService.update(id, body);
  }

  @ApiOperation({ summary: 'Delete a batch' })
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.batchesService.remove(id);
  }

  @ApiOperation({ summary: 'List students in a batch' })
  @Get(':id/students')
  getStudents(@Param('id') id: string) {
    return this.batchesService.getStudents(id);
  }

  @ApiOperation({ summary: 'Add a student to a batch' })
  @Post(':id/students')
  addStudent(@Param('id') batchId: string, @Body() body: { student_id: string }) {
    return this.batchesService.addStudent(batchId, body.student_id);
  }

  @ApiOperation({ summary: 'Remove a student from a batch' })
  @Delete(':id/students/:studentId')
  removeStudent(@Param('id') batchId: string, @Param('studentId') studentId: string) {
    return this.batchesService.removeStudent(batchId, studentId);
  }
}
