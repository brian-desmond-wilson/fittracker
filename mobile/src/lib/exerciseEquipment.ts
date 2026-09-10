/**
 * Equipment names for a catalog row. Derivations and outliers carry
 * exercise_equipment junction rows; cores deliberately carry none — their
 * equipment is the display string in core_default_equipment ("Kettlebell",
 * "Bodyweight, Floor"), which also drives name suppression. The junction wins
 * when present. The legacy equipment_types array is no longer read.
 */
export function equipmentNamesOf(row: {
  equipment_rows?: { equipment: { id?: string; name: string } | null }[] | null;
  core_default_equipment?: string | null;
}): string[] {
  const junction = (row.equipment_rows ?? [])
    .map((r) => r.equipment?.name)
    .filter((name): name is string => !!name);
  if (junction.length > 0) return junction;
  return row.core_default_equipment
    ? row.core_default_equipment.split(',').map((s) => s.trim()).filter(Boolean)
    : [];
}
