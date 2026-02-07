import { SupabaseClient } from '@supabase/supabase-js';
import type {
  ProgramInstanceData, WorkoutData, WorkoutExerciseData,
  ParsedSet, ImportStats
} from './types.js';
import {
  DAY_TYPE, DAY_NAMES,
  STRENGTH_SCHEME, HYPERTROPHY_SCHEME
} from './config.js';
import { formatDate, formatTimestamp } from './parse-dates.js';
import { slugify, normalizeExerciseName, guessExerciseCategory, guessMuscleGroups, guessEquipment } from './utils.js';
import { buildWorkouts } from './correlate.js';

/**
 * Phase 1A: Create/upsert all exercises found across all instances
 */
export async function upsertExercises(
  supabase: SupabaseClient,
  allExerciseNames: Set<string>,
  stats: ImportStats,
  verbose: boolean,
): Promise<Map<string, string>> {
  const exerciseIdMap = new Map<string, string>(); // name -> UUID

  for (const name of allExerciseNames) {
    const normalized = normalizeExerciseName(name);
    const slug = slugify(normalized);

    // Check if exercise exists
    const { data: existing } = await supabase
      .from('exercises')
      .select('id, name')
      .eq('slug', slug)
      .maybeSingle();

    if (existing) {
      exerciseIdMap.set(name, existing.id);
      stats.exercisesExisting++;
      if (verbose) console.log(`   📋 Exercise exists: "${name}" → ${existing.id}`);
      continue;
    }

    // Create new exercise — using actual DB schema columns
    const { data: created, error } = await supabase
      .from('exercises')
      .insert({
        name: normalized,
        slug,
        description: `${normalized} - imported from Project Mass program`,
        created_by: process.env.BRIAN_USER_ID,
      })
      .select('id')
      .single();

    if (error) {
      // Try to find by slug in case of race condition
      const { data: retry } = await supabase
        .from('exercises')
        .select('id')
        .eq('slug', slug)
        .maybeSingle();

      if (retry) {
        exerciseIdMap.set(name, retry.id);
        stats.exercisesExisting++;
      } else {
        stats.errors.push(`Failed to create exercise "${name}": ${error.message}`);
      }
      continue;
    }

    exerciseIdMap.set(name, created.id);
    stats.exercisesCreated++;
    if (verbose) console.log(`   ✨ Created exercise: "${normalized}" (${slug}) → ${created.id}`);
  }

  return exerciseIdMap;
}

/**
 * Phase 1B: Create program template (idempotent via slug)
 */
export async function upsertProgramTemplate(
  supabase: SupabaseClient,
  userId: string,
  verbose: boolean,
): Promise<string> {
  const slug = 'project-mass';

  // Check if exists
  const { data: existing } = await supabase
    .from('program_templates')
    .select('id')
    .eq('slug', slug)
    .maybeSingle();

  if (existing) {
    if (verbose) console.log(`   📋 Program template exists: ${existing.id}`);
    return existing.id;
  }

  const { data, error } = await supabase
    .from('program_templates')
    .insert({
      title: 'Project Mass',
      subtitle: "Jeff Nippard's DUP Strength & Hypertrophy Program",
      slug,
      description: 'An 8-day microcycle DUP (Daily Undulating Periodization) program alternating strength and hypertrophy days. 3 cycles with exercise variations and 4 micro-sessions per cycle with progressive rep/set schemes.',
      creator_name: 'Jeff Nippard',
      creator_id: userId,
      duration_weeks: 12,
      days_per_week: 6,
      minutes_per_session: 75,
      primary_goal: 'Hybrid',
      difficulty_level: 'Advanced',
      training_style: 'DUP',
      is_published: true,
      is_featured: false,
      tags: ['DUP', 'Strength', 'Hypertrophy', 'Powerbuilding', '8-day cycle'],
      equipment_required: ['barbell', 'dumbbells', 'cable machine', 'pull-up bar', 'bench'],
    })
    .select('id')
    .single();

  if (error) throw new Error(`Failed to create program template: ${error.message}`);
  if (verbose) console.log(`   ✨ Created program template: ${data.id}`);
  return data.id;
}

