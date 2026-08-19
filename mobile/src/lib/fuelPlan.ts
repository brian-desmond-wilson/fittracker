// The Fuel engine: the day as a sequence of eating windows.
//
// Fuel (the redesigned Meals & Snacks page) renders one chronological rail:
// receipts above a NOW line, plan below it. This module is every rule that
// rail needs, and none of its I/O:
//
//   - derive default windows when `eating_windows` has no rows (the profile's
//     three point times are the fallback schedule)
//   - attribute today's logs to windows, so a window can be DONE, and decide
//     which windows are LIVE, MISSED or UPCOMING off one clock
//   - redistribute the remaining calorie/protein budget over the windows that
//     are still open, weighted, so a missed breakfast flows into lunch and
//     dinner instead of silently vanishing
//   - pick a meal for each open window (rules tier of the hybrid engine:
//     expiring food first, then window affinity, then Brian score), with a
//     portion factor when the window's budget outgrows the meal
//   - assemble the rail rows and the day's landing projection
//
// Deliberately pure and single-clock: every function takes `nowMinutes` (or
// none), nothing reads `new Date()`. The two-clocks defect this replaces —
// pace lines sampling render time while the recommender froze its own `now` —
// is impossible to reintroduce here by construction.
import type { MealType } from "../types/track";

// ---------------------------------------------------------------------------
// Windows

export interface FuelWindow {
  id: string;
  label: string;
  mealType: MealType;
  startMinutes: number;
  endMinutes: number;
  /** Relative share of the day's budget. Resolved — never null here. */
  budgetWeight: number;
}

export type FuelWindowStatus = "done" | "live" | "missed" | "upcoming";

/** Default budget weights per meal type, used when a window row carries none.
 *  Roughly the 25 / 30 / 35 / 10 split of a three-meals-and-a-snack day. */
export const DEFAULT_BUDGET_WEIGHTS: Record<MealType, number> = {
  breakfast: 1,
  lunch: 1.2,
  dinner: 1.4,
  snack: 0.4,
  dessert: 0.3,
  // No window is ever DEFINED as a beverage window (the DB forbids it), so
  // this weight can only be read if that invariant breaks; zero makes the
  // failure inert rather than budget-shifting.
  beverage: 0,
};

/** How long a derived legacy window stays open past its profile point time. */
export const LEGACY_WINDOW_SPAN_MIN = 90;

export function timeToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map((s) => parseInt(s, 10));
  return h * 60 + (m || 0);
}

/**
 * The fallback schedule: three windows derived from the profile's point
 * times, each opening at the configured time and spanning 90 minutes.
 * Users get real windows the moment they save any row in `eating_windows`;
 * until then their existing settings keep working unchanged.
 */
export function windowsFromLegacyTimes(mealTimes: {
  breakfast: string;
  lunch: string;
  dinner: string;
}): FuelWindow[] {
  const mk = (id: string, label: string, mealType: MealType, hhmm: string): FuelWindow => {
    const start = timeToMinutes(hhmm);
    return {
      id: `legacy-${id}`,
      label,
      mealType,
      startMinutes: start,
      endMinutes: start + LEGACY_WINDOW_SPAN_MIN,
      budgetWeight: DEFAULT_BUDGET_WEIGHTS[mealType],
    };
  };
  return [
    mk("breakfast", "Breakfast", "breakfast", mealTimes.breakfast),
    mk("lunch", "Lunch", "lunch", mealTimes.lunch),
    mk("dinner", "Dinner", "dinner", mealTimes.dinner),
  ];
}

/**
 * Which slot a log made at `nowMinutes` belongs to — the window it lands
 * inside, or failing that the nearest one.
 *
 * This is what makes "log something" arrive already saying "Dinner" at 7 PM
 * instead of asking, or worse defaulting to breakfast because breakfast is
 * first in the list. Nearest rather than next, deliberately: at 9:40 with a
 * 7–9 breakfast window the thing you just ate was breakfast, not the lunch
 * you have not had yet — the same asymmetry `attributeLogs` applies.
 */
export function mealTypeForMinutes(
  windows: FuelWindow[],
  nowMinutes: number,
  fallback: MealType = "snack",
): MealType {
  if (windows.length === 0) return fallback;
  const inside = windows.find(
    (w) => nowMinutes >= w.startMinutes && nowMinutes <= w.endMinutes,
  );
  if (inside) return inside.mealType;
  const nearest = [...windows].sort(
    (a, b) => distanceToWindow(nowMinutes, a) - distanceToWindow(nowMinutes, b),
  )[0];
  return nearest.mealType;
}

