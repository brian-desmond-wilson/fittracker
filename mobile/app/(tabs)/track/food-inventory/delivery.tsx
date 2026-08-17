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

  // After a SAVE, land on a list whatever the history says: the point of
  // arriving there is to see the box you just wrote, and back walks linear
  // history, which leads somewhere else when this screen was entered from
  // outside the stack.
  const landOnList = () =>
    router.replace(
      from === "deliveries" ? "/(tabs)/track/deliveries" : "/(tabs)/track/food-inventory",
    );

  // Backing out is the other case, and it wants a pop. A replace pushes a new
  // screen over this one, so leaving animated forwards — the page slid in from
  // the right as though Back were taking you deeper. The list is still the
  // fallback for a deep link with nothing behind it.
  const abandon = () => (router.canGoBack() ? router.back() : landOnList());

  return (
    <AddDeliveryScreen
      onClose={abandon}
      onSaved={(count, status, arrivesAt) => {
        landOnList();
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
