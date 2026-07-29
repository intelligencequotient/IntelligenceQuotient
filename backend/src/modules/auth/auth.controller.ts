import {
  Controller,
  Post,
  Get,
  Body,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { SupabaseAuthGuard } from '../../common/guards/supabase-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Auth')
@Controller('api/auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /**
   * POST /api/auth/login
   * Frontend sends email + password → gets back JWT token + user info
   */
  @ApiOperation({ summary: 'Login with email and password' })
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
  refresh(@Body() body: { refreshToken: string }) {
    return this.authService.refresh(body.refreshToken);
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
