// mobile/src/hooks/useFuelPlan.ts
// Single assembly point for the Fuel rail: fetches what the engine needs
// (library, profile, windows, prep budget), takes the day's logs from the
// screen that already owns them, and hands back rendered-ready rows.
//
// Clock contract: the plan re-computes at EVENTS — a log, an undo, a screen
// focus, a pull-to-refresh (bump `refreshKey`) — never on a ticking timer.
// Each compute samples one `now` and threads it through attribution, states,
// pace and the rail, so no two parts of the page can disagree about the time
// (the two-clocks defect the old pace lines carried). Between events the rail
// simply stays as computed, which is what a plan should do.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/src/lib/supabase";
import { computeBrianScore } from "@/src/lib/mealScore";
import { brianScoreInputFor } from "@/src/lib/mealScoreInput";
import { computeMealPace, type MealPaceState } from "@/src/lib/mealPace";
import { sumNutrition, type MacroGoals, type MacroTotals } from "@/src/lib/mealMacros";
import {
  attributeLogs,
  buildFuelRail,
  fuelVerdict,
  mergeAiPicks,
  pickForWindows,
  trimToBudget,
  planProjection,
  timeToMinutes,
  windowsFromLegacyTimes,
  windowsFromRows,
  windowStates,
  windowTargets,
  type AiAssignment,
  type EatingWindowRow,
  type FuelCandidate,
  type FuelPick,
  type FuelProjection,
  type FuelRailRow,
  type FuelVerdict,
  type FuelWindow,
} from "@/src/lib/fuelPlan";
import { buildStockByMealId } from "@/src/lib/eatNext";
import { rescuePlan } from "@/src/lib/rescuePlan";
import { assessAssemblability } from "@/src/lib/stockState";
import { mealFaceUrlFor } from "@/src/lib/mealFace";
import { shouldRetire } from "@/src/lib/mealRetirement";
import { daysBetweenLocalDates } from "@/src/lib/stockState";
import {
  computeMealTotals,
  fetchMealLibrary,
  type MealLibraryData,
} from "@/src/lib/supabase/mealLibrary";
import { getLocalDateString } from "@/src/lib/dates";
import { defaultMealTypeFor } from "@/src/types/meal-library";
import type { MealLog } from "@/src/types/track";

const DEFAULT_MAX_PREP_MINUTES = 5;

interface ProfileRow {
  target_calories: number | null;
  target_protein_g: number | null;
  target_carbs_g: number | null;
  target_sodium_mg: number | null;
  target_fats_g: number | null;
  target_sugars_g: number | null;
  target_fiber_g: number | null;
  breakfast_time: string;
  lunch_time: string;
  dinner_time: string;
  water_window_start: string;
  water_window_end: string;
}

// Same both-ways drift guard as useEatNext's PROFILE_COLUMNS: the client is
// untyped, so the select list is derived from the interface.
const PROFILE_COLUMNS = {
  target_calories: true,
  target_protein_g: true,
  target_carbs_g: true,
  target_sodium_mg: true,
  target_fats_g: true,
  target_sugars_g: true,
  target_fiber_g: true,
  breakfast_time: true,
  lunch_time: true,
  dinner_time: true,
  water_window_start: true,
  water_window_end: true,
} satisfies Record<keyof ProfileRow, true>;
const PROFILE_SELECT = Object.keys(PROFILE_COLUMNS).join(", ");

const WINDOW_COLUMNS = {
  id: true,
  label: true,
  meal_type: true,
  start_time: true,
  end_time: true,
  budget_weight: true,
} satisfies Record<keyof EatingWindowRow, true>;
const WINDOW_SELECT = Object.keys(WINDOW_COLUMNS).join(", ");

const hhmm = (t: string) => t.slice(0, 5);

interface FuelSources {
  library: MealLibraryData;
  profile: ProfileRow;
  windowRows: EatingWindowRow[];
  maxPrepMinutes: number;
}

export interface FuelDayModel {
  rows: FuelRailRow[];
  windows: FuelWindow[];
  picks: FuelPick[];
  verdict: FuelVerdict | null;
  caloriePace: MealPaceState | null;
  proteinPace: MealPaceState | null;
  /** Paced like the other two so the strip can draw its shortfall; the
   *  recommender still reads only calories and protein. */
  fiberPace: MealPaceState | null;
  projection: FuelProjection | null;
  goals: MacroGoals | null;
  dayTotals: MacroTotals;
  /** The clock the whole model was computed against. */
  computedAt: Date;
  /** True once the AI tier's assignments are merged into `picks`. */
  aiApplied: boolean;
  /** What the AI tier would be asked, and the identity of that ask. The
   *  effect below reads these; consumers should not. */
  aiSignature: string | null;
  aiRequest: { windows: object[]; candidates: object[] } | null;
}

