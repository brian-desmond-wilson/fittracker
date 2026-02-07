import { SupabaseClient } from '@supabase/supabase-js';
import type { ProgramInstanceData, ImportStats } from './types.js';
/**
 * Phase 1A: Create/upsert all exercises found across all instances
 */
export declare function upsertExercises(supabase: SupabaseClient, allExerciseNames: Set<string>, stats: ImportStats, verbose: boolean): Promise<Map<string, string>>;
/**
 * Phase 1B: Create program template (idempotent via slug)
 */
export declare function upsertProgramTemplate(supabase: SupabaseClient, userId: string, verbose: boolean): Promise<string>;
/**
 * Phase 1C: Create 3 program cycles
 */
export declare function upsertProgramCycles(supabase: SupabaseClient, programId: string, verbose: boolean): Promise<Map<number, string>>;
/**
 * Phase 1D: Create program workouts (6 training days × 4 micros × 3 cycles = 72)
 * Each workout template is unique by (program_id, week_number, day_number)
 */
export declare function upsertProgramWorkouts(supabase: SupabaseClient, programId: string, cycleMap: Map<number, string>, verbose: boolean): Promise<Map<string, string>>;
/**
 * Phase 1E: Create program_workout_exercises for each workout template.
 * Derives exercises from the actual parsed data, including cycle-remapped names.
 */
export declare function upsertProgramWorkoutExercises(supabase: SupabaseClient, programId: string, workoutMap: Map<string, string>, exerciseIdMap: Map<string, string>, instances: ProgramInstanceData[], verbose: boolean): Promise<void>;
/**
 * Phase 1F: Create progressions for each program_workout_exercise
 */
export declare function upsertProgressions(supabase: SupabaseClient, workoutMap: Map<string, string>, verbose: boolean): Promise<void>;
/**
 * Phase 2: Import a single program instance
 */
export declare function importInstance(supabase: SupabaseClient, instance: ProgramInstanceData, programId: string, workoutMap: Map<string, string>, exerciseIdMap: Map<string, string>, userId: string, stats: ImportStats, verbose: boolean): Promise<void>;
