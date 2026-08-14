import React from "react";
import { Alert } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { AddDeliveryScreen } from "@/src/components/track/AddDeliveryScreen";
import { formatArrival } from "@/src/lib/dates";

export default function AddDeliveryPage() {
  const router = useRouter();
  // Which door this was opened through. Two lead here now — the inventory add
  // sheet and the Deliveries page — and each expects to be behind the form when
  // it closes.
  const { from } = useLocalSearchParams<{ from?: string }>();

  // Always land on a list rather than router.back(): the same reason the add
  // route does it — back walks linear history, which is wrong when this screen
  // was entered from somewhere outside this stack.
  const leave = () =>
    router.replace(
      from === "deliveries" ? "/(tabs)/track/deliveries" : "/(tabs)/track/food-inventory",
    );

  return (
    <AddDeliveryScreen
      onClose={leave}
      onSaved={(count, status, arrivesAt) => {
        leave();
        // After the navigation, so the confirmation lands over the list the
        // new meals are now in rather than over the form that wrote them.
        const meals = `${count} ${count === 1 ? "meal" : "meals"}`;
        if (status === "scheduled") {
          Alert.alert(
            "Delivery scheduled",
            `${meals} arriving ${formatArrival(arrivesAt, new Date(), { midSentence: true })}. They join your inventory then — nothing is in it yet.`,
          );
          return;
        }
        Alert.alert(
          "Delivery saved",
          `${meals} ${count === 1 ? "is" : "are"} in your inventory and ready to log.`,
        );
      }}
    />
  );
}
