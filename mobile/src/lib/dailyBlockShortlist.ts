// The rules tier's hard work: which whole workouts are in play for each block
// today. Pure — coverage, soreness, and envelopes arrive as data.
// Spec §4 steps 2-4 and §8.
import { findBuiltin } from "./dailyBuiltins";
import { fitToEnvelope } from "./dailyBlockBudget";
import type {
  BlockCandidate,
  BlockEnvelope,
  BlockRole,
  BlockShortlists,
  BodyFocus,
  BuiltinRoutine,
  TaggedWorkout,
  WorkoutMuscle,
} from "../types/dailyBlocks";
import type { MuscleCoverage } from "./dailyCoverage";

/** Recovery-day gate (spec §4 step 2): ≥3 regions at severity ≥2, or any
 *  region at 3 alongside energy ≤3. */
export function isRecoveryDay(checkin: {
  energy: number;
  soreness: Record<string, number>;
}): boolean {
  const severities = Object.values(checkin.soreness);
  const atTwo = severities.filter((s) => s >= 2).length;
  const atThree = severities.filter((s) => s >= 3).length;
  return atTwo >= 3 || (atThree >= 1 && checkin.energy <= 3);
}

const UPPER = new Set([
  "Chest", "Shoulders", "Triceps",
  "Upper Back", "Lats", "Biceps", "Forearms / Grip", "Neck / Traps",
]);
const LOWER = new Set([
  "Quads", "Glutes", "Hamstrings", "Calves",
  "Hip Flexors", "Hip Abductors", "Hip Adductors",
]);

/** Trunk muscles (Core, Obliques, Lower Back) and anything off the vocabulary
 *  belong to neither half, so a trunk-only workout reads as full-body — it
 *  pairs with an upper or a lower main equally well. */
export function workoutFocus(muscles: WorkoutMuscle[]): BodyFocus {
  const primaries = muscles.filter((m) => m.isPrimary).map((m) => m.name);
  const upper = primaries.filter((m) => UPPER.has(m)).length;
  const lower = primaries.filter((m) => LOWER.has(m)).length;
  if (upper > 0 && lower === 0) return "upper";
  if (lower > 0 && upper === 0) return "lower";
  return "full";
}

/** Don't repeat a main workout inside this window (spec §4 step 3). */
const MAIN_REPEAT_DAYS = 4;
const MAIN_SHORTLIST = 5;
const SUPPORT_SHORTLIST = 3;

export interface ShortlistContext {
  coverage: MuscleCoverage;
  soreness: Record<string, number>;
  envelopes: BlockEnvelope[];
  /** Told, not inferred. The envelopes a recovery day produces happen to carry
   *  no main block, but reading the day's shape back out of them would make
   *  any future main-less envelope silently a recovery day. The caller ran
   *  `isRecoveryDay` to build the envelopes; it passes the same answer here. */
  recoveryDay: boolean;
  rampWeek: number;
}

export interface ShortlistResult {
  shortlists: BlockShortlists;
  /** True when the main list only exists because exclusions were relaxed —
   *  the UI labels the day a compromise (spec §8). False when the list is
   *  empty: nothing was offered, so nothing was compromised. */
  relaxedMain: boolean;
}

function toCandidate(
  w: TaggedWorkout,
  env: BlockEnvelope,
  score: number,
): BlockCandidate | null {
  const fitted = fitToEnvelope(w.tags.estMinutes, w.rounds, env);
  if (!fitted) return null;
  return {
    workoutId: w.workoutId,
    builtinKey: null,
    name: w.name,
    minutes: fitted.minutes,
    roundsNote: fitted.roundsNote,
    muscles: w.tags.muscles,
    focus: workoutFocus(w.tags.muscles),
    score,
  };
}

/** Name breaks a score tie, so the shortlist is a function of the catalog and
 *  not of the order the database handed it to us. */
function byScore(a: BlockCandidate, b: BlockCandidate): number {
  return b.score - a.score || a.name.localeCompare(b.name);
}