/** One AI response, pinned to the exact plan-state it answered. */
interface AiResult {
  signature: string;
  assignments: AiAssignment[];
}

export interface UseFuelPlanValue {
  model: FuelDayModel | null;
  /** True only before the first successful source fetch — stale-while-
   *  revalidate, same contract as useEatNext. */
  loading: boolean;
  error: Error | null;
  refetch: () => void;
}

function toError(e: unknown): Error {
  if (e instanceof Error) return e;
  if (typeof e === "object" && e !== null && "message" in e) {
    const m = e as { message?: unknown; code?: unknown };
    const text = typeof m.message === "string" ? m.message : String(m.message);
    return new Error(typeof m.code === "string" ? `${text} (${m.code})` : text);
  }
  return new Error(String(e));
}

/** Minutes since local midnight of a timestamptz string, in device-local time
 *  — the same coordinate system the windows live in. */
function localMinutes(iso: string): number {
  const d = new Date(iso);
  return d.getHours() * 60 + d.getMinutes();
}

/**
 * Ask the AI tier, with ONE retry.
 *
 * The retry is not optimism, it is a specific race: the call takes several
 * seconds, and a Supabase access token that expires mid-flight (or a session
 * still being restored on a cold start) comes back as a flat 401 that a
 * second attempt, with the refreshed token supabase-js now holds, simply
 * succeeds at. One retry only — a genuinely failing function must be allowed
 * to fail rather than be hammered while the user waits on rules picks that
 * are already correct.
 */
const AI_RETRY_DELAY_MS = 1_200;

// One AI answer per QUESTION, app-wide. Two plan instances can be mounted at
// once — the Fuel rail and Home's Eat Next card render the same plan — and
// the AI tier is a model: asked the identical question twice it can assign
// differently, which would put one meal on Home and another on Track (the
// exact inconsistency the Home card's plan integration exists to remove).
// Module scope makes the answer a property of the signature, not of whichever
// component asked first; the in-flight map coalesces concurrent asks onto one
// network call, same shape as fetchMealLibrary's D1 reasoning.
const aiAnswerBySignature = new Map<string, AiAssignment[]>();
const aiAskInFlight = new Map<string, Promise<AiAssignment[]>>();

async function askFuelPlan(body: object): Promise<AiAssignment[]> {
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, AI_RETRY_DELAY_MS));
    try {
      const { data, error: fnError } = await supabase.functions.invoke("fuel-plan", { body });
      if (fnError) throw fnError;
      return (Array.isArray(data?.picks) ? data.picks : []) as AiAssignment[];
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError;
}

/**
 * `FunctionsHttpError` carries the whole `Response` on `.context` and puts
 * nothing useful in `.message`, so the default log is the string
 * "FunctionsHttpError: Edge Function returned a non-2xx status code" and no
 * indication of WHICH non-2xx. This reads the status and the body out.
 */
async function describeFnError(e: unknown): Promise<string> {
  const ctx = (e as { context?: unknown })?.context;
  if (ctx && typeof ctx === "object" && "status" in ctx) {
    const res = ctx as Response;
    let body = "";
    try {
      body = (await res.text()).slice(0, 200);
    } catch {
      // A body can only be read once; if something already consumed it the
      // status alone is still worth reporting.
    }
    return `HTTP ${res.status}${body ? ` — ${body}` : ""}`;
  }
  return e instanceof Error ? e.message : String(e);
}

/**
 * @param dayLogs   The viewed day's `meal_logs`, already fetched and kept
 *                  fresh by the screen. Order does not matter.
 * @param viewingToday  Past days get receipts only: no picks, no ghosts.
 * @param refreshKey    Bump to force a source refetch (pull-to-refresh).
 */