/** Row shape of `eating_windows` as the client reads it. */
export interface EatingWindowRow {
  id: string;
  label: string;
  meal_type: MealType;
  start_time: string; // "HH:MM" or "HH:MM:SS"
  end_time: string;
  budget_weight: number | null;
}

export function windowsFromRows(rows: EatingWindowRow[]): FuelWindow[] {
  return rows
    .map((r) => ({
      id: r.id,
      label: r.label,
      mealType: r.meal_type,
      startMinutes: timeToMinutes(r.start_time),
      endMinutes: timeToMinutes(r.end_time),
      budgetWeight: r.budget_weight ?? DEFAULT_BUDGET_WEIGHTS[r.meal_type],
    }))
    .sort((a, b) => a.startMinutes - b.startMinutes || a.label.localeCompare(b.label));
}

// ---------------------------------------------------------------------------
// Attribution: which window does a log belong to?

/** A log's minutes-since-midnight must land within this many minutes of a
 *  window's edge to be pulled in by meal-type match alone. */
export const ATTRIBUTION_SLOP_MIN = 120;

export interface FuelLogInput {
  id: string;
  mealType: MealType;
  /** Minutes since local midnight of `logged_at`. Caller converts — this
   *  module never touches Date. */
  loggedAtMinutes: number;
  calories: number;
  protein: number;
  name: string;
  /** FALSE only for a beverage the owner said doesn't fill a window: the log
   *  floats — on the rail, in the totals, invisible to the plan. */
  countsAsMeal: boolean;
}

export interface AttributedLog extends FuelLogInput {
  /** null = unplanned — eaten outside every window. Still on the rail, still
   *  in the totals; the plan simply doesn't pretend it had a slot. */
  windowId: string | null;
}

function distanceToWindow(minutes: number, w: FuelWindow): number {
  if (minutes < w.startMinutes) return w.startMinutes - minutes;
  if (minutes > w.endMinutes) return minutes - w.endMinutes;
  return 0;
}

/**
 * Attribution, in order of confidence:
 *   1. a window whose span contains the log's time — preferring one whose
 *      meal type matches the log's;
 *   2. else the nearest window with a matching meal type, if the log falls
 *      within `ATTRIBUTION_SLOP_MIN` of its edge (breakfast at 9:40 with a
 *      7–9 breakfast window is still breakfast);
 *   3. else unplanned.
 */
export function attributeLogs(
  logs: FuelLogInput[],
  windows: FuelWindow[],
): AttributedLog[] {
  return logs.map((log) => {
    // A non-counting beverage never claims a window, however squarely its
    // time lands in one — that's the whole meaning of the switch. Decided
    // here, at the single door every log passes through, so no downstream
    // reader (window states, budgets, missed notes) needs its own check.
    if (!log.countsAsMeal) return { ...log, windowId: null };
    const containing = windows.filter((w) => distanceToWindow(log.loggedAtMinutes, w) === 0);
    const typed = containing.find((w) => w.mealType === log.mealType);
    if (typed) return { ...log, windowId: typed.id };
    if (containing.length > 0) return { ...log, windowId: containing[0].id };

    const near = windows
      .filter((w) => w.mealType === log.mealType)
      .map((w) => ({ w, d: distanceToWindow(log.loggedAtMinutes, w) }))
      .filter((x) => x.d <= ATTRIBUTION_SLOP_MIN)
      .sort((a, b) => a.d - b.d);
    if (near.length > 0) return { ...log, windowId: near[0].w.id };

    return { ...log, windowId: null };
  });
}

// ---------------------------------------------------------------------------
// Window states

export interface WindowState {
  window: FuelWindow;
  status: FuelWindowStatus;
  logs: AttributedLog[];
}

/**
 * One clock, one verdict per window. A window with any attributed log is DONE
 * even while its span is still open — "eaten" outranks "in progress". An
 * empty window is LIVE inside its span, MISSED after it, UPCOMING before it.
 */
