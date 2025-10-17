import { supabase } from './supabase';
import type {
  ProgramTemplate,
  ProgramTemplateWithRelations,
  ProgramWorkoutWithRelations,
  ProgramInstance,
  ProgramInstanceWithRelations,
  WorkoutInstance,
  WorkoutInstanceWithRelations,
  CreateProgramInstanceInput,
  CreateWorkoutInstanceInput,
  CreateSetInstanceInput,
  UpdateWorkoutInstanceInput,
} from '../../types/training';

// ============================================================================
// PROGRAM TEMPLATES (Browse Programs)
// ============================================================================

/**
 * Fetch all published program templates
 * Used in ProgramsTab to display available programs
 */
export async function fetchPublishedPrograms(): Promise<ProgramTemplateWithRelations[]> {
  const { data, error } = await supabase
    .from('program_templates')
    .select(`
      *,
      cycles:program_cycles(*),
      media:program_media(*)
    `)
    .eq('is_published', true)
    .order('is_featured', { ascending: false })
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching programs:', error);
    throw error;
  }

  return data || [];
}

/**
 * Fetch a single program template by ID with all related data
 * Used in ProgramDetailScreen
 */
export async function fetchProgramById(programId: string): Promise<ProgramTemplateWithRelations | null> {
  const { data, error } = await supabase
    .from('program_templates')
    .select(`
      *,
      cycles:program_cycles(*),
      media:program_media(*),
      workouts:program_workouts(
        *,
        exercises:program_workout_exercises(
          *,
          exercise:exercises(*),
          progressions:program_workout_exercise_progressions(*)
        )
      )
    `)
    .eq('id', programId)
    .single();

  if (error) {
    console.error('Error fetching program:', error);
    throw error;
  }

  return data;
}

/**
 * Fetch a single program template by slug
 * Alternative lookup method
 */
export async function fetchProgramBySlug(slug: string): Promise<ProgramTemplateWithRelations | null> {
  const { data, error } = await supabase
    .from('program_templates')
    .select(`
      *,
      cycles:program_cycles(*),
      media:program_media(*),
      workouts:program_workouts(
        *,
        exercises:program_workout_exercises(
          *,
          exercise:exercises(*),
          progressions:program_workout_exercise_progressions(*)
        )
      )
    `)
    .eq('slug', slug)
    .single();

  if (error) {
    console.error('Error fetching program by slug:', error);
    throw error;
  }

  return data;
}

// ============================================================================
// PROGRAM INSTANCES (User's Active Programs)
// ============================================================================

/**
 * Fetch user's active program instances
 * Used in WorkoutsTab to show current programs
 */
export async function fetchUserProgramInstances(userId: string): Promise<ProgramInstanceWithRelations[]> {
  const { data, error } = await supabase
    .from('program_instances')
    .select(`
      *,
      program:program_templates(*),
      workout_instances:workout_instances(
        *,
        program_workout:program_workouts(*)
      )
    `)
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching user program instances:', error);
    throw error;
  }

  return data || [];
}

/**
 * Fetch a single program instance with all workout data
 */
export async function fetchProgramInstanceById(instanceId: string): Promise<ProgramInstanceWithRelations | null> {
  const { data, error } = await supabase
    .from('program_instances')
    .select(`
      *,
      program:program_templates(*),
      workout_instances:workout_instances(
        *,
        program_workout:program_workouts(
          *,
          exercises:program_workout_exercises(
            *,
            exercise:exercises(*)
          )
        ),
        exercise_instances:exercise_instances(
          *,
          exercise:exercises(*),
          set_instances:set_instances(*)
        )
      )
    `)
    .eq('id', instanceId)
    .single();

  if (error) {
    console.error('Error fetching program instance:', error);
    throw error;
  }

  return data;
}

/**
 * Create a new program instance for a user
 * Called when user clicks "Start Program"
 */
export async function createProgramInstance(input: CreateProgramInstanceInput, userId: string): Promise<ProgramInstance> {
  const { data, error } = await supabase
    .from('program_instances')
    .insert({
      user_id: userId,
      program_id: input.program_id,
      instance_name: input.instance_name,
      start_date: input.start_date,
      expected_end_date: input.expected_end_date,
      current_week: 1,
      current_day: 1,
      status: 'active',
      workouts_completed: 0,
      total_workouts: input.total_workouts,
    })
    .select()
    .single();

  if (error) {
    console.error('Error creating program instance:', error);
    throw error;
  }

  return data;
}

/**
 * Update program instance progress
 */
