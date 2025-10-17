import { useRouter } from "expo-router";
import { WeightScreen } from "@/src/components/track/WeightScreen";

export default function WeightPage() {
  const router = useRouter();

  return <WeightScreen onClose={() => router.back()} />;
}
