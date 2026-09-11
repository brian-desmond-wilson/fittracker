import { useLocalSearchParams, useRouter } from "expo-router";
import { GymSessionsScreen } from "@/src/components/track/gym-sessions/GymSessionsScreen";

export default function GymSessionsPage() {
  const router = useRouter();
  // From the exercise page's "See all N sessions": scope the History list to
  // sessions holding a working set of this exercise (spec 2026-09-11 §4.2).
  const { exerciseId, exerciseName } = useLocalSearchParams<{ exerciseId?: string; exerciseName?: string }>();

  // Back returns to wherever this was opened from (the Tabs navigator uses
  // history back-behaviour), so the exercise page's See-all lands back on
  // the page; with no history at all, fall back to the Track index.
  return (
    <GymSessionsScreen
      exerciseId={typeof exerciseId === "string" && exerciseId !== "" ? exerciseId : null}
      exerciseName={typeof exerciseName === "string" && exerciseName !== "" ? exerciseName : null}
      onClose={() =>
        router.canGoBack() ? router.back() : router.replace("/(tabs)/track")
      }
    />
  );
}
