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

// Workout Section Types (for grouping exercises within a workout)
export type WorkoutSection = 'Warmup' | 'Prehab' | 'Strength' | 'Accessory' | 'Isometric' | 'Cooldown';
export type LoadType = 'rpe' | 'percentage_1rm' | 'weight' | 'notes' | 'none';

export const WORKOUT_SECTIONS: WorkoutSection[] = [
  'Warmup',
  'Prehab',
  'Strength',
  'Accessory',
  'Isometric',
  'Cooldown',
];

export const SECTION_DISPLAY_NAMES: Record<WorkoutSection, string> = {
  'Warmup': 'Warm-up',
  'Prehab': 'Prehab',
  'Strength': 'Strength',
  'Accessory': 'Accessory',
  'Isometric': 'Isometric',
  'Cooldown': 'Cool-down',
};

export const SECTION_DESCRIPTIONS: Record<WorkoutSection, string> = {
  'Warmup': 'Light cardio and dynamic stretches to prepare the body',
  'Prehab': 'Activation and mobility work to prevent injury',
  'Strength': 'Primary compound movements and heavy lifts',
  'Accessory': 'Supplemental exercises to support main lifts',
  'Isometric': 'Static holds and stability work',
  'Cooldown': 'Stretching and recovery to promote flexibility',
};

export interface ProgramTemplate {
  id: string;
  created_at: string;
  updated_at: string;

  // Program Info
  title: string;
  subtitle: string | null;
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
  // Deprecated fields removed in migration 20251028000001
  // demo_video_url, thumbnail_url, setup_instructions, execution_cues, common_mistakes
  video_url: string | null;
  image_url: string | null;
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

  // Section grouping
  section: WorkoutSection | null;

  // Set/Rep Scheme
  target_sets: number | null;
  target_reps_min: number | null;
  target_reps_max: number | null;
  target_time_seconds: number | null;
  is_per_side: boolean;

  // Load Configuration
  load_type: LoadType | null;
  target_rpe_min: number | null;
  target_rpe_max: number | null;
  load_percentage_1rm: number | null;
  load_weight_lbs: number | null;
  load_notes: string | null;

  // Metadata
  rest_seconds: number | null;
  estimated_duration_minutes: number | null;
  video_url: string | null;
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

export interface CreateProgramTemplateInput {
  title: string;
  subtitle?: string;
  description?: string;
  duration_weeks: number;
  days_per_week: number;
  minutes_per_session: number;
  cover_image_url?: string;
  // Optional fields with defaults set by API
  primary_goal?: PrimaryGoal;
  difficulty_level?: DifficultyLevel;
  tags?: string[];
  prerequisites?: string[];
  equipment_required?: string[];
}

// ============================================================================
// WORKOUT WIZARD FORM TYPES
// ============================================================================

/**
 * Configuration for a single exercise within a workout (used in wizard forms)
 */
export interface WorkoutExerciseConfig {
  // Core identification
  exercise_id: string;
  exercise_name: string;
  section: WorkoutSection;
  exercise_order: number;

  // Sets/Reps Configuration
  target_sets?: number;
  target_reps?: number;
  target_time_seconds?: number;
  is_per_side: boolean;

  // Load Configuration
  load_type: LoadType;
  load_rpe?: number;
  load_percentage_1rm?: number;
  load_weight_lbs?: number;
  load_notes?: string;

  // Metadata
  rest_seconds?: number;
  estimated_duration_minutes?: number;
  video_url?: string;
  exercise_notes?: string;
  tempo?: string;
}

/**
 * Form data for the Add Workout wizard
 */
export interface WorkoutFormData {
  // Step 1: Basics
  name: string;
  day_number: number;
  workout_type: WorkoutType;
  estimated_duration_minutes?: number;
  warmup_instructions?: string;
  cooldown_instructions?: string;
  notes?: string;

  // Step 2: Exercises
  exercises: WorkoutExerciseConfig[];
}

/**
 * Input for creating a new program workout with exercises
 */
export interface CreateProgramWorkoutInput {
  program_id: string;
  week_number: number;
  day_number: number;
  name: string;
  workout_type: WorkoutType;
  estimated_duration_minutes?: number;
  warmup_instructions?: string;
  cooldown_instructions?: string;
  notes?: string;
  exercises: Omit<WorkoutExerciseConfig, 'exercise_name'>[];
}

/**
 * Exercises grouped by section (used in UI display)
 */
export interface ExercisesBySection {
  Warmup: WorkoutExerciseConfig[];
  Prehab: WorkoutExerciseConfig[];
  Strength: WorkoutExerciseConfig[];
  Accessory: WorkoutExerciseConfig[];
  Isometric: WorkoutExerciseConfig[];
  Cooldown: WorkoutExerciseConfig[];
}