export function windowStates(
  windows: FuelWindow[],
  logs: AttributedLog[],
  nowMinutes: number,
): WindowState[] {
  return windows.map((w) => {
    const wLogs = logs.filter((l) => l.windowId === w.id);
    let status: FuelWindowStatus;
    if (wLogs.length > 0) status = "done";
    else if (nowMinutes > w.endMinutes) status = "missed";
    else if (nowMinutes >= w.startMinutes) status = "live";
    else status = "upcoming";
    return { window: w, status, logs: wLogs };
  });
}

// ---------------------------------------------------------------------------
// Budget redistribution

export interface WindowTarget {
  windowId: string;
  targetCalories: number;
  targetProtein: number;
}

/**
 * Split what's left of the day's goals across the windows still open (live +
 * upcoming), weighted. This IS the redistribution: a missed window simply
 * isn't in the denominator any more, so its share flows to the others without
 * a special case. Returns [] when nothing is open or nothing is left.
 */
export function windowTargets(opts: {
  states: WindowState[];
  goalCalories: number | null;
  goalProtein: number | null;
  consumedCalories: number;
  consumedProtein: number;
}): WindowTarget[] {
  const open = opts.states.filter((s) => s.status === "live" || s.status === "upcoming");
  if (open.length === 0) return [];
  const remainingCal = Math.max(0, (opts.goalCalories ?? 0) - opts.consumedCalories);
  const remainingPro = Math.max(0, (opts.goalProtein ?? 0) - opts.consumedProtein);
  const totalWeight = open.reduce((s, w) => s + w.window.budgetWeight, 0);
  if (totalWeight <= 0) return [];
  return open.map((s) => ({
    windowId: s.window.id,
    targetCalories: Math.round((remainingCal * s.window.budgetWeight) / totalWeight),
    targetProtein: Math.round((remainingPro * s.window.budgetWeight) / totalWeight),
  }));
}

/**
 * The copy a missed window carries: roughly what it was carrying, and where
 * that went. The amount is the window's share of the FULL day goal — its
 * original allotment, which is what the reader remembers it owing.
 */
export function redistributionNote(opts: {
  missed: FuelWindow;
  allWindows: FuelWindow[];
  openLabels: string[];
  goalCalories: number | null;
}): string | null {
  if (opts.openLabels.length === 0 || opts.goalCalories == null) return null;
  const totalWeight = opts.allWindows.reduce((s, w) => s + w.budgetWeight, 0);
  if (totalWeight <= 0) return null;
  const share = Math.round((opts.goalCalories * opts.missed.budgetWeight) / totalWeight / 10) * 10;
  if (share <= 0) return null;
  const names =
    opts.openLabels.length === 1
      ? opts.openLabels[0]
      : `${opts.openLabels.slice(0, -1).join(", ")} & ${opts.openLabels[opts.openLabels.length - 1]}`;
  return `~${share} cal moved to ${names}`;
}

// ---------------------------------------------------------------------------
// Portioning

/** Scale a pick up when its window's budget outgrows it — never down: being
 *  ahead shrinks LATER targets via redistribution instead of asking anyone to
 *  eat four fifths of a prepared meal. Capped: past 1.5× the answer is a
 *  second course, not a bigger portion. */
export const PORTION_MAX = 1.5;
/** Below this the note isn't worth the ink — 1.05× of anything is noise. */
export const PORTION_NOTE_MIN = 1.15;

export function portionFactor(targetCalories: number, mealCalories: number): number {
  if (mealCalories <= 0 || targetCalories <= mealCalories) return 1;
  const raw = Math.min(PORTION_MAX, targetCalories / mealCalories);
  return Math.round(raw * 20) / 20; // steps of 0.05 — a kitchen-real number
}

export function portionLabel(factor: number): string | null {
  if (factor < PORTION_NOTE_MIN) return null;
  const s = Number.isInteger(factor) ? String(factor) : String(factor);
  return `portion ${s}×`;
}

// ---------------------------------------------------------------------------
// Rules-tier picks

export interface FuelCandidate {
  mealId: string;
  name: string;
  calories: number;
  protein: number;
  prepMinutes: number;
  /** Brian score composite (0–100). */
  score: number;
  mealType: MealType;
  assemblable: boolean;
  /** How many expiring items it would use, and how soon the soonest goes.
   *  From `rescuePlan` — 0 / null when it rescues nothing. */
  rescueCount: number;
  rescueSoonestDays: number | null;
  faceUrl: string | null;
  /** For the AI tier's variety judgement; the rules tier never reads it. */
  lastLoggedDaysAgo?: number | null;
}

