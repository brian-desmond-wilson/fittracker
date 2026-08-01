import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import {
  ChevronLeft,
  ChevronRight,
  Calendar as CalendarIcon,
} from "lucide-react-native";
import { colors, icons, radii, spacing, tint, typography } from "@/src/theme/tokens";
import { Card } from "@/src/components/ui";

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
    <Card variant="panel" style={styles.card}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => onNavigateWeek(-1)}
          style={styles.navButton}
          activeOpacity={0.7}
        >
          <ChevronLeft size={icons.md} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerText}>{weekRangeLabel}</Text>
        <TouchableOpacity
          onPress={() => onNavigateWeek(1)}
          style={styles.navButton}
          activeOpacity={0.7}
        >
          <ChevronRight size={icons.md} color={colors.text} />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={onOpenDatePicker}
          style={styles.navButton}
          activeOpacity={0.7}
        >
          <CalendarIcon size={icons.md} color={colors.text} />
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
    </Card>
  );
}

const styles = StyleSheet.create({
  // Placement only — `Card variant="panel"` owns surface, radius and padding.
  card: {
    marginHorizontal: spacing.screenGutter,
    marginBottom: spacing.xxl,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingBottom: spacing.md,
  },
  headerText: {
    flex: 1,
    ...typography.buttonSm,
    color: colors.text,
    textAlign: "center",
  },
  navButton: {
    padding: spacing.sm,
  },
  // Equal cells separated by a `gap`, replacing a 1pt per-cell margin.
  row: {
    flexDirection: "row",
    gap: spacing.xs,
  },
  cell: {
    flex: 1,
    alignItems: "center",
    paddingVertical: spacing.sm,
    borderRadius: radii.control,
  },
  // A day-strip fill — one of the three sanctioned surviving blues.
  cellSelected: {
    backgroundColor: tint(colors.accents.water),
  },
  dayInitial: {
    ...typography.caption,
    marginBottom: spacing.xs,
  },
  dayNumber: {
    ...typography.body,
    color: colors.text,
    fontWeight: "500",
  },
  dayNumberToday: {
    color: colors.accents.water,
    fontWeight: "700",
  },
  dayNumberSelected: {
    fontWeight: "700",
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: radii.pill,
    marginTop: spacing.sm,
  },
});
