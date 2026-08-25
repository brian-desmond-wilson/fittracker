// The page's headline: goal ring, streak, this week as seven pills, and the
// week's numbers. Collapses to one row when the list needs the screen.
import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import Svg, { Circle } from "react-native-svg";
import { Flame } from "lucide-react-native";
import { colors } from "@/src/lib/colors";
import { formatMinutes, formatVolume } from "@/src/lib/gymSessions";
import type { RailDay } from "@/src/lib/sessionPresentation";
import type { WeekSummary } from "@/src/types/gymSessions";

function GoalRing({ done, target, size }: { done: number; target: number; size: number }) {
  const stroke = size / 9;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const progress = target > 0 ? Math.min(done / target, 1) : 0;
  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <Svg width={size} height={size}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={colors.muted} strokeWidth={stroke} fill="none" />
        <Circle
          cx={size / 2} cy={size / 2} r={r}
          stroke={colors.primary} strokeWidth={stroke} fill="none"
          strokeDasharray={c} strokeDashoffset={c * (1 - progress)}
          strokeLinecap="round" transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      <Text style={[styles.ringText, { fontSize: size / 4.4 }]} accessibilityLabel={`${done} of ${target} sessions`}>
        {done}/{target}
      </Text>
    </View>
  );
}

export function HeroHeader({
  goalDone, goalTarget, streakDays, weeksInARow, rail, week, collapsed, onExpand,
}: {
  goalDone: number;
  goalTarget: number;
  streakDays: number;
  weeksInARow: number;
  rail: RailDay[];
  week: WeekSummary;
  collapsed: boolean;
  onExpand?: () => void;
}) {
  if (collapsed) {
    const streakPart =
      streakDays > 0 ? `🔥 ${streakDays}${weeksInARow > 1 ? ` · ${weeksInARow}w` : ""}` : "";
    const volumePart = week.volumeLbs > 0 ? `${formatVolume(week.volumeLbs)} lbs this week` : "";
    const compactText =
      streakPart && volumePart
        ? `${streakPart} · ${volumePart}`
        : streakPart || volumePart || "This week";
    return (
      <TouchableOpacity
        style={styles.compact}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel="Expand weekly summary"
        onPress={onExpand}
      >
        <GoalRing done={goalDone} target={goalTarget} size={34} />
        <Text style={styles.compactText}>{compactText}</Text>
      </TouchableOpacity>
    );
  }
  const toGo = Math.max(goalTarget - goalDone, 0);
  return (
    <View style={styles.hero}>
      <View style={styles.heroTop}>
        <GoalRing done={goalDone} target={goalTarget} size={52} />
        <View style={styles.heroLines}>
          <Text style={styles.heroTitle}>
            {toGo === 0 ? "Weekly goal met" : `Weekly goal · ${toGo} to go`}
          </Text>
          {streakDays > 0 && (
            <View style={styles.streak}>
              <Flame size={11} color="#86EFAC" />
              <Text style={styles.streakText}>
                {streakDays}-day streak{weeksInARow > 1 ? ` · ${weeksInARow} weeks in a row` : ""}
              </Text>
            </View>
          )}
        </View>
      </View>
      <View style={styles.rail}>
        {rail.map((day) => (
          <View
            key={day.date}
            style={[
              styles.pill,
              day.state === "trained" && styles.pillTrained,
              day.state === "future" && styles.pillFuture,
            ]}
            accessible={true}
            accessibilityLabel={`${day.date}, ${day.state === "rest" ? "rest day" : day.state === "trained" ? "trained" : day.state === "future" ? "upcoming" : "no training"}`}
          >
            <Text style={[styles.pillText, day.state === "trained" && styles.pillTextTrained]}>
              {day.state === "rest" ? "💤" : day.label}
            </Text>
          </View>
        ))}
      </View>
      <View style={styles.tiles}>
        <View style={styles.tile}>
          <Text style={styles.tileLabel}>SESSIONS</Text>
          <Text style={styles.tileValue}>{week.sessions}</Text>
        </View>
        <View style={styles.tile}>
          <Text style={styles.tileLabel}>VOLUME</Text>
          <Text style={styles.tileValue}>{formatVolume(week.volumeLbs)}</Text>
        </View>
        <View style={styles.tile}>
          <Text style={styles.tileLabel}>TIME</Text>
          <Text style={styles.tileValue}>{formatMinutes(week.minutes)}</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: {
    backgroundColor: colors.muted, borderRadius: 14, padding: 12, marginBottom: 12,
  },
  heroTop: { flexDirection: "row", alignItems: "center", gap: 12 },
  heroLines: { flex: 1, gap: 4 },
  heroTitle: { fontSize: 14, fontWeight: "700", color: colors.foreground },
  ringText: { position: "absolute", color: colors.foreground, fontWeight: "700" },
  streak: {
    flexDirection: "row", alignItems: "center", gap: 4, alignSelf: "flex-start",
    backgroundColor: "#14532D", borderRadius: 20, paddingHorizontal: 9, paddingVertical: 3,
  },
  streakText: { fontSize: 11, color: "#86EFAC", fontWeight: "600" },
  rail: { flexDirection: "row", gap: 4, marginTop: 10 },
  pill: {
    flex: 1, alignItems: "center", paddingVertical: 5,
    backgroundColor: colors.background, borderRadius: 7,
  },
  pillTrained: { backgroundColor: "#14532D" },
  pillFuture: { opacity: 0.45 },
  pillText: { fontSize: 10, color: colors.mutedForeground, fontWeight: "600" },
  pillTextTrained: { color: "#86EFAC" },
  tiles: { flexDirection: "row", gap: 8, marginTop: 10 },
  tile: { flex: 1, backgroundColor: colors.background, borderRadius: 10, padding: 10 },
  tileLabel: { fontSize: 10, color: colors.mutedForeground, letterSpacing: 0.5 },
  tileValue: { fontSize: 17, fontWeight: "700", color: colors.foreground, marginTop: 3 },
  compact: {
    flexDirection: "row", alignItems: "center", gap: 10,
    backgroundColor: colors.muted, borderRadius: 12,
    paddingHorizontal: 10, paddingVertical: 6, marginBottom: 12,
  },
  compactText: { fontSize: 12, color: colors.foreground, fontWeight: "600" },
});