export interface FuelPick {
  windowId: string;
  mealId: string;
  name: string;
  calories: number;
  protein: number;
  portion: number;
  prepMinutes: number;
  faceUrl: string | null;
  /** Short chips: "uses food expiring in 1d", "portion 1.25×". */
  reasons: string[];
  /** Carried from the candidate for the Home card's badges (owner decision
   *  2026-08-13: Eat Next renders THIS pick, so it needs what it renders).
   *  The rail itself reads neither. */
  assemblable: boolean;
  score: number;
}

const AFFINITY_BONUS = 12; // in score points: right-meal-for-the-slot beats a
// slightly higher scorer that belongs elsewhere, but not a much higher one.

function rescueRank(c: FuelCandidate): number {
  // Fewer days = more urgent. Non-rescuers sort last.
  if (c.rescueCount === 0 || c.rescueSoonestDays == null) return Number.POSITIVE_INFINITY;
  return c.rescueSoonestDays * 100 - c.rescueCount;
}

/**
 * One pick per open window, earliest window first, each meal used at most
 * once. Ranking inside a window:
 *   1. rescues first — soonest-expiring, then most-rescued (R11: expiring
 *      food gets top priority);
 *   2. assemblable before not;
 *   3. score, with an affinity bonus when the meal's type matches the window;
 *   4. name, for stability.
 * Meals over the prep budget are excluded outright for live windows only —
 * tonight's dinner can afford prep that "eat now" cannot.
 */
/** What the walk produced, and which windows it deliberately left alone. */
export interface WindowPicks {
  picks: FuelPick[];
  /**
   * Windows left empty because the day's calories were already planned, not
   * because the library had nothing to offer. The rail says which, since
   * "nothing fits this slot" would be a lie about a full library.
   */
  budgetSkipped: string[];
}

export function pickForWindows(opts: {
  states: WindowState[];
  targets: WindowTarget[];
  candidates: FuelCandidate[];
  maxPrepMinutes: number;
}): WindowPicks {
  const targetById = new Map(opts.targets.map((t) => [t.windowId, t]));
  const used = new Set<string>();
  const picks: FuelPick[] = [];
  const budgetSkipped: string[] = [];

  const open = opts.states
    .filter((s) => s.status === "live" || s.status === "upcoming")
    .sort((a, b) => a.window.startMinutes - b.window.startMinutes);

  for (const s of open) {
    const target = targetById.get(s.window.id);
    if (!target) continue;
    const pool = opts.candidates
      .filter((c) => !used.has(c.mealId))
      .filter((c) => s.status !== "live" || c.prepMinutes <= opts.maxPrepMinutes);
    if (pool.length === 0) continue;

    const ranked = [...pool].sort((a, b) => {
      const r = rescueRank(a) - rescueRank(b);
      if (r !== 0) return r;
      if (a.assemblable !== b.assemblable) return a.assemblable ? -1 : 1;
      const scoreA = a.score + (a.mealType === s.window.mealType ? AFFINITY_BONUS : 0);
      const scoreB = b.score + (b.mealType === s.window.mealType ? AFFINITY_BONUS : 0);
      if (scoreA !== scoreB) return scoreB - scoreA;
      return a.name.localeCompare(b.name);
    });

    const best = ranked[0];
    used.add(best.mealId);
    const portion = portionFactor(target.targetCalories, best.calories);
    const reasons: string[] = [];
    if (best.rescueCount > 0 && best.rescueSoonestDays != null) {
      reasons.push(
        best.rescueSoonestDays === 0
          ? "uses food expiring today"
          : `uses food expiring in ${best.rescueSoonestDays}d`,
      );
    }
    const pl = portionLabel(portion);
    if (pl) reasons.push(`${pl} to close the gap`);
    picks.push({
      windowId: s.window.id,
      mealId: best.mealId,
      name: best.name,
      calories: best.calories,
      protein: best.protein,
      portion,
      prepMinutes: best.prepMinutes,
      faceUrl: best.faceUrl,
      reasons,
      assemblable: best.assemblable,
      score: best.score,
    });
  }
  return { picks, budgetSkipped };
}

// ---------------------------------------------------------------------------
// AI tier merge

/** One assignment from the fuel-plan edge function, already shape-validated
 *  by that function; this side validates AGAIN because a client must not
 *  trust the network's manners. */
export interface AiAssignment {
  windowId: string;
  mealId: string;
  reason: string | null;
}

