import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { BatchesService } from './batches.service';
import { SupabaseAuthGuard } from '../../common/guards/supabase-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AddStudentDto, CreateBatchDto, UpdateBatchDto } from './dto/batch.dto';

@ApiTags('Batches')
@ApiBearerAuth()
@UseGuards(SupabaseAuthGuard, RolesGuard)
@Roles('teacher', 'admin')
@Controller('api/batches')
export class BatchesController {
  constructor(private readonly batchesService: BatchesService) {}

  @ApiOperation({ summary: 'List batches you own (admins see all)' })
  @Get()
  findAll(@CurrentUser() user) {
    return this.batchesService.findAll(user);
  }

  @ApiOperation({ summary: 'Create a new batch' })
  @Post()
  create(@Body() body: CreateBatchDto, @CurrentUser() user) {
    return this.batchesService.create(body, user);
  }

  @ApiOperation({ summary: 'Get one batch with its students' })
  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user) {
    return this.batchesService.findOne(id, user);
  }

  @ApiOperation({ summary: 'Update batch name or subject focus' })
  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateBatchDto,
    @CurrentUser() user,
  ) {
    return this.batchesService.update(id, body, user);
  }

  @ApiOperation({ summary: 'Delete a batch' })
  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user) {
    return this.batchesService.remove(id, user);
  }

  @ApiOperation({ summary: 'List students in a batch' })
  @Get(':id/students')
  getStudents(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user) {
    return this.batchesService.getStudents(id, user);
  }

  @ApiOperation({ summary: 'Add a student to a batch' })
  @Post(':id/students')
  addStudent(
    @Param('id', ParseUUIDPipe) batchId: string,
    @Body() body: AddStudentDto,
    @CurrentUser() user,
  ) {
    return this.batchesService.addStudent(batchId, body.student_id, user);
  }

  @ApiOperation({ summary: 'Remove a student from a batch' })
  @Delete(':id/students/:studentId')
  removeStudent(
    @Param('id', ParseUUIDPipe) batchId: string,
    @Param('studentId', ParseUUIDPipe) studentId: string,
    @CurrentUser() user,
  ) {
    return this.batchesService.removeStudent(batchId, studentId, user);
  }
}
