import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

/**
 * Passwords guard a graded exam account, so the bar is a little above Supabase's
 * six-character default: length plus a mix, checked wherever a password is set.
 */
export const MIN_PASSWORD_LENGTH = 10;

const PASSWORD_RULE = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/;
const PASSWORD_MESSAGE =
  'Password must be at least 10 characters and include an uppercase letter, a lowercase letter and a digit.';

export class UpdateProfileDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  full_name: string;
}

export class ChangePasswordDto {
  /**
   * Required. It used to be optional, which meant anyone holding a live access
   * token — a shared machine, a stolen bearer, an XSS payload — could set a new
   * password without knowing the old one and take the account over outright.
   */
  @ApiProperty({ description: 'Your existing password. Required.' })
  @IsString()
  @MinLength(1, { message: 'Your current password is required.' })
  currentPassword: string;

  @ApiProperty()
  @IsString()
  @MinLength(MIN_PASSWORD_LENGTH, { message: PASSWORD_MESSAGE })
  @MaxLength(128)
  @Matches(PASSWORD_RULE, { message: PASSWORD_MESSAGE })
  newPassword: string;
}

export class AdminCreateUserDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  full_name: string;

  @ApiProperty()
  @IsEmail({}, { message: 'Please provide a valid email address' })
  @MaxLength(200)
  email: string;

  @ApiProperty()
  @IsString()
  @MinLength(MIN_PASSWORD_LENGTH, { message: PASSWORD_MESSAGE })
  @MaxLength(128)
  @Matches(PASSWORD_RULE, { message: PASSWORD_MESSAGE })
  password: string;

  @ApiProperty({ enum: ['student', 'teacher'] })
  @IsIn(['student', 'teacher'], { message: 'Role must be student or teacher.' })
  role: 'student' | 'teacher';

  @ApiPropertyOptional({ description: 'Subject a teacher is scoped to; "All" for unrestricted.' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  subject?: string;
}

export class AdminResetPasswordDto {
  @ApiProperty()
  @IsString()
  @MinLength(MIN_PASSWORD_LENGTH, { message: PASSWORD_MESSAGE })
  @MaxLength(128)
  @Matches(PASSWORD_RULE, { message: PASSWORD_MESSAGE })
  newPassword: string;
}

/** Shared pagination for the staff-facing user lists. */
export class UserListQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;

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

export class StudentListQueryDto extends UserListQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  batchId?: string;
}

export class AdminUserListQueryDto extends UserListQueryDto {
  @ApiPropertyOptional({ enum: ['student', 'teacher', 'admin', 'all'] })
  @IsOptional()
  @IsIn(['student', 'teacher', 'admin', 'all'])
  role?: string;
}
