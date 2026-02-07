import type { SheetConfig, KnownInstance } from './types.js';
export declare const SPREADSHEET_ID = "1gBNQ4_NBQ0I3hT3bZNo9LZHLfhSkXTQ92Ns7-tXMRkU";
export declare const SHEET_CONFIGS: SheetConfig[];
/** Known instances with their date ranges and cycle counts */
export declare const KNOWN_INSTANCES: KnownInstance[];
/** Day number to workout type mapping */
export declare const DAY_TYPE: Record<number, 'Strength' | 'Hypertrophy'>;
/** Day number to workout name mapping */
export declare const DAY_NAMES: Record<number, string>;
/**
 * Periodization rep/set scheme per micro-session
 * Key: micro number (1-4), Value: { reps, sets }
 * Used ONLY for program_workout_exercises template targets — actual data is parsed from CSV.
 */
export declare const STRENGTH_SCHEME: Record<number, {
    reps: number;
    sets: number;
}>;
export declare const HYPERTROPHY_SCHEME: Record<number, {
    reps: number;
    sets: number;
}>;
/**
 * Cycle 2 exercise name remapping.
 * CSV headers always show Cycle 1 exercise names. In Cycle 2, different exercises
 * are logged in the same columns. This map provides the correct exercise name.
 * Key: dayNumber → Map<cycle1HeaderName, cycle2ExerciseName>
 *
 * Cycle 3 returns to Cycle 1 exercises (no remapping needed).
 * null value = exercise stays the same in Cycle 2.
 */
export declare const CYCLE_2_EXERCISE_MAP: Record<number, Record<string, string | null>>;
/**
 * Get the correct exercise name for a given cycle.
 * Cycle 1 & 3: use the header name as-is.
 * Cycle 2: look up the remapping, fall back to header name if not mapped.
 */
export declare function getExerciseNameForCycle(headerName: string, dayNumber: number, cycleNumber: number): string;
/** Values in cells that should be treated as no data */
export declare const SKIP_VALUES: Set<string>;
/** Date gap threshold (in days) to detect new instances */
export declare const DATE_GAP_THRESHOLD = 14;
