import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { Droplets, Trash2 } from "lucide-react-native";
import { colors } from "@/src/lib/colors";
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
      <Text style={styles.sectionTitle}>History</Text>
      {loading ? (
        <Text style={styles.loadingText}>Loading...</Text>
      ) : sortedDates.length === 0 ? (
        <Text style={styles.emptyText}>No water logs yet. Start tracking today!</Text>
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
                  <TouchableOpacity
                    key={log.id}
                    style={styles.logCard}
                    onPress={onEdit ? () => onEdit(log) : undefined}
                    activeOpacity={onEdit ? 0.7 : 1}
                    disabled={!onEdit}
                  >
                    <View style={styles.logInfo}>
                      <Droplets size={16} color={beverageColor(type)} />
                      <Text style={styles.logAmount}>
                        {formatAmount(Number(log.amount_oz), displayUnit)}
                      </Text>
                      {type !== "water" && (
                        <View
                          style={[
                            styles.badge,
                            { backgroundColor: beverageColor(type) },
                          ]}
                        >
                          <Text style={styles.badgeText}>
                            {beverageLabel(type)}
                          </Text>
                        </View>
                      )}
                      <Text style={styles.logTime}>{formatTime(log.logged_at)}</Text>
                    </View>
                    <TouchableOpacity
                      onPress={() => onDelete(log.id)}
                      style={styles.deleteButton}
                      activeOpacity={0.7}
                    >
                      <Trash2 size={18} color={colors.mutedForeground} />
                    </TouchableOpacity>
                  </TouchableOpacity>
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
    paddingHorizontal: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: colors.foreground,
    marginBottom: 12,
  },
  loadingText: {
    fontSize: 16,
    color: colors.mutedForeground,
    textAlign: "center",
    paddingVertical: 24,
  },
  emptyText: {
    fontSize: 16,
    color: colors.mutedForeground,
    textAlign: "center",
    paddingVertical: 24,
  },
  dayGroup: {
    marginBottom: 20,
  },
  dayHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  dayDate: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.foreground,
  },
  dayTotal: {
    fontSize: 16,
    fontWeight: "600",
    color: "#3B82F6",
  },
  logCard: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  logInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
  },
  logAmount: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.foreground,
  },
  badge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    marginLeft: 4,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#FFFFFF",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  logTime: {
    fontSize: 14,
    color: colors.mutedForeground,
    marginLeft: "auto",
  },
  deleteButton: {
    padding: 4,
  },
});
