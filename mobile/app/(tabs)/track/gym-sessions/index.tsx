import { useRouter } from "expo-router";
import { GymSessionsScreen } from "@/src/components/track/gym-sessions/GymSessionsScreen";

export default function GymSessionsPage() {
  const router = useRouter();

  // Always land on Track index — router.back() would walk linear history if
  // entered from outside the Track tab.
  return (
    <GymSessionsScreen
      onClose={() =>
        router.canGoBack() ? router.back() : router.replace("/(tabs)/track")
      }
    />
  );
}
