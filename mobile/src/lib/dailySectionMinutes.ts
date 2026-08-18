// How long each section of today's session should take.
//
// The model that composes the session also estimates its sections, because it
// alone knows why it paired what it paired. But two of the three ways a
// session appears never reach the model — the rules fallback, and a captured
// workout served whole — and a model answer can arrive malformed or claiming
// three hours of work for a forty-minute day. So the arithmetic below is both
// the fallback and the sanity check: an estimate is never missing, and a
// number the model cannot justify never reaches the screen.
import type {
  SectionMinutes,
  SectionPlan,
  SessionItem,
  SessionSection,
} from "../types/daily";

/** A controlled rep, eccentric included. */
const SECONDS_PER_REP = 4;
/** Walking to the next station, loading it, finding the clip. */
const TRANSITION_SECONDS = 60;
const DEFAULT_REPS = "10";
/** Above this the answer is not an estimate, it is a misunderstanding. */
const MAX_SECTION_MINUTES = 180;
/**
 * The model may overrun the day a little — a plan that lands at 130 minutes
 * of a 120-minute day is a judgment call, not a broken answer. Past this it
 * stopped doing the arithmetic and we use our own.
 */
const OVERRUN_TOLERANCE = 1.25;

const SECTIONS: SessionSection[] = ["warmup", "mobility", "main", "accessory", "bfr", "cooldown"];

/**
 * Seconds of work in one set of the given prescription.
 *
 * Reps arrive as human text, not numbers: "10", "8-12", "10/side", "30-60s".
 * A range costs its top end (you plan for the hard set), "/side" costs twice,
 * and a prescription written in seconds is a hold whose number IS its
 * duration rather than a rep count.
 */
export function setSeconds(reps: string | null): number {
  const raw = (reps ?? DEFAULT_REPS).trim().toLowerCase();
  const numbers = (raw.match(/\d+/g) ?? []).map(Number);
  const top = numbers.length > 0 ? Math.max(...numbers) : Number(DEFAULT_REPS);
  const isHold = /\d\s*(s\b|sec)/.test(raw);
  const perSide = raw.includes("/side") || raw.includes("each side");
  const seconds = isHold ? top : top * SECONDS_PER_REP;
  return perSide ? seconds * 2 : seconds;
}

/** What a prescription costs, whatever carries it — a stored item or a plan. */
interface Prescription {
  targetSets: number | null;
  targetReps: string | null;
  restSeconds: number | null;
}

/** Seconds one exercise costs: its working sets, the rests between them, and
 *  the gap before whatever comes next. */
function itemSeconds(item: Prescription): number {
  const sets = Math.max(1, item.targetSets ?? 1);
  const rest = Math.max(0, item.restSeconds ?? 0);
  return sets * setSeconds(item.targetReps) + (sets - 1) * rest + TRANSITION_SECONDS;
}

/**
 * What one section of a budget will cost, in minutes, unrounded.
 *
 * The time budget spends against this rather than its own per-slot estimates,
 * so the minutes it believes it has committed are the minutes the athlete
 * reads off the screen. When the two disagree the budget stops buying early
 * and the day comes out short of the time that was asked for.
 */
export function planMinutes(plan: SectionPlan): number {
  if (plan.slots <= 0) return 0;
  return (plan.slots * itemSeconds(plan)) / 60;
}

/**
 * Minutes per section, derived from the prescriptions themselves — so a
 * low-energy check-in that trims a set shows up as a shorter day.
 */
export function estimateSectionMinutes(items: SessionItem[]): SectionMinutes {
  const seconds = new Map<SessionSection, number>();
  for (const item of items) {
    if (!SECTIONS.includes(item.section)) continue;
    seconds.set(item.section, (seconds.get(item.section) ?? 0) + itemSeconds(item));
  }

  const minutes: SectionMinutes = {};
  for (const [section, total] of seconds) {
    // Any section with work in it takes at least a minute.
    minutes[section] = Math.max(1, Math.round(total / 60));
  }
  return minutes;
}

export function totalSectionMinutes(minutes: SectionMinutes): number {
  return SECTIONS.reduce((sum, section) => sum + (minutes[section] ?? 0), 0);
}

/**
 * The model's own estimates, kept only if they hold up. Null means "unusable
 * answer" and the caller falls back to `estimateSectionMinutes` — the same
 * all-or-nothing stance the item validation takes, because a half-answered
 * plan reads as a plan with free sections in it.
 *
 * Sections the model reports but never filled are dropped rather than
 * rejected: a stray entry is noise, not evidence the arithmetic is wrong.
 */
export function validateSectionMinutes(
  raw: unknown,
  items: SessionItem[],
  minutesAvailable: number,
): SectionMinutes | null {
  if (!Array.isArray(raw)) return null;

  const worked = new Set(items.map((i) => i.section));
  if (worked.size === 0) return null;

  const minutes: SectionMinutes = {};
  for (const entry of raw) {
    if (typeof entry !== "object" || entry === null) return null;
    const { section, minutes: value } = entry as Record<string, unknown>;
    if (!SECTIONS.includes(section as SessionSection)) continue;
    if (!worked.has(section as SessionSection)) continue;
    if (typeof value !== "number" || !Number.isFinite(value)) return null;
    const whole = Math.round(value);
    if (whole < 1 || whole > MAX_SECTION_MINUTES) return null;
    minutes[section as SessionSection] = whole;
  }

  // Every section the model filled has to carry a number, or the tab would
  // show some sections timed and others silent.
  for (const section of worked) {
    if (minutes[section] === undefined) return null;
  }
  if (totalSectionMinutes(minutes) > minutesAvailable * OVERRUN_TOLERANCE) return null;

  return minutes;
}
