import { useRouter } from "expo-router";
import { WorkoutsScreen } from "@/src/components/track/WorkoutsScreen";

export default function WorkoutsPage() {
  const router = useRouter();

  // Always land on Track index — router.back() would walk linear
  // history if entered from outside the Track tab.
  return <WorkoutsScreen onClose={() => router.replace("/(tabs)/track")} />;
}
