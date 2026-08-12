import React from "react";
import { Alert } from "react-native";
import { useRouter } from "expo-router";
import { AddDeliveryScreen } from "@/src/components/track/AddDeliveryScreen";

export default function AddDeliveryPage() {
  const router = useRouter();

  // Always land on the inventory list rather than router.back(): the same
  // reason the add route does it — back walks linear history, which is wrong
  // when this screen was entered from somewhere outside this stack.
  const leave = () => router.replace("/(tabs)/track/food-inventory");

  return (
    <AddDeliveryScreen
      onClose={leave}
      onSaved={(count) => {
        leave();
        // After the navigation, so the confirmation lands over the list the
        // new meals are now in rather than over the form that wrote them.
        Alert.alert(
          "Delivery saved",
          `${count} ${count === 1 ? "meal is" : "meals are"} in your inventory and ready to log.`,
        );
      }}
    />
  );
}
