// mobile/src/hooks/useLoopHub.ts
// Data assembly for the Loop Hub (spec §4.2 as revised): composes shipped
// fetchers and takes the useEatNext RESULT as a parameter — LoopHubScreen runs
// both hooks; this one never duplicates useEatNext's assembly.
//
// The revision matters: the original design had this hook replicate Eat Next's
// data path, which as landed is ~80 lines of review-hardened assembly (scoring
// trio, constraints fallback, the local-midnight workout-completion query with
// its documented bug history). Replicating it is the drift risk spec §10 warns
// about, so the result arrives as an argument instead.
//
// The duplicate inventory/library reads inside `fetchShoppingData` are ACCEPTED
// deliberately (spec §4.2): single-user app, ~22 rows, and reuse of the shipped
// fetchers cannot drift from the screens that own them the way a new query
// layer could. Do not "optimize" this into a bespoke query.
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/src/lib/supabase";
import { fetchInventoryWithState } from "@/src/lib/supabase/inventory";
import { fetchMealLibrary } from "@/src/lib/supabase/mealLibrary";
import { fetchShoppingData } from "@/src/lib/supabase/shopping";
import { computeMealPace } from "@/src/lib/mealPace";
import { sumNutrition } from "@/src/lib/mealMacros";
import { computeBrianScore } from "@/src/lib/mealScore";
import { brianScoreInputFor } from "@/src/lib/mealScoreInput";
import { buildStockByMealId, type EatNextResult } from "@/src/lib/eatNext";
import { computeLoopStatus, type LoopStatus } from "@/src/lib/loopStatus";
import { getLocalDateString } from "@/src/lib/dates";

interface PaceProfileRow {
  target_calories: number | null;
  target_protein_g: number | null;
  breakfast_time: string;
  lunch_time: string;
  dinner_time: string;
  water_window_start: string;
  water_window_end: string;
}
const PACE_PROFILE_SELECT =
  "target_calories, target_protein_g, breakfast_time, lunch_time, dinner_time, water_window_start, water_window_end";

const hhmm = (t: string) => t.slice(0, 5);

/**
 * Verbatim from `useEatNext.ts:130` — see that copy for the full rationale.
 * Duplicated rather than shared because it is not exported there; the two
 * copies must stay identical, so change both or neither.
 *
 * The plan's Task 4 note (d) proposed simplifying this away on the grounds
 * that "`fetchInventoryWithState`/`fetchShoppingData` already throw real
 * `Error`s". **They do not.** Both re-throw raw PostgREST error objects
 * (`inventory.ts:48`, `shopping.ts:80` — `throw errors[0]`), as does
 * `fetchMealLibrary`, and the bare `logs.error`/`profile.error` thrown below
 * are the same kind of object. A simplified `String(e.message)` normalization
 * would drop `details`, `hint` and `code` — and for the 42703 column-name
 * class, `hint` carries PostgREST's "Perhaps you meant to reference the
 * column …", the single most actionable line. Recorded as an amendment.
 */
function toError(e: unknown): Error {
  if (e instanceof Error) return e;
  if (typeof e === "object" && e !== null && "message" in e) {
    const { message, code, details, hint } = e as {
      message?: unknown;
      code?: unknown;
      details?: unknown;
      hint?: unknown;
    };
    const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
    const parts = [
      typeof message === "string" ? message : String(message),
      str(details),
      str(hint),
    ].filter((s) => s.length > 0);
    const text = parts.join(" — ");
    return new Error(typeof code === "string" ? `${text} (${code})` : text);
  }
  return new Error(String(e));
}

export interface UseLoopHubValue {
  status: LoopStatus | null;
  /**
   * `true` only while there is NOTHING to show — i.e. the very first load.
   * Stale-while-revalidate, matching `useEatNext`: a `refetch` leaves this
   * false and keeps the previous `status` on screen until a new one
   * supersedes it, so the hub holds steady data instead of blanking on every
   * focus. No consumer can distinguish "refetching" from "idle"; add a
   * separate flag if one ever needs to rather than repurposing this one.
   */
  loading: boolean;
  error: Error | null;
  refetch: () => void;
}

