import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

/** Palette states the exam UI tracks per question. */
export const ANSWER_STATUSES = [
  'not_visited',
  'not_answered',
  'answered',
  'marked',
  'answered_marked',
] as const;

/**
 * A single exam answer.
 *
 * `selected_answer` is intentionally free-form — it carries `{ index }`,
 * `{ indices: [...] }` or `{ value }` depending on the question type — but it is
 * only ever compared against the stored key, never interpolated anywhere.
 */
export class SaveAnswerDto {
  @ApiProperty()
  @IsUUID()
  question_id: string;

  @ApiPropertyOptional({ description: 'One of { index }, { indices: [...] } or { value }' })
  @IsOptional()
  selected_answer?: any;

  @ApiPropertyOptional({ enum: ANSWER_STATUSES })
  @IsOptional()
  @IsIn(ANSWER_STATUSES)
  status?: string;

  /** Clamped server-side too; a whole exam is bounded by its duration anyway. */
  @ApiProperty({ minimum: 0 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(86_400)
  time_spent_seconds: number;
}

export class ToggleFlagDto {
  @ApiProperty()
  @IsUUID()
  question_id: string;

  @ApiProperty()
  @IsBoolean()
  flagged: boolean;
}

export class LogViolationDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(64)
  type?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  detail?: string;
}

export class SubmitAttemptDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  autoSubmitted?: boolean;
}
