// The meta row's fourth column (spec §4.1): scoring type names in their
// display order, "Reps · Load".
export interface ScoringTypeRow {
  name: string;
  displayOrder: number;
}

export function scoredByLabel(rows: ScoringTypeRow[]): string {
  return [...rows].sort((a, b) => a.displayOrder - b.displayOrder).map((r) => r.name).join(" · ");
}

/** From the page select's `scoring_rows:exercise_scoring_types(scoring_type:scoring_types(name, display_order))`. */
export function scoringRowsOf(
  raw: { scoring_type: unknown }[] | undefined | null,
): ScoringTypeRow[] {
  const out: ScoringTypeRow[] = [];
  for (const row of raw ?? []) {
    const t = Array.isArray(row.scoring_type) ? row.scoring_type[0] : row.scoring_type;
    if (!t || typeof t !== "object") continue;
    const { name, display_order } = t as { name?: unknown; display_order?: unknown };
    if (typeof name !== "string") continue;
    out.push({ name, displayOrder: typeof display_order === "number" ? display_order : 0 });
  }
  return out;
}
