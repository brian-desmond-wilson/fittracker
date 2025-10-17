// Training Program Database Types
// Generated from Supabase schema

// ============================================================================
// PROGRAM TEMPLATE TYPES
// ============================================================================

export type PrimaryGoal = 'Strength' | 'Hypertrophy' | 'Power' | 'Endurance' | 'Hybrid';
export type DifficultyLevel = 'Beginner' | 'Intermediate' | 'Advanced';
export type WorkoutType = 'Strength' | 'Hypertrophy' | 'Power' | 'Endurance' | 'Rest' | 'Deload';
export type ExerciseCategory = 'Compound' | 'Isolation' | 'Accessory' | 'Cardio';
export type MediaType = 'video' | 'pdf' | 'document' | 'image';

export interface ProgramTemplate {
  id: string;
  created_at: string;
  updated_at: string;

  // Program Info
  title: string;
  slug: string;
  description: string;
  creator_name: string;
  creator_id: string | null;

  // Program Structure
  duration_weeks: number;
  days_per_week: number;
  minutes_per_session: number;

  // Program Attributes
  primary_goal: PrimaryGoal;
  difficulty_level: DifficultyLevel;
  training_style: string | null;

  // Media
  cover_image_url: string | null;
  video_preview_url: string | null;

  // Status
  is_published: boolean;
  is_featured: boolean;

  // Metadata
  tags: string[] | null;
  prerequisites: string[] | null;
  equipment_required: string[] | null;
}

export interface ProgramCycle {
  id: string;
  created_at: string;
  program_id: string;
  cycle_number: number;
  name: string;
  description: string | null;
  duration_weeks: number;
}

export interface Exercise {
  id: string;
  created_at: string;
  updated_at: string;
  name: string;
  slug: string;
  description: string | null;
  category: ExerciseCategory;
  muscle_groups: string[];
  equipment: string[];
  demo_video_url: string | null;
  thumbnail_url: string | null;
  setup_instructions: string | null;
  execution_cues: string[] | null;
  common_mistakes: string[] | null;
}

export interface ProgramWorkout {
  id: string;
  created_at: string;
  program_id: string;
  cycle_id: string | null;
  week_number: number;
  day_number: number;
  name: string;
  workout_type: WorkoutType;
  estimated_duration_minutes: number | null;
  warmup_instructions: string | null;
  cooldown_instructions: string | null;
  notes: string | null;
}

export interface ProgramWorkoutExercise {
  id: string;
  created_at: string;
  program_workout_id: string;
  exercise_id: string;
  exercise_order: number;
  target_sets: number;
  target_reps_min: number | null;
  target_reps_max: number | null;
  target_rpe_min: number | null;
  target_rpe_max: number | null;
  rest_seconds: number | null;
  exercise_notes: string | null;
  tempo: string | null;
}

export interface ProgramWorkoutExerciseProgression {
  id: string;
  created_at: string;
  program_workout_exercise_id: string;
  week_number: number;
  intensity_percentage: number | null;
  rpe_target: number | null;
  volume_sets: number | null;
  week_notes: string | null;
}

export interface ProgramMedia {
  id: string;
  created_at: string;
  program_id: string;
  media_type: MediaType;
  title: string;
  description: string | null;
  storage_path: string | null;
  external_url: string | null;
  file_size_bytes: number | null;
  duration_seconds: number | null;
  thumbnail_url: string | null;
  display_order: number;
}

// ============================================================================
// USER PROGRAM INSTANCE TYPES
// ============================================================================

export type ProgramInstanceStatus = 'active' | 'completed' | 'paused' | 'abandoned';
export type WorkoutInstanceStatus = 'scheduled' | 'in_progress' | 'completed' | 'skipped';
export type ExerciseInstanceStatus = 'not_started' | 'in_progress' | 'completed' | 'skipped';

export interface ProgramInstance {
  id: string;
  created_at: string;
  updated_at: string;
  user_id: string;
  program_id: string;
  instance_name: string;
  start_date: string;
  expected_end_date: string;
  actual_end_date: string | null;
  current_week: number;
  current_day: number;
  status: ProgramInstanceStatus;
  workouts_completed: number;
  total_workouts: number;
}

export interface WorkoutInstance {
  id: string;
  created_at: string;
  updated_at: string;
  program_instance_id: string;
  program_workout_id: string;
  user_id: string;
  scheduled_date: string;
  week_number: number;
  day_number: number;
  status: WorkoutInstanceStatus;
  started_at: string | null;
  completed_at: string | null;
  total_duration_minutes: number | null;
  total_volume_lbs: number | null;
  notes: string | null;
  energy_level: number | null;
  overall_difficulty: number | null;
}

export interface ExerciseInstance {
  id: string;
  created_at: string;
  updated_at: string;
  workout_instance_id: string;
  program_workout_exercise_id: string;
  exercise_id: string;
  user_id: string;
  exercise_order: number;
  status: ExerciseInstanceStatus;
  completed_at: string | null;
  notes: string | null;
  form_quality: number | null;
}

export interface SetInstance {
  id: string;
  created_at: string;
  exercise_instance_id: string;
  user_id: string;
  set_number: number;
  target_reps: number | null;
  target_weight_lbs: number | null;
  actual_reps: number;
  actual_weight_lbs: number;
  rpe: number | null;
  volume_lbs: number; // Calculated field
  is_warmup: boolean;
  is_failure: boolean;
}

// ============================================================================
// EXTENDED TYPES WITH RELATIONS (for UI components)
// ============================================================================

export interface ProgramTemplateWithRelations extends ProgramTemplate {
  cycles?: ProgramCycle[];
  media?: ProgramMedia[];
  workouts?: ProgramWorkout[];
}

export interface ProgramWorkoutWithRelations extends ProgramWorkout {
  exercises?: (ProgramWorkoutExercise & {
    exercise?: Exercise;
    progressions?: ProgramWorkoutExerciseProgression[];
  })[];
}

export interface WorkoutInstanceWithRelations extends WorkoutInstance {
  program_workout?: ProgramWorkout;
  exercise_instances?: (ExerciseInstance & {
    exercise?: Exercise;
    set_instances?: SetInstance[];
  })[];
}

export interface ProgramInstanceWithRelations extends ProgramInstance {
  program?: ProgramTemplate;
  workout_instances?: WorkoutInstanceWithRelations[];
}

// ============================================================================
// HELPER TYPES FOR FORMS
// ============================================================================

export interface CreateProgramInstanceInput {
  program_id: string;
  instance_name: string;
  start_date: string;
  expected_end_date: string;
  total_workouts: number;
}

export interface CreateWorkoutInstanceInput {
  program_instance_id: string;
  program_workout_id: string;
  scheduled_date: string;
  week_number: number;
  day_number: number;
}

export interface CreateSetInstanceInput {
  exercise_instance_id: string;
  set_number: number;
  target_reps?: number;
  target_weight_lbs?: number;
  actual_reps: number;
  actual_weight_lbs: number;
  rpe?: number;
  is_warmup?: boolean;
  is_failure?: boolean;
}

export interface UpdateWorkoutInstanceInput {
  status?: WorkoutInstanceStatus;
  started_at?: string;
  completed_at?: string;
  total_duration_minutes?: number;
  total_volume_lbs?: number;
  notes?: string;
  energy_level?: number;
  overall_difficulty?: number;
}
