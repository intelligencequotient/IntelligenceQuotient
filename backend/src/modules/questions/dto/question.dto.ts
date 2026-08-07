import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

/**
 * Questions used to be written straight from the request body
 * (`insert({ ...body })` / `update(body)`), so a teacher could set any column —
 * `review_status: 'approved'` to skip QA, `is_active`, `created_by`, even `id`.
 * These DTOs are the write contract: with the global ValidationPipe's
 * `whitelist` + `forbidNonWhitelisted`, anything not declared here is rejected.
 */

export const DIFFICULTIES = ['easy', 'medium', 'hard'] as const;
export const QUESTION_TYPES = ['single_correct', 'multi_correct', 'numerical', 'assertion'] as const;

/** Enough for a long LaTeX question; short enough to bound a request body. */
const MAX_QUESTION_TEXT = 8000;
const MAX_OPTIONS = 10;

export class CreateQuestionDto {
  @ApiProperty()
  @IsString()
  @MaxLength(100)
  subject: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  topic?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  subtopic?: string;

  @ApiProperty()
  @IsString()
  @MaxLength(MAX_QUESTION_TEXT)
  question_text: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_OPTIONS)
  @IsString({ each: true })
  @MaxLength(2000, { each: true })
  options?: string[];

  /** `{ index }`, `{ indices: [] }` or `{ value }` — matched by the grader. */
  @ApiProperty({ description: 'One of { index }, { indices: [...] } or { value }' })
  @IsObject()
  correct_answer: Record<string, any>;

  @ApiPropertyOptional({ enum: DIFFICULTIES })
  @IsOptional()
  @IsIn(DIFFICULTIES)
  difficulty?: string;

  @ApiPropertyOptional({ enum: QUESTION_TYPES })
  @IsOptional()
  @IsIn(QUESTION_TYPES)
  q_type?: string;

  @ApiPropertyOptional({ default: 4 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  marks?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  image_url?: string;
}

/** Every field optional — a teacher may correct one line of a question. */
export class UpdateQuestionDto extends PartialType(CreateQuestionDto) {}

/** Corrections a reviewer may apply while approving from the QA queue. */
export class ApproveQuestionDto {
  @ApiPropertyOptional({ type: UpdateQuestionDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => UpdateQuestionDto)
  corrections?: UpdateQuestionDto;
}

/** Bulk operations are capped: an unbounded id list is a free denial of service. */
export const MAX_BULK_IDS = 500;

export class BulkIdsDto {
  @ApiProperty({ type: [String], maxItems: MAX_BULK_IDS })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(MAX_BULK_IDS)
  @IsUUID('4', { each: true })
  ids: string[];
}

/** One previewed CSV row on its way back from the browser to be saved. */
export class CsvRowDto extends CreateQuestionDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  valid?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  errorMsg?: string | null;
}

export const MAX_CSV_ROWS = 2000;

export class BulkConfirmDto {
  @ApiProperty({ type: [CsvRowDto], maxItems: MAX_CSV_ROWS })
  @IsArray()
  @ArrayMaxSize(MAX_CSV_ROWS)
  @ValidateNested({ each: true })
  @Type(() => CsvRowDto)
  rows: CsvRowDto[];
}

export class QuestionQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  subject?: string;

  @ApiPropertyOptional({ enum: DIFFICULTIES })
  @IsOptional()
  @IsIn(DIFFICULTIES)
  difficulty?: string;

  @ApiPropertyOptional({ enum: QUESTION_TYPES })
  @IsOptional()
  @IsIn(QUESTION_TYPES)
  q_type?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  topic?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;

  @ApiPropertyOptional({ enum: ['pending', 'approved', 'rejected', 'all'] })
  @IsOptional()
  @IsIn(['pending', 'approved', 'rejected', 'all'])
  review_status?: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: 20, maximum: 200 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;
}

export class ReviewQueueQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  subject?: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: 20, maximum: 200 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;
}

export class PdfUploadDto {
  @ApiPropertyOptional({ enum: ['jee', 'neet', 'cbse', 'general'], default: 'jee' })
  @IsOptional()
  @IsIn(['jee', 'neet', 'cbse', 'general'])
  examType?: string;
}
