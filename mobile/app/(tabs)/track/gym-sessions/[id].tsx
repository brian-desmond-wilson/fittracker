import { useRouter } from "expo-router";
import { SessionDetailScreen } from "@/src/components/track/gym-sessions/SessionDetailScreen";

export default function GymSessionDetailPage() {
  const router = useRouter();

  return (
    <SessionDetailScreen
      onClose={() =>
        router.canGoBack() ? router.back() : router.replace("/(tabs)/track/gym-sessions")
      }
    />
  );
}
