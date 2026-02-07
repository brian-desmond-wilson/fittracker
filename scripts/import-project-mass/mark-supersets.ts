/**
 * Mark supersets in program_workout_exercises table
 * 
 * Day 5 (Leg Hypertrophy): Leg Extensions + Lying Leg Curls = superset_group 1
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function main() {
  console.log('Marking supersets in program_workout_exercises...\n');

  // Get the program_id for Project Mass
  const { data: program } = await supabase
    .from('program_templates')
    .select('id')
    .eq('slug', 'project-mass')
    .single();

  if (!program) {
    console.error('Project Mass program not found');
    return;
  }

  console.log(`Program ID: ${program.id}`);

  // Get all Day 5 workouts (Leg Hypertrophy)
  const { data: day5Workouts, error: workoutsError } = await supabase
    .from('program_workouts')
    .select('id, name, week_number')
    .eq('program_id', program.id)
    .eq('day_number', 5);

  if (workoutsError) {
    console.error('Error fetching workouts:', workoutsError.message);
    return;
  }

  console.log(`Found ${day5Workouts?.length || 0} Day 5 (Leg Hypertrophy) workouts`);

  // Get exercise IDs for Leg Extensions and Lying Leg Curls
  const { data: exercises } = await supabase
    .from('exercises')
    .select('id, name')
    .or('name.ilike.%leg extension%,name.ilike.%leg curl%,name.ilike.%lying leg curl%,name.ilike.%seated leg curl%');

  console.log('\nRelevant exercises found:');
  exercises?.forEach(e => console.log(`  - ${e.name} (${e.id})`));

  // Find the specific exercises we want
  const legExtension = exercises?.find(e => 
    e.name.toLowerCase().includes('leg extension') && 
    !e.name.toLowerCase().includes('curl')
  );
  
  const lyingLegCurl = exercises?.find(e => 
    e.name.toLowerCase().includes('lying leg curl') ||
    (e.name.toLowerCase().includes('leg curl') && e.name.toLowerCase().includes('lying'))
  );

  const seatedLegCurl = exercises?.find(e =>
    e.name.toLowerCase().includes('seated leg curl')
  );

  // Use lying leg curl for Cycle 1/3, seated leg curl for Cycle 2
  console.log(`\nLeg Extension: ${legExtension?.name} (${legExtension?.id})`);
  console.log(`Lying Leg Curl: ${lyingLegCurl?.name} (${lyingLegCurl?.id})`);
  console.log(`Seated Leg Curl: ${seatedLegCurl?.name} (${seatedLegCurl?.id})`);

  if (!legExtension) {
    console.error('Leg Extension exercise not found');
    return;
  }

  // Mark supersets for each Day 5 workout
  let updated = 0;
  for (const workout of day5Workouts || []) {
    // Get program_workout_exercises for this workout
    const { data: pwe } = await supabase
      .from('program_workout_exercises')
      .select('id, exercise_id')
      .eq('program_workout_id', workout.id);

    // Find leg extension and leg curl in this workout
    const legExtPwe = pwe?.find(p => p.exercise_id === legExtension.id);
    const legCurlPwe = pwe?.find(p => 
      p.exercise_id === lyingLegCurl?.id || 
      p.exercise_id === seatedLegCurl?.id
    );

    if (legExtPwe && legCurlPwe) {
      // Mark both with superset_group = 1
      const { error: err1 } = await supabase
        .from('program_workout_exercises')
        .update({ superset_group: 1 })
        .eq('id', legExtPwe.id);

      const { error: err2 } = await supabase
        .from('program_workout_exercises')
        .update({ superset_group: 1 })
        .eq('id', legCurlPwe.id);

      if (!err1 && !err2) {
        updated += 2;
        console.log(`✅ Marked superset for ${workout.name}`);
      } else {
        console.log(`❌ Failed for ${workout.name}: ${err1?.message || err2?.message}`);
      }
    } else {
      console.log(`⏭️  Skipped ${workout.name} - exercises not found in template`);
    }
  }

  console.log(`\n✅ Done! Updated ${updated} program_workout_exercises records`);
}

main().catch(console.error);
