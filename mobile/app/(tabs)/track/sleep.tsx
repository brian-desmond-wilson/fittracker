import { useRouter } from "expo-router";
import { SleepScreen } from "@/src/components/track/SleepScreen";

export default function SleepPage() {
  const router = useRouter();

  return <SleepScreen onClose={() => router.back()} />;
}
