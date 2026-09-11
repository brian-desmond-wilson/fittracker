// supabase/functions/enrich-exercise/fill.ts
// Pure decisions for the enrichment pipeline: given a row, its provenance,
// what its captures can offer and the run's flags, say which fields to fill
// and from where. No I/O, no Deno globals — index.ts does the reading and
// writing; this file is what the tests pin.
// Spec: docs/superpowers/specs/2026-09-11-catalog-enrichment-pipeline-design.md §5, §8

export type ProvenanceBy = 'user' | 'extraction' | 'model' | 'capture';
export interface ProvenanceStamp { by: ProvenanceBy; at: string }
export type EnrichableField = 'description' | 'video_url' | 'image_url';
/** exercises.enrichment, keyed by column. A missing key means fillable. */
export type Enrichment = Partial<Record<EnrichableField, ProvenanceStamp>>;

export interface EnrichRow {
  id: string;
  name: string;
  description: string | null;
  video_url: string | null;
  image_url: string | null;
  enrichment: Enrichment;
}

/** What this row's linked captures can offer, already narrowed by the rules below. */
export interface Candidate {
  extractionDescription: string | null;
  singleExerciseSourceUrl: string | null;
}

export interface RunFlags {
  /** Generate an image for an empty slot. */
  images: boolean;
  /** Generate an image even over an existing one — the only overwrite. Implies images. */
  forceImage: boolean;
}

export interface FillPlan {
  description?: { by: 'extraction' | 'model'; text?: string };
  video_url?: { by: 'capture'; url: string };
  image_url?: { by: 'model' };
}

/** One linked captured_sources row, flattened for the decision. */
export interface SourceCandidate {
  sourceUrl: string;
  platform: string;
  capturedAt: string;
  extractionStatus: string;
  /** True when the capture produced a captured_workouts row. */
  hasWorkout: boolean;
  rawExtraction: unknown;
}

export type DescriptionCheck = { ok: true; text: string } | { ok: false; reason: string };

const MIN_DESCRIPTION = 40;
const MAX_DESCRIPTION = 600;

const blank = (v: string | null): boolean => v === null || v.trim() === '';

/** Null or blank, and not a person's. */
export function isFillable(row: EnrichRow, field: EnrichableField): boolean {
  if (!blank(row[field])) return false;
  return row.enrichment[field]?.by !== 'user';
}

/** Lower-case, trimmed, inner whitespace collapsed. */
export function normaliseName(name: string): string {
  return name.toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Plain prose: no markup, no markdown bullets or headings, no newlines. */
function isPlainText(text: string): boolean {
  if (/[<>]/.test(text)) return false;
  if (/^[-*#>•]/.test(text)) return false;
  if (/\n/.test(text)) return false;
  return true;
}

/**
 * The gate every description passes before it is written (§8): 40–600
 * characters after trimming, plain text, and not opening with the name of a
 * DIFFERENT catalog exercise — the model's favourite failure is describing
 * the wrong movement. The row's own name is allowed. A name only counts
 * when it is followed by a word boundary, so "Deadlifting…" is not "Deadlift".
 */
export function validateDescription(text: string, name: string, otherNames: string[]): DescriptionCheck {
  const trimmed = text.trim();
  if (trimmed.length < MIN_DESCRIPTION) return { ok: false, reason: `too short (${trimmed.length} < ${MIN_DESCRIPTION} chars)` };
  if (trimmed.length > MAX_DESCRIPTION) return { ok: false, reason: `too long (${trimmed.length} > ${MAX_DESCRIPTION} chars)` };
  if (!isPlainText(trimmed)) return { ok: false, reason: 'not plain text' };
  const own = normaliseName(name);
  const head = normaliseName(trimmed);
  for (const other of otherNames) {
    const n = normaliseName(other);
    if (n === '' || n === own) continue;
    if (head === n || (head.startsWith(n) && !/[a-z0-9]/.test(head.charAt(n.length)))) {
      return { ok: false, reason: `starts with another catalog name: ${other}` };
    }
  }
  return { ok: true, text: trimmed };
}

/** The pipeline only ever writes a stored post link from the two platforms
 *  captures come from, over https. The human field accepts anything. */
export function isPipelineVideoUrl(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:') return false;
    const host = u.hostname.replace(/^www\./, '');
    const isDomain = (h: string, d: string) => h === d || h.endsWith(`.${d}`);
    return isDomain(host, 'instagram.com') || isDomain(host, 'tiktok.com');
  } catch {
    return false;
  }
}

const byNewest = (a: SourceCandidate, b: SourceCandidate) => b.capturedAt.localeCompare(a.capturedAt);

/** Decision 2: the default demo video is the post, when it was captured as a
 *  single exercise. Most recent reviewed capture with no workout row. */
export function pickSingleExerciseSource(sources: SourceCandidate[]): string | null {
  const hit = [...sources]
    .sort(byNewest)
    .find((s) => s.extractionStatus === 'reviewed' && !s.hasWorkout && isPipelineVideoUrl(s.sourceUrl));
  return hit ? hit.sourceUrl : null;
}

/** The capture extraction's description for this name, from the newest
 *  reviewed source whose stored raw extraction lists the name. Mirrors the
 *  phone's extractionPrefill match (case and spacing insensitive). */
export function extractionDescriptionFor(sources: SourceCandidate[], name: string): string | null {
  const wanted = normaliseName(name);
  for (const s of [...sources].sort(byNewest)) {
    if (s.extractionStatus !== 'reviewed') continue;
    const raw = s.rawExtraction;
    if (typeof raw !== 'object' || raw === null) continue;
    const exercises = (raw as { exercises?: unknown }).exercises;
    if (!Array.isArray(exercises)) continue;
    for (const e of exercises) {
      if (typeof e !== 'object' || e === null) continue;
      const ex = e as { name?: unknown; description?: unknown };
      if (typeof ex.name !== 'string' || normaliseName(ex.name) !== wanted) continue;
      if (typeof ex.description === 'string' && ex.description.trim() !== '') return ex.description.trim();
    }
  }
  return null;
}

/**
 * The plan for one row. Empty object = nothing to do. `otherNames` is every
 * other catalog name and alias, for validating an extraction description up
 * front (a bad one falls through to the model, which index.ts validates the
 * same way after generating).
 */
export function planFill(row: EnrichRow, candidate: Candidate, flags: RunFlags, otherNames: string[]): FillPlan {
  const plan: FillPlan = {};
  if (isFillable(row, 'description')) {
    const fromExtraction = candidate.extractionDescription;
    const check = fromExtraction !== null ? validateDescription(fromExtraction, row.name, otherNames) : null;
    plan.description = check && check.ok ? { by: 'extraction', text: check.text } : { by: 'model' };
  }
  if (isFillable(row, 'video_url') && candidate.singleExerciseSourceUrl !== null) {
    plan.video_url = { by: 'capture', url: candidate.singleExerciseSourceUrl };
  }
  if (flags.forceImage || (flags.images && isFillable(row, 'image_url'))) {
    plan.image_url = { by: 'model' };
  }
  return plan;
}

/** True when a sweep should visit this row: any field the plan would fill. */
export function hasWork(plan: FillPlan): boolean {
  return plan.description !== undefined || plan.video_url !== undefined || plan.image_url !== undefined;
}
