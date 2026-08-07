import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiConsumes } from '@nestjs/swagger';
import { QuestionsService } from './questions.service';
import { PdfProcessorService } from './pdf-processor.service';
import { SupabaseAuthGuard } from '../../common/guards/supabase-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import {
  ApproveQuestionDto,
  BulkConfirmDto,
  BulkIdsDto,
  CreateQuestionDto,
  MAX_CSV_ROWS,
  PdfUploadDto,
  QuestionQueryDto,
  ReviewQueueQueryDto,
  UpdateQuestionDto,
} from './dto/question.dto';

/**
 * Upload ceilings. Multer buffers the whole file in memory, so without a limit
 * a single request could exhaust the instance's heap — and with 1000 students
 * on the same box, that is everybody's outage, not just the uploader's.
 */
const MAX_CSV_BYTES = 5 * 1024 * 1024;
const MAX_PDF_BYTES = 50 * 1024 * 1024;

const CSV_MIME = ['text/csv', 'application/vnd.ms-excel', 'text/plain', 'application/csv'];
const PDF_MIME = ['application/pdf'];

/** Multer rejects on the declared type; the service re-checks the actual bytes. */
const mimeFilter =
  (allowed: string[], label: string) =>
  (_req: any, file: Express.Multer.File, cb: (e: Error | null, ok: boolean) => void) => {
    if (!allowed.includes(file.mimetype)) {
      return cb(new BadRequestException(`Expected ${label}.`), false);
    }
    cb(null, true);
  };

@ApiTags('Questions')
@ApiBearerAuth()
@UseGuards(SupabaseAuthGuard, RolesGuard)
@Roles('teacher', 'admin')
@Controller('api/questions')
export class QuestionsController {
  constructor(
    private readonly questionsService: QuestionsService,
    private readonly pdfProcessorService: PdfProcessorService,
  ) {}

  @ApiOperation({ summary: 'List all questions with filters (server-side pagination)' })
  @Get()
  findAll(@CurrentUser() user: any, @Query() query: QuestionQueryDto) {
    return this.questionsService.findAll(query, user);
  }

  @ApiOperation({ summary: 'QA queue — AI-extracted questions awaiting verification' })
  @Get('review-queue')
  getReviewQueue(@CurrentUser() user: any, @Query() query: ReviewQueueQueryDto) {
    return this.questionsService.getReviewQueue(query, user);
  }

  @ApiOperation({ summary: 'Create one question manually' })
  @Post()
  create(@Body() body: CreateQuestionDto, @CurrentUser() user) {
    return this.questionsService.create(body, user);
  }

  @ApiOperation({ summary: 'Approve many questions at once' })
  @Post('bulk-approve')
  bulkApprove(@Body() body: BulkIdsDto, @CurrentUser() user) {
    return this.questionsService.bulkApprove(body.ids, user);
  }

  @ApiOperation({ summary: 'Soft-delete many questions at once' })
  @Post('bulk-delete')
  bulkDelete(@Body() body: BulkIdsDto, @CurrentUser() user) {
    return this.questionsService.bulkRemove(body.ids, user);
  }

  @ApiOperation({ summary: 'Upload CSV and get a preview (does not save yet)' })
  @ApiConsumes('multipart/form-data')
  @Post('bulk-upload')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MAX_CSV_BYTES, files: 1 },
      fileFilter: mimeFilter(CSV_MIME, 'a CSV file'),
    }),
  )
  bulkUpload(@UploadedFile() file: Express.Multer.File) {
    if (!file?.buffer?.length) throw new BadRequestException('No CSV file provided.');
    return this.questionsService.parseCSV(file.buffer, MAX_CSV_ROWS);
  }

  @ApiOperation({ summary: 'Confirm CSV preview — saves valid rows to DB' })
  @Post('bulk-confirm')
  bulkConfirm(@Body() body: BulkConfirmDto, @CurrentUser() user) {
    return this.questionsService.bulkInsert(body.rows, user);
  }

  @ApiOperation({ summary: 'Upload PDF to extract and classify image questions' })
  @ApiConsumes('multipart/form-data')
  @Post('bulk-upload-pdf')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MAX_PDF_BYTES, files: 1 },
      fileFilter: mimeFilter(PDF_MIME, 'a PDF file'),
    }),
  )
  bulkUploadPdf(
    @UploadedFile() file: Express.Multer.File,
    @Body() body: PdfUploadDto,
    @CurrentUser() user,
  ) {
    if (!file?.buffer?.length) throw new BadRequestException('No PDF file provided.');
    return this.pdfProcessorService.processPdf(file.buffer, user.id, body.examType || 'jee');
  }

  // ── Parameterised routes last, so they cannot shadow the literals above ─────

  @ApiOperation({ summary: 'Get one question by ID' })
  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user) {
    return this.questionsService.findOne(id, user);
  }

  @ApiOperation({ summary: 'Edit a question' })
  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateQuestionDto,
    @CurrentUser() user,
  ) {
    return this.questionsService.update(id, body, user);
  }

  @ApiOperation({ summary: 'Delete a question (soft delete)' })
  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user) {
    return this.questionsService.remove(id, user);
  }

  @ApiOperation({ summary: 'Duplicate a question' })
  @Post(':id/duplicate')
  duplicate(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user) {
    return this.questionsService.duplicate(id, user);
  }

  @ApiOperation({ summary: 'Approve a question from the QA queue (optionally with corrections)' })
  @Patch(':id/approve')
  approve(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: ApproveQuestionDto,
    @CurrentUser() user,
  ) {
    return this.questionsService.approve(id, user, body?.corrections);
  }

  @ApiOperation({ summary: 'Reject a question from the QA queue' })
  @Patch(':id/reject')
  reject(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user) {
    return this.questionsService.reject(id, user);
  }
}
