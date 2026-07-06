import { useRouter } from "expo-router";
import { MeasurementsScreen } from "@/src/components/track/MeasurementsScreen";

export default function MeasurementsPage() {
  const router = useRouter();

  // Always land on Track index — router.back() would walk linear
  // history if entered from outside the Track tab.
  return <MeasurementsScreen onClose={() => router.canGoBack() ? router.back() : router.replace("/(tabs)/track")} />;
}
