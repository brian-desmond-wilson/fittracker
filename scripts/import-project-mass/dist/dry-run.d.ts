import type { ProgramInstanceData, SheetData, ImportStats } from './types.js';
/**
 * Preview what would be imported without making any database changes
 */
export declare function previewImport(instances: ProgramInstanceData[], allSheetData: SheetData[], allExerciseNames: Set<string>, verbose: boolean): ImportStats;
