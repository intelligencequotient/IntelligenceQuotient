import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { resolve } from 'path';

// Load .env file
dotenv.config({ path: resolve(__dirname, '.env') });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Error: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing in .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

async function main() {
  console.log('📦 Creating question-images bucket...');
  
  const { data, error } = await supabase.storage.createBucket('question-images', {
    public: true,
    allowedMimeTypes: ['image/png', 'image/jpeg', 'image/webp'],
    fileSizeLimit: 1048576 * 5, // 5MB limit
  });

  if (error) {
    if (error.message.includes('already exists')) {
      console.log('✅ Bucket "question-images" already exists.');
    } else {
      console.error('❌ Failed to create bucket:', error.message);
    }
  } else {
    console.log('✅ Successfully created "question-images" bucket!');
  }
}

main();
