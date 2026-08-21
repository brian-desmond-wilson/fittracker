// Which saved exercise instance belongs to which position in the workout —
// the resume mapping for the logging screen.
//
// Keying this by exercise id alone corrupted sessions that repeat a movement:
// both occurrences displayed (and wrote through) the FIRST instance, so
// logging the second overwrote the first's sets. Daily sessions made repeats
// routine — two blocks whose source workouts share a movement, or a captured
// circuit that programs one twice.
//
// Instances are written with `exercise_order` = template position + 1, so the
// stamp is the primary key back to an occurrence. A fallback pass by exercise
// id (first unclaimed occurrence, row order) catches legacy rows and rows
// whose stamp no longer agrees with the template.

export interface ResumeInstance {
  id: string;
  exercise_id: string;
  exercise_order: number | null;
}

/** Map template position → its instance. At most one instance per position,
 *  at most one position per instance; unmatched rows are dropped. */
export function assignInstancesToOccurrences<T extends ResumeInstance>(
  templateExerciseIds: string[],
  rows: T[],
): Map<number, T> {
  const byIndex = new Map<number, T>();
  const unplaced: T[] = [];

  for (const r of rows) {
    const idx = r.exercise_order == null ? -1 : r.exercise_order - 1;
    if (
      idx >= 0 &&
      idx < templateExerciseIds.length &&
      templateExerciseIds[idx] === r.exercise_id &&
      !byIndex.has(idx)
    ) {
      byIndex.set(idx, r);
    } else {
      unplaced.push(r);
    }
  }

  for (const r of unplaced) {
    const idx = templateExerciseIds.findIndex(
      (exId, i) => exId === r.exercise_id && !byIndex.has(i),
    );
    if (idx >= 0) byIndex.set(idx, r);
  }

  return byIndex;
}
