// mobile/src/components/track/loop/StationRow.tsx
// One station of the loop pipeline. TWO touch targets by design (spec §3
// decision 2): the row body opens the detail sheet, the chevron deep-links
// straight to the owning screen. Do not collapse them — the whole point is
// that a glance-and-drill user and a go-there-now user each get one tap.
import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { ChevronRight } from "lucide-react-native";
import { colors, icons, radii, spacing, tint, typography } from "@/src/theme/tokens";
import { Badge, Card } from "@/src/components/ui";
import type { StationStatus } from "@/src/lib/loopStatus";
import { STATION_ACCENTS, STATION_ICONS } from "./stations";

interface StationRowProps {
  station: StationStatus;
  onPressBody: () => void;     // opens the detail sheet
  onPressChevron: () => void;  // deep-links to station.destination
}

export function StationRow({ station, onPressBody, onPressChevron }: StationRowProps) {
  const accent = colors.accents[STATION_ACCENTS[station.key]];
  const Icon = STATION_ICONS[station.key];
  return (
    <Card variant="row" onPress={onPressBody}>
      <View style={styles.line}>
        <View style={[styles.iconCircle, { backgroundColor: tint(accent) }]}>
          <Icon size={18} color={accent} strokeWidth={icons.strokeWidth} />
        </View>
        <View style={styles.textBlock}>
          <Text style={[typography.rowTitle, styles.title]} numberOfLines={1}>{station.title}</Text>
          <Text style={[typography.caption, styles.sub]} numberOfLines={1}>{station.headline}</Text>
        </View>
        {/* `station.badge.tone` is a `StationTone`, which is a strict subset of
            `BadgeTone` — so it is assignable with NO cast. Deliberately left
            uncast: a cast here would silently swallow the day someone adds a
            `StationTone` member that `BadgeTone` lacks, which is the one thing
            worth catching about this seam. The subset exists so the engine can
            avoid a `lib → components` import; don't "fix" it in the engine. */}
        {station.badge ? (
          <Badge label={station.badge.label} tone={station.badge.tone} />
        ) : null}
        {/* POINTER-ONLY SHORTCUT, stated plainly. `Card` renders a
            `TouchableOpacity`, which is `accessible` by default and therefore
            GROUPS its subtree on iOS — so this chevron is NOT an independently
            focusable VoiceOver target, and the label below folds into the row's
            single announcement instead of exposing a second action. The
            screen-reader path to the same destination is: row body → sheet →
            the sheet's CTA, which carries this same `destinationLabel`.
            Deliberately NOT "fixed" with `accessible={false}` on the Card —
            that would expose the chevron but strip the row body's own button
            semantics. This is the app's only pressable `Card` with a nested
            touchable; if a second appears, solve it in the primitive. */}
        <TouchableOpacity
          onPress={onPressChevron}
          // hitSlop brings the ~20pt glyph up to the ≥44pt target the two-target
          // design requires without widening the visual chevron.
          hitSlop={{ top: 14, bottom: 14, left: 10, right: 14 }}
          accessibilityRole="button"
          accessibilityLabel={station.destinationLabel}
        >
          <ChevronRight size={icons.md} color={colors.textFaint} strokeWidth={icons.strokeWidth} />
        </TouchableOpacity>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  line: { flexDirection: "row", alignItems: "center", gap: spacing.sm + 2 },
  iconCircle: { width: 34, height: 34, borderRadius: radii.pill, alignItems: "center", justifyContent: "center" },
  textBlock: { flex: 1, minWidth: 0 },
  title: { color: colors.text },
  sub: { marginTop: 1 },
});
