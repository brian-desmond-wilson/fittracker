// Reads and writes for the weekly-goal history.
import { supabase } from "../supabase";
import type { WeeklyGoal, WeeklyGoalDraft } from "../../types/goals";

const SELECT = "id, effective_from, sessions_target, volume_target_lbs, region_target";

const toGoal = (row: any): WeeklyGoal => ({
  id: row.id,
  effectiveFrom: row.effective_from,
  sessionsTarget: Number(row.sessions_target),
  volumeTargetLbs: row.volume_target_lbs === null ? null : Number(row.volume_target_lbs),
  regionTarget: row.region_target === null ? null : Number(row.region_target),
});

export async function fetchGoalHistory(userId: string): Promise<WeeklyGoal[]> {
  const { data, error } = await supabase
    .from("weekly_goals")
    .select(SELECT)
    .eq("user_id", userId)
    .order("effective_from", { ascending: false });
  if (error) {
    console.error("fetchGoalHistory failed:", error.message);
    return [];
  }
  return (data ?? []).map(toGoal);
}

/**
 * Save a goal effective from the given week's Sunday. Upsert on
 * (user_id, effective_from) so editing twice in one week corrects that week
 * rather than stacking rows.
 */
export async function saveWeeklyGoal(
  userId: string,
  weekStart: string,
  draft: WeeklyGoalDraft,
): Promise<boolean> {
  const { error } = await supabase.from("weekly_goals").upsert(
    {
      user_id: userId,
      effective_from: weekStart,
      sessions_target: draft.sessionsTarget,
      volume_target_lbs: draft.volumeTargetLbs,
      region_target: draft.regionTarget,
    },
    { onConflict: "user_id,effective_from" },
  );
  if (error) {
    console.error("saveWeeklyGoal failed:", error.message);
    return false;
  }
  return true;
}
