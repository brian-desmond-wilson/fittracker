import { useLocalSearchParams, useRouter } from "expo-router";
import { CapturedFromScreen } from "@/src/components/training/item-detail/CapturedFromScreen";

export default function ExerciseSourcesPage() {
  const router = useRouter();
  const { id, tab } = useLocalSearchParams<{ id: string; tab?: string }>();
  return (
    <CapturedFromScreen
      exerciseId={id}
      initialTab={tab === "creators" ? "creators" : "posts"}
      onClose={() => (router.canGoBack() ? router.back() : router.replace("/(tabs)/training" as never))}
    />
  );
}