/**
 * Phase 1C: Create 3 program cycles
 */
export async function upsertProgramCycles(
  supabase: SupabaseClient,
  programId: string,
  verbose: boolean,
): Promise<Map<number, string>> {
  const cycleMap = new Map<number, string>();

  const cycleData = [
    { cycle_number: 1, name: 'Cycle 1 - Foundation', description: 'Primary exercise variations. 4 micro-sessions with progressive rep/set schemes.', duration_weeks: 4 },
    { cycle_number: 2, name: 'Cycle 2 - Variation', description: 'Secondary exercise variations for continued adaptation. 4 micro-sessions.', duration_weeks: 4 },
    { cycle_number: 3, name: 'Cycle 3 - Peak', description: 'Return to primary exercises with increased volume (up to 7 sets). 4 micro-sessions.', duration_weeks: 4 },
  ];

  for (const cycle of cycleData) {
    const { data: existing } = await supabase
      .from('program_cycles')
      .select('id')
      .eq('program_id', programId)
      .eq('cycle_number', cycle.cycle_number)
      .maybeSingle();

    if (existing) {
      cycleMap.set(cycle.cycle_number, existing.id);
      if (verbose) console.log(`   📋 Cycle ${cycle.cycle_number} exists: ${existing.id}`);
      continue;
    }

    const { data, error } = await supabase
      .from('program_cycles')
      .insert({ program_id: programId, ...cycle })
      .select('id')
      .single();

    if (error) throw new Error(`Failed to create cycle ${cycle.cycle_number}: ${error.message}`);
    cycleMap.set(cycle.cycle_number, data.id);
    if (verbose) console.log(`   ✨ Created cycle ${cycle.cycle_number}: ${data.id}`);
  }

  return cycleMap;
}

/**
 * Phase 1D: Create program workouts (6 training days × 4 micros × 3 cycles = 72)
 * Each workout template is unique by (program_id, week_number, day_number)
 */
export async function upsertProgramWorkouts(
  supabase: SupabaseClient,
  programId: string,
  cycleMap: Map<number, string>,
  verbose: boolean,
): Promise<Map<string, string>> {
  const workoutMap = new Map<string, string>(); // "weekNum-dayNum" -> UUID

  for (let cycle = 1; cycle <= 3; cycle++) {
    const cycleId = cycleMap.get(cycle)!;
    for (let micro = 1; micro <= 4; micro++) {
      const weekNumber = (cycle - 1) * 4 + micro;

      for (const dayNumber of [1, 2, 3, 5, 6, 7]) {
        const key = `${weekNumber}-${dayNumber}`;
        const workoutType = DAY_TYPE[dayNumber];
        const dayName = DAY_NAMES[dayNumber];
        const name = `${dayName} (C${cycle}M${micro})`;

        const { data: existing } = await supabase
          .from('program_workouts')
          .select('id')
          .eq('program_id', programId)
          .eq('week_number', weekNumber)
          .eq('day_number', dayNumber)
          .maybeSingle();

        if (existing) {
          workoutMap.set(key, existing.id);
          continue;
        }

        const { data, error } = await supabase
          .from('program_workouts')
          .insert({
            program_id: programId,
            cycle_id: cycleId,
            week_number: weekNumber,
            day_number: dayNumber,
            name,
            workout_type: workoutType,
            notes: `Cycle ${cycle}, Micro ${micro}`,
          })
          .select('id')
          .single();

        if (error) {
          console.error(`Failed to create workout w${weekNumber}d${dayNumber}: ${error.message}`);
          continue;
        }
        workoutMap.set(key, data.id);
      }
    }
  }

  if (verbose) console.log(`   📋 ${workoutMap.size} program workouts ready`);
  return workoutMap;
}

