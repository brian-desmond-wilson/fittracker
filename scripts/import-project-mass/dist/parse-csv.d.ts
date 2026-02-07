import type { SheetConfig, SheetData, SheetSegment } from './types.js';
/**
 * Fetch a single sheet as CSV from Google Sheets
 */
export declare function fetchSheetCSV(gid: number): Promise<string>;
/**
 * Parse a full sheet CSV into structured data
 */
export declare function parseSheetCSV(csvText: string, config: SheetConfig): SheetData;
/**
 * Detect instance boundaries within a sheet's data and group rows into segments.
 * Uses the known instance date ranges for precise matching.
 */
export declare function detectSegments(sheetData: SheetData, knownInstances: {
    startDate: Date;
    endDate: Date | null;
}[]): SheetSegment[];
