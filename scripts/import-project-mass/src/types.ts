// ============================================================================
// Import-specific types for Project Mass data
// ============================================================================

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
  instanceLabel: string;      // col A - "Original", "Brak", etc.
  dayLabel: string;           // col B - "Day 1", "Day 9", "Cycle 2", etc.
  date: Date | null;          // col C - parsed date
  dateRaw: string;            // col C raw
  exercises: ParsedExercise[];
  rawRow: string[];
  hasSplitMarkers: boolean;   // true if any exercise had all "--" columns (done on different date)
}

/** One sheet's worth of parsed data */
export interface SheetData {
  gid: number;
  dayNumber: number;          // 1,2,3,5,6,7
  focus: string;              // "Lower Strength", etc.
  exerciseNames: string[];    // From row 3 header
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
  cycleNumber: number;        // 2, 3 (cycle 1 is implicit at start)
  date: Date | null;
}

/** A correlated program instance from all 6 sheets */
export interface ProgramInstanceData {
  instanceNumber: number;     // 1-12
  name: string;               // "Project Mass - Feb 2016"
  startDate: Date;
  endDate: Date;
  isOngoing: boolean;
  cycles: number[];           // [1], [1,2], [1,2,3]
  segments: SheetSegment[];   // One per sheet that has data for this instance
}

/** Data for a single workout (one day in one microcycle) */
export interface WorkoutData {
  dayNumber: number;          // 1,2,3,5,6,7
  weekNumber: number;         // microcycle number (1-12)
  cycleNumber: number;        // 1,2,3
  scheduledDate: Date;
  endDate: Date | null;       // non-null for split workouts
  exercises: WorkoutExerciseData[];
  status: 'completed' | 'skipped';
}

/** Data for one exercise in a workout */
export interface WorkoutExerciseData {
  exerciseName: string;
  performedDate: Date | null; // non-null for split workouts
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
  startDate: string;          // "M/D/YY" or similar
  endDate: string;            // or "ongoing"
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