/**
 * Phase 1E: Create program_workout_exercises for each workout template.
 * Derives exercises from the actual parsed data, including cycle-remapped names.
 */
export async function upsertProgramWorkoutExercises(
  supabase: SupabaseClient,
  programId: string,
  workoutMap: Map<string, string>,
  exerciseIdMap: Map<string, string>,
  instances: ProgramInstanceData[],
  verbose: boolean,
): Promise<void> {
  // Build a mapping: "weekNumber-dayNumber" -> exercise list
  // from the actual parsed workout data (which already has cycle-remapped names)
  const workoutExerciseMap = new Map<string, { name: string; order: number }[]>();

  for (const instance of instances) {
    const workouts = buildWorkouts(instance);
    for (const workout of workouts) {
      const key = `${workout.weekNumber}-${workout.dayNumber}`;
      // Only set if we haven't populated this workout's exercises yet
      if (!workoutExerciseMap.has(key)) {
        workoutExerciseMap.set(key, workout.exercises.map(ex => ({
          name: ex.exerciseName,
          order: ex.order,
        })));
      }
    }
  }

  let created = 0;
  let existing = 0;

  for (const [key, exercises] of workoutExerciseMap) {
    const workoutId = workoutMap.get(key);
    if (!workoutId) continue;

    const [weekStr, dayStr] = key.split('-');
    const weekNum = parseInt(weekStr);
    const dayNum = parseInt(dayStr);
    const micro = ((weekNum - 1) % 4) + 1;
    const dayType = DAY_TYPE[dayNum];
    const scheme = dayType === 'Strength'
      ? STRENGTH_SCHEME[micro]
      : HYPERTROPHY_SCHEME[micro];

    for (const ex of exercises) {
      const exerciseId = exerciseIdMap.get(ex.name);
      if (!exerciseId) {
        if (verbose) console.warn(`   ⚠️ No exercise ID for "${ex.name}" in ${key}`);
        continue;
      }

      // Check if exists by workout + order
      const { data: existingPwe } = await supabase
        .from('program_workout_exercises')
        .select('id')
        .eq('program_workout_id', workoutId)
        .eq('exercise_order', ex.order)
        .maybeSingle();

      if (existingPwe) {
        existing++;
        continue;
      }

      const { error } = await supabase
        .from('program_workout_exercises')
        .insert({
          program_workout_id: workoutId,
          exercise_id: exerciseId,
          exercise_order: ex.order,
          section: 'Strength',
          target_sets: scheme?.sets || 4,
          target_reps_min: scheme?.reps || 3,
          target_reps_max: scheme?.reps || 3,
          load_type: 'weight',
        });

      if (error) {
        console.error(`   ❌ Failed to create PWE for ${ex.name} in ${key}: ${error.message}`);
        continue;
      }
      created++;
    }
  }

  if (verbose) console.log(`   📋 PWEs: ${created} created, ${existing} existing`);
}

/**
 * Phase 1F: Create progressions for each program_workout_exercise
 */