export function useFuelPlan(
  dayLogs: MealLog[],
  viewingToday: boolean,
  refreshKey?: number,
): UseFuelPlanValue {
  const [sources, setSources] = useState<FuelSources | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [aiResult, setAiResult] = useState<AiResult | null>(null);
  const runIdRef = useRef(0);

  const load = useCallback(async () => {
    const runId = ++runIdRef.current;
    try {
      const [library, profile, windows, constraints] = await Promise.all([
        fetchMealLibrary(),
        supabase.from("profiles").select(PROFILE_SELECT).maybeSingle(),
        supabase.from("eating_windows").select(WINDOW_SELECT).order("start_time"),
        supabase.from("nutrition_constraints").select("max_prep_minutes").maybeSingle(),
      ]);
      const errs = [profile.error, windows.error, constraints.error].filter((e) => e !== null);
      if (errs.length > 0) {
        errs.slice(1).forEach((e) => console.error("useFuelPlan (secondary):", e));
        throw errs[0];
      }
      const p = profile.data as ProfileRow | null;
      if (!p) throw new Error("No profile row");
      if (runId !== runIdRef.current) return;
      setError(null);
      setSources({
        library,
        profile: p,
        // Untyped client + computed select string → postgrest infers an error
        // shape; the row type is pinned by WINDOW_COLUMNS above.
        windowRows: (windows.data ?? []) as unknown as EatingWindowRow[],
        maxPrepMinutes:
          (constraints.data as { max_prep_minutes: number } | null)?.max_prep_minutes ??
          DEFAULT_MAX_PREP_MINUTES,
      });
    } catch (e) {
      console.error("useFuelPlan:", e);
      if (runId !== runIdRef.current) return;
      setError(toError(e));
    } finally {
      if (runId === runIdRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    // refreshKey is the consumers' force-reload signal, not read by load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load, refreshKey]);

  const model = useMemo<FuelDayModel | null>(() => {
    if (!sources) return null;
    const { library, profile, windowRows, maxPrepMinutes } = sources;
    // ONE clock per compute — see the header comment for the contract.
    const now = new Date();
    const today = getLocalDateString(now);
    const nowMinutes = now.getHours() * 60 + now.getMinutes();

    const goals: MacroGoals = {
      calories: profile.target_calories,
      protein: profile.target_protein_g,
      carbs: profile.target_carbs_g,
      sodium_mg: profile.target_sodium_mg,
      fats: profile.target_fats_g,
      sugars: profile.target_sugars_g,
      fiber_g: profile.target_fiber_g,
    };
    const dayTotals = sumNutrition(dayLogs);

    const windows =
      windowRows.length > 0
        ? windowsFromRows(windowRows)
        : windowsFromLegacyTimes({
            breakfast: hhmm(profile.breakfast_time),
            lunch: hhmm(profile.lunch_time),
            dinner: hhmm(profile.dinner_time),
          });

    const attributed = attributeLogs(
      dayLogs.map((l) => ({
        id: l.id,
        mealType: l.meal_type,
        loggedAtMinutes: localMinutes(l.logged_at),
        calories: Number(l.calories ?? 0),
        protein: Number(l.protein ?? 0),
        name: l.name,
      })),
      windows,
    );

    // Past days: receipts only (R6). No states clock, no picks, no verdict.
    if (!viewingToday) {
      return {
        rows: buildFuelRail({
          states: windowStates(windows, attributed, 24 * 60),
          logs: attributed,
          picks: [],
          projection: null,
          nowMinutes: null,
          goalCalories: goals.calories,
        }),
        windows,
        picks: [],
        verdict: null,
        caloriePace: null,
        proteinPace: null,
        fiberPace: null,
        projection: null,
        goals,
        dayTotals,
        computedAt: now,
        aiApplied: false,
        aiSignature: null,
        aiRequest: null,
      };
    }

    const states = windowStates(windows, attributed, nowMinutes);
    const targets = windowTargets({
      states,
      goalCalories: goals.calories,
      goalProtein: goals.protein,
      consumedCalories: dayTotals.calories,
      consumedProtein: dayTotals.protein,
    });

    // Candidate assembly — the same exclusions the recommender applies
    // (retired meals out), plus rescue data so expiring food can jump the
    // queue (R11). All from the one cached library read.
    const expiring = library.inventory
      .filter((r) => r.totalQuantity > 0 && r.daysLeft !== null && r.daysLeft >= 0 && r.daysLeft <= 7)
      .map((r) => ({ name: r.name, conceptIds: r.conceptIds, daysLeft: r.daysLeft as number }));
    const stockByMealId = buildStockByMealId(library);

    const live = library.meals.filter((meal) =>
      !shouldRetire({
        isCompletePortion: meal.is_complete_portion ?? false,
        totalQuantity: library.inventory.some(
          (row) =>
            row.totalQuantity > 0 &&
            meal.items.some((it) =>
              (library.conceptIdsBySavedFoodId.get(it.saved_food_id) ?? [])
                .some((cid) => row.conceptIds.includes(cid)),
            ),
        ) ? 1 : 0,
        daysSinceLastLogged: library.lastLoggedByMealId.has(meal.id)
          ? daysBetweenLocalDates(library.lastLoggedByMealId.get(meal.id)!, today)
          : null,
        daysSinceCreated: daysBetweenLocalDates(
          getLocalDateString(new Date(meal.created_at)),
          today,
        ),
      }),
    );

    const rescueByMealId = new Map(
      rescuePlan({
        meals: live.map((m) => {
          const items = m.items.map((it) => ({
            savedFoodId: it.saved_food_id,
            name: it.savedFood.name,
            barcode: it.savedFood.barcode,
            conceptIds: library.conceptIdsBySavedFoodId.get(it.saved_food_id) ?? [],
          }));
          return {
            mealId: m.id,
            name: m.name,
            conceptIds: items.flatMap((it) => it.conceptIds),
            assemblable: assessAssemblability({ items, inventory: library.inventory }).assemblable,
          };
        }),
        expiring,
        limit: live.length, // every rescue counts here; the cap is a UI concern
      }).map((r) => [r.mealId, r]),
    );

    const candidates: FuelCandidate[] = live.map((meal) => {
      const totals = computeMealTotals(meal.items);
      const score = computeBrianScore(
        brianScoreInputFor(meal, library.conceptIdsBySavedFoodId, library.conceptsById),
      );
      const rescue = rescueByMealId.get(meal.id);
      return {
        mealId: meal.id,
        name: meal.name,
        calories: totals.calories,
        protein: totals.protein,
        prepMinutes: meal.prep_minutes,
        score: score.score,
        mealType: defaultMealTypeFor(meal),
        assemblable: stockByMealId.get(meal.id)?.assemblable ?? false,
        rescueCount: rescue?.rescues.length ?? 0,
        rescueSoonestDays: rescue?.soonestDaysLeft ?? null,
        faceUrl: mealFaceUrlFor(
          meal.image_primary_url,
          meal.items.map((it) => ({
            displayOrder: it.display_order,
            imageUrl: it.savedFood.image_primary_url,
            calories: (it.savedFood.calories ?? 0) * it.servings,
          })),
        ),
        lastLoggedDaysAgo: library.lastLoggedByMealId.has(meal.id)
          ? daysBetweenLocalDates(library.lastLoggedByMealId.get(meal.id)!, today)
          : null,
      };
    });

    // The day's unplanned calories drive how many windows get filled: the walk
    // spends from this and stops rather than handing every window a meal the
    // budget cannot carry.
    const remainingCalories =
      goals.calories === null ? null : Math.max(0, goals.calories - dayTotals.calories);
    const { picks: rulesPicks } = pickForWindows({
      states,
      targets,
      candidates,
      maxPrepMinutes,
    });

    // The identity of this plan-state: same open windows, same targets, same
    // candidate set → same AI question, so a cached answer still applies.
    // Anything that changes the question (a log, a miss, fresh sources)
    // changes the string and triggers exactly one new ask.
    const aiSignature = [
      targets.map((t) => `${t.windowId}=${t.targetCalories}/${t.targetProtein}`).join("|"),
      candidates.map((c) => c.mealId).sort().join(","),
    ].join("::");

    // Merge the AI tier over rules when its answer matches this exact
    // plan-state; otherwise rules stand (and the effect below re-asks).
    const aiFresh = aiResult !== null && aiResult.signature === aiSignature;
    const plannedPicks = aiFresh
      ? mergeAiPicks({
          states,
          targets,
          candidates,
          rulesPicks,
          ai: aiResult.assignments,
          maxPrepMinutes,
        })
      : rulesPicks;

    // The budget is spent AFTER the merge, so both tiers answer to it. The AI
    // is asked about every open window and may say what it likes; what the day
    // can actually carry is decided here, once.
    const { picks, budgetSkipped } = trimToBudget({
      picks: plannedPicks,
      states,
      remainingCalories,
    });

    const aiRequest =
      targets.length > 0 && candidates.length > 0
        ? {
            windows: states
              .filter((s) => s.status === "live" || s.status === "upcoming")
              .map((s) => {
                const t = targets.find((x) => x.windowId === s.window.id);
                return {
                  windowId: s.window.id,
                  label: s.window.label,
                  mealType: s.window.mealType,
                  targetCalories: t?.targetCalories ?? 0,
                  targetProtein: t?.targetProtein ?? 0,
                };
              }),
            candidates: candidates.map((c) => ({
              mealId: c.mealId,
              name: c.name,
              calories: Math.round(c.calories),
              protein: Math.round(c.protein),
              prepMinutes: c.prepMinutes,
              score: Math.round(c.score),
              mealType: c.mealType,
              assemblable: c.assemblable,
              expiresInDays: c.rescueSoonestDays,
              lastLoggedDaysAgo: c.lastLoggedDaysAgo ?? null,
            })),
          }
        : null;

    const windowStart = hhmm(profile.water_window_start);
    const windowEnd = hhmm(profile.water_window_end);
    const mealTimes = {
      breakfast: hhmm(profile.breakfast_time),
      lunch: hhmm(profile.lunch_time),
      dinner: hhmm(profile.dinner_time),
    };
    const paceFor = (macro: "calories" | "protein" | "fiber"): MealPaceState =>
      computeMealPace({
        currentValue:
          macro === "calories"
            ? dayTotals.calories
            : macro === "protein"
              ? dayTotals.protein
              : dayTotals.fiber_g,
        goal:
          macro === "calories"
            ? goals.calories
            : macro === "protein"
              ? goals.protein
              : goals.fiber_g,
        windowStart,
        windowEnd,
        mealTimes,
        macro,
        now,
      });
    const caloriePace = paceFor("calories");
    const proteinPace = paceFor("protein");
    const fiberPace = paceFor("fiber");

    const projection = planProjection({
      consumedCalories: dayTotals.calories,
      consumedProtein: dayTotals.protein,
      picks,
      goalCalories: goals.calories,
      goalProtein: goals.protein,
    });

    return {
      rows: buildFuelRail({
        states,
        logs: attributed,
        picks,
        projection,
        nowMinutes,
        goalCalories: goals.calories,
        budgetSkipped,
      }),
      windows,
      picks,
      verdict: fuelVerdict({
        calorieStatus: caloriePace.status,
        proteinStatus: proteinPace.status,
        nowMinutes,
        windowEndMinutes: timeToMinutes(windowEnd),
      }),
      caloriePace,
      proteinPace,
      fiberPace,
      projection,
      goals,
      dayTotals,
      computedAt: now,
      aiApplied: aiFresh,
      aiSignature,
      aiRequest,
    };
  }, [sources, dayLogs, viewingToday, aiResult]);

  // The AI tier, asked at events only: whenever the plan-state signature
  // changes (a log, a miss crossing a window edge at recompute, fresh
  // sources), and never twice for the same question. Failure is silent by
  // design — the rules picks are already on screen and stay there.
  useEffect(() => {
    if (!model || !viewingToday) return;
    const { aiSignature: sig, aiRequest } = model;
    if (!sig || !aiRequest || model.aiApplied) return;
    const answered = aiAnswerBySignature.get(sig);
    if (answered) {
      // Another instance already asked this exact question — adopt its answer
      // rather than asking a model that might answer differently this time.
      setAiResult({ signature: sig, assignments: answered });
      return;
    }
    let ask = aiAskInFlight.get(sig);
    if (!ask) {
      ask = askFuelPlan(aiRequest)
        .then((assignments) => {
          // Publish even an empty answer: it marks the question as asked, so a
          // model that genuinely assigns nothing doesn't get re-asked forever.
          aiAnswerBySignature.set(sig, assignments);
          return assignments;
        })
        .finally(() => {
          aiAskInFlight.delete(sig);
        });
      aiAskInFlight.set(sig, ask);
    }
    let cancelled = false;
    ask
      .then((assignments) => {
        if (!cancelled) setAiResult({ signature: sig, assignments });
      })
      .catch(async (e) => {
        // WARN, not error: the rules picks are already on screen and stay
        // there, so this is a missed upgrade rather than a broken page — and
        // a red dev banner over a working plan misreports that. The status
        // and body are read out of the response because "FunctionsHttpError"
        // alone says nothing about which failure this was.
        console.warn("useFuelPlan: AI picks unavailable, keeping rules picks.", await describeFnError(e));
      });
    return () => {
      cancelled = true;
    };
  }, [model, viewingToday]);

  return { model, loading, error, refetch: load };
}