/**
 * Merge the AI tier's assignments over the rules tier's picks, per window and
 * defensively. An assignment is honored only when its meal exists, hasn't
 * been used yet, and respects the live-window prep gate; any window the AI
 * skipped — or whose assignment failed validation — keeps its rules pick.
 * Portions and rescue/portion reasons are ALWAYS recomputed by rules; the
 * model contributes the assignment and one sentence, nothing numeric.
 */
/**
 * Spend the day's calories in window order and drop what will not fit.
 *
 * This runs AFTER the AI merge, deliberately, and it is the only place the
 * budget is enforced. Enforcing it inside `pickForWindows` was not enough:
 * the AI tier's assignments are merged over the rules tier afterwards and
 * happily re-filled the windows the rules had left alone — the strip said
 * 2,120 while the rail below it still planned 3,355.
 *
 * The problem it solves: window TARGETS divide the remaining budget by weight,
 * but nothing subtracted a pick once made, so seven windows each targeting a
 * seventh of the day were each handed a whole meal. Portions never scale down
 * (nobody eats four fifths of a prepared meal), so nothing downstream could
 * claw it back.
 *
 * Fills the earlier windows and leaves the later ones spare, rather than
 * scattering gaps: eating happens in time order. No slack — a rule that
 * sometimes tips over is one nobody can predict, and the landing row already
 * says when the day comes up short. Protein is deliberately not a second
 * constraint: calories run out first, and two stopping rules would make it
 * unpredictable which one ended the day.
 */
export function trimToBudget(opts: {
  picks: FuelPick[];
  states: WindowState[];
  /** `null` (no calorie goal) plans everything, as before. */
  remainingCalories: number | null;
}): WindowPicks {
  if (opts.remainingCalories === null) return { picks: opts.picks, budgetSkipped: [] };

  const order = new Map(
    [...opts.states]
      .sort((a, b) => a.window.startMinutes - b.window.startMinutes)
      .map((s, i) => [s.window.id, i]),
  );
  const inTimeOrder = [...opts.picks].sort(
    (a, b) => (order.get(a.windowId) ?? 0) - (order.get(b.windowId) ?? 0),
  );

  let remaining = opts.remainingCalories;
  const kept: FuelPick[] = [];
  const budgetSkipped: string[] = [];
  for (const pick of inTimeOrder) {
    const cost = Math.round(pick.calories * pick.portion);
    if (cost > remaining) {
      budgetSkipped.push(pick.windowId);
      continue;
    }
    remaining -= cost;
    kept.push(pick);
  }
  return { picks: kept, budgetSkipped };
}

export function mergeAiPicks(opts: {
  states: WindowState[];
  targets: WindowTarget[];
  candidates: FuelCandidate[];
  rulesPicks: FuelPick[];
  ai: AiAssignment[];
  maxPrepMinutes: number;
}): FuelPick[] {
  const candidateById = new Map(opts.candidates.map((c) => [c.mealId, c]));
  const targetById = new Map(opts.targets.map((t) => [t.windowId, t]));
  const rulesByWindow = new Map(opts.rulesPicks.map((p) => [p.windowId, p]));
  const aiByWindow = new Map(opts.ai.map((a) => [a.windowId, a]));
  const used = new Set<string>();
  const picks: FuelPick[] = [];

  const open = opts.states
    .filter((s) => s.status === "live" || s.status === "upcoming")
    .sort((a, b) => a.window.startMinutes - b.window.startMinutes);

  for (const s of open) {
    const target = targetById.get(s.window.id);
    if (!target) continue;

    const ai = aiByWindow.get(s.window.id);
    const aiCandidate = ai ? candidateById.get(ai.mealId) : undefined;
    const aiValid =
      ai !== undefined &&
      aiCandidate !== undefined &&
      !used.has(ai.mealId) &&
      (s.status !== "live" || aiCandidate.prepMinutes <= opts.maxPrepMinutes);

    if (aiValid) {
      const portion = portionFactor(target.targetCalories, aiCandidate.calories);
      const reasons: string[] = [];
      if (ai.reason) reasons.push(ai.reason);
      if (aiCandidate.rescueCount > 0 && aiCandidate.rescueSoonestDays != null) {
        reasons.push(
          aiCandidate.rescueSoonestDays === 0
            ? "uses food expiring today"
            : `uses food expiring in ${aiCandidate.rescueSoonestDays}d`,
        );
      }
      const pl = portionLabel(portion);
      if (pl) reasons.push(`${pl} to close the gap`);
      used.add(ai.mealId);
      picks.push({
        windowId: s.window.id,
        mealId: aiCandidate.mealId,
        name: aiCandidate.name,
        calories: aiCandidate.calories,
        protein: aiCandidate.protein,
        portion,
        prepMinutes: aiCandidate.prepMinutes,
        faceUrl: aiCandidate.faceUrl,
        reasons,
        assemblable: aiCandidate.assemblable,
        score: aiCandidate.score,
      });
      continue;
    }

    const rules = rulesByWindow.get(s.window.id);
    if (rules && !used.has(rules.mealId)) {
      used.add(rules.mealId);
      picks.push(rules);
    }
  }
  return picks;
}

