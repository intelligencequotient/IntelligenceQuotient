import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

const url = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Fail at boot rather than surfacing "Invalid API key" on the first request a
// student makes. A misconfigured deployment should never start serving.
if (!url || !serviceRoleKey) {
  throw new Error(
    'FATAL: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set. Copy .env.example to .env and fill them in.',
  );
}

/**
 * Supabase Admin Client — uses Service Role Key.
 * This bypasses Row Level Security (RLS) and is used for all backend data access.
 * NEVER expose this client or the service role key to the frontend.
 *
 * Nothing user-facing may authenticate through this client: `signInWithPassword`
 * establishes a session *on the client instance*, and because this one is a
 * module-level singleton shared by every request, that session would leak across
 * concurrent requests. Use `supabaseAuth` below for anything that signs a user in.
 */
export const supabase = createClient(url, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
  global: {
    headers: {
      Authorization: `Bearer ${serviceRoleKey}`,
    },
  },
});

/**
 * Anon-key client used only for user credential flows (login, verifying a
 * current password, refreshing a session).
 *
 * It holds no privileged key, so a session established on it grants exactly what
 * that user already has — and it is created per call site via
 * `createUserAuthClient()` when isolation matters.
 */
const anonKey = process.env.SUPABASE_ANON_KEY || serviceRoleKey;

export const supabaseAuth = createClient(url, anonKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

/**
 * A throwaway auth client with no shared session state.
 *
 * Used where a sign-in must not be observable by any other request — checking a
 * user's current password before letting them change it, for instance.
 */
export function createUserAuthClient() {
  return createClient(url!, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
}
