// mobile/src/components/track/loop/LoopHubScreen.tsx
// The Nutrition Loop Hub: the six-station food loop as one vertical pipeline.
// READ-ONLY by design — every string on this screen was decided by
// `computeLoopStatus` (the tested surface) and arrives through `useLoopHub`.
// This component owns navigation, refresh and sheet visibility, nothing else.
import React, { useCallback, useRef, useState } from "react";
import { RefreshControl } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { colors } from "@/src/theme/tokens";
import { EmptyState, LoadingState, Screen } from "@/src/components/ui";
import { useEatNext } from "@/src/hooks/useEatNext";
import { useLoopHub } from "@/src/hooks/useLoopHub";
import type { StationStatus } from "@/src/lib/loopStatus";
import { Connector } from "./Connector";
import { StationRow } from "./StationRow";
import { StationDetailSheet } from "./StationDetailSheet";

export function LoopHubScreen({ onBack }: { onBack: () => void }) {
  const router = useRouter();
  const eatNext = useEatNext();
  const hub = useLoopHub(eatNext.result);
  const [openStation, setOpenStation] = useState<StationStatus | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // BOTH refetches, always — never `eatNext.refetch()` alone.
  //
  // The tempting version calls only `eatNext.refetch()` and lets the cascade
  // drive the hub (`useLoopHub`'s effect depends on the eatNext result), saving
  // a double fetch. It is WRONG, and wrong exactly when Retry matters:
  // `useEatNext` is stale-while-revalidate, so a FAILED refetch leaves `result`
  // at the same object identity — the hub's effect never fires and the hub
  // never retries. The user would press Retry on a broken screen and nothing
  // would happen. The extra fetch is the price of a Retry that works.
  const refetchBoth = useCallback(() => {
    eatNext.refetch();
    hub.refetch();
  }, [eatNext.refetch, hub.refetch]);

  // House focus-refresh pattern (EatNextHomeCard refinement): skip the
  // mount-time focus so the hooks' own mount effects aren't doubled.
  const firstFocus = useRef(true);
  useFocusEffect(
    useCallback(() => {
      if (firstFocus.current) {
        firstFocus.current = false;
        return;
      }
      refetchBoth();
    }, [refetchBoth]),
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    refetchBoth();
    // The hooks are stale-while-revalidate and expose no in-flight signal
    // (documented on UseEatNextValue.loading) — a short fixed spinner
    // acknowledges the gesture without inventing state the hooks don't have.
    setTimeout(() => setRefreshing(false), 800);
  }, [refetchBoth]);

  const openDestination = useCallback(
    (station: StationStatus) => {
      setOpenStation(null);
      router.push(station.destination);
    },
    [router],
  );

  const firstLoading = (hub.loading || eatNext.loading) && hub.status === null;
  const failed = !firstLoading && hub.status === null && (hub.error ?? eatNext.error);

  return (
    <Screen
      variant="detail"
      title="Nutrition Loop"
      onBack={onBack}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={colors.brand}
          // Android reads `colors`, not `tintColor` — both are set for the
          // same reason `Connector` sets an Android font fallback.
          colors={[colors.brand]}
        />
      }
    >
      {/* `LoadingState` / `EmptyState` are full-bleed (flex: 1 + opaque bg) and
          are direct children of `Screen`'s scroll body here — its sanctioned
          container. Do not wrap either in a Card. */}
      {firstLoading ? (
        <LoadingState />
      ) : failed ? (
        <EmptyState
          title="Couldn't load the loop"
          body={failed.message}
          action={{ label: "Retry", onPress: refetchBoth }}
        />
      ) : hub.status ? (
        <>
          {/* EVERY station renders a trailing `Connector` — all six. Station
              6's label ("purchased → restock ↺ inventory") is the loop
              CLOSING back to station 1, not an off-by-one to trim. */}
          {hub.status.stations.map((station) => (
            <React.Fragment key={station.key}>
              <StationRow
                station={station}
                onPressBody={() => setOpenStation(station)}
                onPressChevron={() => router.push(station.destination)}
              />
              <Connector label={station.connector} />
            </React.Fragment>
          ))}
          <StationDetailSheet
            station={openStation}
            onClose={() => setOpenStation(null)}
            onOpenDestination={() => openStation && openDestination(openStation)}
          />
        </>
      ) : null}
    </Screen>
  );
}
