// The classify answer, constrained to our vocabulary — same stance as
// captureReview: the model suggests, the client decides what is usable.
// Roles and at least one primary muscle are the hard requirements; every
// other field degrades to null.
//
// Degrading is not the same as harmless. A null estMinutes fails
// fitToEnvelope, so a workout that validates without one is stamped
// classified, reads as tagged in the UI, and is invisible to every shortlist
// until someone fills the number in. It degrades anyway because the tag
// editor can repair it — where muscles reject instead, because a workout with
// no primary muscle is not something the editor asks the user to fix, and
// it would sit in the catalog immune to the soreness gate.
import type { BlockRole, WorkoutIntensity, WorkoutTags } from "../types/dailyBlocks";

const ROLES: BlockRole[] = ["warmup", "mobility", "main", "conditioning", "cooldown"];
const INTENSITIES: WorkoutIntensity[] = ["low", "moderate", "high"];
const SKILLS = ["Beginner", "Intermediate", "Advanced"] as const;
/** The est_minutes CHECK on captured_workouts is BETWEEN 1 AND 240; this is
 *  a shade stricter, because the range is tested before the rounding. The
 *  column would take a 240.4 rounded down to 240, and we degrade it to null
 *  instead — a classifier emitting a fractional four-hour workout is emitting
 *  noise, and null is the safe direction to send noise. */
const MAX_MINUTES = 240;

/** Null means "unusable" — the workout stays untagged and out of play. */
export function validateWorkoutTags(
  raw: unknown,
  allowedMuscles: Set<string>,
): WorkoutTags | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;

  // Deduped like the muscle lists below, and for the same reason: the model
  // repeats itself, and block_roles is a TEXT[] whose CHECK only bounds the
  // vocabulary, so ["main", "main"] would store and render as two roles.
  const blockRoles = [...new Set(
    (Array.isArray(r.block_roles) ? r.block_roles : [])
      .filter((v): v is BlockRole => ROLES.includes(v as BlockRole)),
  )];
  if (blockRoles.length === 0) return null;

  const names = (v: unknown): string[] =>
    (Array.isArray(v) ? v : []).filter(
      (m): m is string => typeof m === "string" && allowedMuscles.has(m),
    );
  const primaries = [...new Set(names(r.primary_muscles))];
  const primarySet = new Set(primaries);
  const secondaries = [...new Set(names(r.secondary_muscles))]
    .filter((m) => !primarySet.has(m));

  // A workout with no primary muscle is unusable, not merely under-described:
  // the soreness gate reads primaries, so it would be permanently immune —
  // a chest workout offered on a chest-sore day.
  if (primaries.length === 0) return null;

  const est = typeof r.est_minutes === "number" &&
    Number.isFinite(r.est_minutes) &&
    r.est_minutes >= 1 && r.est_minutes <= MAX_MINUTES
      ? Math.round(r.est_minutes)
      : null;

  return {
    blockRoles,
    muscles: [
      ...primaries.map((name) => ({ name, isPrimary: true })),
      ...secondaries.map((name) => ({ name, isPrimary: false })),
    ],
    estMinutes: est,
    intensity: INTENSITIES.includes(r.intensity as WorkoutIntensity)
      ? (r.intensity as WorkoutIntensity)
      : null,
    skillLevel: SKILLS.includes(r.skill_level as (typeof SKILLS)[number])
      ? (r.skill_level as (typeof SKILLS)[number])
      : null,
    classifiedAt: null, // stamped by the saver, not the validator
  };
}
