/**
 * Reset test workout data from Feb 6, 2026
 * Deletes workout_instances created today for the Jan 2026 program instance
 */

const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

// Load service key from import-project-mass .env file
const envPath = path.join(__dirname, 'import-project-mass', '.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  envContent.split('\n').forEach(line => {
    const [key, ...valueParts] = line.split('=');
    if (key && valueParts.length) {
      process.env[key.trim()] = valueParts.join('=').trim();
    }
  });
}

const supabaseUrl = process.env.SUPABASE_URL || 'https://tffxvrjvkhpyxsagrjga.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

if (!supabaseKey) {
  console.error('Missing SUPABASE_SERVICE_KEY or EXPO_PUBLIC_SUPABASE_ANON_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const PROGRAM_INSTANCE_ID = '862987de-74cb-43ab-929a-0d472d8b315b'; // Jan 2026

async function resetTestWorkouts() {
  console.log('Finding test workout_instances from today...');
  
  // Find workout_instances created today (Feb 6)
  const today = new Date().toISOString().split('T')[0];
  
  // Only delete in_progress workouts from today (never delete completed workouts)
  const { data: workouts, error: findError } = await supabase
    .from('workout_instances')
    .select('id, day_number, week_number, status, created_at')
    .eq('program_instance_id', PROGRAM_INSTANCE_ID)
    .eq('status', 'in_progress')
    .gte('created_at', today + 'T00:00:00')
    .lte('created_at', today + 'T23:59:59');

  if (findError) {
    console.error('Error finding workouts:', findError);
    return;
  }

  if (!workouts || workouts.length === 0) {
    console.log('No test workouts found from today.');
    return;
  }

  console.log(`Found ${workouts.length} workout(s) to delete:`);
  workouts.forEach(w => {
    console.log(`  - Day ${w.day_number}, Week ${w.week_number}, Status: ${w.status}, ID: ${w.id}`);
  });

  // Delete related exercise_instances and set_instances (cascade should handle this, but let's be safe)
  for (const workout of workouts) {
    // Get exercise instances
    const { data: exercises } = await supabase
      .from('exercise_instances')
      .select('id')
      .eq('workout_instance_id', workout.id);

    if (exercises && exercises.length > 0) {
      const exerciseIds = exercises.map(e => e.id);
      
      // Delete set_instances
      const { error: setError } = await supabase
        .from('set_instances')
        .delete()
        .in('exercise_instance_id', exerciseIds);
      
      if (setError) console.error('Error deleting sets:', setError);
      else console.log(`  Deleted sets for workout ${workout.id}`);

      // Delete exercise_instances
      const { error: exError } = await supabase
        .from('exercise_instances')
        .delete()
        .eq('workout_instance_id', workout.id);
      
      if (exError) console.error('Error deleting exercises:', exError);
      else console.log(`  Deleted exercise instances for workout ${workout.id}`);
    }

    // Delete workout_instance
    const { error: workoutError } = await supabase
      .from('workout_instances')
      .delete()
      .eq('id', workout.id);

    if (workoutError) {
      console.error('Error deleting workout:', workoutError);
    } else {
      console.log(`  ✅ Deleted workout_instance ${workout.id}`);
    }
  }

  console.log('\n✅ Done! App should now show Day 6 (Push Hypertrophy)');
}

resetTestWorkouts().catch(console.error);
