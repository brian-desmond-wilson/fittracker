import { useRouter } from "expo-router";
import { MealsScreen } from "@/src/components/track/MealsScreen";

export default function MealsPage() {
  const router = useRouter();

  return <MealsScreen onClose={() => router.back()} />;
}
