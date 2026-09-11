// The exercises.enrichment provenance object as the phone sees it, and the
// one rule the front door applies on update: a person's non-empty value
// stamps by="user" (the pipeline never touches it again); blanking a field
// drops its key (the pipeline may fill it again); an unchanged echo leaves
// whatever stamp is there. Pure.
// Spec: docs/superpowers/specs/2026-09-11-catalog-enrichment-pipeline-design.md §5
export type EnrichmentBy = "user" | "extraction" | "model" | "capture";
export type EnrichableField = "description" | "video_url" | "image_url";
export interface EnrichmentStamp { by: EnrichmentBy; at: string }
export type ExerciseEnrichment = Partial<Record<EnrichableField, EnrichmentStamp>>;

export const ENRICHABLE_FIELDS: EnrichableField[] = ["description", "video_url", "image_url"];

const norm = (v: string | null | undefined): string | null => {
  const t = (v ?? "").trim();
  return t === "" ? null : t;
};

export function withoutProvenance(prov: ExerciseEnrichment, field: EnrichableField): ExerciseEnrichment {
  const next = { ...prov };
  delete next[field];
  return next;
}

/**
 * The provenance object to write alongside a column patch, or null when
 * the patch leaves provenance as it is. `current` is the row before the
 * patch; only the three enrichable keys of `patch` are read.
 */
export function provenanceAfterPatch(
  prov: ExerciseEnrichment,
  current: Record<EnrichableField, string | null>,
  patch: Partial<Record<EnrichableField, string | null>> & Record<string, unknown>,
  nowIso: string,
): ExerciseEnrichment | null {
  let next: ExerciseEnrichment = { ...prov };
  let changed = false;
  for (const field of ENRICHABLE_FIELDS) {
    if (patch[field] === undefined) continue;
    const before = norm(current[field]);
    const after = norm(patch[field]);
    if (after === before) continue;
    if (after === null) {
      if (next[field] !== undefined) { next = withoutProvenance(next, field); changed = true; }
    } else {
      next = { ...next, [field]: { by: "user", at: nowIso } };
      changed = true;
    }
  }
  return changed ? next : null;
}