function rankFitted(
  pool: TaggedWorkout[],
  env: BlockEnvelope,
  score: (w: TaggedWorkout) => number,
  limit: number,
): BlockCandidate[] {
  return pool
    .map((w) => toCandidate(w, env, score(w)))
    .filter((c): c is BlockCandidate => c !== null)
    .sort(byScore)
    .slice(0, limit);
}

/** Freshness of a workout's primaries against the week's load, in (0, 1] — 1
 *  is untouched all week, and it falls but never reaches 0 as load climbs.
 *  The mean, not the sum: a workout tagged with more muscles must not
 *  out-score a focused one just for being tagged more thoroughly, so hitting
 *  one untouched muscle beats hitting three half-trained ones. A workout the
 *  classifier left muscle-less scores as if its muscles were trained hard
 *  today. */
function freshness(w: TaggedWorkout, coverage: MuscleCoverage): number {
  const primaries = w.tags.muscles.filter((m) => m.isPrimary).map((m) => m.name);
  if (primaries.length === 0) return 0.5;
  const sum = primaries.reduce((s, m) => s + 1 / (1 + (coverage.load[m] ?? 0)), 0);
  return sum / primaries.length;
}

/** Older beats recent, and never-done beats both. */
function recency(w: TaggedWorkout): number {
  return w.lastPerformedDaysAgo === null ? 1 : Math.min(1, w.lastPerformedDaysAgo / 7);
}

/**
 * Two of spec §4 step 3's three ranking criteria: neglected-coverage overlap
 * (weighted double) and recency, with a flat penalty for going straight back
 * at yesterday's muscles. Duration fit — the third — is deliberately absent:
 * every candidate here already fits its envelope, and the AI tier sees each
 * one's `minutes` and `roundsNote` when it makes the final call, so scoring
 * the fit again would only bias the rules tier toward the middle of a range
 * the model can judge better in context.
 */
function scoreMain(w: TaggedWorkout, coverage: MuscleCoverage): number {
  const primaries = w.tags.muscles.filter((m) => m.isPrimary).map((m) => m.name);
  const yesterdayPenalty = primaries.some((m) => coverage.yesterday.has(m)) ? 0.5 : 0;
  return freshness(w, coverage) * 2 + recency(w) - yesterdayPenalty;
}

/** Any primary at soreness ≥2 — which is stricter than spec §4's "dominated
 *  by muscles at soreness ≥2". A full-body workout with three primaries, one
 *  of them sore, leaves the strict tier on that one muscle and can label an
 *  otherwise ordinary day a compromise. Deliberate: it matches the existing
 *  exercise-level gate in dailyCandidates.ts, and §8's relaxation ladder is
 *  the release valve. Renaming it to match what it does, not what §4 says. */
function hasSorePrimary(w: TaggedWorkout, soreness: Record<string, number>): boolean {
  return w.tags.muscles.some((m) => m.isPrimary && (soreness[m.name] ?? 0) >= 2);
}

/** Spec §4 step 4: a support or conditioning workout must share body focus
 *  with at least one main candidate. A full-body workout pairs with anything,
 *  and a null constraint (no main today) rules nothing out. */
function sharesMainFocus(w: TaggedWorkout, mainFocuses: Set<BodyFocus> | null): boolean {
  if (mainFocuses === null) return true;
  const focus = workoutFocus(w.tags.muscles);
  return focus === "full" || mainFocuses.has(focus);
}