export async function upsertProgressions(
  supabase: SupabaseClient,
  workoutMap: Map<string, string>,
  verbose: boolean,
): Promise<void> {
  let created = 0;
  let existing = 0;

  // For each workout template, create progressions for its exercises
  for (const [key, workoutId] of workoutMap) {
    const [weekStr, dayStr] = key.split('-');
    const weekNumber = parseInt(weekStr);
    const dayNumber = parseInt(dayStr);
    const micro = ((weekNumber - 1) % 4) + 1;
    const dayType = DAY_TYPE[dayNumber];
    const scheme = dayType === 'Strength'
      ? STRENGTH_SCHEME[micro]
      : HYPERTROPHY_SCHEME[micro];

    // Get all PWEs for this workout
    const { data: pwes } = await supabase
      .from('program_workout_exercises')
      .select('id')
      .eq('program_workout_id', workoutId);

    if (!pwes || pwes.length === 0) continue;

    for (const pwe of pwes) {
      // Check if progression exists
      const { data: existingProg } = await supabase
        .from('program_workout_exercise_progressions')
        .select('id')
        .eq('program_workout_exercise_id', pwe.id)
        .eq('week_number', weekNumber)
        .maybeSingle();

      if (existingProg) {
        existing++;
        continue;
      }

      const { error } = await supabase
        .from('program_workout_exercise_progressions')
        .insert({
          program_workout_exercise_id: pwe.id,
          week_number: weekNumber,
          volume_sets: scheme?.sets || 4,
          target_reps_min: scheme?.reps || 3,
          target_reps_max: scheme?.reps || 3,
          week_notes: micro === 4 ? 'MAX test' : null,
        });

      if (error) {
        console.error(`   ❌ Failed to create progression for PWE ${pwe.id} week ${weekNumber}: ${error.message}`);
        continue;
      }
      created++;
    }
  }

  if (verbose) console.log(`   📋 Progressions: ${created} created, ${existing} existing`);
}

/**
 * Phase 2: Import a single program instance
 */
export async function importInstance(
  supabase: SupabaseClient,
  instance: ProgramInstanceData,
  programId: string,
  workoutMap: Map<string, string>,
  exerciseIdMap: Map<string, string>,
  userId: string,
  stats: ImportStats,
  verbose: boolean,
): Promise<void> {
  // 2.1 Create program_instance
  const instanceName = instance.name;

  const { data: existingInstance } = await supabase
    .from('program_instances')
    .select('id')
    .eq('user_id', userId)
    .eq('program_id', programId)
    .eq('instance_name', instanceName)
    .maybeSingle();

  let programInstanceId: string;

  if (existingInstance) {
    programInstanceId = existingInstance.id;
    if (verbose) console.log(`   📋 Instance exists: ${instanceName} → ${programInstanceId}`);
  } else {
    const maxCycles = Math.max(...instance.cycles);
    const totalMicros = maxCycles * 4;
    const expectedEndDate = new Date(instance.startDate);
    expectedEndDate.setDate(expectedEndDate.getDate() + totalMicros * 8);

    const totalWorkouts = totalMicros * 6;
    const status = instance.isOngoing ? 'active' : 'completed';

    const { data, error } = await supabase
      .from('program_instances')
      .insert({
        user_id: userId,
        program_id: programId,
        instance_name: instanceName,
        start_date: formatDate(instance.startDate),
        expected_end_date: formatDate(expectedEndDate),
        actual_end_date: instance.isOngoing ? null : formatDate(instance.endDate),
        current_week: instance.isOngoing ? 1 : totalMicros,
        current_day: instance.isOngoing ? 1 : 7,
        status,
        workouts_completed: 0, // Updated after importing workouts
        total_workouts: totalWorkouts,
      })
      .select('id')
      .single();

    if (error) {
      stats.errors.push(`Failed to create instance "${instanceName}": ${error.message}`);
      return;
    }
    programInstanceId = data.id;
    stats.programInstancesCreated++;
    if (verbose) console.log(`   ✨ Created instance: ${instanceName} → ${programInstanceId}`);
  }

  // 2.2 Build workouts from parsed data (with cycle-remapped exercise names)
  const workouts = buildWorkouts(instance);
  if (verbose) console.log(`   📊 ${workouts.length} workouts to import`);

  let workoutsCompleted = 0;

  // 2.3 Import each workout
  for (const workout of workouts) {
    try {
      await importWorkout(
        supabase, workout, programInstanceId, programId,
        workoutMap, exerciseIdMap, userId, stats, verbose,
      );
      if (workout.status === 'completed') workoutsCompleted++;
    } catch (err: any) {
      stats.errors.push(`Error importing workout w${workout.weekNumber}d${workout.dayNumber}: ${err.message}`);
    }
  }

  // Update workouts_completed
  await supabase
    .from('program_instances')
    .update({ workouts_completed: workoutsCompleted })
    .eq('id', programInstanceId);
}

