// mobile/src/components/track/loop/StationDetailSheet.tsx
// Renders a station's `StationDetail` payload VERBATIM (spec §6). There is
// deliberately zero station-specific logic here — no branching on
// `station.key`, no re-deriving, no conditional copy. Every string and every
// verdict was decided by `computeLoopStatus`, which is the tested surface; a
// special case for one station belongs there, not here.
import React from "react";
import { Modal, StyleSheet, Text, TouchableWithoutFeedback, View } from "react-native";
import type { LucideIcon } from "lucide-react-native";
import { colors, icons, radii, spacing, tint, typography, type AccentKey } from "@/src/theme/tokens";
import { Badge, Button } from "@/src/components/ui";
import type { StationStatus } from "@/src/lib/loopStatus";

interface StationDetailSheetProps {
  station: StationStatus | null;   // null = hidden
  icon: LucideIcon | null;
  accent: AccentKey;
  onClose: () => void;
  onOpenDestination: () => void;   // dismiss + router.push(station.destination)
}

export function StationDetailSheet({
  station, icon: Icon, accent, onClose, onOpenDestination,
}: StationDetailSheetProps) {
  const a = colors.accents[accent];
  return (
    <Modal visible={station !== null} transparent animationType="slide" onRequestClose={onClose}>
      {/* Sibling scrim + sheet inside RN's Modal container, which is `flex: 1`
          with the default column direction — so the `flex: 1` scrim takes all
          space above and the intrinsic-height sheet pins to the bottom, with
          the whole area above it tappable to dismiss. */}
      <TouchableWithoutFeedback onPress={onClose} accessibilityRole="button" accessibilityLabel="Close">
        <View style={styles.scrim} />
      </TouchableWithoutFeedback>
      {station ? (
        <View style={styles.sheet}>
          <View style={styles.grabber} />
          <View style={styles.head}>
            {Icon ? (
              <View style={[styles.iconCircle, { backgroundColor: tint(a) }]}>
                <Icon size={18} color={a} strokeWidth={icons.strokeWidth} />
              </View>
            ) : null}
            {/* flex + minWidth:0 so a long headline wraps instead of pushing
                past the sheet edge — same reason `StationRow.textBlock` has
                them. No `numberOfLines` here: the sheet has room to wrap, and
                truncating the detail view would defeat its purpose. */}
            <View style={styles.headText}>
              <Text style={[typography.rowTitle, styles.title]}>{station.title}</Text>
              <Text style={typography.caption}>{station.headline}</Text>
            </View>
          </View>
          {/* Index-keyed: `label` alone is not unique (two inventory items may
              share a name) and neither is `label:value` (two "Milk" rows both
              reading "2d left"). The list is a static projection re-rendered
              whole, so a positional key is correct and collision-proof. */}
          {station.detail.lines.map((l, i) => (
            <View key={`${i}:${l.label}`} style={styles.statLine}>
              <Text style={[typography.body, styles.statLabel]}>{l.label}</Text>
              <Text style={[typography.body, styles.statValue]}>{l.value}</Text>
            </View>
          ))}
          {station.detail.chips.length > 0 ? (
            <View style={styles.chips}>
              {/* `tone` is a `StationTone`, a strict subset of `BadgeTone`, so
                  it assigns with NO cast — and is left uncast deliberately, as
                  in `StationRow`: a cast would suppress the one divergence
                  worth catching (a `StationTone` member `BadgeTone` lacks). */}
              {station.detail.chips.map((c, i) => (
                <Badge key={`${i}:${c.label}`} label={c.label} tone={c.tone} />
              ))}
            </View>
          ) : null}
          {station.detail.footnote ? (
            <Text style={[typography.caption, styles.footnote]}>{station.detail.footnote}</Text>
          ) : null}
          <Button label={station.destinationLabel} onPress={onOpenDestination} fluid />
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
  statLabel: { color: colors.textMuted },
  statValue: { color: colors.text },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm - 2 },
  footnote: { marginTop: spacing.xs },
});
