import { useRouter } from "expo-router";
import { LoopHubScreen } from "@/src/components/track/loop/LoopHubScreen";

export default function LoopRoute() {
  const router = useRouter();

  // Always land on Track index — a bare router.back() walks the linear
  // history, so entering from outside the Track tab would go back there and
  // leave this tab's nested stack at [index, loop], surfacing the wrong screen
  // on re-entry. Same guard as every sibling Track route.
  return <LoopHubScreen onBack={() => (router.canGoBack() ? router.back() : router.replace("/(tabs)/track"))} />;
}
