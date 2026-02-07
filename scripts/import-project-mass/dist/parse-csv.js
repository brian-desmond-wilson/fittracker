import { parse } from 'csv-parse/sync';
import { parseDate, daysBetween, getYear } from './parse-dates.js';
import { parseSetCell, parseWarmupNotes, isSplitMarker } from './parse-sets.js';
import { SPREADSHEET_ID, SKIP_VALUES, DATE_GAP_THRESHOLD } from './config.js';
/**
 * Fetch a single sheet as CSV from Google Sheets
 */
export async function fetchSheetCSV(gid) {
    const url = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/export?format=csv&gid=${gid}`;
    const response = await fetch(url, {
        redirect: 'follow',
        headers: {
            'Accept': 'text/csv',
        },
    });
    if (!response.ok) {
        throw new Error(`Failed to fetch sheet ${gid}: ${response.status} ${response.statusText}`);
    }
    return response.text();
}
/**
 * Parse the header rows (rows 1-4) to determine exercise layout
 */
function parseExerciseLayout(rows) {
    if (rows.length < 4)
        return [];
    const exerciseNameRow = rows[2]; // Row 3: exercise names
    const setHeaderRow = rows[3]; // Row 4: "Set 1", "Set 2", etc.
    const exercises = [];
    let currentExercise = null;
    // Start from column 3 (D) - first 3 cols are Instance, Day, Date
    for (let col = 3; col < exerciseNameRow.length; col++) {
        const exerciseName = (exerciseNameRow[col] || '').trim();
        const setHeader = (setHeaderRow[col] || '').trim().toLowerCase();
        // If we find a non-empty exercise name, start a new exercise
        if (exerciseName && exerciseName.length > 0) {
            if (currentExercise) {
                exercises.push(currentExercise);
            }
            currentExercise = {
                name: exerciseName,
                setColumns: [],
                notesColumn: -1,
            };
        }
        if (!currentExercise)
            continue;
        // Map this column to the current exercise
        if (setHeader.startsWith('set')) {
            currentExercise.setColumns.push(col);
        }
        else if (setHeader === 'notes') {
            currentExercise.notesColumn = col;
        }
        // Empty columns between exercises are separators - skip them
        // But only if we don't have a set header for the current exercise
    }
    // Don't forget the last exercise
    if (currentExercise) {
        exercises.push(currentExercise);
    }
    return exercises;
}
/**
 * Parse a single data row into exercises with their sets
 */
function parseDataRow(row, exerciseLayout, yearHint) {
    const instanceLabel = (row[0] || '').trim();
    const dayLabel = (row[1] || '').trim();
    const dateRaw = (row[2] || '').trim();
    const date = parseDate(dateRaw, yearHint);
    const exercises = [];
    let hasSplitMarkers = false;
    for (const layout of exerciseLayout) {
        const workingSets = [];
        const notesRaw = layout.notesColumn >= 0 ? (row[layout.notesColumn] || '').trim() : '';
        // Check if all set columns are empty/skip or split markers
        // We want to detect when the "real" content is exclusively "--" markers.
        // N/A, DNF, empty = ignored. Only actual data or "--" counts.
        let hasSplitMarkerInExercise = false;
        let hasRealData = false;
        for (const colIdx of layout.setColumns) {
            const cellVal = (row[colIdx] || '').trim();
            if (!cellVal || SKIP_VALUES.has(cellVal.toLowerCase())) {
                // Empty, N/A, DNF, or "--"/"---" from skip values — but check split markers first
                if (isSplitMarker(cellVal)) {
                    hasSplitMarkerInExercise = true;
                }
                continue;
            }
            // Non-empty, non-skip value
            if (isSplitMarker(cellVal)) {
                hasSplitMarkerInExercise = true;
            }
            else {
                hasRealData = true;
            }
        }
        // If exercise has split markers but no real data, it was done on a different day
        if (hasSplitMarkerInExercise && !hasRealData) {
            // Don't include this exercise for this row
            hasSplitMarkers = true;
            continue;
        }
        // Parse working sets from Set 1-7 columns
        for (const colIdx of layout.setColumns) {
            const cellVal = (row[colIdx] || '').trim();
            if (!cellVal || SKIP_VALUES.has(cellVal.toLowerCase()) || isSplitMarker(cellVal)) {
                continue;
            }
            const parsed = parseSetCell(cellVal);
            if (parsed) {
                workingSets.push(parsed);
            }
        }
        // Parse warmup sets from Notes column
        const { warmupSets, remainingNotes } = parseWarmupNotes(notesRaw);
        // Only include the exercise if it has any set data
        if (workingSets.length > 0 || warmupSets.length > 0) {
            exercises.push({
                exerciseName: layout.name,
                colStart: layout.setColumns[0] || 0,
                workingSets,
                warmupSets,
                notes: remainingNotes,
            });
        }
    }
    return {
        instanceLabel,
        dayLabel,
        date,
        dateRaw,
        exercises,
        rawRow: row,
        hasSplitMarkers,
    };
}
/**
 * Check if a row is effectively empty (no meaningful data)
 */
function isEmptyRow(row) {
    // Check if all cells are empty
    return row.every(cell => !(cell || '').trim());
}
/**
 * Check if a row is a cycle marker (e.g., "Cycle 2" in the date or day column)
 */
function getCycleMarker(row) {
    for (let i = 0; i < Math.min(row.length, 5); i++) {
        const val = (row[i] || '').trim();
        const match = val.match(/^cycle\s*(\d+)/i);
        if (match)
            return parseInt(match[1], 10);
    }
    return null;
}
/**
 * Parse a full sheet CSV into structured data
 */
export function parseSheetCSV(csvText, config) {
    const allRows = parse(csvText, {
        relax_column_count: true,
        skip_empty_lines: false,
    });
    if (allRows.length < 5) {
        throw new Error(`Sheet ${config.gid} (${config.focus}) has fewer than 5 rows`);
    }
    // Parse exercise layout from header rows
    const exerciseLayout = parseExerciseLayout(allRows);
    const exerciseNames = exerciseLayout.map(e => e.name);
    // Parse data rows (starting from row 5, index 4)
    const dataRows = [];
    let lastYear;
    for (let i = 4; i < allRows.length; i++) {
        const row = allRows[i];
        if (isEmptyRow(row)) {
            // Keep empty rows as markers for instance boundary detection
            dataRows.push({
                instanceLabel: '',
                dayLabel: '',
                date: null,
                dateRaw: '',
                exercises: [],
                rawRow: row,
                hasSplitMarkers: false,
            });
            continue;
        }
        // Check for cycle marker
        const cycleNum = getCycleMarker(row);
        if (cycleNum !== null) {
            // This is a cycle boundary row - include it as a special marker
            dataRows.push({
                instanceLabel: '',
                dayLabel: `Cycle ${cycleNum}`,
                date: null,
                dateRaw: (row[2] || '').trim(),
                exercises: [],
                rawRow: row,
                hasSplitMarkers: false,
            });
            continue;
        }
        const parsed = parseDataRow(row, exerciseLayout, lastYear);
        if (parsed.date) {
            lastYear = getYear(parsed.date);
        }
        dataRows.push(parsed);
    }
    return {
        gid: config.gid,
        dayNumber: config.dayNumber,
        focus: config.focus,
        exerciseNames,
        rows: dataRows,
    };
}
/**
 * Detect instance boundaries within a sheet's data and group rows into segments.
 * Uses the known instance date ranges for precise matching.
 */
export function detectSegments(sheetData, knownInstances) {
    const segments = [];
    let currentRows = [];
    let currentCycleMarkers = [];
    let lastDate = null;
    let emptyStreak = 0;
    function flushSegment() {
        // Filter to only rows with actual data or cycle markers
        const dataRows = currentRows.filter(r => r.exercises.length > 0 || r.dayLabel.startsWith('Cycle'));
        if (dataRows.length === 0)
            return;
        const dates = dataRows
            .map(r => r.date)
            .filter((d) => d !== null)
            .sort((a, b) => a.getTime() - b.getTime());
        if (dates.length === 0)
            return;
        segments.push({
            sheetGid: sheetData.gid,
            dayNumber: sheetData.dayNumber,
            focus: sheetData.focus,
            startDate: dates[0],
            endDate: dates[dates.length - 1],
            rows: dataRows,
            cycleMarkers: [...currentCycleMarkers],
        });
        currentRows = [];
        currentCycleMarkers = [];
    }
    for (let i = 0; i < sheetData.rows.length; i++) {
        const row = sheetData.rows[i];
        // Track empty rows
        if (row.exercises.length === 0 && !row.dayLabel.startsWith('Cycle') && !row.date) {
            emptyStreak++;
            if (emptyStreak >= 2 && currentRows.length > 0) {
                flushSegment();
                lastDate = null;
            }
            continue;
        }
        emptyStreak = 0;
        // Check for cycle markers
        if (row.dayLabel.startsWith('Cycle')) {
            const cycleMatch = row.dayLabel.match(/Cycle\s*(\d+)/i);
            if (cycleMatch) {
                currentCycleMarkers.push({
                    rowIndex: i,
                    cycleNumber: parseInt(cycleMatch[1], 10),
                    date: row.date,
                });
            }
            currentRows.push(row);
            continue;
        }
        // Check for date gap (new instance)
        if (row.date && lastDate) {
            const gap = daysBetween(lastDate, row.date);
            if (gap > DATE_GAP_THRESHOLD) {
                flushSegment();
            }
        }
        currentRows.push(row);
        if (row.date) {
            lastDate = row.date;
        }
    }
    // Don't forget last segment
    flushSegment();
    return segments;
}
//# sourceMappingURL=parse-csv.js.map