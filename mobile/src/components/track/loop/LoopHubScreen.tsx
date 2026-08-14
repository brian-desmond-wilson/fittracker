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
import { useNextFuelPick } from "@/src/hooks/useNextFuelPick";
import type { StationKey, StationStatus } from "@/src/lib/loopStatus";
import { Connector } from "./Connector";
import { StationRow } from "./StationRow";
import { StationDetailSheet } from "./StationDetailSheet";

export function LoopHubScreen({ onBack }: { onBack: () => void }) {
  const router = useRouter();
  const eatNext = useEatNext();
  // The plan's answer for station 3, from the same hook the Home card uses —
  // so the loop, Home and Fuel all name one meal. It falls back to `eatNext`
  // whenever the plan has nothing to say.
  const fuel = useNextFuelPick();
  const hub = useLoopHub(
    eatNext.result,
    fuel.suggestion
      ? {
          name: fuel.suggestion.pick.name,
          calories: fuel.suggestion.pick.calories,
          protein: fuel.suggestion.pick.protein,
          prepMinutes: fuel.suggestion.pick.prepMinutes,
          score: fuel.suggestion.pick.score,
          assemblable: fuel.suggestion.pick.assemblable,
          reasons: fuel.suggestion.pick.reasons,
          windowLabel: fuel.suggestion.window.label,
          closingSoon: fuel.suggestion.closingSoon,
        }
      : null,
  );
  // The open station is DERIVED from `hub.status`, not snapshotted into state.
  // Holding a `StationStatus` here would go stale in one reachable window: the
  // rows render as soon as the FIRST hub load lands, while `eatNext` is still
  // loading, so tapping station 3 in those seconds would capture the payload
  // computed with `eatNext: null` (headline "—"). The row behind would update
  // when Eat Next resolved; the open sheet would not, until closed and
  // reopened. Keying by `StationKey` and re-finding makes that impossible.
  // `hub.status` is never set back to null once populated, so this cannot
  // flicker, and the sheet's own `lastRef` still covers the dismissal slide.
  const [openKey, setOpenKey] = useState<StationKey | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const openStation = hub.status?.stations.find((s) => s.key === openKey) ?? null;

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
    fuel.refetch();
    hub.refetch();
  }, [eatNext.refetch, fuel.refetch, hub.refetch]);

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
      setOpenKey(null);
      router.push(station.destination);
    },
    [router],
  );

  const firstLoading = (hub.loading || eatNext.loading) && hub.status === null;
  // BOTH conditions are required, and each rules out a different bug.
  //
  // `error !== null` alone would blank a screen that already has good data the
  // moment a REFRESH fails — precisely what stale-while-revalidate (spec §8)
  // exists to prevent, and the hooks keep the previous `result` on a failed
  // refetch exactly so the user keeps seeing it. `result === null` alone is not
  // an error at all: it is also the cold-start state.
  //
  // Together they mean "Eat Next has failed and has NOTHING to fall back on".
  const eatNextDead = eatNext.error !== null && eatNext.result === null;
  // An Eat Next failure is a LOOP failure. Gating only on `hub.status === null`
  // would render it as a quiet station 3 ("—", no badge) on an otherwise
  // healthy six-station screen — no error, no Retry. Reachable, not
  // theoretical: `useEatNext` reads `nutrition_constraints` and
  // `workout_instances` (useEatNext.ts:195-224), two tables `useLoopHub` never
  // touches. Spec §6 is all-or-nothing: no per-station degradation.
  const stationsShowable = hub.status !== null && !eatNextDead;
  // The DECISION and the PAYLOAD are separate on purpose. Folding them into one
  // `false | null | Error` would silently depend on a cross-hook invariant
  // nothing enforces — that whenever the stations aren't showable, some error
  // is non-null. It holds today; the day it doesn't, the old form evaluated to
  // `null`, fell through to the trailing `: null`, and rendered a BLANK screen
  // with no Retry — the same bug class as above by another route. With a total
  // fallback message below, no path can render nothing.
  const failure = hub.error ?? eatNext.error;
  const failed = !firstLoading && !stationsShowable;

  // STYLE GUIDE RULE 25 — these two states get their own NON-scrolling Screen.
  // `EmptyState`/`LoadingState` are `flex: 1` (`flexBasis: 0`), so they never
  // size to their own content; in an auto-height parent they collapse onto
  // their `spacing.xxxl` padding and spill. `Screen`'s SCROLL body is exactly
  // such a parent — `scrollContent` (Screen.tsx:117) has no `flexGrow: 1` — so
  // rendering them there is the trap rule 25 names. `scroll={false}` renders
  // `styles.scroll` (`flex: 1`) instead, which is rule 25's third bullet: a
  // `flex: 1` ancestor supplying a definite height directly. Same shape as
  // `ShoppingListScreen`. Losing pull-to-refresh here is fine — the error state
  // carries an explicit Retry. Do NOT move these back under the scroller.
  if (firstLoading || failed) {
    return (
      <Screen variant="detail" title="Nutrition Loop" onBack={onBack} scroll={false}>
        {firstLoading ? (
          <LoadingState />
        ) : (
          <EmptyState
            title="Couldn't load the loop"
            body={failure?.message ?? "Something went wrong."}
            action={{ label: "Retry", onPress: refetchBoth }}
          />
        )}
      </Screen>
    );
  }

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
      {hub.status ? (
        <>
          {/* EVERY station renders a trailing `Connector` — all six. Station
              6's label ("purchased → restock ↺ inventory") is the loop
              CLOSING back to station 1, not an off-by-one to trim. */}
          {hub.status.stations.map((station) => (
            <React.Fragment key={station.key}>
              <StationRow
                station={station}
                onPressBody={() => setOpenKey(station.key)}
                onPressChevron={() => router.push(station.destination)}
              />
              <Connector label={station.connector} />
            </React.Fragment>
          ))}
          <StationDetailSheet
            station={openStation}
            onClose={() => setOpenKey(null)}
            onOpenDestination={() => openStation && openDestination(openStation)}
          />
        </>
      ) : null}
    </Screen>
  );
}
