import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { supabase } from '../../config/supabase.config';
import { verifySupabaseToken, TokenVerificationError } from '../auth/supabase-jwt';

/**
 * SupabaseAuthGuard
 * Validates the Bearer JWT token on every protected route.
 * The token signature is cryptographically verified (see common/auth/supabase-jwt.ts)
 * before any claim is trusted, then the role is loaded from public.users.
 * Attaches the full user object (id, email, role, full_name) to req.user.
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

    const token = authHeader.slice('Bearer '.length);

    let identity: Awaited<ReturnType<typeof verifySupabaseToken>>;
    try {
      identity = await verifySupabaseToken(token);
    } catch (e) {
      throw new UnauthorizedException(
        e instanceof TokenVerificationError ? e.message : 'Invalid or malformed token.',
      );
    }

    // ── Fetch the user's role from public.users table (service role = no RLS) ──
    const { data: profile, error: profileError } = await supabase
      .from('users')
      .select('full_name, role')
      .eq('id', identity.userId)
      .single();

    if (profileError || !profile) {
      throw new UnauthorizedException('User profile not found. Contact support.');
    }

    // Attach user info to the request — accessible via @CurrentUser() decorator
    request.user = {
      id: identity.userId,
      email: identity.email,
      role: profile.role,
      full_name: profile.full_name,
      subject: identity.metadata?.subject || 'All',
    };

    return true;
  }
}
