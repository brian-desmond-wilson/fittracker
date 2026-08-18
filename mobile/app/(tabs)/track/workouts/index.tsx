import { useRouter } from "expo-router";
import { WorkoutHistoryScreen } from "@/src/components/track/workouts/WorkoutHistoryScreen";

export default function WorkoutHistoryPage() {
  const router = useRouter();

  // Always land on Track index — router.back() would walk linear history if
  // entered from outside the Track tab.
  return (
    <WorkoutHistoryScreen
      onClose={() =>
        router.canGoBack() ? router.back() : router.replace("/(tabs)/track")
      }
    />
  );
}
