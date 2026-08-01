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
        <LoadingState />
      ) : sortedDates.length === 0 ? (
        <EmptyState
          icon={Droplets}
          title="No water logs yet"
          body="Start tracking today!"
        />
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
