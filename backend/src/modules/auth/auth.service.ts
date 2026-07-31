import { Injectable, UnauthorizedException } from '@nestjs/common';
import { supabase } from '../../config/supabase.config';

@Injectable()
export class AuthService {
  /**
   * Login: Authenticates user via Supabase Auth and returns JWT tokens + profile.
   */
  async login(email: string, password: string) {
    // Step 1: Sign in via Supabase Auth
    const { data, error } = await supabase.auth.signInWithPassword({
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
      },
    };
  }

  /**
   * Refresh: Use refresh token to get a new access token.
   */
  async refresh(refreshToken: string) {
    const { data, error } = await supabase.auth.refreshSession({
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
   * Me: Returns the full profile of the currently logged-in user.
   */
  async getMe(userId: string) {
    const { data, error } = await supabase
      .from('users')
      .select('id, full_name, email, role, created_at')
      .eq('id', userId)
      .single();

    if (error || !data) {
      throw new UnauthorizedException('Could not retrieve user profile.');
    }

    return data;
  }
}
