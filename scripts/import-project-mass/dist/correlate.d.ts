import type { SheetSegment, ProgramInstanceData, WorkoutData } from './types.js';
/**
 * Match sheet segments to known program instances by date overlap.
 * Returns complete ProgramInstanceData objects ready for import.
 */
export declare function correlateInstances(allSegments: SheetSegment[][]): ProgramInstanceData[];
/**
 * Given a program instance's segments, build workout data organized by
 * microcycle (week_number) and day.
 *
 * For each sheet segment:
 * - Data rows are chronologically ordered
 * - Each row = one microcycle's workout for that day
 * - Row 1 = micro 1, Row 2 = micro 2, etc.
 * - Cycle markers indicate cycle transitions
 *
 * Exercise names are remapped based on cycle number:
 * - Cycle 1 & 3: use CSV header names as-is
 * - Cycle 2: use CYCLE_2_EXERCISE_MAP to get the correct variant
 */
export declare function buildWorkouts(instance: ProgramInstanceData): WorkoutData[];
/**
 * Collect ALL unique exercise names that will be needed across all instances.
 * This includes both Cycle 1 header names AND Cycle 2 remapped names.
 */
export declare function collectAllExerciseNames(instances: ProgramInstanceData[]): Set<string>;
