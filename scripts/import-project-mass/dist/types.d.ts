export type DifficultyRating = 'e' | 'em' | 'm' | 'mh' | 'h' | 'vh';
/** A single parsed set from the spreadsheet */
export interface ParsedSet {
    reps: number;
    weight: number;
    difficulty: DifficultyRating | null;
    increaseWeight: boolean;
    isWarmup: boolean;
    raw: string;
}
/** A parsed exercise from one row/date in one sheet */
export interface ParsedExercise {
    exerciseName: string;
    /** Column index where this exercise starts in the CSV */
    colStart: number;
    workingSets: ParsedSet[];
    warmupSets: ParsedSet[];
    notes: string;
}
/** A single data row from one sheet */
export interface ParsedRow {
    instanceLabel: string;
    dayLabel: string;
    date: Date | null;
    dateRaw: string;
    exercises: ParsedExercise[];
    rawRow: string[];
    hasSplitMarkers: boolean;
}
/** One sheet's worth of parsed data */
export interface SheetData {
    gid: number;
    dayNumber: number;
    focus: string;
    exerciseNames: string[];
    rows: ParsedRow[];
}
/** A segment within a sheet representing one program instance */
export interface SheetSegment {
    sheetGid: number;
    dayNumber: number;
    focus: string;
    startDate: Date;
    endDate: Date;
    rows: ParsedRow[];
    cycleMarkers: CycleMarker[];
}
/** Cycle boundary marker found in the data */
export interface CycleMarker {
    rowIndex: number;
    cycleNumber: number;
    date: Date | null;
}
/** A correlated program instance from all 6 sheets */
export interface ProgramInstanceData {
    instanceNumber: number;
    name: string;
    startDate: Date;
    endDate: Date;
    isOngoing: boolean;
    cycles: number[];
    segments: SheetSegment[];
}
/** Data for a single workout (one day in one microcycle) */
export interface WorkoutData {
    dayNumber: number;
    weekNumber: number;
    cycleNumber: number;
    scheduledDate: Date;
    endDate: Date | null;
    exercises: WorkoutExerciseData[];
    status: 'completed' | 'skipped';
}
/** Data for one exercise in a workout */
export interface WorkoutExerciseData {
    exerciseName: string;
    performedDate: Date | null;
    order: number;
    workingSets: ParsedSet[];
    warmupSets: ParsedSet[];
    notes: string;
}
/** Config for each spreadsheet sheet */
export interface SheetConfig {
    gid: number;
    dayNumber: number;
    focus: string;
}
/** The 12 known program instances */
export interface KnownInstance {
    number: number;
    name: string;
    startDate: string;
    endDate: string;
    cycles: number[];
}
/** Stats collected during import */
export interface ImportStats {
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
}
