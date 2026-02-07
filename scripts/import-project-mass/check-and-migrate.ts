import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function main() {
  // Check if column exists by querying
  const { data, error } = await supabase
    .from('workout_instances')
    .select('completion_status')
    .limit(1);
  
  if (error && error.message.includes('column "completion_status" does not exist')) {
    console.log('Column does not exist, need to add via SQL Editor in Supabase Dashboard');
    console.log('\nRun this SQL:\n');
    console.log(`ALTER TABLE workout_instances ADD COLUMN completion_status TEXT CHECK (completion_status IN ('completed', 'partial'));`);
  } else if (error) {
    console.log('Error:', error.message);
  } else {
    console.log('✅ completion_status column already exists!');
  }
  
  // Also check current program instances
  const { data: instances, error: instErr } = await supabase
    .from('program_instances')
    .select('id, instance_name, status, start_date, actual_end_date')
    .order('start_date', { ascending: false })
    .limit(5);
  
  if (instErr) {
    console.log('Error fetching instances:', instErr.message);
  } else {
    console.log('\nRecent program instances:');
    console.table(instances);
  }
}

main();
