// Types for the Workout Session screen (app/workout/[id].tsx).

export interface Exercise {
  id: string;
  name: string;
  image_url: string | null;
}

export interface ProgramWorkoutExercise {
  id: string;
  exercise_id: string;
  exercise_order: number;
  target_sets: number;
  target_reps_min: number;
  target_reps_max: number | null;
  superset_group: number | null;
  exercises: Exercise | Exercise[]; // Supabase returns array for nested select
  /** Which section of a composed day this came from — what the live screen
   *  groups its chapters by. Undefined for a program workout, which has no
   *  blocks and walks as one flat list. */
  section?: string | null;
}

export interface WorkoutTemplate {
  id: string;
  name: string;
  day_number: number;
  week_number: number;
  program_workout_exercises: ProgramWorkoutExercise[];
}

export interface SetEntry {
  id?: string;
  set_number: number;
  weight_lbs: number | null;
  actual_reps: number | null;
  is_warmup: boolean;
  difficulty: string | null;
  increase_weight_next: boolean;
  notes: string | null;
  completed: boolean;
  // Timing
  started_at: number | null; // timestamp when timer started
  completed_at: number | null; // timestamp when set was logged
  rest_seconds: number | null; // rest time before this set
  /** How long the set took. Authoritative when typed in; otherwise derived. */
  duration_seconds: number | null;
  /** Whether the timer produced these numbers or you did. A measured 4:12 and
   *  a remembered 4:12 are not equally trustworthy. */
  timing_source: "measured" | "entered" | null;
}

export interface ExerciseState {
  exercise: ProgramWorkoutExercise;
  exercise_instance_id?: string;
  sets: SetEntry[];
  notes: string;
  difficulty: string | null;
  increase_weight_next: boolean;
  completed: boolean;
  last_weight?: number;
  last_reps?: number;
}