// ════════════════════════════════════════════════════════════════════
// Internal helpers
// ════════════════════════════════════════════════════════════════════

async function importWorkout(
  supabase: SupabaseClient,
  workout: WorkoutData,
  programInstanceId: string,
  programId: string,
  workoutMap: Map<string, string>,
  exerciseIdMap: Map<string, string>,
  userId: string,
  stats: ImportStats,
  verbose: boolean,
): Promise<void> {
  const workoutKey = `${workout.weekNumber}-${workout.dayNumber}`;
  const programWorkoutId = workoutMap.get(workoutKey);

  if (!programWorkoutId) {
    stats.warnings.push(`No workout template for week ${workout.weekNumber} day ${workout.dayNumber}`);
    return;
  }

  // Check if workout instance exists
  const { data: existingWI } = await supabase
    .from('workout_instances')
    .select('id')
    .eq('program_instance_id', programInstanceId)
    .eq('week_number', workout.weekNumber)
    .eq('day_number', workout.dayNumber)
    .maybeSingle();

  let workoutInstanceId: string;

  if (existingWI) {
    workoutInstanceId = existingWI.id;
    if (verbose) console.log(`     📋 Workout exists: w${workout.weekNumber}d${workout.dayNumber}`);
  } else {
    // Calculate total volume
    let totalVolume = 0;
    for (const ex of workout.exercises) {
      for (const set of [...ex.workingSets, ...ex.warmupSets]) {
        totalVolume += set.weight * set.reps;
      }
    }

    const insertData: Record<string, any> = {
      program_instance_id: programInstanceId,
      program_workout_id: programWorkoutId,
      user_id: userId,
      scheduled_date: formatDate(workout.scheduledDate),
      week_number: workout.weekNumber,
      day_number: workout.dayNumber,
      status: workout.status,
      completed_at: workout.status === 'completed' ? formatTimestamp(workout.scheduledDate) : null,
      total_volume_lbs: Math.round(totalVolume),
    };

    if (workout.endDate) {
      insertData.end_date = formatDate(workout.endDate);
      stats.splitWorkoutsDetected++;
    }

    const { data, error } = await supabase
      .from('workout_instances')
      .insert(insertData)
      .select('id')
      .single();

    if (error) {
      stats.errors.push(`Failed to create workout w${workout.weekNumber}d${workout.dayNumber}: ${error.message}`);
      return;
    }
    workoutInstanceId = data.id;
    stats.workoutInstancesCreated++;
  }

  // Import exercises
  for (const exerciseData of workout.exercises) {
    try {
      await importExerciseInstance(
        supabase, exerciseData, workoutInstanceId, programWorkoutId,
        exerciseIdMap, userId, workout, stats, verbose,
      );
    } catch (err: any) {
      stats.errors.push(`Error importing exercise "${exerciseData.exerciseName}": ${err.message}`);
    }
  }
}

