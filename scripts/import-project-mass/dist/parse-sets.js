import { SKIP_VALUES } from './config.js';
/**
 * Difficulty ratings ordered by length (longest first) to avoid partial matches.
 * "vh" must be checked before "v" or "h", "mh" before "m" or "h", etc.
 */
const DIFFICULTY_TOKENS = ['vh', 'mh', 'em', 'e', 'm', 'h'];
/**
 * Parse a single set cell value like "3x225mh^" or "3 x 185" or "10x135m/h"
 * Returns null if the cell is empty or a skip value.
 *
 * All working set data comes from Set 1-7 columns. All warmup data comes from
 * Notes columns. There is NO percentage-based warmup classification.
 */
export function parseSetCell(raw) {
    if (!raw)
        return null;
    const trimmed = raw.trim();
    if (!trimmed)
        return null;
    if (SKIP_VALUES.has(trimmed.toLowerCase()))
        return null;
    // Check for increase weight marker
    const increaseWeight = trimmed.includes('^');
    // Normalize: remove ^, trim
    let clean = trimmed.replace(/\^/g, '').trim();
    // Normalize difficulty separators: "m/h" -> "mh", "e/m" -> "em"
    clean = clean.replace(/m\/h/gi, 'mh');
    clean = clean.replace(/e\/m/gi, 'em');
    // Extract difficulty from end of string
    let difficulty = null;
    let withoutDifficulty = clean;
    for (const token of DIFFICULTY_TOKENS) {
        const lower = withoutDifficulty.toLowerCase();
        if (lower.endsWith(token)) {
            difficulty = token;
            withoutDifficulty = withoutDifficulty.slice(0, -token.length).trim();
            break;
        }
    }
    // Now parse "reps x weight" — the main pattern
    // Handle: "3x225", "3 x 225", "10x135", "4x205", "10 x 60"
    const match = withoutDifficulty.match(/^(\d+)\s*x\s*(\d+(?:\.\d+)?)\s*$/i);
    if (match) {
        return {
            reps: parseInt(match[1], 10),
            weight: parseFloat(match[2]),
            difficulty,
            increaseWeight,
            isWarmup: false,
            raw: trimmed,
        };
    }
    // Handle "reps x ?" — bodyweight exercises with unknown weight (treat as 0)
    const unknownWeightMatch = withoutDifficulty.match(/^(\d+)\s*x\s*\?\s*$/i);
    if (unknownWeightMatch) {
        return {
            reps: parseInt(unknownWeightMatch[1], 10),
            weight: 0,
            difficulty,
            increaseWeight,
            isWarmup: false,
            raw: trimmed,
        };
    }
    // Handle "reps x 8?" or "10 x 9?" — uncertain weight (best effort parse)
    const uncertainMatch = withoutDifficulty.match(/^(\d+)\s*x\s*(\d+)\?\s*$/i);
    if (uncertainMatch) {
        return {
            reps: parseInt(uncertainMatch[1], 10),
            weight: parseFloat(uncertainMatch[2]),
            difficulty,
            increaseWeight,
            isWarmup: false,
            raw: trimmed,
        };
    }
    // Handle edge case: "4x" with no weight (incomplete entry)
    const partialMatch = withoutDifficulty.match(/^(\d+)\s*x\s*$/i);
    if (partialMatch) {
        return {
            reps: parseInt(partialMatch[1], 10),
            weight: 0,
            difficulty,
            increaseWeight,
            isWarmup: false,
            raw: trimmed,
        };
    }
    // If we couldn't parse it, return null (not a set)
    return null;
}
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
export function parseWarmupNotes(notesRaw) {
    if (!notesRaw || !notesRaw.trim()) {
        return { warmupSets: [], remainingNotes: '' };
    }
    const notes = notesRaw.trim();
    const warmupSets = [];
    // Check if the notes field starts with set data (NxW pattern)
    const setPattern = /^\s*\d+\s*x\s*\d+/i;
    if (!setPattern.test(notes)) {
        // Doesn't start with set data — it's just text notes
        return { warmupSets: [], remainingNotes: notes };
    }
    // Split by comma and try to parse each part
    const parts = notes.split(',');
    let lastSetIndex = -1;
    for (let i = 0; i < parts.length; i++) {
        const parsed = parseSetCell(parts[i].trim());
        if (parsed) {
            parsed.isWarmup = true;
            warmupSets.push(parsed);
            lastSetIndex = i;
        }
        else {
            // If we hit a non-set part after finding sets, stop
            if (lastSetIndex >= 0)
                break;
        }
    }
    // Everything after the last warmup set is remaining notes
    const remainingParts = parts.slice(lastSetIndex + 1);
    const remainingNotes = remainingParts.join(',').trim();
    return { warmupSets, remainingNotes };
}
/**
 * Checks if a cell value is a split workout marker ("--" or "---").
 * This means "exercise was done on a different date."
 */
/**
 * Checks if a cell value is a split workout marker.
 * This means "exercise was done on a different date."
 * Handles regular hyphens (--), em-dashes (———), en-dashes (––), and mixes.
 */
export function isSplitMarker(value) {
    const trimmed = value.trim();
    if (!trimmed)
        return false;
    // 2+ regular hyphens: --, ---
    if (/^-{2,}$/.test(trimmed))
        return true;
    // Any em-dash (—) or en-dash (–) character(s), possibly mixed with hyphens
    if (/^[\u2013\u2014][-\u2013\u2014]*$/.test(trimmed))
        return true;
    return false;
}
//# sourceMappingURL=parse-sets.js.map