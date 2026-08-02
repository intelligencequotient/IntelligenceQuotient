import {
  Controller,
  Post,
  Get,
  Body,
  Req,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { ForgotPasswordDto, RefreshDto, ResetPasswordDto } from './dto/auth.dto';
import { SupabaseAuthGuard } from '../../common/guards/supabase-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Auth')
@Controller('api/auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /**
   * POST /api/auth/login
   * Frontend sends email + password → gets back JWT token + user info
   *
   * Throttled harder than the global limit: credential stuffing is the reason
   * this endpoint exists as a target.
   */
  @ApiOperation({ summary: 'Login with email and password' })
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('login')
  login(@Body() loginDto: LoginDto) {
    return this.authService.login(loginDto.email, loginDto.password);
  }

  /**
   * POST /api/auth/refresh
   * Frontend sends refresh token → gets back new access token
   */
  @ApiOperation({ summary: 'Refresh access token' })
  @Post('refresh')
  refresh(@Body() body: RefreshDto) {
    return this.authService.refresh(body.refreshToken);
  }

  /**
   * POST /api/auth/logout
   * Revokes the current session server-side.
   */
  @ApiOperation({ summary: 'Log out and revoke the current session' })
  @ApiBearerAuth()
  @UseGuards(SupabaseAuthGuard)
  @HttpCode(HttpStatus.OK)
  @Post('logout')
  logout(@Req() req: any) {
    const header: string = req.headers['authorization'] || '';
    return this.authService.logout(header.replace(/^Bearer\s+/i, '').trim());
  }

  /**
   * POST /api/auth/forgot-password
   * Emails a recovery link. Response is identical whether or not the account exists.
   */
  @ApiOperation({ summary: 'Request a password reset email' })
  @Throttle({ default: { limit: 5, ttl: 300_000 } })
  @HttpCode(HttpStatus.OK)
  @Post('forgot-password')
  forgotPassword(@Body() body: ForgotPasswordDto) {
    return this.authService.forgotPassword(body.email);
  }

  /**
   * POST /api/auth/reset-password
   * Consumes the token from the recovery email and sets a new password.
   */
  @ApiOperation({ summary: 'Complete a password reset' })
  @Throttle({ default: { limit: 10, ttl: 300_000 } })
  @HttpCode(HttpStatus.OK)
  @Post('reset-password')
  resetPassword(@Body() body: ResetPasswordDto) {
    return this.authService.resetPassword(body.accessToken, body.newPassword);
  }

  /**
   * GET /api/auth/me
   * Returns the profile of the currently logged-in user
   */
  @ApiOperation({ summary: 'Get current logged-in user profile' })
  @ApiBearerAuth()
  @UseGuards(SupabaseAuthGuard)
  @Get('me')
  getMe(@CurrentUser() user) {
    return this.authService.getMe(user.id, user.subject);
  }
}
