import { useRouter } from "expo-router";
import { FoodInventoryScreen } from "@/src/components/track/FoodInventoryScreen";

export default function FoodInventoryPage() {
  const router = useRouter();

  // Always land on Track index — router.back() would walk linear
  // history if entered from outside the Track tab.
  return <FoodInventoryScreen onClose={() => router.replace("/(tabs)/track")} />;
}
