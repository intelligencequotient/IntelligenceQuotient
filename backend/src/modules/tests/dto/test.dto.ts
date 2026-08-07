import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

/**
 * Write contracts for tests.
 *
 * These endpoints previously took `body: any` and spread it into the update, so
 * a teacher could rewrite `created_by`, flip `status` to published without going
 * through `publish`, or set `total_marks` to any number they liked.
 */

/** A full JEE paper is 90 questions; the ceiling leaves room without being unbounded. */
export const MAX_QUESTIONS_PER_TEST = 300;
export const MAX_BATCHES_PER_ASSIGNMENT = 50;

export class CreateTestDto {
  @ApiProperty()
  @IsString()
  @MaxLength(200)
  title: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  subject?: string;

  /**
   * Test kind, or a paper pattern.
   *
   * The column behind this is the `public.test_type` enum
   * (quiz | mock_test | assignment | exam), but the admin console has always
   * sent a *pattern* here ('jee_main', 'custom'). The service accepts either and
   * splits them; validation stays permissive so the existing console keeps
   * working, and an unrecognised value comes back as a 400 naming the options.
   */
  @ApiPropertyOptional({
    example: 'jee_main',
    description: 'quiz | mock_test | assignment | exam, or a pattern: jee_main | jee_advanced | neet | custom',
  })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  t_type?: string;

  /** Explicit paper pattern. Preferred over overloading `t_type`. */
  @ApiPropertyOptional({ enum: ['jee_main', 'jee_advanced', 'neet', 'custom'] })
  @IsOptional()
  @IsIn(['jee_main', 'jee_advanced', 'neet', 'custom'])
  paper_pattern?: string;

  @ApiProperty({ minimum: 1, maximum: 600 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(600)
  duration_minutes: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  negative_marking?: boolean;

  @ApiPropertyOptional({ minimum: 0, maximum: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(10)
  negative_marks?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  instructions?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsUUID('4', { each: true })
  teacher_ids?: string[];

  /**
   * Accepted but ignored.
   *
   * The UI computes a running total while a paper is being built and posts it
   * along with everything else. The stored value is always recomputed from the
   * questions actually linked to the test — a client-supplied mark total is how
   * you end up with a scoreboard out of a denominator nobody can reproduce — but
   * rejecting the field outright would 400 every save the existing UI makes.
   */
  @ApiPropertyOptional({ description: 'Ignored — derived from the linked questions.' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  total_marks?: number;

  /**
   * Only honoured by POST /constructor, which builds and publishes in one go.
   * POST /tests always creates a draft; the field is accepted there so the
   * existing admin form keeps working, and ignored.
   */
  @ApiPropertyOptional({ enum: ['draft', 'published'], default: 'draft' })
  @IsOptional()
  @IsIn(['draft', 'published'])
  status?: 'draft' | 'published';
}

/**
 * `status` is deliberately absent: publishing goes through PATCH /:id/publish so
 * the transition stays auditable, and `total_marks` is derived from the paper.
 */
export class UpdateTestDto extends PartialType(CreateTestDto) {}

export class TestQuestionsDto {
  @ApiProperty({ type: [String], maxItems: MAX_QUESTIONS_PER_TEST })
  @IsArray()
  @ArrayMaxSize(MAX_QUESTIONS_PER_TEST)
  @IsUUID('4', { each: true })
  question_ids: string[];
}

export class AssignTeachersDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMaxSize(50)
  @IsUUID('4', { each: true })
  teacher_ids: string[];
}

export class AssignTestDto {
  @ApiProperty({ type: [String], maxItems: MAX_BATCHES_PER_ASSIGNMENT })
  @IsArray()
  @ArrayMaxSize(MAX_BATCHES_PER_ASSIGNMENT)
  @IsUUID('4', { each: true })
  batch_ids: string[];

  @ApiPropertyOptional({ description: 'ISO timestamp the exam opens' })
  @IsOptional()
  @IsISO8601()
  scheduled_start?: string;

  @ApiPropertyOptional({ description: 'ISO timestamp the exam closes' })
  @IsOptional()
  @IsISO8601()
  scheduled_end?: string;
}

/** Create test + link questions + assign batches in one call (TestConstructor). */
export class SaveFullTestDto extends CreateTestDto {
  @ApiPropertyOptional({ type: [String], maxItems: MAX_QUESTIONS_PER_TEST })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_QUESTIONS_PER_TEST)
  @IsUUID('4', { each: true })
  question_ids?: string[];

  @ApiPropertyOptional({ type: [String], maxItems: MAX_BATCHES_PER_ASSIGNMENT })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_BATCHES_PER_ASSIGNMENT)
  @IsUUID('4', { each: true })
  batch_ids?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsISO8601()
  scheduled_start?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsISO8601()
  scheduled_end?: string;
}

export class TestListQueryDto {
  @ApiPropertyOptional({ enum: ['draft', 'published', 'archived'] })
  @IsOptional()
  @IsIn(['draft', 'published', 'archived'])
  status?: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: 50, maximum: 200 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;
}
