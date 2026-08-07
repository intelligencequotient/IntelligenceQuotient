import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

/** Page size for the student's own doubt history. */
export class DoubtHistoryQueryDto {
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

/** Hard cap on a single chat message, enforced on both REST and WebSocket paths. */
export const MAX_MESSAGE_LENGTH = 4000;

export class CreateDoubtDto {
  @ApiPropertyOptional({ description: 'Question the doubt refers to' })
  @IsOptional()
  @IsUUID()
  question_id?: string;

  @ApiPropertyOptional({ description: 'Attempt the doubt was raised from (must belong to the student)' })
  @IsOptional()
  @IsUUID()
  attempt_id?: string;

  @ApiPropertyOptional({ description: 'Short text snippet describing the doubt' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  snippet?: string;

  @ApiPropertyOptional({ description: 'Teacher to assign the doubt to; omit to queue it as pending' })
  @IsOptional()
  @IsUUID()
  teacher_id?: string;
}

export class SendMessageDto {
  @ApiProperty({ maxLength: MAX_MESSAGE_LENGTH })
  @IsString()
  @Length(1, MAX_MESSAGE_LENGTH)
  message_text: string;
}

export class DoubtQueueQueryDto {
  @ApiPropertyOptional({ enum: ['pending', 'accepted', 'resolved'] })
  @IsOptional()
  @IsIn(['pending', 'accepted', 'resolved'])
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
