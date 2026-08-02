import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class RefreshDto {
  @ApiProperty()
  @IsString()
  refreshToken: string;
}

export class LogoutDto {
  @ApiPropertyOptional({ description: 'Omit to revoke only the current session.' })
  @IsOptional()
  @IsString()
  refreshToken?: string;
}

export class ForgotPasswordDto {
  @ApiProperty({ example: 'student@edu.com' })
  @IsEmail({}, { message: 'Please provide a valid email address' })
  email: string;
}

export class ResetPasswordDto {
  @ApiProperty({ description: 'Access token from the password-recovery email link.' })
  @IsString()
  accessToken: string;

  @ApiProperty({ example: 'my-new-password' })
  @IsString()
  @MinLength(6, { message: 'Password must be at least 6 characters' })
  newPassword: string;
}
