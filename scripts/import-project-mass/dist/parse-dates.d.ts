/**
 * Parse dates from various formats found in Google Sheets export.
 *
 * Known formats:
 * - "2/3/16" or "2/3/2016" (US short)
 * - "3/19/18" (US short)
 * - "5/12" (month/day, year inferred from context)
 * - "2020-01-15" (ISO)
 * - "3/22/18" (after empty Instance col)
 * - Serial date numbers from Google Sheets
 */
export declare function parseDate(raw: string, yearHint?: number): Date | null;
/** Format a date as YYYY-MM-DD for Supabase */
export declare function formatDate(d: Date): string;
/** Format a date as ISO timestamp for Supabase */
export declare function formatTimestamp(d: Date): string;
/** Days between two dates */
export declare function daysBetween(a: Date, b: Date): number;
/** Get year from a date for use as yearHint */
export declare function getYear(d: Date): number;
