import { useRouter } from "expo-router";
import { SessionDetailScreen } from "@/src/components/track/workouts/SessionDetailScreen";

export default function WorkoutSessionPage() {
  const router = useRouter();

  return (
    <SessionDetailScreen
      onClose={() =>
        router.canGoBack() ? router.back() : router.replace("/(tabs)/track/workouts")
      }
    />
  );
}
