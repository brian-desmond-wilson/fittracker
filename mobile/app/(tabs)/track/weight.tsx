import { useRouter } from "expo-router";
import { WeightScreen } from "@/src/components/track/WeightScreen";

export default function WeightPage() {
  const router = useRouter();

  // Always land on Track index — router.back() would walk linear
  // history if entered from outside the Track tab.
  return <WeightScreen onClose={() => router.canGoBack() ? router.back() : router.replace("/(tabs)/track")} />;
}
