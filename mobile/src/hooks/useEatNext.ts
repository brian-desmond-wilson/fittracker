// mobile/src/hooks/useEatNext.ts
// Single assembly point for the Eat Next engine (spec §6): every surface and
// the nudge scheduler consume this hook, so no two surfaces can disagree.
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/src/lib/supabase";
import { computeBrianScore } from "@/src/lib/mealScore";
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
  // NOTE: `eat_nudges_enabled` is deliberately ABSENT here — see the
  // `nudgesEnabled: false` comment at the recommendEatNext call below.
}

export interface UseEatNextValue {
  result: EatNextResult | null;
  loading: boolean;
  error: Error | null;
  refetch: () => void;
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
 * too, so this normalizes both sources.
 */
function toError(e: unknown): Error {
  if (e instanceof Error) return e;
  if (typeof e === "object" && e !== null && "message" in e) {
    const { message, code } = e as { message?: unknown; code?: unknown };
    const text = typeof message === "string" ? message : String(message);
    return new Error(typeof code === "string" ? `${text} (${code})` : text);
  }
  return new Error(String(e));
}

export function useEatNext(refreshKey?: number): UseEatNextValue {
  const [result, setResult] = useState<EatNextResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  // Stale-response guard. Two loads really can overlap here: Task 8's card
  // refetches on focus while Task 10's screen refetches after every meal
  // write, so a focus change during a slow reload leaves two in flight and
  // the slower one would otherwise win and publish an OLDER recommendation
  // (with the day's totals from before the write). Only the newest run may
  // touch state.
  const runIdRef = useRef(0);

  const load = useCallback(async () => {
    const runId = ++runIdRef.current;
    // ONE clock for the whole assembly. `getLocalDateString`, `nowMinutes`
    // and both `computeMealPace` calls (which default to their own
    // `new Date()`) must agree on the instant, or a load that straddles a
    // minute — or worse, local midnight — can compute pace against one
    // moment and contexts against another.
    const now = new Date();
    try {
      setError(null);
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
        supabase
          .from("profiles")
          .select(
            "target_calories, target_protein_g, target_carbs_g, target_sodium_mg, target_fats_g, target_sugars_g, target_fiber_g, breakfast_time, lunch_time, dinner_time, water_window_start, water_window_end",
          )
          .maybeSingle(),
        supabase
          .from("nutrition_constraints")
          .select("max_prep_minutes")
          .maybeSingle(),
        supabase
          .from("workout_instances")
          .select("completed_at")
          .eq("scheduled_date", today)
          .eq("status", "completed")
          // Required, not decorative: Postgres (and PostgREST) order DESC
          // as NULLS FIRST, so a legacy `status = 'completed'` row with a
          // null `completed_at` would win the limit(1) and silently disable
          // the post-workout context for the whole day. Every current write
          // path sets both together (`training.ts:611-613`,
          // `todaysWorkout.ts:250-253`, `app/workout/[id].tsx:1240-1245`),
          // so this only guards historical rows — and it costs nothing.
          .not("completed_at", "is", null)
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

      // Duplicates the `scores` memo in `MealLibraryModal` (and the single-meal
      // one in `MealBuilder`) — deliberate, per the plan's note. Re-checked
      // during execution: Phase 2 extracted NO shared helper for this
      // assembly, so there is nothing to substitute; exporting a modal's
      // internals would be worse than the third copy.
      const meals: ScoredMeal[] = library.meals.map((meal) => ({
        meal,
        totals: computeMealTotals(meal.items),
        score: computeBrianScore({
          prepMinutes: meal.prep_minutes,
          role: meal.role,
          tasteOverride: meal.taste_override,
          items: meal.items.map((it) => ({
            calories: it.savedFood.calories,
            protein: it.savedFood.protein,
            servings: it.servings,
            smallPiecesOk: it.small_pieces_ok,
            concepts: (library.conceptIdsBySavedFoodId.get(it.saved_food_id) ?? [])
              .map((id) => library.conceptsById.get(id))
              .filter((c): c is NonNullable<typeof c> => !!c)
              .map((c) => ({
                rating: c.rating,
                requiresSmallPieces: c.requires_small_pieces,
                prepIntensive: c.prep_intensive,
              })),
          })),
        }),
      }));

      let workoutCompletedAtMinutes: number | null = null;
      const completedAt = (workout.data as { completed_at: string | null } | null)
        ?.completed_at;
      if (completedAt) {
        const d = new Date(completedAt); // timestamptz → local
        // Only a SAME-LOCAL-DAY completion can be expressed as minutes since
        // local midnight, which is what the engine compares against
        // `nowMinutes`. A workout scheduled for today but finished on an
        // earlier day (the app lets you complete a future instance) would
        // otherwise contribute yesterday's clock time as if it were today's
        // and fake a post-workout window.
        if (getLocalDateString(d) === today) {
          workoutCompletedAtMinutes = d.getHours() * 60 + d.getMinutes();
        }
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
        // Hardcoded until `profiles.eat_nudges_enabled` EXISTS. The column is
        // added only by `supabase/migrations/20260729110000_recommender_profile_and_view_cleanup.sql`,
        // which is written but unapplied (Task 11 is the owner gate) — and
        // PostgREST rejects the ENTIRE select with 42703/HTTP 400 if any named
        // column is unknown, so naming it above would break this hook, and
        // every surface built on it, for the whole pre-migration window.
        // (Phase 2 hit this exact failure; see its Task 1 amendment.)
        // `false` is both the migration's default and the correct
        // pre-migration behavior — nudges are opt-in, so nothing is lost.
        // TO WIRE UP after Task 11 applies the migration: add
        // `eat_nudges_enabled` to the profiles select string above and to
        // `ProfileRow` as `boolean`, then pass `p.eat_nudges_enabled` here.
        nudgesEnabled: false,
      });
      if (runId !== runIdRef.current) return;
      setResult(next);
    } catch (e) {
      console.error("useEatNext:", e);
      if (runId !== runIdRef.current) return;
      setError(toError(e));
    } finally {
      // `setLoading(true)` is deliberately absent from this function: a
      // refetch keeps `loading` false and leaves the previous `result` in
      // place, so Task 8's card — which shows its spinner only while
      // `loading && !result` — renders slightly stale data instead of
      // flashing a spinner on every focus or meal write. Only the first load
      // shows the spinner, via the initial `useState(true)`. Intentional; do
      // not "fix" it without revisiting that card.
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

  return { result, loading, error, refetch: load };
}
