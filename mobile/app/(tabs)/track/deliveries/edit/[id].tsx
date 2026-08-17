import React, { useEffect, useState } from "react";
import { Alert, StatusBar, View, StyleSheet } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { AddDeliveryScreen } from "@/src/components/track/AddDeliveryScreen";
import { LoadingState } from "@/src/components/ui";
import {
  fetchPendingDelivery, type PendingDeliveryDraft,
} from "@/src/lib/supabase/preparedMeals";
import { formatArrival } from "@/src/lib/dates";
import { colors } from "@/src/theme/tokens";

export default function EditDeliveryPage() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  // The form takes its initial values from props, so it cannot mount until the
  // row is in hand — a form that fills itself in a moment later would fight
  // anything typed in the meantime.
  const [draft, setDraft] = useState<PendingDeliveryDraft | null>(null);

  // Pop, don't replace. A replace pushes a new screen over this one, so
  // leaving animated forwards — the page slid in from the right as though Back
  // were taking you deeper. Popping plays the same movement in reverse, which
  // is what a back control means. The replace stays as the fallback for a
  // deep link, where there is no card behind to return to.
  const leave = () =>
    router.canGoBack() ? router.back() : router.replace("/(tabs)/track/deliveries");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const row = await fetchPendingDelivery(id);
        if (cancelled) return;
        if (!row) {
          // Gone means it arrived: the Deliveries page materialises due boxes
          // on every read, so the likeliest way to get here is tapping Edit on
          // a card in the instant before that happened.
          Alert.alert(
            "This delivery already arrived",
            "Its meals are in your inventory now.",
            [{ text: "OK", onPress: leave }],
          );
          return;
        }
        setDraft(row);
      } catch (e) {
        console.error("pending delivery fetch failed:", e);
        if (cancelled) return;
        Alert.alert("Couldn't open that delivery", "Try again.", [
          { text: "OK", onPress: leave },
        ]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (!draft) {
    return (
      <>
        <StatusBar barStyle="light-content" />
        <View style={styles.container}>
          <LoadingState label="Loading delivery..." />
        </View>
      </>
    );
  }

  return (
    <AddDeliveryScreen
      editing={draft}
      onClose={leave}
      onSaved={(count, status, arrivesAt) => {
        leave();
        // Silence for the ordinary case: the card behind is the acknowledgement
        // — you land back on it and it reads out the arrival you just set.
        // A box moved into the past is the exception, because it will not be
        // there at all; the next read of this page writes it into inventory,
        // and a card disappearing with nothing said reads as a bug.
        if (status !== "due") return;
        const meals = `${count} ${count === 1 ? "meal" : "meals"}`;
        Alert.alert(
          "This delivery is due now",
          `You set it to arrive ${formatArrival(arrivesAt, new Date(), { midSentence: true })}, which has passed — so ${meals} will join your inventory the next time it's read.`,
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
});
