import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Droplets, Trash2 } from "lucide-react-native";
import { colors, icons, radii, spacing, tint, typography } from "@/src/theme/tokens";
import {
  Card,
  EmptyState,
  IconButton,
  LoadingState,
  SectionHeader,
} from "@/src/components/ui";
import { WaterLog } from "@/src/types/track";
import {
  WaterUnit,
  formatVolume,
  formatAmount,
  BeverageType,
  beverageLabel,
  beverageColor,
} from "@/src/lib/waterUnits";

interface WaterHistoryListProps {
  loading: boolean;
  sortedDates: string[];
  groupedLogs: Record<string, WaterLog[]>;
  displayUnit: WaterUnit;
  formatHistoryDate: (dateStr: string) => string;
  formatTime: (timestamp: string) => string;
  onDelete: (id: string) => void;
  onEdit?: (log: WaterLog) => void;
}

export function WaterHistoryList({
  loading,
  sortedDates,
  groupedLogs,
  displayUnit,
  formatHistoryDate,
  formatTime,
  onDelete,
  onEdit,
}: WaterHistoryListProps) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <SectionHeader title="History" />
      </View>
      {loading ? (
        <View style={styles.stateBox}>
          <LoadingState />
        </View>
      ) : sortedDates.length === 0 ? (
        <View style={styles.stateBox}>
          <EmptyState
            icon={Droplets}
            title="No water logs yet"
            body="Start tracking today!"
          />
        </View>
      ) : (
        sortedDates.map((date) => {
          const dayLogs = groupedLogs[date];
          const dayTotal = dayLogs.reduce(
            (sum, log) => sum + parseFloat(log.amount_oz.toString()),
            0
          );
          const dayTotalDisplay = formatVolume(dayTotal, displayUnit);
          return (
            <View key={date} style={styles.dayGroup}>
              <View style={styles.dayHeader}>
                <Text style={styles.dayDate}>{formatHistoryDate(date)}</Text>
                <Text style={styles.dayTotal}>{dayTotalDisplay}</Text>
              </View>
              {dayLogs.map((log) => {
                const type = (log.beverage_type || "water") as BeverageType;
                return (
                  <Card
                    key={log.id}
                    variant="row"
                    style={styles.logCard}
                    onPress={onEdit ? () => onEdit(log) : undefined}
                  >
                    <View style={styles.logInfo}>
                      <Droplets size={icons.sm} color={beverageColor(type)} />
                      <Text style={styles.logAmount}>
                        {formatAmount(Number(log.amount_oz), displayUnit)}
                      </Text>
                      {type !== "water" && (
                        <View
                          style={[
                            styles.badge,
                            { backgroundColor: tint(beverageColor(type)) },
                          ]}
                        >
                          <Text
                            style={[
                              styles.badgeText,
                              { color: beverageColor(type) },
                            ]}
                          >
                            {beverageLabel(type)}
                          </Text>
                        </View>
                      )}
                      <Text style={styles.logTime}>{formatTime(log.logged_at)}</Text>
                    </View>
                    <IconButton
                      icon={Trash2}
                      variant="circle"
                      tone="danger"
                      onPress={() => onDelete(log.id)}
                      accessibilityLabel="Delete water log"
                    />
                  </Card>
                );
              })}
            </View>
          );
        })
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    paddingHorizontal: spacing.screenGutter,
  },
  // `SectionHeader` takes no style prop; the wrapper owns its spacing.
  sectionHeader: {
    marginBottom: spacing.md,
  },
  /**
   * `EmptyState`/`LoadingState` are `flex: 1`, i.e. `flexBasis: 0`, so they
   * need a parent with a DEFINITE main size or they resolve to zero content
   * height and collapse onto their own 2×`spacing.xxxl` padding, spilling
   * their icon and copy out of the box.
   *
   * The usual fix — `flexGrow: 1` down the chain to the scroller (Task 5's
   * `gridContainer`, Task 8's two-level chain) — provably cannot work here.
   * That fix works by giving the scroll content container a definite height of
   * at least the viewport, creating free space for the flex child to claim.
   * This history list is the LAST block on a screen whose five cards above it
   * (ring ~300, quick-add ~110, day strip ~110, insights ~250, custom-log
   * ~150, plus the title) already total ~1000pt — more than any phone
   * viewport — so the content container never has free space to distribute
   * and a `flexGrow` chain would be inert at every level.
   *
   * A `minHeight` is the lever that does work: Yoga's `CalculateLayout.cpp`
   * (STEP 5) takes `availableInnerMainDim = minInnerMainDim` whenever a
   * min-dimension is defined and exceeds the line's consumed size, and — this
   * is the load-bearing part — leaves `sizeBasedOnContent` false, so
   * `remainingFreeSpace` becomes positive and the `flexGrow: 1` child fills
   * the box. Without it the `else` branch sets `sizeBasedOnContent = true`
   * and the child keeps its zero basis.
   *
   * The value is the taller of the two primitives' intrinsic content:
   * 2×`spacing.xxxl` padding + a 40pt icon + 2×`spacing.md` gaps + a
   * `rowTitle` line + a `body` line ≈ 166pt, with slack for a wrapped title.
   */
  stateBox: {
    minHeight: 192,
  },
  dayGroup: {
    marginBottom: spacing.xl,
  },
  /**
   * A per-day sub-header, NOT a `SectionHeader`: "History" above it already
   * owns `typography.section`, and nesting the same 13/700 uppercase style
   * inside itself would flatten the hierarchy it exists to create.
   */
  dayHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.md,
  },
  dayDate: {
    ...typography.rowTitle,
    color: colors.textMuted,
  },
  // The stat-cell value token.
  dayTotal: {
    ...typography.rowTitle,
    fontWeight: "700",
    color: colors.text,
  },
  // Placement only — `Card variant="row"` owns surface, radius, padding, border.
  logCard: {
    marginBottom: spacing.sm,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  logInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    flex: 1,
  },
  logAmount: {
    ...typography.rowTitle,
    color: colors.text,
  },
  /**
   * The `Badge` recipe (tinted fill + full-strength label) applied by hand:
   * `Badge`'s tone set has no per-beverage slot, the same reason Task 8 left
   * `MealsDayList`'s meal-type badge bespoke.
   */
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: radii.pill,
    marginLeft: spacing.xs,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: "600",
  },
  logTime: {
    ...typography.body,
    color: colors.textMuted,
    marginLeft: "auto",
  },
});
