import { BadRequestException, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { supabase, supabaseAuth } from '../../config/supabase.config';
import { verifySupabaseToken } from '../../common/auth/supabase-jwt';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  /**
   * Login: Authenticates user via Supabase Auth and returns JWT tokens + profile.
   *
   * Credentials go through the anon client, never the service-role one: signing
   * in mutates the client's own session, and the service-role client is a
   * singleton shared by every concurrent request on the instance.
   */
  async login(email: string, password: string) {
    // Step 1: Sign in via Supabase Auth
    const { data, error } = await supabaseAuth.auth.signInWithPassword({
      email,
      password,
    });

    if (error || !data.session) {
      throw new UnauthorizedException(
        'Invalid email or password. Please check your credentials.',
      );
    }

    // Step 2: Get role + name from public.users
    const { data: profile, error: profileError } = await supabase
      .from('users')
      .select('full_name, role')
      .eq('id', data.user.id)
      .single();

    if (profileError || !profile) {
      throw new UnauthorizedException(
        'User account exists but profile is missing. Contact support.',
      );
    }

    // Step 3: Return tokens and user info to frontend
    return {
      accessToken: data.session.access_token,
      refreshToken: data.session.refresh_token,
      user: {
        id: data.user.id,
        email: data.user.email,
        full_name: profile.full_name,
        role: profile.role,
        subject: data.user.user_metadata?.subject || 'All',
      },
    };
  }

  /**
   * Refresh: Use refresh token to get a new access token.
   */
  async refresh(refreshToken: string) {
    const { data, error } = await supabaseAuth.auth.refreshSession({
      refresh_token: refreshToken,
    });

    if (error || !data.session) {
      throw new UnauthorizedException('Refresh token is invalid or expired. Please log in again.');
    }

    return {
      accessToken: data.session.access_token,
      refreshToken: data.session.refresh_token,
    };
  }

  /**
   * Logout: revokes the caller's session server-side so the access token cannot
   * be replayed even if it was captured before it expired.
   *
   * `scope: 'local'` kills just this session; the frontend also clears its own
   * localStorage. Failures are swallowed — a logout must never leave the user
   * stuck on a screen they are trying to leave.
   */
  async logout(accessToken: string) {
    try {
      await supabase.auth.admin.signOut(accessToken, 'local');
    } catch (e: any) {
      this.logger.warn(`Session revocation failed (token may already be expired): ${e?.message}`);
    }
    return { success: true, message: 'Logged out.' };
  }

  /**
   * Forgot password: sends a Supabase recovery email.
   *
   * Always reports success. Telling an anonymous caller whether an address is
   * registered would let them enumerate the user base.
   */
  async forgotPassword(email: string) {
    const redirectTo =
      process.env.PASSWORD_RESET_REDIRECT_URL ||
      `${process.env.FRONTEND_URL || 'http://localhost:5173'}/reset-password`;

    try {
      await supabase.auth.resetPasswordForEmail(email, { redirectTo });
    } catch (e: any) {
      this.logger.warn(`Password reset request failed for ${email}: ${e?.message}`);
    }

    return {
      success: true,
      message: 'If an account exists for that address, a reset link is on its way.',
    };
  }

  /**
   * Reset password: consumes the recovery token from the emailed link.
   * The token's signature is verified before it is trusted to identify a user.
   */
  async resetPassword(accessToken: string, newPassword: string) {
    let userId: string;
    try {
      const identity = await verifySupabaseToken(accessToken);
      userId = identity.userId;
    } catch {
      throw new UnauthorizedException('This reset link is invalid or has expired.');
    }

    const { error } = await supabase.auth.admin.updateUserById(userId, {
      password: newPassword,
    });
    if (error) throw new BadRequestException(error.message);

    // Kill every other session so a stolen token cannot outlive the reset.
    try {
      await supabase.auth.admin.signOut(accessToken, 'global');
    } catch {
      // Non-fatal.
    }

    return { success: true, message: 'Password updated. Please log in again.' };
  }

  /**
   * Me: Returns the full profile of the currently logged-in user.
   */
  async getMe(userId: string, subject: string = 'All') {
    const { data, error } = await supabase
      .from('users')
      .select('id, full_name, email, role, created_at')
      .eq('id', userId)
      .single();

    if (error || !data) {
      throw new UnauthorizedException('Could not retrieve user profile.');
    }

    return { ...data, subject };
  }
}
