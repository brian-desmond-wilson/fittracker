import { useRouter } from "expo-router";
import { WorkoutsScreen } from "@/src/components/track/WorkoutsScreen";

export default function WorkoutsPage() {
  const router = useRouter();

  return <WorkoutsScreen onClose={() => router.back()} />;
}
