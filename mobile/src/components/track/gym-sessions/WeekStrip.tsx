// The current week as seven tappable day cards: date, volume, or 💤.
// The month grid answers "how consistent"; this answers "how was this week".
import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { colors } from "@/src/lib/colors";
import { formatVolume, sessionVolume, sessionsOn } from "@/src/lib/gymSessions";
import type { RailDay } from "@/src/lib/sessionPresentation";
import type { HistorySession } from "@/src/types/gymSessions";

export function WeekStrip({
  rail, sessions, selected, onSelect, today,
}: {
  rail: RailDay[];
  sessions: HistorySession[];
  selected: string | null;
  onSelect: (date: string) => void;
  today: string;
}) {
  return (
    <View style={styles.strip}>
      {rail.map((day) => {
        const daySessions = sessionsOn(sessions, day.date);
        const volume = daySessions.reduce((t, s) => t + sessionVolume(s), 0);
        const isSelected = day.date === selected;
        const isToday = day.date === today;
        return (
          <TouchableOpacity
            key={day.date}
            style={[
              styles.card,
              isSelected && styles.cardSelected,
              day.state === "future" && styles.cardFuture,
              isToday && !isSelected && styles.cardToday,
            ]}
            disabled={daySessions.length === 0}
            onPress={() => onSelect(day.date)}
            accessibilityRole="button"
            accessibilityLabel={`${Number(day.date.slice(8))}, ${
              day.state === "rest"
                ? "rest day"
                : daySessions.length === 0
                  ? "no training"
                  : `${daySessions.length} session${daySessions.length === 1 ? "" : "s"}`
            }`}
          >
            <Text style={styles.day}>{day.label}</Text>
            <Text style={[styles.num, isSelected && styles.numSelected]}>
              {Number(day.date.slice(8))}
            </Text>
            <Text style={styles.vol}>
              {day.state === "rest" ? "💤" : volume > 0 ? formatVolume(volume) : " "}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  strip: { flexDirection: "row", gap: 5 },
  card: {
    flex: 1, alignItems: "center", backgroundColor: colors.muted,
    borderRadius: 9, paddingVertical: 7, gap: 2,
    borderWidth: 1, borderColor: "transparent",
  },
  cardSelected: { borderColor: colors.primary },
  cardFuture: { opacity: 0.45 },
  cardToday: { borderColor: colors.border },
  day: { fontSize: 9, color: colors.mutedForeground },
  num: { fontSize: 13, fontWeight: "700", color: colors.foreground },
  numSelected: { color: colors.primary },
  vol: { fontSize: 8, color: "#86EFAC", minHeight: 10 },
});
