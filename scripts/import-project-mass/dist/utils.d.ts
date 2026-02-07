/**
 * Generate a URL-safe slug from a string.
 * "Barbell Bench Press (Medium Grip)" → "barbell-bench-press-medium-grip"
 */
export declare function slugify(text: string): string;
/**
 * Normalize exercise names for consistent matching.
 * Handles common variations in spelling/formatting.
 */
export declare function normalizeExerciseName(name: string): string;
/**
 * Determine exercise category based on name
 */
export declare function guessExerciseCategory(name: string): 'Compound' | 'Isolation' | 'Accessory';
/**
 * Determine primary muscle groups based on exercise name
 */
export declare function guessMuscleGroups(name: string): string[];
/**
 * Determine equipment based on exercise name
 */
export declare function guessEquipment(name: string): string[];
/**
 * Create an ImportStats object with zero values
 */
export declare function createEmptyStats(): {
    exercisesCreated: number;
    exercisesExisting: number;
    programInstancesCreated: number;
    workoutInstancesCreated: number;
    exerciseInstancesCreated: number;
    setInstancesCreated: number;
    warmupSetsCreated: number;
    workingSetsCreated: number;
    splitWorkoutsDetected: number;
    rowsSkipped: number;
    errors: string[];
    warnings: string[];
};
