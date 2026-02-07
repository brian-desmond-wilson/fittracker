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
export function parseDate(raw: string, yearHint?: number): Date | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // Check for cycle markers ("Cycle 2", "Cycle 3")
  if (/^cycle\s*\d/i.test(trimmed)) return null;

  // Check for serial date number (Google Sheets uses epoch Dec 30, 1899)
  const num = Number(trimmed);
  if (!isNaN(num) && num > 40000 && num < 60000) {
    // Google Sheets serial date
    const date = new Date(Date.UTC(1899, 11, 30 + num));
    return isValidDate(date) ? date : null;
  }

  // Try ISO format: YYYY-MM-DD
  const isoMatch = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (isoMatch) {
    const date = new Date(+isoMatch[1], +isoMatch[2] - 1, +isoMatch[3]);
    return isValidDate(date) ? date : null;
  }

  // Try US format: M/D/YY or M/D/YYYY
  const usMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (usMatch) {
    let year = +usMatch[3];
    if (year < 100) {
      year = year >= 50 ? 1900 + year : 2000 + year;
    }
    const date = new Date(year, +usMatch[1] - 1, +usMatch[2]);
    return isValidDate(date) ? date : null;
  }

  // Try M/D format (no year): "5/12" - use yearHint
  const shortMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})$/);
  if (shortMatch && yearHint) {
    const date = new Date(yearHint, +shortMatch[1] - 1, +shortMatch[2]);
    return isValidDate(date) ? date : null;
  }

  // Try Date.parse as fallback
  const fallback = new Date(trimmed);
  return isValidDate(fallback) ? fallback : null;
}

function isValidDate(d: Date): boolean {
  return d instanceof Date && !isNaN(d.getTime());
}

/** Format a date as YYYY-MM-DD for Supabase */
export function formatDate(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Format a date as ISO timestamp for Supabase */
export function formatTimestamp(d: Date): string {
  return d.toISOString();
}

/** Days between two dates */
export function daysBetween(a: Date, b: Date): number {
  const msPerDay = 86400000;
  return Math.abs(Math.floor((b.getTime() - a.getTime()) / msPerDay));
}

/** Get year from a date for use as yearHint */
export function getYear(d: Date): number {
  return d.getFullYear();
}
