import { useRouter } from "expo-router";
import { ProgressPhotosScreen } from "@/src/components/track/ProgressPhotosScreen";

export default function ProgressPhotosPage() {
  const router = useRouter();

  // Always land on Track index — router.back() would walk linear
  // history if entered from outside the Track tab.
  return <ProgressPhotosScreen onClose={() => router.replace("/(tabs)/track")} />;
}
