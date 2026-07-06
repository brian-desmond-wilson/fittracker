import { useRouter } from "expo-router";
import { WaterScreen } from "@/src/components/track/WaterScreen";

export default function WaterPage() {
  const router = useRouter();

  // Always land on Track index. router.back() walks the linear history
  // (so coming from Home would go back to Home and leave the Track
  // tab's nested stack at [index, water], which causes the wrong screen
  // when re-entering the Track tab).
  return <WaterScreen onClose={() => router.canGoBack() ? router.back() : router.replace("/(tabs)/track")} />;
}