export function buildBlockShortlists(
  workouts: TaggedWorkout[],
  ctx: ShortlistContext,
): ShortlistResult {
  const tagged = workouts.filter((w) => w.tags.classifiedAt !== null);
  const byRole = (role: BlockRole) =>
    tagged.filter((w) => w.tags.blockRoles.includes(role));
  const envFor = (block: BlockRole) =>
    ctx.envelopes.find((e) => e.block === block);

  const shortlists: BlockShortlists = {};
  let relaxedMain = false;

  // ---- Main (skipped entirely on a recovery day) ----
  /** The focuses support work has to pair with, or null when there is no main
   *  to pair with at all — a recovery day, or a catalog too thin to field one.
   *  Null means unconstrained: with no main in the session, an upper-body
   *  warm-up clashes with nothing. */
  let mainFocuses: Set<BodyFocus> | null = null;
  const mainEnv = envFor("main");
  if (!ctx.recoveryDay && mainEnv) {
    const pool = byRole("main")
      // Advanced workouts sit out the re-entry ramp. There is no per-workout
      // skill state yet, so the ramp stands in for "not above the user's skill
      // level" — pinned during planning, where the spec was silent.
      .filter((w) => !(ctx.rampWeek <= 2 && w.tags.skillLevel === "Advanced"));

    const unsore = (w: TaggedWorkout) => !hasSorePrimary(w, ctx.soreness);
    const unrepeated = (w: TaggedWorkout) =>
      w.lastPerformedDaysAgo === null || w.lastPerformedDaysAgo >= MAIN_REPEAT_DAYS;

    // §8: relax recency first, then soreness dominance — never the ramp gate.
    // Each tier is judged on the candidates it actually yields, not on the
    // workouts that entered it: a strict pool whose every member busts the
    // time envelope has produced no main, and the day still needs one.
    const tiers = [
      pool.filter((w) => unsore(w) && unrepeated(w)),
      pool.filter(unsore),
      pool,
    ];
    let main: BlockCandidate[] = [];
    for (let tier = 0; tier < tiers.length; tier++) {
      main = rankFitted(tiers[tier], mainEnv, (w) => scoreMain(w, ctx.coverage), MAIN_SHORTLIST);
      if (main.length > 0) {
        relaxedMain = tier > 0;
        break;
      }
    }
    shortlists.main = main;
    if (main.length > 0) mainFocuses = new Set(main.map((c) => c.focus));
  }

  // Catalog support candidates may match ANY main candidate's focus (spec §4
  // step 4), but the built-in is one routine and has to commit before the AI
  // has picked. So it commits only when the whole main shortlist agrees; when
  // the shortlist is split — or there is no main at all — it takes the
  // full-body routine, which is never the wrong flavour for the pick that
  // lands. Following the top candidate alone would put an upper-body cool-down
  // on a session whose main turned out to be legs.
  const mainFocusList = [...(mainFocuses ?? [])];
  const builtinFocus: BodyFocus = mainFocusList.length === 1 ? mainFocusList[0] : "full";

  // ---- Support blocks ----
  const supportRoles: BuiltinRoutine["role"][] = ctx.recoveryDay
    ? ["mobility", "cooldown"]
    : ["warmup", "mobility", "cooldown"];
  for (const role of supportRoles) {
    const env = envFor(role);
    if (!env) continue;
    // No soreness gate here, deliberately: mobility and stretching for a sore
    // muscle are the point, and a warm-up precedes work main has already
    // sore-gated.
    const list = rankFitted(
      byRole(role).filter((w) => sharesMainFocus(w, mainFocuses)),
      env,
      (w) => freshness(w, ctx.coverage) + recency(w),
      SUPPORT_SHORTLIST,
    );

    // Built-ins are appended directly, NOT run through fitToEnvelope: they
    // ship at 6-8 minutes and a compressed short-day envelope (3-5) would
    // reject them outright, breaking the promise that every session is
    // complete. Clamp to the ceiling instead.
    const builtin = findBuiltin(role, builtinFocus);
    if (builtin) {
      list.push({
        workoutId: null,
        builtinKey: builtin.key,
        name: builtin.name,
        minutes: Math.min(builtin.minutes, env.maxMinutes),
        roundsNote: null,
        muscles: [],
        focus: builtin.focus,
        score: 0,
      });
    }
    shortlists[role] = list;
  }

  // ---- Conditioning: optional, no built-in (spec §3.3), never on a recovery
  // day (spec §6 — mobility and cool-down alone) ----
  const condEnv = envFor("conditioning");
  if (!ctx.recoveryDay && condEnv) {
    shortlists.conditioning = rankFitted(
      byRole("conditioning").filter(
        (w) => sharesMainFocus(w, mainFocuses) && !hasSorePrimary(w, ctx.soreness),
      ),
      condEnv,
      (w) => freshness(w, ctx.coverage),
      SUPPORT_SHORTLIST,
    );
  }

  return { shortlists, relaxedMain };
}