export async function updateProgramInstance(
  instanceId: string,
  updates: Partial<ProgramInstance>
): Promise<ProgramInstance> {
  const { data, error } = await supabase
    .from('program_instances')
    .update(updates)
    .eq('id', instanceId)
    .select()
    .single();

  if (error) {
    console.error('Error updating program instance:', error);
    throw error;
  }

  return data;
}

// ============================================================================
// WORKOUT INSTANCES (Daily Workouts)
// ============================================================================

/**
 * Create scheduled workout instances for a program
 * Called after creating a program instance to pre-schedule all workouts
 */
export async function createWorkoutInstances(
  workouts: CreateWorkoutInstanceInput[]
): Promise<WorkoutInstance[]> {
  const { data, error } = await supabase
    .from('workout_instances')
    .insert(workouts)
    .select();

  if (error) {
    console.error('Error creating workout instances:', error);
    throw error;
  }

  return data || [];
}

/**
 * Fetch today's scheduled workouts for a user
 */
export async function fetchTodaysWorkouts(userId: string, date: string): Promise<WorkoutInstanceWithRelations[]> {
  const { data, error } = await supabase
    .from('workout_instances')
    .select(`
      *,
      program_workout:program_workouts(
        *,
        exercises:program_workout_exercises(
          *,
          exercise:exercises(*)
        )
      ),
      exercise_instances:exercise_instances(
        *,
        exercise:exercises(*),
        set_instances:set_instances(*)
      )
    `)
    .eq('user_id', userId)
    .eq('scheduled_date', date)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Error fetching today\'s workouts:', error);
    throw error;
  }

  return data || [];
}

/**
 * Fetch workout instance by ID with full details
 */
export async function fetchWorkoutInstanceById(workoutId: string): Promise<WorkoutInstanceWithRelations | null> {
  const { data, error } = await supabase
    .from('workout_instances')
    .select(`
      *,
      program_workout:program_workouts(
        *,
        exercises:program_workout_exercises(
          *,
          exercise:exercises(*),
          progressions:program_workout_exercise_progressions(*)
        )
      ),
      exercise_instances:exercise_instances(
        *,
        exercise:exercises(*),
        set_instances:set_instances(*)
      )
    `)
    .eq('id', workoutId)
    .single();

  if (error) {
    console.error('Error fetching workout instance:', error);
    throw error;
  }

  return data;
}

/**
 * Update workout instance
 */
export async function updateWorkoutInstance(
  workoutId: string,
  updates: UpdateWorkoutInstanceInput
): Promise<WorkoutInstance> {
  const { data, error } = await supabase
    .from('workout_instances')
    .update(updates)
    .select()
    .single();

  if (error) {
    console.error('Error updating workout instance:', error);
    throw error;
  }

  return data;
}

/**
 * Start a workout (update status to in_progress and set started_at)
 */
export async function startWorkout(workoutId: string): Promise<WorkoutInstance> {
  return updateWorkoutInstance(workoutId, {
    status: 'in_progress',
    started_at: new Date().toISOString(),
  });
}

/**
 * Complete a workout (update status to completed and set completed_at)
 */
export async function completeWorkout(
  workoutId: string,
  totalDurationMinutes: number,
  totalVolumeLbs: number
): Promise<WorkoutInstance> {
  return updateWorkoutInstance(workoutId, {
    status: 'completed',
    completed_at: new Date().toISOString(),
    total_duration_minutes: totalDurationMinutes,
    total_volume_lbs: totalVolumeLbs,
  });
}

// ============================================================================
// EXERCISE & SET INSTANCES (Logging Work)
// ============================================================================

/**
 * Create a new set instance
 */
export async function createSetInstance(input: CreateSetInstanceInput, userId: string) {
  const { data, error } = await supabase
    .from('set_instances')
    .insert({
      ...input,
      user_id: userId,
    })
    .select()
    .single();

  if (error) {
    console.error('Error creating set instance:', error);
    throw error;
  }

  return data;
}

/**
 * Delete a set instance
 */
export async function deleteSetInstance(setId: string): Promise<void> {
  const { error } = await supabase
    .from('set_instances')
    .delete()
    .eq('id', setId);

  if (error) {
    console.error('Error deleting set instance:', error);
    throw error;
  }
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Calculate total workouts for a program
 */
export function calculateTotalWorkouts(daysPerWeek: number, durationWeeks: number): number {
  return daysPerWeek * durationWeeks;
}

/**
 * Calculate expected end date from start date and duration
 */
export function calculateEndDate(startDate: Date, durationWeeks: number): Date {
  const endDate = new Date(startDate);
  endDate.setDate(endDate.getDate() + (durationWeeks * 7));
  return endDate;
}

/**
 * Format duration in seconds to MM:SS
 */
export function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}
