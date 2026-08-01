// mobile/src/components/track/loop/StationDetailSheet.tsx
// Renders a station's `StationDetail` payload VERBATIM (spec §6). There is
// deliberately zero station-specific logic here — no branching on
// `station.key`, no re-deriving, no conditional copy. Every string and every
// verdict was decided by `computeLoopStatus`, which is the tested surface; a
// special case for one station belongs there, not here.
import React, { useRef } from "react";
import { Modal, StyleSheet, Text, TouchableWithoutFeedback, View } from "react-native";
import { colors, icons, radii, spacing, tint, typography } from "@/src/theme/tokens";
import { Badge, Button } from "@/src/components/ui";
import type { StationStatus } from "@/src/lib/loopStatus";
import { STATION_ACCENTS, STATION_ICONS } from "./stations";

interface StationDetailSheetProps {
  station: StationStatus | null;   // null = hidden
  onClose: () => void;
  onOpenDestination: () => void;   // dismiss + router.push(station.destination)
}

export function StationDetailSheet({
  station, onClose, onOpenDestination,
}: StationDetailSheetProps) {
  // Keep the LAST station rendered while the native slide-out plays. `visible`
  // and the content were previously driven by the same value, so the panel
  // unmounted the instant `station` went null and the dismissal read as the
  // panel vanishing while only the scrim animated away.
  //
  // A render-phase ref write is sound HERE, unlike the one moved out of
  // `useLoopHub`'s render body: this value is consumed in the SAME render that
  // writes it, and the write is idempotent for a given `station`, so a
  // double-render cannot observe a torn value. The hook's ref was read later by
  // an async callback, which is where cross-render staleness actually bites.
  const lastRef = useRef(station);
  if (station) lastRef.current = station;
  const s = station ?? lastRef.current;
  const a = s ? colors.accents[STATION_ACCENTS[s.key]] : null;
  const Icon = s ? STATION_ICONS[s.key] : null;
  return (
    <Modal visible={station !== null} transparent animationType="slide" onRequestClose={onClose}>
      {/* Sibling scrim + sheet inside RN's Modal container, which is `flex: 1`
          with the default column direction — so the `flex: 1` scrim takes all
          space above and the intrinsic-height sheet pins to the bottom, with
          the whole area above it tappable to dismiss. */}
      <TouchableWithoutFeedback onPress={onClose} accessibilityRole="button" accessibilityLabel="Close">
        <View style={styles.scrim} />
      </TouchableWithoutFeedback>
      {s ? (
        <View style={styles.sheet}>
          <View style={styles.grabber} />
          <View style={styles.head}>
            {Icon && a ? (
              <View style={[styles.iconCircle, { backgroundColor: tint(a) }]}>
                <Icon size={18} color={a} strokeWidth={icons.strokeWidth} />
              </View>
            ) : null}
            {/* flex + minWidth:0 so a long headline wraps instead of pushing
                past the sheet edge — same reason `StationRow.textBlock` has
                them. No `numberOfLines` here: the sheet has room to wrap, and
                truncating the detail view would defeat its purpose. */}
            <View style={styles.headText}>
              <Text style={[typography.rowTitle, styles.title]}>{s.title}</Text>
              <Text style={typography.caption}>{s.headline}</Text>
            </View>
          </View>
          {/* Index-keyed: `label` alone is not unique (two inventory items may
              share a name) and neither is `label:value` (two "Milk" rows both
              reading "2d left"). The list is a static projection re-rendered
              whole, so a positional key is correct and collision-proof. */}
          {s.detail.lines.map((l, i) => (
            <View key={`${i}:${l.label}`} style={styles.statLine}>
              <Text style={[typography.body, styles.statLabel]}>{l.label}</Text>
              <Text style={[typography.body, styles.statValue]}>{l.value}</Text>
            </View>
          ))}
          {s.detail.chips.length > 0 ? (
            <View style={styles.chips}>
              {/* `tone` is a `StationTone`, a strict subset of `BadgeTone`, so
                  it assigns with NO cast — and is left uncast deliberately, as
                  in `StationRow`: a cast would suppress the one divergence
                  worth catching (a `StationTone` member `BadgeTone` lacks). */}
              {s.detail.chips.map((c, i) => (
                <Badge key={`${i}:${c.label}`} label={c.label} tone={c.tone} />
              ))}
            </View>
          ) : null}
          {s.detail.footnote ? (
            <Text style={[typography.caption, styles.footnote]}>{s.detail.footnote}</Text>
          ) : null}
          <Button label={s.destinationLabel} onPress={onOpenDestination} fluid />
        </View>
      ) : null}
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: colors.scrim },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radii.panel, borderTopRightRadius: radii.panel,
    borderWidth: 1, borderBottomWidth: 0, borderColor: colors.border,
    padding: spacing.lg, paddingBottom: spacing.xxl,
    gap: spacing.md,
  },
  grabber: { width: 36, height: 4, borderRadius: radii.pill, backgroundColor: colors.surface2, alignSelf: "center" },
  head: { flexDirection: "row", alignItems: "center", gap: spacing.sm + 2 },
  headText: { flex: 1, minWidth: 0 },
  iconCircle: { width: 34, height: 34, borderRadius: radii.pill, alignItems: "center", justifyContent: "center" },
  title: { color: colors.text },
  statLine: { flexDirection: "row", justifyContent: "space-between" },
  // RN defaults `flexShrink: 0`, so without this a long label/value pair
  // overflows the row instead of reflowing — reachable with real data, since
  // stations 1 and 5 put inventory ITEM NAMES in `detail.lines`. Shrinking the
  // label lets it WRAP (no `numberOfLines` here, matching the head block's
  // deliberate no-truncation intent); the value stays unshrunk and right-
  // aligned so the number never breaks. Same ruling as
  // `FoodInventoryScreen.expiringName` and `EatNextRow.chipName`.
  statLabel: { color: colors.textMuted, flexShrink: 1 },
  statValue: { color: colors.text, flexShrink: 0, textAlign: "right" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm - 2 },
  footnote: { marginTop: spacing.xs },
});
