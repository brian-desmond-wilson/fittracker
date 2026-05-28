import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import {
  ChevronLeft,
  ChevronRight,
  Calendar as CalendarIcon,
} from "lucide-react-native";
import { colors } from "@/src/lib/colors";

const DAY_INITIALS = ["S", "M", "T", "W", "T", "F", "S"];

interface WaterDayStripProps {
  weekDates: { date: Date; key: string }[];
  weekRangeLabel: string;
  selectedDate: string;
  todayString: string;
  onNavigateWeek: (delta: number) => void;
  onSelectDate: (key: string) => void;
  onOpenDatePicker: () => void;
  dotColorFor: (key: string) => string;
}

export function WaterDayStrip({
  weekDates,
  weekRangeLabel,
  selectedDate,
  todayString,
  onNavigateWeek,
  onSelectDate,
  onOpenDatePicker,
  dotColorFor,
}: WaterDayStripProps) {
  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => onNavigateWeek(-1)}
          style={styles.navButton}
          activeOpacity={0.7}
        >
          <ChevronLeft size={20} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={styles.headerText}>{weekRangeLabel}</Text>
        <TouchableOpacity
          onPress={() => onNavigateWeek(1)}
          style={styles.navButton}
          activeOpacity={0.7}
        >
          <ChevronRight size={20} color={colors.foreground} />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={onOpenDatePicker}
          style={styles.navButton}
          activeOpacity={0.7}
        >
          <CalendarIcon size={18} color={colors.foreground} />
        </TouchableOpacity>
      </View>
      <View style={styles.row}>
        {weekDates.map(({ date, key }, i) => {
          const isSelected = key === selectedDate;
          const isToday = key === todayString;
          return (
            <TouchableOpacity
              key={key}
              onPress={() => onSelectDate(key)}
              style={[styles.cell, isSelected && styles.cellSelected]}
              activeOpacity={0.7}
            >
              <Text style={styles.dayInitial}>{DAY_INITIALS[i]}</Text>
              <Text
                style={[
                  styles.dayNumber,
                  isToday && styles.dayNumberToday,
                  isSelected && styles.dayNumberSelected,
                ]}
              >
                {date.getDate()}
              </Text>
              <View style={[styles.dot, { backgroundColor: dotColorFor(key) }]} />
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 20,
    marginBottom: 24,
    padding: 12,
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingBottom: 10,
  },
  headerText: {
    flex: 1,
    fontSize: 14,
    fontWeight: "600",
    color: colors.foreground,
    textAlign: "center",
  },
  navButton: {
    padding: 6,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  cell: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 8,
    borderRadius: 8,
    marginHorizontal: 1,
  },
  cellSelected: {
    backgroundColor: "rgba(59, 130, 246, 0.18)",
  },
  dayInitial: {
    fontSize: 11,
    color: colors.mutedForeground,
    marginBottom: 4,
  },
  dayNumber: {
    fontSize: 15,
    color: colors.foreground,
    fontWeight: "500",
  },
  dayNumberToday: {
    color: "#3B82F6",
    fontWeight: "700",
  },
  dayNumberSelected: {
    fontWeight: "700",
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginTop: 6,
  },
});
