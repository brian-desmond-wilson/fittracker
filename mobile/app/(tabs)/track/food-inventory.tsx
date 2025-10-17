import { useRouter } from "expo-router";
import { FoodInventoryScreen } from "@/src/components/track/FoodInventoryScreen";

export default function FoodInventoryPage() {
  const router = useRouter();

  return <FoodInventoryScreen onClose={() => router.back()} />;
}
