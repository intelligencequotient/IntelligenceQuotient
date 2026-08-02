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

async function seed() {
  console.log('🌱 Seeding demo users...');

  const usersToCreate = [
    {
      email: 'teacher@edu.com',
      password: 'teacher123',
      full_name: 'Dr. Robert Chen',
      role: 'teacher',
      subject: 'All',
    },
    {
      email: 'student@edu.com',
      password: 'student123',
      full_name: 'Alex Johnson',
      role: 'student',
    },
    {
      email: 'physics_teacher@edu.com',
      password: 'teacher123',
      full_name: 'Dr. Alan Physics',
      role: 'teacher',
      subject: 'Physics',
    },
    {
      email: 'chemistry_teacher@edu.com',
      password: 'teacher123',
      full_name: 'Dr. Marie Chem',
      role: 'teacher',
      subject: 'Chemistry',
    },
    {
      email: 'maths_teacher@edu.com',
      password: 'teacher123',
      full_name: 'Dr. Euler Maths',
      role: 'teacher',
      subject: 'Mathematics',
    },
    {
      email: 'admin@edu.com',
      password: 'admin123',
      full_name: 'Super Admin',
      role: 'admin',
    },
  ];

  for (const u of usersToCreate) {
    console.log(`Processing ${u.email}...`);
    
    // 1. Create in Supabase Auth (admin bypasses email confirmation)
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email: u.email,
      password: u.password,
      email_confirm: true,
      user_metadata: u.subject ? { subject: u.subject } : {},
    });

    let userId = authData?.user?.id;

    if (authError) {
      const errMsg = authError.message || '';
      if (errMsg.includes('already exists') || errMsg.includes('already registered') || errMsg.includes('already been registered')) {
        console.log(`⚠️ User ${u.email} already exists in auth. Fetching ID...`);
        // If they exist, let's find their ID
        const { data: existingUsers } = await supabase.auth.admin.listUsers();
        const existing = (existingUsers?.users as any[])?.find((x: any) => x.email === u.email);
        if (existing) {
          userId = existing.id;
          
          // Let's also reset their password and metadata just to be sure it matches the demo
          await supabase.auth.admin.updateUserById(userId as string, { 
            password: u.password,
            user_metadata: u.subject ? { subject: u.subject } : {} 
          });
          console.log(`✅ Password & metadata updated for ${u.email}`);
        }
      } else {
        console.error(`❌ Error creating ${u.email} in Auth:`, authError.message);
        continue;
      }
    } else {
      console.log(`✅ Created ${u.email} in Auth.`);
    }

    if (!userId) {
       console.error(`❌ Could not resolve ID for ${u.email}`);
       continue;
    }

    // 2. Upsert into public.users
    const { error: dbError } = await supabase
      .from('users')
      .upsert({
        id: userId,
        email: u.email,
        full_name: u.full_name,
        role: u.role,
      }, { onConflict: 'id' });

    if (dbError) {
      console.error(`❌ Error upserting ${u.email} to public.users:`, dbError.message);
    } else {
      console.log(`✅ Upserted ${u.email} into public.users table.`);
    }
  }

  console.log('🎉 Seeding complete! You can now log in.');
}

seed();
