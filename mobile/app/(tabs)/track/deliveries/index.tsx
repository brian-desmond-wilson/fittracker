import React from "react";
import { router } from "expo-router";
import { DeliveriesScreen } from "@/src/components/track/DeliveriesScreen";

export default function DeliveriesRoute() {
  return (
    <DeliveriesScreen
      onClose={() => (router.canGoBack() ? router.back() : router.replace("/(tabs)/track"))}
      // The one New Delivery form, told where it was opened from so it comes
      // back here rather than landing on the inventory grid.
      onNewDelivery={() =>
        router.push("/(tabs)/track/food-inventory/delivery?from=deliveries")}
      onEditDelivery={(id) => router.push(`/(tabs)/track/deliveries/edit/${id}`)}
    />
  );
}
