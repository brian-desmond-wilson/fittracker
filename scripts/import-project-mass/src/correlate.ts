import type { SheetSegment, ProgramInstanceData, WorkoutData, WorkoutExerciseData } from './types.js';
import { KNOWN_INSTANCES, DAY_TYPE, getExerciseNameForCycle } from './config.js';
import { parseDate, daysBetween } from './parse-dates.js';

/**
 * Match sheet segments to known program instances by date overlap.
 * Returns complete ProgramInstanceData objects ready for import.
 */
export function correlateInstances(allSegments: SheetSegment[][]): ProgramInstanceData[] {
  const instances: ProgramInstanceData[] = [];

  for (const known of KNOWN_INSTANCES) {
    const knownStart = parseDate(known.startDate)!;
    const knownEnd = known.endDate === 'ongoing'
      ? new Date(2099, 0, 1) // Far future for ongoing
      : parseDate(known.endDate)!;

    if (!knownStart) {
      console.warn(`⚠️ Could not parse start date for ${known.name}: ${known.startDate}`);
      continue;
    }

    const matchedSegments: SheetSegment[] = [];

    // For each sheet's segments, find the one that overlaps this known instance
    for (const sheetSegments of allSegments) {
      let bestMatch: SheetSegment | null = null;
      let bestOverlap = 0;

      for (const seg of sheetSegments) {
        // Check date overlap
        const overlapStart = new Date(Math.max(seg.startDate.getTime(), knownStart.getTime()));
        const overlapEnd = new Date(Math.min(seg.endDate.getTime(), knownEnd.getTime()));
        const overlap = overlapEnd.getTime() - overlapStart.getTime();

        if (overlap > bestOverlap) {
          bestOverlap = overlap;
          bestMatch = seg;
        }
      }

      if (bestMatch) {
        matchedSegments.push(bestMatch);
      }
    }

    const allDates = matchedSegments
      .flatMap(s => s.rows.filter(r => r.date).map(r => r.date!))
      .sort((a, b) => a.getTime() - b.getTime());

    const instanceStart = allDates.length > 0 ? allDates[0] : knownStart;
    const instanceEnd = allDates.length > 0 ? allDates[allDates.length - 1] : knownStart;

    instances.push({
      instanceNumber: known.number,
      name: known.name,
      startDate: instanceStart,
      endDate: instanceEnd,
      isOngoing: known.endDate === 'ongoing',
      cycles: known.cycles,
      segments: matchedSegments,
    });
  }

  return instances;
}

/**
 * Given a program instance's segments, build workout data organized by
 * microcycle (week_number) and day.
 *
 * For each sheet segment:
 * - Data rows are chronologically ordered
 * - Each row = one microcycle's workout for that day
 * - Row 1 = micro 1, Row 2 = micro 2, etc.
 * - Cycle markers indicate cycle transitions
 *
 * Exercise names are remapped based on cycle number:
 * - Cycle 1 & 3: use CSV header names as-is
 * - Cycle 2: use CYCLE_2_EXERCISE_MAP to get the correct variant
 */
export function buildWorkouts(instance: ProgramInstanceData): WorkoutData[] {
  const workouts: WorkoutData[] = [];

  for (const segment of instance.segments) {
    const dayNumber = segment.dayNumber;

    // Separate data rows from cycle markers
    let currentCycle = 1;
    let microCounter = 0;
    let cycleStartMicro = 0; // microCounter value where current cycle began

    for (const row of segment.rows) {
      // Check for cycle marker
      if (row.dayLabel.startsWith('Cycle')) {
        const m = row.dayLabel.match(/Cycle\s*(\d+)/i);
        if (m) {
          currentCycle = parseInt(m[1], 10);
          cycleStartMicro = microCounter;
        }
        continue;
      }

      // Skip empty rows
      if (row.exercises.length === 0) continue;

      // Calculate micro number within cycle (0-based then 1-based)
      // Split workout detection: continuation rows share the same microcycle
      if (!row.hasSplitMarkers) {
        microCounter++;
      }

      const microWithinCycle = microCounter - cycleStartMicro; // 1-based
      const weekNumber = (currentCycle - 1) * 4 + microWithinCycle;

      // Build exercise data with cycle-aware name remapping
      const exercises: WorkoutExerciseData[] = row.exercises.map((ex, idx) => ({
        exerciseName: getExerciseNameForCycle(ex.exerciseName, dayNumber, currentCycle),
        performedDate: null, // Will be set for split workouts
        order: idx + 1,
        workingSets: ex.workingSets,
        warmupSets: ex.warmupSets,
        notes: ex.notes,
      }));

      workouts.push({
        dayNumber,
        weekNumber,
        cycleNumber: currentCycle,
        scheduledDate: row.date || instance.startDate,
        endDate: null,
        exercises,
        status: exercises.some(e => e.workingSets.length > 0 || e.warmupSets.length > 0)
          ? 'completed' : 'skipped',
      });

    }
  }

  // ── Detect & merge split workouts ──────────────────────────────────
  // Same weekNumber + dayNumber appearing on consecutive dates means
  // Brian split one logical workout across multiple gym sessions.
  // The "--" markers (handled in parse-csv) exclude exercises not done
  // on a given date, so different rows contain different exercises.
  // We merge them: one workout_instance with scheduled_date = first,
  // end_date = last, and performed_date set per-exercise.

  const byKey = new Map<string, WorkoutData[]>();
  for (const w of workouts) {
    const key = `${w.dayNumber}-${w.weekNumber}`;
    const existing = byKey.get(key) || [];
    existing.push(w);
    byKey.set(key, existing);
  }

  const mergedWorkouts: WorkoutData[] = [];
  for (const [_key, group] of byKey) {
    if (group.length === 1) {
      mergedWorkouts.push(group[0]);
      continue;
    }

    // Multiple entries for same day+week = split workout
    const sorted = group.sort((a, b) => a.scheduledDate.getTime() - b.scheduledDate.getTime());
    const first = sorted[0];
    const last = sorted[sorted.length - 1];

    // Merge exercises, tagging each with its performed_date
    const allExercises: WorkoutExerciseData[] = [];
    for (const w of sorted) {
      for (const ex of w.exercises) {
        ex.performedDate = w.scheduledDate;
        allExercises.push(ex);
      }
    }
    allExercises.forEach((ex, idx) => { ex.order = idx + 1; });

    mergedWorkouts.push({
      ...first,
      endDate: last.scheduledDate.getTime() !== first.scheduledDate.getTime() ? last.scheduledDate : null,
      exercises: allExercises,
      status: 'completed',
    });
  }

  return mergedWorkouts.sort((a, b) => {
    if (a.weekNumber !== b.weekNumber) return a.weekNumber - b.weekNumber;
    return a.dayNumber - b.dayNumber;
  });
}

/**
 * Collect ALL unique exercise names that will be needed across all instances.
 * This includes both Cycle 1 header names AND Cycle 2 remapped names.
 */
export function collectAllExerciseNames(instances: ProgramInstanceData[]): Set<string> {
  const names = new Set<string>();
  for (const instance of instances) {
    const workouts = buildWorkouts(instance);
    for (const w of workouts) {
      for (const ex of w.exercises) {
        names.add(ex.exerciseName);
      }
    }
  }
  return names;
}
