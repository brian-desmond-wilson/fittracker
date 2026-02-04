import { useRouter } from "expo-router";
import { ProgressPhotosScreen } from "@/src/components/track/ProgressPhotosScreen";

export default function ProgressPhotosPage() {
  const router = useRouter();

  return <ProgressPhotosScreen onClose={() => router.back()} />;
}
