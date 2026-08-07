import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

/**
 * Batch writes previously took a loosely typed object straight into
 * `update(body)`, which meant `created_by` was as writable as `name` — a teacher
 * could reassign someone else's batch to themselves.
 */
export class CreateBatchDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  subject_focus?: string;
}

export class UpdateBatchDto extends PartialType(CreateBatchDto) {}

export class AddStudentDto {
  @ApiProperty()
  @IsUUID()
  student_id: string;
}
