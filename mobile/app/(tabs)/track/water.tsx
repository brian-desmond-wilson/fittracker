import { useRouter } from "expo-router";
import { WaterScreen } from "@/src/components/track/WaterScreen";

export default function WaterPage() {
  const router = useRouter();

  return <WaterScreen onClose={() => router.back()} />;
}
