import {
  Controller, Get, Post, Patch, Delete, Param, Body,
  Query, UseGuards, UseInterceptors, UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiConsumes } from '@nestjs/swagger';
import { QuestionsService } from './questions.service';
import { PdfProcessorService } from './pdf-processor.service';
import { SupabaseAuthGuard } from '../../common/guards/supabase-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Questions')
@ApiBearerAuth()
@UseGuards(SupabaseAuthGuard, RolesGuard)
@Roles('teacher', 'admin')
@Controller('api/questions')
export class QuestionsController {
  constructor(
    private readonly questionsService: QuestionsService,
    private readonly pdfProcessorService: PdfProcessorService
  ) {}

  @ApiOperation({ summary: 'List all questions with filters' })
  @Get()
  findAll(
    @Query('subject') subject?: string,
    @Query('difficulty') difficulty?: string,
    @Query('q_type') q_type?: string,
    @Query('topic') topic?: string,
    @Query('search') search?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.questionsService.findAll({ subject, difficulty, q_type, topic, search, page, limit });
  }

  @ApiOperation({ summary: 'Create one question manually' })
  @Post()
  create(@Body() body: any, @CurrentUser() user) {
    return this.questionsService.create(body, user.id);
  }

  @ApiOperation({ summary: 'Get one question by ID' })
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.questionsService.findOne(id);
  }

  @ApiOperation({ summary: 'Edit a question' })
  @Patch(':id')
  update(@Param('id') id: string, @Body() body: any) {
    return this.questionsService.update(id, body);
  }

  @ApiOperation({ summary: 'Delete a question (soft delete)' })
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.questionsService.remove(id);
  }

  @ApiOperation({ summary: 'Duplicate a question' })
  @Post(':id/duplicate')
  duplicate(@Param('id') id: string, @CurrentUser() user) {
    return this.questionsService.duplicate(id, user.id);
  }

  @ApiOperation({ summary: 'Upload CSV and get a preview (does not save yet)' })
  @ApiConsumes('multipart/form-data')
  @Post('bulk-upload')
  @UseInterceptors(FileInterceptor('file'))
  bulkUpload(@UploadedFile() file: Express.Multer.File) {
    return this.questionsService.parseCSV(file.buffer);
  }

  @ApiOperation({ summary: 'Confirm CSV preview — saves valid rows to DB' })
  @Post('bulk-confirm')
  bulkConfirm(@Body() body: { rows: any[] }, @CurrentUser() user) {
    return this.questionsService.bulkInsert(body.rows, user.id);
  }

  @ApiOperation({ summary: 'Upload PDF to extract and classify image questions' })
  @ApiConsumes('multipart/form-data')
  @Post('bulk-upload-pdf')
  @UseInterceptors(FileInterceptor('file'))
  bulkUploadPdf(
    @UploadedFile() file: Express.Multer.File,
    @Body('examType') examType: string,
    @CurrentUser() user
  ) {
    // examType should default to 'jee' if not provided
    return this.pdfProcessorService.processPdf(file.buffer, user.id, examType || 'jee');
  }
}
// Trigger hot-reload
