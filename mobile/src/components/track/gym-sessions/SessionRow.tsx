import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { ChevronRight } from "lucide-react-native";
import { colors } from "@/src/lib/colors";
import { formatVolume, sessionPace, sessionVolume } from "@/src/lib/gymSessions";
import {
  durationLine, formatSessionDate, mainExerciseCount, regionsHit, sessionTitle,
} from "@/src/lib/sessionPresentation";
import { SOURCE_COLORS, SOURCE_LABELS } from "./groupColors";
import type { HistorySession } from "@/src/types/gymSessions";
import { MiniMuscleMap } from "./MiniMuscleMap";

const CARD_REGION_CHIPS = 3;

export function SessionRow({
  session,
  today,
  onPress,
  showDate = true,
  prCount,
}: {
  session: HistorySession;
  today: string;
  onPress: () => void;
  showDate?: boolean;
  prCount?: number;
}) {
  const title = sessionTitle(session);
  const volume = sessionVolume(session);
  const pace = sessionPace(session);
  const duration = durationLine(session);
  const regions = regionsHit(session);
  const exercises = mainExerciseCount(session);
  const source = SOURCE_COLORS[session.source] ?? SOURCE_COLORS.unknown;

  // Only what is actually known — a session with no timing shouldn't wear a
  // dash where its duration would be.
  const meta = [
    `${exercises} exercise${exercises === 1 ? "" : "s"}`,
    duration,
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
      accessibilityLabel={`${title}, ${meta}. Open the session.`}
    >
      <MiniMuscleMap regions={regions} />
      <View style={styles.body}>
        <View style={styles.head}>
          <Text style={styles.name} numberOfLines={1}>{title}</Text>
          <Text style={styles.when}>
            {showDate ? formatSessionDate(session.date, today) : clock}
          </Text>
        </View>
        <Text style={styles.meta}>{meta}</Text>
        <View style={styles.chips}>
          <View style={[styles.chip, { backgroundColor: source.bg }]}>
            <Text style={[styles.chipText, { color: source.fg }]}>
              {SOURCE_LABELS[session.source] ?? "Logged"}
            </Text>
          </View>
          {regions.slice(0, CARD_REGION_CHIPS).map((region) => (
            <View key={region} style={styles.chip}>
              <Text style={styles.chipText}>{region}</Text>
            </View>
          ))}
          {/* Modality/category chip renders here once the movement model
              supplies it — the slot is this comment. */}
          {prCount ? (
            <View style={[styles.chip, styles.prChip]}>
              <Text style={[styles.chipText, styles.prChipText]}>PR ×{prCount}</Text>
            </View>
          ) : null}
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
    flexDirection: "row", alignItems: "center", gap: 10,
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
  prChip: { backgroundColor: "#241a2e" },
  prChipText: { color: "#E879F9" },
});
