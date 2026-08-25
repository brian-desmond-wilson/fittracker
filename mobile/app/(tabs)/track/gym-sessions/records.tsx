import { useRouter } from "expo-router";
import { AllRecordsScreen } from "@/src/components/track/gym-sessions/AllRecordsScreen";

export default function GymRecordsPage() {
  const router = useRouter();

  return (
    <AllRecordsScreen
      onClose={() =>
        router.canGoBack() ? router.back() : router.replace("/(tabs)/track/gym-sessions")
      }
    />
  );
}
