// mobile/src/hooks/useEatNext.ts
// Single assembly point for the Eat Next engine (spec §6): every surface and
// the nudge scheduler consume this hook, so no two surfaces can disagree.
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/src/lib/supabase";
import { computeBrianScore } from "@/src/lib/mealScore";
import { brianScoreInputFor } from "@/src/lib/mealScoreInput";
import { computeMealPace, type MealPaceState } from "@/src/lib/mealPace";
import { sumNutrition, type MacroGoals } from "@/src/lib/mealMacros";
import {
  recommendEatNext,
  type EatNextResult,
  type ScoredMeal,
} from "@/src/lib/eatNext";
import {
  computeMealTotals,
  fetchMealLibrary,
} from "@/src/lib/supabase/mealLibrary";
import { getLocalDateString } from "@/src/components/track/meals/mealsHelpers";

/** Mirrors `nutrition_constraints.max_prep_minutes`'s own schema default
 *  (`20260728100000_nutrition_preference_schema.sql:54`), so a missing
 *  constraints row behaves exactly like an untouched one. The column is
 *  `not null`, so this fallback fires only when the ROW is absent. */
const DEFAULT_MAX_PREP_MINUTES = 5;

interface ProfileRow {
  target_calories: number | null;
  target_protein_g: number | null;
  target_carbs_g: number | null;
  target_sodium_mg: number | null;
  target_fats_g: number | null;
  target_sugars_g: number | null;
  target_fiber_g: number | null;
  // All five time columns are `TIME NOT NULL DEFAULT …` — never null.
  breakfast_time: string;
  lunch_time: string;
  dinner_time: string;
  water_window_start: string;
  water_window_end: string;
  eat_nudges_enabled: boolean;
}

/**
 * The profiles select list, derived from `ProfileRow` rather than written out
 * beside it. `satisfies Record<keyof ProfileRow, true>` is checked BOTH ways —
 * a field added to `ProfileRow` and not here fails to compile ("property is
 * missing"), and a key here that is not on `ProfileRow` fails as an excess
 * property. Since this client is untyped (`createClient` with no `Database`
 * generic), select-string-vs-interface drift is the one column-name error
 * class `tsc` CAN catch, and it is exactly the mistake Task 11 Step 4 invites:
 * add `eat_nudges_enabled` to one of the two and forget the other. Now that
 * edit is a single change that cannot be half-done.
 */
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
  eat_nudges_enabled: true,
} satisfies Record<keyof ProfileRow, true>;

const PROFILE_SELECT = Object.keys(PROFILE_COLUMNS).join(", ");

export interface UseEatNextValue {
  result: EatNextResult | null;
  /**
   * `true` only while there is NOTHING to show — i.e. the very first load.
   * This hook is stale-while-revalidate: a `refetch` leaves `loading` false
   * and keeps the previous `result` (and previous `error`) on screen until a
   * new one supersedes it, so surfaces hold steady data instead of blanking
   * or flashing a spinner on every screen focus and every meal write.
   * Consequence, stated honestly: no consumer can currently distinguish
   * "refetching" from "idle". Add a separate flag if one ever needs to —
   * do not repurpose this one.
   */
  loading: boolean;
  error: Error | null;
  refetch: () => void;
  /**
   * The single clock (`load`'s local `now`) this `result` was computed
   * against — `null` before the first successful load. Stale-while-revalidate
   * like `result`: it updates only alongside a successful `setResult`, so the
   * two are always a matched pair (an in-flight refetch or a failed one never
   * makes `computedAt` describe a different `result` than the one on screen).
   *
   * Pass this as `eatNudgeService.ts`'s `syncEatNudge(decision, sourceDay)`
   * — its required `sourceDay` argument is exactly this value; see that
   * function's doc comment for why it must be this and not `new Date()`.
   * Treat it as read-only: it's the literal `Date` object held in this
   * hook's state, so mutating it in place (e.g. `.setHours(...)`) would
   * corrupt state as a side effect of what looks like a read.
   */
  computedAt: Date | null;
}

const hhmm = (t: string) => t.slice(0, 5); // "HH:MM:SS" → "HH:MM"
const toMinutes = (t: string) => {
  const [h, m] = t.split(":").map((s) => parseInt(s, 10));
  return h * 60 + (m || 0);
};