// ---------------------------------------------------------------------------
// Projection + verdict

/**
 * How the projected day misses, when it misses.
 *
 * "Short" was the only word the landing row had, so a plan that overshot
 * calories by half still read "short of goal". Calories are named first
 * because they are the number beside the verdict; a protein floor missed on
 * an otherwise fine day gets its own answer rather than being folded in.
 */
export type ProjectionMiss = "over_calories" | "under_calories" | "under_protein";

export interface FuelProjection {
  calories: number;
  protein: number;
  onGoal: boolean;
  /** `null` exactly when `onGoal` is true. */
  miss: ProjectionMiss | null;
}

/** Calories may land a little over without failing the day; protein is a
 *  floor. Both tolerances mirror `computeMealPace`'s. */
export const PROJECTION_CAL_UNDER_TOL = 0.05;
export const PROJECTION_CAL_OVER_TOL = 0.1;
export const PROJECTION_PROTEIN_TOL_G = 8;

export function planProjection(opts: {
  consumedCalories: number;
  consumedProtein: number;
  picks: FuelPick[];
  goalCalories: number | null;
  goalProtein: number | null;
}): FuelProjection {
  const calories = Math.round(
    opts.picks.reduce((s, p) => s + p.calories * p.portion, opts.consumedCalories),
  );
  const protein = Math.round(
    opts.picks.reduce((s, p) => s + p.protein * p.portion, opts.consumedProtein),
  );
  const calOk =
    opts.goalCalories == null ||
    (calories >= opts.goalCalories * (1 - PROJECTION_CAL_UNDER_TOL) &&
      calories <= opts.goalCalories * (1 + PROJECTION_CAL_OVER_TOL));
  const proOk = opts.goalProtein == null || protein >= opts.goalProtein - PROJECTION_PROTEIN_TOL_G;
  const miss: ProjectionMiss | null =
    calOk && proOk ? null
    : !calOk && opts.goalCalories != null && calories > opts.goalCalories ? "over_calories"
    : !calOk ? "under_calories"
    : "under_protein";
  return { calories, protein, onGoal: calOk && proOk, miss };
}

export type FuelVerdictTone = "before_window" | "behind" | "on_pace" | "ahead" | "goal_hit" | "closed";

export interface FuelVerdict {
  tone: FuelVerdictTone;
  label: string;
}

/** The strip's one-word answer. Behind on either macro is behind — protein
 *  matters as much as calories on this page. */
export function fuelVerdict(opts: {
  calorieStatus: string;
  proteinStatus: string;
  nowMinutes: number;
  windowEndMinutes: number;
}): FuelVerdict {
  if (opts.nowMinutes > opts.windowEndMinutes) return { tone: "closed", label: "Day closed" };
  // Before the first window opens there is nothing to be on pace WITH. The
  // macro statuses say `before_window`, and reading them without this case
  // let that fall through to the final `on_pace` — so at two in the morning,
  // nothing eaten, the strip showed a green "On pace". The loop's own pace
  // station says "Before window" at that hour; two screens, one day, one
  // answer.
  if (
    opts.calorieStatus === "before_window" &&
    opts.proteinStatus === "before_window"
  ) {
    return { tone: "before_window", label: "Before window" };
  }
  if (opts.calorieStatus === "goal_hit" && opts.proteinStatus === "goal_hit") {
    return { tone: "goal_hit", label: "Goals hit" };
  }
  if (opts.calorieStatus === "behind" || opts.proteinStatus === "behind") {
    return { tone: "behind", label: "Behind pace" };
  }
  if (opts.calorieStatus === "ahead" || opts.proteinStatus === "ahead") {
    return { tone: "ahead", label: "Ahead of pace" };
  }
  return { tone: "on_pace", label: "On pace" };
}

