import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { supabase } from '../../config/supabase.config';

/**
 * SupabaseAuthGuard
 * Validates the Bearer JWT token on every protected route.
 * Attaches the full user object (id, email, role, full_name) to req.user.
 *
 * Usage: @UseGuards(SupabaseAuthGuard)
 */
@Injectable()
export class SupabaseAuthGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    
    const authHeader = request.headers['authorization'];

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException(
        'Missing or invalid Authorization header. Format: "Bearer <token>"',
      );
    }

    const token = authHeader.split(' ')[1];

    // Verify the token with Supabase Auth
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser(token);

    if (error || !user) {
      throw new UnauthorizedException('Invalid or expired token. Please log in again.');
    }

    // Fetch the user's role from public.users table
    const { data: profile, error: profileError } = await supabase
      .from('users')
      .select('full_name, role')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) {
      throw new UnauthorizedException('User profile not found. Contact support.');
    }

    // Attach user info to the request — accessible via @CurrentUser() decorator
    request.user = {
      id: user.id,
      email: user.email,
      role: profile.role,
      full_name: profile.full_name,
    };

    return true;
  }
}