async function importExerciseInstance(
  supabase: SupabaseClient,
  exerciseData: WorkoutExerciseData,
  workoutInstanceId: string,
  programWorkoutId: string,
  exerciseIdMap: Map<string, string>,
  userId: string,
  workout: WorkoutData,
  stats: ImportStats,
  verbose: boolean,
): Promise<void> {
  const exerciseId = exerciseIdMap.get(exerciseData.exerciseName);
  if (!exerciseId) {
    stats.warnings.push(`No exercise ID for "${exerciseData.exerciseName}"`);
    return;
  }

  // Find matching program_workout_exercise (by workout + exercise, then by order)
  let pweId: string | null = null;

  const { data: pweByExercise } = await supabase
    .from('program_workout_exercises')
    .select('id')
    .eq('program_workout_id', programWorkoutId)
    .eq('exercise_id', exerciseId)
    .maybeSingle();

  if (pweByExercise) {
    pweId = pweByExercise.id;
  } else {
    // Fall back to matching by exercise_order
    const { data: pweByOrder } = await supabase
      .from('program_workout_exercises')
      .select('id')
      .eq('program_workout_id', programWorkoutId)
      .eq('exercise_order', exerciseData.order)
      .maybeSingle();

    if (pweByOrder) {
      pweId = pweByOrder.id;
    } else {
      // Create a new PWE for this exercise in this workout
      const { data: newPwe, error: pweError } = await supabase
        .from('program_workout_exercises')
        .insert({
          program_workout_id: programWorkoutId,
          exercise_id: exerciseId,
          exercise_order: exerciseData.order,
          section: 'Strength',
          target_sets: 4,
          load_type: 'weight',
        })
        .select('id')
        .single();

      if (pweError) {
        stats.errors.push(`Failed to create PWE for "${exerciseData.exerciseName}": ${pweError.message}`);
        return;
      }
      pweId = newPwe.id;
    }
  }

  // Check if exercise instance exists
  const { data: existingEI } = await supabase
    .from('exercise_instances')
    .select('id')
    .eq('workout_instance_id', workoutInstanceId)
    .eq('exercise_order', exerciseData.order)
    .maybeSingle();

  let exerciseInstanceId: string;

  if (existingEI) {
    exerciseInstanceId = existingEI.id;
  } else {
    const hasSets = exerciseData.workingSets.length > 0 || exerciseData.warmupSets.length > 0;

    const insertData: Record<string, any> = {
      workout_instance_id: workoutInstanceId,
      program_workout_exercise_id: pweId,
      exercise_id: exerciseId,
      user_id: userId,
      exercise_order: exerciseData.order,
      status: hasSets ? 'completed' : 'skipped',
      notes: exerciseData.notes || null,
    };

    // performed_date for split workouts
    if (exerciseData.performedDate && workout.endDate) {
      insertData.performed_date = formatDate(exerciseData.performedDate);
    }

    const { data, error } = await supabase
      .from('exercise_instances')
      .insert(insertData)
      .select('id')
      .single();

    if (error) {
      stats.errors.push(`Failed to create exercise instance "${exerciseData.exerciseName}": ${error.message}`);
      return;
    }
    exerciseInstanceId = data.id;
    stats.exerciseInstancesCreated++;
  }

  // Import sets: warmup first, then working
  let setNumber = 1;

  for (const set of exerciseData.warmupSets) {
    await importSetInstance(supabase, set, exerciseInstanceId, userId, setNumber++, true, stats);
    stats.warmupSetsCreated++;
  }

  for (const set of exerciseData.workingSets) {
    await importSetInstance(supabase, set, exerciseInstanceId, userId, setNumber++, false, stats);
    stats.workingSetsCreated++;
  }
}

async function importSetInstance(
  supabase: SupabaseClient,
  set: ParsedSet,
  exerciseInstanceId: string,
  userId: string,
  setNumber: number,
  isWarmup: boolean,
  stats: ImportStats,
): Promise<void> {
  // Check if set exists
  const { data: existing } = await supabase
    .from('set_instances')
    .select('id')
    .eq('exercise_instance_id', exerciseInstanceId)
    .eq('set_number', setNumber)
    .maybeSingle();

  if (existing) return;

  const insertData: Record<string, any> = {
    exercise_instance_id: exerciseInstanceId,
    user_id: userId,
    set_number: setNumber,
    actual_reps: set.reps,
    actual_weight_lbs: set.weight,
    is_warmup: isWarmup,
    is_failure: false,
  };

  if (set.difficulty) {
    insertData.difficulty_rating = set.difficulty;
  }

  if (set.increaseWeight) {
    insertData.increase_weight = true;
  }

  const { error } = await supabase
    .from('set_instances')
    .insert(insertData);

  if (error) {
    stats.errors.push(`Failed to create set ${setNumber}: ${error.message}`);
    return;
  }
  stats.setInstancesCreated++;
}
