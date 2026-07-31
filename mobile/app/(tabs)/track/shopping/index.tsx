import { router } from "expo-router";
import { ShoppingListScreen } from "@/src/components/track/ShoppingListScreen";

export default function ShoppingRoute() {
  return (
    <ShoppingListScreen
      onClose={() => (router.canGoBack() ? router.back() : router.replace("/(tabs)/track"))}
    />
  );
}
