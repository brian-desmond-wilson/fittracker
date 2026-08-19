import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { ChevronRight } from "lucide-react-native";
import { colors } from "@/src/lib/colors";
import {
  formatVolume,
  GROUP_LABELS,
  sessionEmphasis,
  sessionMinutes,
  sessionPace,
  sessionVolume,
} from "@/src/lib/gymSessions";
import { GROUP_COLORS, SOURCE_COLORS, SOURCE_LABELS } from "./groupColors";
import type { HistorySession } from "@/src/types/gymSessions";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** "Sat 16" — the year is never the question when scanning a log. */
function shortDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return `${WEEKDAYS[date.getUTCDay()]} ${d}`;
}

export function SessionRow({
  session,
  onPress,
  showDate = true,
}: {
  session: HistorySession;
  onPress: () => void;
  showDate?: boolean;
}) {
  const volume = sessionVolume(session);
  const minutes = sessionMinutes(session);
  const pace = sessionPace(session);
  const emphasis = sessionEmphasis(session);
  const source = SOURCE_COLORS[session.source] ?? SOURCE_COLORS.unknown;

  // Only what is actually known — a session with no timing shouldn't wear a
  // dash where its duration would be.
  const meta = [
    `${session.exercises.length} exercise${session.exercises.length === 1 ? "" : "s"}`,
    minutes ? `${minutes} min` : null,
    volume > 0 ? `${formatVolume(volume)} lbs` : null,
    pace ? `${pace} lb/min` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const clock = session.startedAt
    ? new Date(session.startedAt).toLocaleTimeString([], {
        hour: "numeric",
        minute: "2-digit",
      })
    : null;

  return (
    <TouchableOpacity
      style={styles.row}
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={`${session.name}, ${meta}. Open the session.`}
    >
      <View style={styles.body}>
        <View style={styles.head}>
          <Text style={styles.name} numberOfLines={1}>
            {session.name}
          </Text>
          <Text style={styles.when}>{showDate ? shortDate(session.date) : clock}</Text>
        </View>
        <Text style={styles.meta}>{meta}</Text>
        <View style={styles.chips}>
          <View style={[styles.chip, { backgroundColor: source.bg }]}>
            <Text style={[styles.chipText, { color: source.fg }]}>
              {SOURCE_LABELS[session.source] ?? "Logged"}
            </Text>
          </View>
          <View style={styles.chip}>
            <View style={[styles.dot, { backgroundColor: GROUP_COLORS[emphasis] }]} />
            <Text style={styles.chipText}>{GROUP_LABELS[emphasis]}</Text>
          </View>
          {/* A workout done across two days says so, rather than looking like
              one short session. */}
          {session.sessionCount > 1 && (
            <View style={styles.chip}>
              <Text style={styles.chipText}>
                {session.sessionNumber} of {session.sessionCount} sessions
              </Text>
            </View>
          )}
        </View>
      </View>
      <ChevronRight size={18} color={colors.mutedForeground} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row", alignItems: "center", gap: 8,
    paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  body: { flex: 1 },
  head: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 8 },
  name: { flex: 1, fontSize: 15, fontWeight: "600", color: colors.foreground },
  when: { fontSize: 12, color: colors.mutedForeground },
  meta: { fontSize: 12, color: colors.mutedForeground, marginTop: 4 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 8 },
  chip: {
    flexDirection: "row", alignItems: "center", gap: 5,
    backgroundColor: colors.muted, borderRadius: 20,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  chipText: { fontSize: 11, color: colors.mutedForeground, fontWeight: "600" },
  dot: { width: 6, height: 6, borderRadius: 3 },
});
