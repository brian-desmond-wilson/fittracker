// From a capture's stored raw extraction and the name under review, the
// values the catalog wizard should open with — so "Create new" starts from
// what the model read instead of from blanks. Pure: no I/O, no React
// Native. The raw extraction is the model's own JSON (snake_case), stored
// on captured_sources.raw_extraction before any client sanitizing.
// Spec: docs/superpowers/specs/2026-09-11-catalog-enrichment-pipeline-design.md §4, §6
import type { WizardFormData } from "./catalogWizardForm";
import type { SkillLevel } from "../types/crossfit";

export interface ExtractionPrefill {
  description: string | null;
  /** Names from the muscle_regions reference table, as the model wrote them. */
  primaryMuscles: string[];
  secondaryMuscles: string[];
  /** Names from the equipment reference table. */
  equipment: string[];
  skillLevel: SkillLevel | null;
}

/** Lower-case, trimmed, inner whitespace collapsed. */
export function normaliseName(name: string): string {
  return name.toLowerCase().replace(/\s+/g, " ").trim();
}

const strings = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.trim() !== "").map((x) => x.trim()) : [];

const SKILLS: SkillLevel[] = ["Beginner", "Intermediate", "Advanced"];

/** The canonical skill level for a model-written value, case-folded; null when it is none of them. */
const skillLevel = (v: unknown): SkillLevel | null => {
  if (typeof v !== "string") return null;
  const wanted = v.trim().toLowerCase();
  return SKILLS.find((s) => s.toLowerCase() === wanted) ?? null;
};

const description = (v: unknown): string | null =>
  typeof v === "string" && v.trim() !== "" ? v.trim() : null;

/** The prefill for `reviewedName`, or null when the extraction does not list it. */
export function extractionPrefillFor(raw: unknown, reviewedName: string): ExtractionPrefill | null {
  if (typeof raw !== "object" || raw === null) return null;
  const exercises = (raw as { exercises?: unknown }).exercises;
  if (!Array.isArray(exercises)) return null;
  const wanted = normaliseName(reviewedName);
  for (const e of exercises) {
    if (typeof e !== "object" || e === null) continue;
    const ex = e as Record<string, unknown>;
    if (typeof ex.name !== "string" || normaliseName(ex.name) !== wanted) continue;
    return {
      description: description(ex.description),
      primaryMuscles: strings(ex.primary_muscles),
      secondaryMuscles: strings(ex.secondary_muscles),
      equipment: strings(ex.equipment),
      skillLevel: skillLevel(ex.skill_level),
    };
  }
  return null;
}

/**
 * The prefill from a match review's draft exercise — the sanitized,
 * camelCase copy the capture stored on the review row itself. The fallback
 * for when the raw extraction no longer lists the reviewed name (the
 * reviewer renamed it before saving, so a name match against the model's
 * original wording fails). Keyed to the review, so no name lookup is needed.
 */
export function prefillFromDraft(draft: unknown): ExtractionPrefill | null {
  if (typeof draft !== "object" || draft === null || Array.isArray(draft)) return null;
  const ex = draft as Record<string, unknown>;
  return {
    description: description(ex.description),
    primaryMuscles: strings(ex.primaryMuscles),
    secondaryMuscles: strings(ex.secondaryMuscles),
    equipment: strings(ex.equipment),
    skillLevel: skillLevel(ex.skillLevel),
  };
}

/** The two dictionaries the prefill needs, by name. */
export interface PrefillDictionaries {
  muscleRegions: { id: string; name: string }[];
  equipment: { id: string; name: string }[];
}

function idsFor(names: string[], rows: { id: string; name: string }[]): string[] {
  const byName = new Map(rows.map((r) => [normaliseName(r.name), r.id]));
  const ids: string[] = [];
  for (const n of names) {
    const id = byName.get(normaliseName(n));
    if (id && !ids.includes(id)) ids.push(id);
  }
  return ids;
}

/**
 * Lay the prefill onto a form. Only empty fields are filled — the person
 * may have typed before the dictionaries arrived, and a prefill must never
 * clobber a keystroke. Names the dictionaries do not know are dropped.
 */
export function applyPrefillToForm(
  form: WizardFormData, prefill: ExtractionPrefill, dict: PrefillDictionaries,
): WizardFormData {
  const next: WizardFormData = { ...form };
  if (next.description.trim() === "" && prefill.description) next.description = prefill.description;
  if (next.skill_level === null && prefill.skillLevel) next.skill_level = prefill.skillLevel;
  if (next.equipment_ids.length === 0) next.equipment_ids = idsFor(prefill.equipment, dict.equipment);
  if (next.muscle_region_ids.length === 0 && next.primary_muscle_region_ids.length === 0) {
    const primary = idsFor(prefill.primaryMuscles, dict.muscleRegions);
    const secondary = idsFor(prefill.secondaryMuscles, dict.muscleRegions).filter((id) => !primary.includes(id));
    next.primary_muscle_region_ids = primary;
    next.muscle_region_ids = [...primary, ...secondary];
  }
  return next;
}
