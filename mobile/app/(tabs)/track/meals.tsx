import { useRouter } from "expo-router";
import { MealsScreen } from "@/src/components/track/MealsScreen";

export default function MealsPage() {
  const router = useRouter();

  // Always land on Track index — router.back() would walk linear
  // history if entered from outside the Track tab.
  return <MealsScreen onClose={() => router.replace("/(tabs)/track")} />;
}
