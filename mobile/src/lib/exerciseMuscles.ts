// The exercise_muscle_regions join, shaped for a card or a row: primaries
// first, then secondaries, each group in name order, so the first entry is
// always THE primary and the picture order never depends on insert order.
// Sibling of exerciseEquipment.ts.

export interface MuscleRegionRow {
  is_primary: boolean | null;
  muscle_region: { name: string } | null;
}

export interface ExerciseMuscle {
  name: string;
  isPrimary: boolean;
}

export function musclesOf(rows: MuscleRegionRow[] | null | undefined): ExerciseMuscle[] {
  const out: ExerciseMuscle[] = [];
  for (const r of rows ?? []) {
    const name = r.muscle_region?.name;
    if (!name) continue;
    out.push({ name, isPrimary: r.is_primary === true });
  }
  return out.sort((a, b) =>
    a.isPrimary === b.isPrimary ? a.name.localeCompare(b.name) : a.isPrimary ? -1 : 1,
  );
}
