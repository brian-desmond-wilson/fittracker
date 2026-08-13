// mobile/src/hooks/useNextFuelPick.ts
// The Home card's window into the Fuel plan (owner decision 2026-08-13).
//
// "Eat Next" and the Fuel rail used to be two engines answering the same
// question — and at 10:41 one said breakfast smoothie while the other said
// dinner pasta, because the recommender knows contexts but not windows. The
// card now renders THE SAME plan the rail renders: this hook returns the
// rail's first suggestion row, verbatim.
//
// It exists because `useFuelPlan` deliberately takes the day's logs as a
// parameter — the Fuel screen already owns them — and the Home card does not.
// This hook owns that one missing input and nothing else; every planning rule
// stays in `fuelPlan.ts`, and the AI tier's answer is shared module-wide (see
// useFuelPlan's signature cache), so the two surfaces cannot diverge.
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/src/lib/supabase";
import { getLocalDateString } from "@/src/lib/dates";
import { useFuelPlan } from "@/src/hooks/useFuelPlan";
import type { FuelPick, FuelRailRow, FuelWindow } from "@/src/lib/fuelPlan";
import type { MealLog } from "@/src/types/track";

export interface NextFuelSuggestion {
  window: FuelWindow;
  pick: FuelPick;
  closingSoon: boolean;
}

type SuggestionRow = Extract<FuelRailRow, { kind: "suggestion" }>;

export interface UseNextFuelPickValue {
  /** The rail's first suggestion row — null while loading, and null when the
   *  plan has nothing to suggest (day closed, goals hit, empty library). */
  suggestion: NextFuelSuggestion | null;
  loading: boolean;
  refetch: () => void;
}

export function useNextFuelPick(refreshKey?: number): UseNextFuelPickValue {
  // `null` = not yet loaded. The plan below runs against `[]` in that state,
  // but `suggestion` stays null until real logs arrive — a plan computed
  // without the day's receipts would happily re-suggest an already-eaten
  // breakfast for the flash of a load.
  const [logs, setLogs] = useState<MealLog[] | null>(null);

  const loadLogs = useCallback(async () => {
    try {
      // No user_id filter: RLS scopes meal_logs to the caller, the same
      // reasoning fetchMealLibrary's own meal_logs query records.
      const { data, error } = await supabase
        .from("meal_logs")
        .select("*")
        .eq("date", getLocalDateString())
        .order("logged_at", { ascending: true });
      if (error) throw error;
      setLogs((data ?? []) as MealLog[]);
    } catch (e) {
      // Keep whatever we had — a stale suggestion beats a vanished card, the
      // same stale-while-revalidate stance as useEatNext.
      console.error("useNextFuelPick logs:", e);
    }
  }, []);

  useEffect(() => {
    loadLogs();
  }, [loadLogs, refreshKey]);

  const plan = useFuelPlan(logs ?? [], true, refreshKey);

  const suggestion = useMemo<NextFuelSuggestion | null>(() => {
    if (logs === null || !plan.model) return null;
    const row = plan.model.rows.find(
      (r): r is SuggestionRow => r.kind === "suggestion",
    );
    return row
      ? { window: row.window, pick: row.pick, closingSoon: row.closingSoon }
      : null;
  }, [logs, plan.model]);

  const planRefetch = plan.refetch;
  const refetch = useCallback(() => {
    loadLogs();
    planRefetch();
  }, [loadLogs, planRefetch]);

  return {
    suggestion,
    loading: logs === null || plan.loading,
    refetch,
  };
}
