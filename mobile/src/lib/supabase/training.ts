import { supabase } from '../supabase';
import { getLocalDateString } from '../dates';
import type {
  ProgramTemplate,
  ProgramTemplateWithRelations,
  ProgramWorkout,
  ProgramWorkoutWithRelations,
  ProgramInstance,
  ProgramInstanceWithRelations,
  WorkoutInstance,
  WorkoutInstanceWithRelations,
  Exercise,
  CreateProgramInstanceInput,
  CreateProgramTemplateInput,
  CreateProgramWorkoutInput,
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

/**
 * Generate a unique slug for a program title
 * If the base slug exists, appends a number (e.g., my-program-2)
 */
async function generateUniqueProgramSlug(title: string): Promise<string> {
  const baseSlug = title
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .substring(0, 50); // Limit length

  // Check if base slug exists
  const { data: existing } = await supabase
    .from('program_templates')
    .select('slug')
    .eq('slug', baseSlug)
    .maybeSingle();

  // If no conflict, use base slug
  if (!existing) {
    return baseSlug;
  }

  // If conflict, find the next available number
  let counter = 2;
  while (counter < 100) {
    const testSlug = `${baseSlug}-${counter}`;
    const { data: testExisting } = await supabase
      .from('program_templates')
      .select('slug')
      .eq('slug', testSlug)
      .maybeSingle();

    if (!testExisting) {
      return testSlug;
    }
    counter++;
  }

  // Fallback: use timestamp
  return `${baseSlug}-${Date.now()}`;
}

/**
 * Create a new program template
 * Called when user creates a new program via the Add Program modal
 */
export async function createProgramTemplate(
  input: CreateProgramTemplateInput,
  userId: string,
  creatorName: string
): Promise<ProgramTemplate | null> {
  try {
    // Generate unique slug from title
    const slug = await generateUniqueProgramSlug(input.title);

    const { data, error } = await supabase
      .from('program_templates')
      .insert({
        title: input.title,
        subtitle: input.subtitle || null,
        slug,
        description: input.description || '',
        creator_id: userId,
        creator_name: creatorName,
        duration_weeks: input.duration_weeks,
        days_per_week: input.days_per_week,
        minutes_per_session: input.minutes_per_session,
        cover_image_url: input.cover_image_url || null,
        // Default values for required fields
        primary_goal: input.primary_goal || 'Hybrid',
        difficulty_level: input.difficulty_level || 'Intermediate',
        training_style: null,
        video_preview_url: null,
        is_published: true, // Immediately published per requirements
        is_featured: false,
        tags: input.tags || [],
        prerequisites: input.prerequisites || [],
        equipment_required: input.equipment_required || [],
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating program template:', error);
      throw error;
    }

    return data;
  } catch (error) {
    console.error('Error in createProgramTemplate:', error);
    return null;
  }
}

/**
 * Delete a program template
 * Only the creator can delete their own programs
 */
export async function deleteProgramTemplate(programId: string, userId: string): Promise<boolean> {
  try {
    // First verify the user is the creator
    const { data: program, error: fetchError } = await supabase
      .from('program_templates')
      .select('creator_id')
      .eq('id', programId)
      .single();

    if (fetchError || !program) {
      console.error('Error fetching program:', fetchError);
      return false;
    }

    if (program.creator_id !== userId) {
      console.error('User is not the creator of this program');
      return false;
    }

    // Delete the program
    const { error: deleteError } = await supabase
      .from('program_templates')
      .delete()
      .eq('id', programId);

    if (deleteError) {
      console.error('Error deleting program:', deleteError);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error in deleteProgramTemplate:', error);
    return false;
  }
}

/**
 * Update an existing program template
 * Only the creator can update their own programs
 */
export async function updateProgramTemplate(
  programId: string,
  updates: {
    title?: string;
    subtitle?: string;
    description?: string;
    duration_weeks?: number;
    days_per_week?: number;
    minutes_per_session?: number;
    cover_image_url?: string;
    difficulty_level?: string;
    primary_goal?: string;
    creator_name?: string;
  },
  userId: string
): Promise<ProgramTemplate | null> {
  try {
    // First verify the user is the creator
    const { data: program, error: fetchError } = await supabase
      .from('program_templates')
      .select('creator_id')
      .eq('id', programId)
      .single();

    if (fetchError || !program) {
      console.error('Error fetching program:', fetchError);
      return null;
    }

    if (program.creator_id !== userId) {
      console.error('User is not the creator of this program');
      return null;
    }

    // Update the program
    const { data, error: updateError } = await supabase
      .from('program_templates')
      .update({
        ...updates,
        updated_at: new Date().toISOString(),
      })
      .eq('id', programId)
      .select()
      .single();

    if (updateError) {
      console.error('Error updating program:', updateError);
      return null;
    }

    return data;
  } catch (error) {
    console.error('Error in updateProgramTemplate:', error);
    return null;
  }
}

/**
 * Upload program cover image to Supabase Storage
 * Returns the public URL of the uploaded image
 */
export async function uploadProgramCoverImage(
  imageUri: string,
  userId: string
): Promise<string | null> {
  try {
    const { data: { session } } = await supabase.auth.getSession();

    if (!session) {
      console.error('No session available for upload');
      return null;
    }

    // Create unique filename
    const fileExt = imageUri.split('.').pop()?.split('?')[0] || 'jpg';
    const timestamp = Date.now();
    const fileName = `${userId}/${timestamp}_cover.${fileExt}`;

    // Use FormData for React Native compatibility
    const formData = new FormData();
    formData.append('file', {
      uri: imageUri,
      type: `image/${fileExt === 'jpg' ? 'jpeg' : fileExt}`,
      name: `cover.${fileExt}`,
    } as any);

    // Upload using fetch with FormData (React Native pattern)
    const uploadUrl = `${process.env.EXPO_PUBLIC_SUPABASE_URL}/storage/v1/object/program-covers/${fileName}`;

    const uploadResponse = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${session.access_token}`,
      },
      body: formData,
    });

    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text();
      console.error('Upload failed:', uploadResponse.status, errorText);
      return null;
    }

    // Get public URL
    const { data: { publicUrl } } = supabase.storage
      .from('program-covers')
      .getPublicUrl(fileName);

    return publicUrl;
  } catch (error) {
    console.error('Program cover upload failed:', error);
    return null;
  }
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

/**
 * How a program run stops being the one that schedules your days.
 *
 * `abandoned` and `completed` are both endings — the difference is only what
 * the history says happened, and the caller decides that, never this function.
 * A run you stopped keeping up with is `abandoned`: recording it as
 * `completed` would put a finish line in your history you never crossed.
 */
export type ProgramEndOutcome = 'abandoned' | 'completed';

/**
 * End a program run.
 *
 * `status` is what every scheduling read keys on — `fetchTodaysWorkout` looks
 * for the one instance with `status = 'active'` — so this single write is what
 * stops the daily recommendation. The scheduled `workout_instances` rows are
 * deliberately left alone: they are the plan this run HAD, they no longer
 * reach any surface once the run is not active, and deleting them would take
 * the completed ones (your history) with them.
 *
 * `actual_end_date` is stamped from the LOCAL calendar, not
 * `toISOString().split('T')[0]` — an evening in a negative-offset timezone
 * converts to tomorrow in UTC, which is how a run gets an end date it never
 * saw. Same rule the expiration-date picker records.
 */
export async function endProgramInstance(
  instanceId: string,
  outcome: ProgramEndOutcome,
): Promise<ProgramInstance> {
  return updateProgramInstance(instanceId, {
    status: outcome,
    actual_end_date: getLocalDateString(),
  });
}

/**
 * Pause a run, or put a paused one back to work.
 *
 * Pausing reads as the same silence as ending — no workout is recommended,
 * because only an `active` run schedules anything — but it keeps
 * `actual_end_date` null, so the run has no ending recorded and resuming
 * leaves no trace of the gap. That is the whole distinction: a pause is a
 * break you mean to come back from.
 */
export async function setProgramInstancePaused(
  instanceId: string,
  paused: boolean,
): Promise<ProgramInstance> {
  return updateProgramInstance(instanceId, { status: paused ? 'paused' : 'active' });
}

/**
 * The user's one scheduling run, if they have one — the same "active"
 * question `fetchTodaysWorkout` asks, so a surface offering to END a run and
 * the card showing that run's workout can never disagree about which run it
 * is. `paused` deliberately does NOT count: a paused run schedules nothing.
 */
export async function fetchActiveProgramInstance(
  userId: string,
): Promise<ProgramInstance | null> {
  const { data, error } = await supabase
    .from('program_instances')
    .select('*')
    .eq('user_id', userId)
    // Both predicates, and in this order, because `fetchTodaysWorkout` asks
    // exactly this pair — a run is the scheduler's run only if it is active
    // AND unended. Matching one but not the other is how a surface starts
    // disagreeing with the card on Home about whether a program is running.
    .is('actual_end_date', null)
    .eq('status', 'active')
    .order('start_date', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('Error fetching active program instance:', error);
    throw error;
  }

  return data;
}

/**
 * This user's unfinished run of ONE program — active or paused.
 *
 * Wider than `fetchActiveProgramInstance` on purpose: a paused run schedules
 * nothing, but it is still yours and still the thing you would resume or end,
 * so a program's own page must offer it rather than inviting you to start a
 * second run alongside it.
 */
export async function fetchCurrentRunForProgram(
  userId: string,
  programId: string,
): Promise<ProgramInstance | null> {
  const { data, error } = await supabase
    .from('program_instances')
    .select('*')
    .eq('user_id', userId)
    .eq('program_id', programId)
    .is('actual_end_date', null)
    .in('status', ['active', 'paused'])
    .order('start_date', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('Error fetching current run for program:', error);
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

// ============================================================================
// PROGRAM WORKOUTS (Workout Templates - Add Workout Wizard)
// ============================================================================

/**
 * Fetch all exercises (non-movements) for workout wizard
 * Only returns exercises where is_movement = false (training exercises, not CrossFit movements)
 */
export async function fetchExercises(): Promise<Exercise[]> {
  const { data, error } = await supabase
    .from('exercises')
    .select('*')
    .eq('is_movement', false)
    .order('name');

  if (error) {
    console.error('Error fetching exercises:', error);
    throw error;
  }

  return data || [];
}

/**
 * Search exercises by name (non-movements only)
 */
export async function searchExercises(query: string): Promise<Exercise[]> {
  const { data, error } = await supabase
    .from('exercises')
    .select('*')
    .eq('is_movement', false)
    .ilike('name', `%${query}%`)
    .order('name')
    .limit(30);

  if (error) {
    console.error('Error searching exercises:', error);
    throw error;
  }

  return data || [];
}

/**
 * Create a program workout with exercises
 * Called from the Add Workout wizard to save a new workout template
 */
export async function createProgramWorkout(
  input: CreateProgramWorkoutInput
): Promise<ProgramWorkout | null> {
  try {
    // Step 1: Create the workout record
    const { data: workout, error: workoutError } = await supabase
      .from('program_workouts')
      .insert({
        program_id: input.program_id,
        week_number: input.week_number,
        day_number: input.day_number,
        name: input.name,
        workout_type: input.workout_type,
        estimated_duration_minutes: input.estimated_duration_minutes,
        warmup_instructions: input.warmup_instructions,
        cooldown_instructions: input.cooldown_instructions,
        notes: input.notes,
      })
      .select()
      .single();

    if (workoutError || !workout) {
      console.error('Error creating workout:', workoutError);
      return null;
    }

    // Step 2: Create exercise records if any
    if (input.exercises.length > 0) {
      const exerciseRecords = input.exercises.map((ex, index) => ({
        program_workout_id: workout.id,
        exercise_id: ex.exercise_id,
        section: ex.section,
        exercise_order: ex.exercise_order || index + 1,
        // Exercise group fields
        group_id: ex.group_id || null,
        group_type: ex.group_type || null,
        group_item_order: ex.group_item_order ?? 0,
        // Prescription fields
        target_sets: ex.target_sets || null,
        target_reps_min: ex.target_reps || null,
        target_reps_max: ex.target_reps || null,
        target_time_seconds: ex.target_time_seconds || null,
        is_per_side: ex.is_per_side,
        load_type: ex.load_type,
        target_rpe_min: ex.load_rpe || null,
        target_rpe_max: ex.load_rpe || null,
        load_percentage_1rm: ex.load_percentage_1rm || null,
        load_weight_lbs: ex.load_weight_lbs || null,
        load_notes: ex.load_notes || null,
        rest_seconds: ex.rest_seconds || null,
        estimated_duration_minutes: ex.estimated_duration_minutes || null,
        video_url: ex.video_url || null,
        exercise_notes: ex.exercise_notes || null,
        tempo: ex.tempo || null,
      }));

      const { error: exerciseError } = await supabase
        .from('program_workout_exercises')
        .insert(exerciseRecords);

      if (exerciseError) {
        console.error('Error creating exercises:', exerciseError);
        // Rollback: delete the workout if exercise creation fails
        await supabase.from('program_workouts').delete().eq('id', workout.id);
        return null;
      }
    }

    return workout;
  } catch (error) {
    console.error('Error in createProgramWorkout:', error);
    return null;
  }
}

/**
 * Update an existing program workout with exercises
 * Called from the Edit Workout wizard to update an existing workout template
 */
export async function updateProgramWorkout(
  workoutId: string,
  input: Omit<CreateProgramWorkoutInput, 'program_id' | 'week_number'>
): Promise<ProgramWorkout | null> {
  try {
    // Step 1: Update the workout record
    const { data: workout, error: workoutError } = await supabase
      .from('program_workouts')
      .update({
        day_number: input.day_number,
        name: input.name,
        workout_type: input.workout_type,
        estimated_duration_minutes: input.estimated_duration_minutes || null,
        warmup_instructions: input.warmup_instructions || null,
        cooldown_instructions: input.cooldown_instructions || null,
        notes: input.notes || null,
      })
      .eq('id', workoutId)
      .select()
      .single();

    if (workoutError || !workout) {
      console.error('Error updating workout:', workoutError);
      return null;
    }

    // Step 2: Delete existing exercises and re-create them
    // This is simpler than trying to diff and update individual exercises
    const { error: deleteError } = await supabase
      .from('program_workout_exercises')
      .delete()
      .eq('program_workout_id', workoutId);

    if (deleteError) {
      console.error('Error deleting existing exercises:', deleteError);
      return null;
    }

    // Step 3: Create new exercise records
    if (input.exercises.length > 0) {
      const exerciseRecords = input.exercises.map((ex, index) => ({
        program_workout_id: workoutId,
        exercise_id: ex.exercise_id,
        section: ex.section,
        exercise_order: ex.exercise_order || index + 1,
        // Exercise group fields
        group_id: ex.group_id || null,
        group_type: ex.group_type || null,
        group_item_order: ex.group_item_order ?? 0,
        // Prescription fields
        target_sets: ex.target_sets || null,
        target_reps_min: ex.target_reps || null,
        target_reps_max: ex.target_reps || null,
        target_time_seconds: ex.target_time_seconds || null,
        is_per_side: ex.is_per_side,
        load_type: ex.load_type,
        target_rpe_min: ex.load_rpe || null,
        target_rpe_max: ex.load_rpe || null,
        load_percentage_1rm: ex.load_percentage_1rm || null,
        load_weight_lbs: ex.load_weight_lbs || null,
        load_notes: ex.load_notes || null,
        rest_seconds: ex.rest_seconds || null,
        estimated_duration_minutes: ex.estimated_duration_minutes || null,
        video_url: ex.video_url || null,
        exercise_notes: ex.exercise_notes || null,
        tempo: ex.tempo || null,
      }));

      const { error: exerciseError } = await supabase
        .from('program_workout_exercises')
        .insert(exerciseRecords);

      if (exerciseError) {
        console.error('Error creating exercises:', exerciseError);
        return null;
      }
    }

    return workout;
  } catch (error) {
    console.error('Error in updateProgramWorkout:', error);
    return null;
  }
}

/**
 * Delete a program workout and all its exercises
 * Exercises are deleted automatically via CASCADE
 */
export async function deleteProgramWorkout(workoutId: string): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('program_workouts')
      .delete()
      .eq('id', workoutId);

    if (error) {
      console.error('Error deleting workout:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error in deleteProgramWorkout:', error);
    return false;
  }
}

/**
 * Fetch workouts for a specific week of a program
 * Used in ScheduleTab to display workouts for the selected week
 */
export async function fetchWorkoutsForWeek(
  programId: string,
  weekNumber: number
): Promise<ProgramWorkoutWithRelations[]> {
  const { data, error } = await supabase
    .from('program_workouts')
    .select(`
      *,
      exercises:program_workout_exercises(
        *,
        exercise:exercises(*)
      )
    `)
    .eq('program_id', programId)
    .eq('week_number', weekNumber)
    .order('day_number');

  if (error) {
    console.error('Error fetching workouts for week:', error);
    throw error;
  }

  return data || [];
}