/**
 * PostgREST hands its errors back as PLAIN OBJECTS, not `Error` instances:
 * `PostgrestError` (which does extend `Error`) is constructed only on the
 * `.throwOnError()` path — @supabase/postgrest-js 2.75.0,
 * `PostgrestBuilder.js:154` — and this client does not use it. So the usual
 * `e instanceof Error ? e : new Error(String(e))` collapses a real
 * `{code: "42703", message: 'column "…" does not exist'}` into
 * `Error("[object Object]")`, which is exactly the detail a surface's error
 * state needs to show. `fetchMealLibrary` re-throws raw PostgREST objects
 * too (`mealLibrary.ts:62,134,234`), so this normalizes both sources.
 *
 * `details` and `hint` are folded in, not just `message` + `code`: for the
 * 42703 class this whole hook guards against, `hint` carries PostgREST's
 * "Perhaps you meant to reference the column …", which is the single most
 * actionable line. Note the audience today is the console and any future
 * consumer that reads `error.message` — Task 8's card renders a fixed string
 * and never reads it, so this is not currently surfaced on screen.
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

export function useEatNext(refreshKey?: number): UseEatNextValue {
  const [result, setResult] = useState<EatNextResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [computedAt, setComputedAt] = useState<Date | null>(null);
  // Stale-response guard. Overlapping loads are expected by design here: per
  // the plan (Tasks 8 and 10 — not yet written, so this is the plan's stated
  // intent rather than verified code), the Home card refetches on focus and
  // the Meals screen refetches after every meal write. A focus change during
  // a slow reload then leaves two in flight, and the slower one would win and
  // publish an OLDER recommendation — computed from the day's totals from
  // before the write. Only the newest run may touch state.
  const runIdRef = useRef(0);

  const load = useCallback(async () => {
    const runId = ++runIdRef.current;
    // ONE clock for the whole assembly. `getLocalDateString`, `nowMinutes`
    // and both `computeMealPace` calls (which default to their own
    // `new Date()`) must agree on the instant, or a load that straddles a
    // minute — or worse, local midnight — can compute pace against one
    // moment and contexts against another.
    const now = new Date();
    // Today's LOCAL bounds as absolute instants, for the `completed_at`
    // (`timestamptz`) range below. Built from local midnight, never UTC
    // midnight: comparing a timestamptz against UTC bounds slides the window
    // by the machine's offset, which for the user's timezone would count part
    // of yesterday evening as today. `setDate(+1)` (rather than +24h) also
    // keeps the upper bound at local midnight across a DST change.
    const startOfDay = new Date(now);
    startOfDay.setHours(0, 0, 0, 0);
    const startOfNextDay = new Date(startOfDay);
    startOfNextDay.setDate(startOfNextDay.getDate() + 1);
    try {
      const today = getLocalDateString(now);
      const [library, logs, profile, constraints, workout] = await Promise.all([
        fetchMealLibrary(),
        supabase.from("meal_logs").select("*").eq("date", today),
        // No .eq() filter on either single-row table: `profiles` is keyed by
        // `id` with an `auth.uid() = id` select policy, and
        // `nutrition_constraints` is `unique (user_id)` with an
        // `auth.uid() = user_id` select policy, so RLS already narrows each
        // to exactly the caller's row — maybeSingle() cannot see a second
        // one. Same reasoning as `fetchMealLibrary`'s profiles read.
        supabase.from("profiles").select(PROFILE_SELECT).maybeSingle(),
        supabase
          .from("nutrition_constraints")
          .select("max_prep_minutes")
          .maybeSingle(),
        // "Completed today" means `completed_at` inside today's local range —
        // NOT `scheduled_date = today`, which spec §6 originally specified.
        // Ruled by the coordinator during execution as a defective expression
        // of spec §2's "workouts completed today", because the two come apart
        // on a reachable path: "Save Progress" leaves a row `in_progress` /
        // `partial` with a null `completed_at` (`app/workout/[id].tsx:1179-1185`),
        // `getTodaysWorkout` resumes the latest incomplete instance with no
        // constraint that its `scheduled_date` is today
        // (`todaysWorkout.ts:65-95`), and finishing it stamps `completed_at =
        // now` on a row still dated yesterday (`app/workout/[id].tsx:1240-1245`)
        // — which a `scheduled_date` filter misses, silently disabling the
        // post_workout context minutes after a real workout.
        // The range also subsumes two guards this query used to need: a
        // `completed_at` outside today can no longer be returned at all (so no
        // same-local-day check is needed downstream), and NULL fails a range
        // predicate, so DESC's NULLS-FIRST ordering can no longer float a
        // null-`completed_at` row to the top of `limit(1)`.
        supabase
          .from("workout_instances")
          .select("completed_at")
          .eq("status", "completed")
          .gte("completed_at", startOfDay.toISOString())
          .lt("completed_at", startOfNextDay.toISOString())
          .order("completed_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);
      const errs = [logs.error, profile.error, constraints.error, workout.error]
        .filter((e) => e !== null);
      if (errs.length > 0) {
        // Secondary failures only: `errs[0]` is thrown and logged by the
        // catch below. (House pattern from `fetchMealLibrary`, with its one
        // gap closed — logging `slice(1)` and throwing `errs[0]` left the
        // single error that actually reached the UI as the only one never
        // printed.)
        errs.slice(1).forEach((e) => console.error("useEatNext (secondary):", e));
        throw errs[0];
      }
      const p = profile.data as ProfileRow | null;
      if (!p) throw new Error("No profile row");

      const dayTotals = sumNutrition(logs.data ?? []);
      const goals: MacroGoals = {
        calories: p.target_calories,
        protein: p.target_protein_g,
        carbs: p.target_carbs_g,
        sodium_mg: p.target_sodium_mg,
        fats: p.target_fats_g,
        sugars: p.target_sugars_g,
        fiber_g: p.target_fiber_g,
      };
      const mealTimes = {
        breakfast: hhmm(p.breakfast_time),
        lunch: hhmm(p.lunch_time),
        dinner: hhmm(p.dinner_time),
      };
      const windowStart = hhmm(p.water_window_start);
      const windowEnd = hhmm(p.water_window_end);

      const paceFor = (macro: "calories" | "protein"): MealPaceState =>
        computeMealPace({
          currentValue: macro === "calories" ? dayTotals.calories : dayTotals.protein,
          goal: macro === "calories" ? goals.calories : goals.protein,
          windowStart,
          windowEnd,
          mealTimes,
          macro,
          now, // share this assembly's clock instead of sampling a new one
        });

      // The score input assembly lives in `mealScoreInput.ts` (pure, tested).
      // `MealLibraryModal` and `MealBuilder` still carry their own copies —
      // migrating those two Phase 2 components is a recorded follow-up, out of
      // scope for this task.
      const meals: ScoredMeal[] = library.meals.map((meal) => ({
        meal,
        totals: computeMealTotals(meal.items),
        score: computeBrianScore(
          brianScoreInputFor(
            meal,
            library.conceptIdsBySavedFoodId,
            library.conceptsById,
          ),
        ),
      }));

      // Minutes since LOCAL midnight, the coordinate system the engine
      // compares against `nowMinutes`. Safe without a day check because the
      // query above can only return a completion inside today's local range.
      let workoutCompletedAtMinutes: number | null = null;
      const completedAt = (workout.data as { completed_at: string | null } | null)
        ?.completed_at;
      if (completedAt) {
        const d = new Date(completedAt); // timestamptz → local
        workoutCompletedAtMinutes = d.getHours() * 60 + d.getMinutes();
      }

      const next = recommendEatNext({
        nowMinutes: now.getHours() * 60 + now.getMinutes(),
        windowStartMinutes: toMinutes(windowStart),
        windowEndMinutes: toMinutes(windowEnd),
        mealTimesMinutes: {
          breakfast: toMinutes(mealTimes.breakfast),
          lunch: toMinutes(mealTimes.lunch),
          dinner: toMinutes(mealTimes.dinner),
        },
        dayTotals,
        goals,
        caloriePace: paceFor("calories"),
        proteinPace: paceFor("protein"),
        meals,
        maxPrepMinutes:
          (constraints.data as { max_prep_minutes: number } | null)
            ?.max_prep_minutes ?? DEFAULT_MAX_PREP_MINUTES,
        workoutCompletedAtMinutes,
        nudgesEnabled: p.eat_nudges_enabled,
      });
      if (runId !== runIdRef.current) return;
      // Clearing the error HERE, not at the top of `load`: `loading` stays
      // false on a refetch, so clearing it up front published
      // `{loading: false, result: null, error: null}` for the whole retry
      // request — a state every surface reads as "nothing to render", making
      // the card vanish mid-retry (and the card is where the retry control
      // lives). Same stale-while-revalidate rule already applied to `result`:
      // the old error stands until a result or a fresh error supersedes it.
      setError(null);
      setResult(next);
      setComputedAt(now);
    } catch (e) {
      console.error("useEatNext:", e);
      if (runId !== runIdRef.current) return;
      setError(toError(e));
    } finally {
      // No `setLoading(true)` anywhere in `load` — see the `loading` doc
      // comment on UseEatNextValue for the contract that depends on it.
      if (runId === runIdRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    // `refreshKey` is a dep of the EFFECT but is not read by `load`, so
    // exhaustive-deps flags it as unnecessary — that is what the disable
    // below suppresses. Bumping the key is the consumers' way of forcing a
    // reload, so the dep is the whole point. (The alternative — moving
    // `refreshKey` into `load`'s own dep array — would churn `refetch`'s
    // identity for every consumer that puts it in a dep array, to remove one
    // comment. No eslint is configured in this project today; the directive
    // is kept as documentation and for whenever one is.)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load, refreshKey]);

  return { result, loading, error, refetch: load, computedAt };
}
