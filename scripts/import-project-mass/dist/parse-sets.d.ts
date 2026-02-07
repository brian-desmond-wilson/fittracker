import type { ParsedSet } from './types.js';
/**
 * Parse a single set cell value like "3x225mh^" or "3 x 185" or "10x135m/h"
 * Returns null if the cell is empty or a skip value.
 *
 * All working set data comes from Set 1-7 columns. All warmup data comes from
 * Notes columns. There is NO percentage-based warmup classification.
 */
export declare function parseSetCell(raw: string): ParsedSet | null;
/**
 * Parse warmup sets from the Notes column.
 * Warmup sets appear as comma-separated values like:
 * "12x45e, 12x95e, 10x135m, 8x185mh"
 * "8x45, 8x95, 6x135"
 *
 * ONLY the Notes column contains warmup sets.
 * Set 1-7 columns ALWAYS contain working sets — never warmups.
 *
 * Returns the warmup sets found (if any) and the remaining notes text.
 */
export declare function parseWarmupNotes(notesRaw: string): {
    warmupSets: ParsedSet[];
    remainingNotes: string;
};
/**
 * Checks if a cell value is a split workout marker ("--" or "---").
 * This means "exercise was done on a different date."
 */
/**
 * Checks if a cell value is a split workout marker.
 * This means "exercise was done on a different date."
 * Handles regular hyphens (--), em-dashes (———), en-dashes (––), and mixes.
 */
export declare function isSplitMarker(value: string): boolean;
