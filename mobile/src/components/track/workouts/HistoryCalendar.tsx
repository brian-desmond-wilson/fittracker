// A month of training at a glance. Dots take the session's muscle emphasis, so
// a captured workout and a WOD read the same way a recommended day does — the
// grid describes what you worked, not which plan it belonged to.
import React, { useMemo, useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { ChevronLeft, ChevronRight } from "lucide-react-native";
import { colors } from "@/src/lib/colors";
import { emphasisByDate, GROUP_LABELS } from "@/src/lib/workoutHistory";
import { GROUP_COLORS } from "./groupColors";
import type { HistorySession, MuscleGroup } from "@/src/types/workoutHistory";

const DAY_INITIALS = ["S", "M", "T", "W", "T", "F", "S"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const iso = (year: number, month: number, day: number): string =>
  `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

/** Leading blanks so the 1st lands under its weekday, then the month's days. */
function monthCells(year: number, month: number): (number | null)[] {
  const firstWeekday = new Date(Date.UTC(year, month, 1)).getUTCDay();
  const days = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: days }, (_, i) => i + 1),
  ];
}

export function HistoryCalendar({
  sessions,
  today,
  selected,
  onSelect,
}: {
  sessions: HistorySession[];
  today: string;
  selected: string | null;
  onSelect: (date: string) => void;
}) {
  const [y, m] = today.split("-").map(Number);
  const [cursor, setCursor] = useState({ year: y, month: m - 1 });
  const emphasis = useMemo(() => emphasisByDate(sessions), [sessions]);
  const countByDate = useMemo(() => {
    const counts = new Map<string, number>();
    for (const s of sessions) counts.set(s.date, (counts.get(s.date) ?? 0) + 1);
    return counts;
  }, [sessions]);

  const cells = monthCells(cursor.year, cursor.month);
  const step = (by: -1 | 1) =>
    setCursor(({ year, month }) => {
      const next = month + by;
      if (next < 0) return { year: year - 1, month: 11 };
      if (next > 11) return { year: year + 1, month: 0 };
      return { year, month: next };
    });

  // Only the groups actually on screen this month — a legend listing colours
  // you cannot see is noise.
  const shown = new Set<MuscleGroup>();
  for (const day of cells) {
    if (day === null) continue;
    const group = emphasis.get(iso(cursor.year, cursor.month, day));
    if (group) shown.add(group);
  }

  return (
    <View>
      <View style={styles.monthRow}>
        <TouchableOpacity
          onPress={() => step(-1)}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Previous month"
        >
          <ChevronLeft size={20} color={colors.mutedForeground} />
        </TouchableOpacity>
        <Text style={styles.monthLabel}>
          {MONTHS[cursor.month]} {cursor.year}
        </Text>
        <TouchableOpacity
          onPress={() => step(1)}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Next month"
        >
          <ChevronRight size={20} color={colors.mutedForeground} />
        </TouchableOpacity>
      </View>

      <View style={styles.week}>
        {DAY_INITIALS.map((d, i) => (
          <Text key={`${d}-${i}`} style={styles.weekday}>
            {d}
          </Text>
        ))}
      </View>

      <View style={styles.grid}>
        {cells.map((day, i) => {
          if (day === null) return <View key={`blank-${i}`} style={styles.cell} />;
          const date = iso(cursor.year, cursor.month, day);
          const group = emphasis.get(date);
          const isToday = date === today;
          const isSelected = date === selected;
          const count = countByDate.get(date) ?? 0;
          return (
            <TouchableOpacity
              key={date}
              style={[
                styles.cell,
                isSelected && styles.cellSelected,
                !isSelected && isToday && styles.cellToday,
              ]}
              onPress={() => onSelect(date)}
              disabled={count === 0}
              accessibilityRole="button"
              accessibilityLabel={
                count === 0
                  ? `${day}, no training`
                  : `${day}, ${count} session${count === 1 ? "" : "s"}, ${
                      GROUP_LABELS[group ?? "untagged"]
                    }`
              }
            >
              <Text
                style={[
                  styles.dayText,
                  count === 0 && styles.dayTextEmpty,
                  isSelected && styles.dayTextSelected,
                ]}
              >
                {day}
              </Text>
              <View style={styles.dots}>
                {group &&
                  Array.from({ length: Math.min(count, 3) }, (_, n) => (
                    <View
                      key={n}
                      style={[
                        styles.dot,
                        {
                          backgroundColor: isSelected
                            ? "#052E16"
                            : GROUP_COLORS[group],
                        },
                      ]}
                    />
                  ))}
              </View>
            </TouchableOpacity>
          );
        })}
      </View>

      {shown.size > 0 && (
        <View style={styles.legend}>
          {(["push", "pull", "lower", "full", "untagged"] as MuscleGroup[])
            .filter((g) => shown.has(g))
            .map((g) => (
              <View key={g} style={styles.legendItem}>
                <View style={[styles.dot, { backgroundColor: GROUP_COLORS[g] }]} />
                <Text style={styles.legendText}>{GROUP_LABELS[g]}</Text>
              </View>
            ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  monthRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    marginBottom: 10,
  },
  monthLabel: { fontSize: 15, fontWeight: "600", color: colors.foreground },
  week: { flexDirection: "row", marginBottom: 4 },
  weekday: {
    flex: 1, textAlign: "center", fontSize: 11, color: colors.mutedForeground,
  },
  grid: { flexDirection: "row", flexWrap: "wrap" },
  cell: {
    width: `${100 / 7}%`, alignItems: "center", paddingVertical: 6,
    borderRadius: 10,
  },
  cellSelected: { backgroundColor: colors.primary },
  cellToday: { borderWidth: 1, borderColor: colors.border },
  dayText: { fontSize: 13, color: colors.foreground },
  dayTextEmpty: { color: colors.mutedForeground, opacity: 0.45 },
  dayTextSelected: { color: "#052E16", fontWeight: "700" },
  dots: { flexDirection: "row", gap: 2, height: 8, marginTop: 3 },
  dot: { width: 5, height: 5, borderRadius: 3 },
  legend: {
    flexDirection: "row", flexWrap: "wrap", gap: 12, marginTop: 12,
    paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.border,
  },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 5 },
  legendText: { fontSize: 11, color: colors.mutedForeground },
});
