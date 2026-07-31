import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

/**
 * Supabase Admin Client — uses Service Role Key.
 * This bypasses Row Level Security (RLS) and is used for all backend operations.
 * NEVER expose this client or the service role key to the frontend.
 */
export const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  },
);
