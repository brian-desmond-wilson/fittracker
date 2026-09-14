import { useLocalSearchParams, useRouter } from "expo-router";
import { GymSessionsScreen } from "@/src/components/track/gym-sessions/GymSessionsScreen";

const str = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);

export default function GymSessionsPage() {
  const router = useRouter();
  // From an exercise page's "See all N sessions": scope the History list to
  // sessions holding a working set of this exercise (spec 2026-09-11 §4.2).
  // From a workout page's: scope it to completed sessions of that workout
  // served whole (spec 2026-09-13 §4.4).
  const { exerciseId, exerciseName, workoutId, workoutName } = useLocalSearchParams<{
    exerciseId?: string; exerciseName?: string; workoutId?: string; workoutName?: string;
  }>();

  // Back returns to wherever this was opened from (the Tabs navigator uses
  // history back-behaviour), so a page's See-all lands back on the page;
  // with no history at all, fall back to the Track index.
  return (
    <GymSessionsScreen
      exerciseId={str(exerciseId)}
      exerciseName={str(exerciseName)}
      workoutId={str(workoutId)}
      workoutName={str(workoutName)}
      onClose={() =>
        router.canGoBack() ? router.back() : router.replace("/(tabs)/track")
      }
    />
  );
}
