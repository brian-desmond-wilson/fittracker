import { useRouter } from "expo-router";
import { MeasurementsScreen } from "@/src/components/track/MeasurementsScreen";

export default function MeasurementsPage() {
  const router = useRouter();

  return <MeasurementsScreen onClose={() => router.back()} />;
}
