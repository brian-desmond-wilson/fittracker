/**
 * Supabase Query Functions: Today's Workout
 * 
 * For use with the mobile app's existing supabase client pattern
 * Add to: /mobile/src/lib/supabase/training.ts
 */

import { supabase } from '../supabase';
import { TodaysWorkoutResponse, TodaysWorkoutResult, ExerciseInfo, CompletionStatus } from '@/src/types/training';

// Rest days in the 8-day cycle
const REST_DAYS = [4, 8];

/**
 * Get the next workout day, skipping rest days
 */
function getNextWorkoutDay(currentDay: number): number {
  let nextDay = currentDay + 1;
  if (nextDay > 8) nextDay = 1;
  while (REST_DAYS.includes(nextDay)) {
    nextDay = nextDay + 1;
    if (nextDay > 8) nextDay = 1;
  }
  return nextDay;
}

/**
 * Calculate cycle number (1-3) from week number (1-12)
 */
function getCycleNumber(weekNumber: number): number {
  if (weekNumber <= 4) return 1;
  if (weekNumber <= 8) return 2;
  return 3;
}

/**
 * Fetch today's workout for a user
 */
export async function fetchTodaysWorkout(userId: string): Promise<TodaysWorkoutResponse> {
  // 1. Get active program instance
  const { data: activeProgram, error: programError } = await supabase
    .from('program_instances')
    .select(`
      id,
      instance_name,
      program_id,
      start_date,
      current_week,
      current_day
    `)
    .eq('user_id', userId)
    .is('actual_end_date', null)
    .eq('status', 'active')
    .order('start_date', { ascending: false })
    .limit(1)
    .single();

  if (programError || !activeProgram) {
    return {
      error: 'no_active_program',
      message: 'No active program found. Start a program to get workout recommendations.',
    };
  }

  // 2. Get last workout instance
  const { data: lastWorkout } = await supabase
    .from('workout_instances')
    .select('id, completion_status, status, week_number, day_number, started_at')
    .eq('program_instance_id', activeProgram.id)
    .order('scheduled_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  // 3. Determine target workout
  let targetDayNumber: number;
  let targetWeekNumber: number;
  let isPartialContinue = false;
  let existingWorkoutInstanceId: string | undefined;

  // Check if workout is incomplete: either status='in_progress' OR completion_status='partial'
  const isIncomplete = lastWorkout && (
    lastWorkout.status === 'in_progress' || 
    lastWorkout.completion_status === 'partial'
  );

  if (!lastWorkout) {
    targetDayNumber = 1;
    targetWeekNumber = 1;
  } else if (isIncomplete) {
    // Resume incomplete workout
    targetDayNumber = lastWorkout.day_number;
    targetWeekNumber = lastWorkout.week_number;
    isPartialContinue = true;
    existingWorkoutInstanceId = lastWorkout.id;
  } else {
    targetDayNumber = getNextWorkoutDay(lastWorkout.day_number);
    targetWeekNumber = lastWorkout.week_number;
    
    // Week increment on cycle wrap
    if (targetDayNumber < lastWorkout.day_number && lastWorkout.day_number === 7) {
      targetWeekNumber = Math.min(lastWorkout.week_number + 1, 12);
    }
  }

  const cycleNumber = getCycleNumber(targetWeekNumber);
  const cycleRelativeWeek = ((targetWeekNumber - 1) % 4) + 1;

  // 4. Get workout template
  const { data: workoutTemplate } = await supabase
    .from('program_workouts')
    .select('id, name, day_number, week_number')
    .eq('program_id', activeProgram.program_id)
    .eq('day_number', targetDayNumber)
    .eq('week_number', cycleRelativeWeek)
    .single();

  if (!workoutTemplate) {
    return {
      error: 'no_active_program',
      message: `No workout template found for Day ${targetDayNumber}.`,
    };
  }

  // 5. Get template exercises
  const { data: templateExercises } = await supabase
    .from('program_workout_exercises')
    .select(`
      id,
      exercise_id,
      exercise_order,
      target_sets,
      exercises (id, name)
    `)
    .eq('program_workout_id', workoutTemplate.id)
    .order('exercise_order', { ascending: true });

  if (!templateExercises) {
    return {
      error: 'no_active_program',
      message: 'Failed to load exercises.',
    };
  }

  // 6. Get completed sets for partial workouts
  const completedSetsMap = new Map<string, number>();
  let sessionPaused = false;
  let sessionDurationSeconds = 0;
  
  if (isPartialContinue && existingWorkoutInstanceId) {
    const { data: exerciseInstances } = await supabase
      .from('exercise_instances')
      .select('exercise_id, set_instances (id)')
      .eq('workout_instance_id', existingWorkoutInstanceId);

    exerciseInstances?.forEach(ei => {
      completedSetsMap.set(ei.exercise_id, ei.set_instances?.length || 0);
    });
    
    // Check if today's session is paused (has ended_at)
    // Use local date, not UTC (toISOString returns UTC which can be wrong after 4pm PST)
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const { data: todaySession } = await supabase
      .from('workout_sessions')
      .select('id, ended_at, duration_seconds')
      .eq('workout_instance_id', existingWorkoutInstanceId)
      .eq('session_date', today)
      .maybeSingle();
    
    if (todaySession?.ended_at) {
      sessionPaused = true;
      sessionDurationSeconds = todaySession.duration_seconds || 0;
    }
  }

  // 7. Build exercise list
  const exercises: ExerciseInfo[] = templateExercises.map(te => {
    const targetSets = te.target_sets || 3;
    const completedSets = completedSetsMap.get(te.exercise_id) || 0;
    return {
      id: te.exercise_id,
      name: (te.exercises as any)?.name || 'Unknown Exercise',
      targetSets,
      completedSets,
      isComplete: completedSets >= targetSets,
    };
  });

  const remainingExerciseCount = exercises.filter(e => !e.isComplete).length;

  // Determine the status: 'new', 'continue' (active), or 'paused'
  let workoutStatus: 'new' | 'continue' | 'paused' = 'new';
  if (isPartialContinue) {
    workoutStatus = sessionPaused ? 'paused' : 'continue';
  }

  const result: TodaysWorkoutResult = {
    workoutTemplate: {
      id: workoutTemplate.id,
      name: workoutTemplate.name,
      day_number: workoutTemplate.day_number,
    },
    programInstance: {
      id: activeProgram.id,
      name: activeProgram.instance_name,
    },
    cycleNumber,
    status: workoutStatus,
    exercises,
    remainingExerciseCount,
  };

  if (existingWorkoutInstanceId) {
    result.existingWorkoutInstanceId = existingWorkoutInstanceId;
  }

  // Include started_at if workout is in progress (active, not paused)
  if (isPartialContinue && lastWorkout?.started_at && !sessionPaused) {
    result.startedAt = lastWorkout.started_at;
  }
  
  // Include session duration for paused workouts
  if (sessionPaused) {
    result.sessionDurationSeconds = sessionDurationSeconds;
  }

  return result;
}

/**
 * Mark workout as partial (user stopped mid-workout)
 */
export async function markWorkoutAsPartial(workoutInstanceId: string): Promise<void> {
  await supabase
    .from('workout_instances')
    .update({ 
      completion_status: 'partial' as CompletionStatus,
      status: 'in_progress'
    })
    .eq('id', workoutInstanceId);
}

/**
 * Mark workout as completed
 */
export async function markWorkoutAsCompleted(workoutInstanceId: string): Promise<void> {
  await supabase
    .from('workout_instances')
    .update({ 
      completion_status: 'completed' as CompletionStatus,
      status: 'completed',
      completed_at: new Date().toISOString()
    })
    .eq('id', workoutInstanceId);
}