// ---------------------------------------------------------------------------
// Rail assembly

export const CLOSING_SOON_MIN = 20;

export type FuelRailRow =
  | { kind: "logged"; log: AttributedLog; windowLabel: string | null; sortMinutes: number }
  | {
      kind: "missed";
      window: FuelWindow;
      note: string | null;
      sortMinutes: number;
    }
  | { kind: "retro"; sortMinutes: number }
  | { kind: "now"; sortMinutes: number }
  | {
      kind: "suggestion";
      window: FuelWindow;
      pick: FuelPick;
      closingSoon: boolean;
      sortMinutes: number;
    }
  | {
      kind: "empty-slot";
      window: FuelWindow;
      /** Why nothing is suggested: the library had nothing left to offer,
       *  or the day's calories are already planned. The two want different
       *  words — blaming the library for a full one would be a lie. */
      reason: "no-candidates" | "budget-spent";
      sortMinutes: number;
    }
  | { kind: "landing"; projection: FuelProjection; sortMinutes: number };

/**
 * The rail, in render order. Today: receipts and missed windows sorted by
 * time, one retro ghost just above NOW, the NOW marker, then the plan, then
 * the landing line. Past days (`nowMinutes: null`): receipts only — actuals,
 * no plan, no ghosts (R6).
 */
export function buildFuelRail(opts: {
  states: WindowState[];
  logs: AttributedLog[];
  picks: FuelPick[];
  projection: FuelProjection | null;
  nowMinutes: number | null;
  goalCalories: number | null;
  /** Window ids the picker left alone because the budget was spent. */
  budgetSkipped?: string[];
}): FuelRailRow[] {
  const windowById = new Map(opts.states.map((s) => [s.window.id, s.window]));
  const rows: FuelRailRow[] = [];

  for (const log of opts.logs) {
    const w = log.windowId ? (windowById.get(log.windowId) ?? null) : null;
    rows.push({
      kind: "logged",
      log,
      windowLabel: w ? w.label : null,
      sortMinutes: log.loggedAtMinutes,
    });
  }

  if (opts.nowMinutes == null) {
    return rows.sort((a, b) => a.sortMinutes - b.sortMinutes);
  }

  const openLabels = opts.states
    .filter((s) => s.status === "live" || s.status === "upcoming")
    .map((s) => s.window.label);
  const allWindows = opts.states.map((s) => s.window);

  for (const s of opts.states) {
    if (s.status !== "missed") continue;
    rows.push({
      kind: "missed",
      window: s.window,
      note: redistributionNote({
        missed: s.window,
        allWindows,
        openLabels,
        goalCalories: opts.goalCalories,
      }),
      sortMinutes: s.window.endMinutes,
    });
  }

  // The retro ghost sits just above NOW: one standing invitation to back-fill
  // whatever the day forgot, missed window or not (R5).
  rows.push({ kind: "retro", sortMinutes: opts.nowMinutes - 0.5 });
  rows.push({ kind: "now", sortMinutes: opts.nowMinutes });

  const pickByWindow = new Map(opts.picks.map((p) => [p.windowId, p]));
  for (const s of opts.states) {
    if (s.status !== "live" && s.status !== "upcoming") continue;
    const pick = pickByWindow.get(s.window.id);
    // Suggestions render at the LATER of window start and now — a live
    // window's slot is "now", not an hour ago.
    const at = Math.max(s.window.startMinutes, opts.nowMinutes + 1);
    if (pick) {
      rows.push({
        kind: "suggestion",
        window: s.window,
        pick,
        closingSoon:
          s.status === "live" && s.window.endMinutes - opts.nowMinutes <= CLOSING_SOON_MIN,
        sortMinutes: at,
      });
    } else {
      rows.push({
        kind: "empty-slot",
        window: s.window,
        reason: opts.budgetSkipped?.includes(s.window.id) ? "budget-spent" : "no-candidates",
        sortMinutes: at,
      });
    }
  }

  if (opts.projection && opts.picks.length > 0) {
    rows.push({ kind: "landing", projection: opts.projection, sortMinutes: 24 * 60 + 1 });
  }

  return rows.sort((a, b) => a.sortMinutes - b.sortMinutes);
}