export function useLoopHub(eatNext: EatNextResult | null): UseLoopHubValue {
  const [status, setStatus] = useState<LoopStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  // Stale-response guard, same contract as `useEatNext`: overlapping loads are
  // expected (screen focus during a slow reload), and without this the SLOWER
  // one would win and publish a status computed from older data.
  const runIdRef = useRef(0);
  // The engine needs the CURRENT eatNext result at compute time, including
  // recomputes triggered by a data refetch that eatNext didn't participate in.
  const eatNextRef = useRef(eatNext);
  eatNextRef.current = eatNext;

  const load = useCallback(async () => {
    const runId = ++runIdRef.current;
    const now = new Date();
    try {
      const today = getLocalDateString(now);
      const [inventory, library, shopping, logs, profile] = await Promise.all([
        fetchInventoryWithState(today),
        fetchMealLibrary(),
        fetchShoppingData(today),
        supabase.from("meal_logs").select("*").eq("date", today),
        // No .eq() filter: `profiles` is single-row for this app, same
        // reasoning as `fetchMealLibrary`'s and `useEatNext`'s reads.
        supabase.from("profiles").select(PACE_PROFILE_SELECT).maybeSingle(),
      ]);
      const errs = [logs.error, profile.error].filter((e) => e !== null);
      if (errs.length > 0) {
        errs.slice(1).forEach((e) => console.error("useLoopHub (secondary):", e));
        throw errs[0];
      }
      const p = profile.data as PaceProfileRow | null;
      if (!p) throw new Error("No profile row");
      const totals = sumNutrition(logs.data ?? []);
      const mealTimes = {
        breakfast: hhmm(p.breakfast_time), lunch: hhmm(p.lunch_time), dinner: hhmm(p.dinner_time),
      };
      const paceFor = (macro: "calories" | "protein") =>
        computeMealPace({
          currentValue: macro === "calories" ? totals.calories : totals.protein,
          goal: macro === "calories" ? p.target_calories : p.target_protein_g,
          windowStart: hhmm(p.water_window_start),
          windowEnd: hhmm(p.water_window_end),
          mealTimes, macro, now,
        });
      const next = computeLoopStatus({
        inventory: inventory.map((i) => ({ id: i.id, name: i.name, state: i.state })),
        // Library AND ranking in one array — `raw` ranks, `display` is the /100
        // UI value (spec §5.5). One `.map`, so a meal cannot appear in the
        // count without its score, or vice versa.
        meals: library.meals.map((meal) => {
          const s = computeBrianScore(
            brianScoreInputFor(meal, library.conceptIdsBySavedFoodId, library.conceptsById),
          );
          return { id: meal.id, name: meal.name, raw: s.raw, display: s.score };
        }),
        stockByMealId: buildStockByMealId(library),
        eatNext: eatNextRef.current,
        paceCalories: paceFor("calories"),
        paceProtein: paceFor("protein"),
        totals: { calories: totals.calories, protein: totals.protein },
        goals: { calories: p.target_calories, protein: p.target_protein_g },
        rates: shopping.ratesById,
        suggestions: shopping.suggestions,
        listRows: shopping.listRows,
        vendors: shopping.vendors,
      });
      if (runId !== runIdRef.current) return;
      setError(null);
      setStatus(next);
    } catch (e) {
      console.error("useLoopHub:", e);
      if (runId !== runIdRef.current) return;
      setError(toError(e));
    } finally {
      if (runId === runIdRef.current) setLoading(false);
    }
  }, []);

  // Recompute when the eatNext result lands/changes (cheap: refetches too, by
  // design — the eatNext result usually changes because data changed).
  // No loop risk: `load` is stable (`useCallback(…, [])`) and nothing here
  // writes `eatNext`, which is owned by the caller's `useEatNext`.
  useEffect(() => { load(); }, [load, eatNext]);

  return { status, loading, error, refetch: load };
}
