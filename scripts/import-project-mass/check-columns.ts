import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function check() {
  const { data, error } = await supabase.from('exercises').select('*').limit(1);
  if (error) {
    console.error('Error:', error.message);
    return;
  }
  console.log('Exercises columns:', Object.keys(data?.[0] || {}));
}

check();
