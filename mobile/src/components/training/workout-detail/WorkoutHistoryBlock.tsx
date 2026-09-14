// mobile/src/components/training/workout-detail/WorkoutHistoryBlock.tsx
// "Your history" for a workout (spec 2026-09-13 §4.4, decision 8): the
// exercise page's frame, with last done / times / first done until a
// session-end score exists to draw Best and a trend from. Never done: one
// card saying so, no toggle. Every number comes from lib/workoutHistory;
// this file only draws.
import React, { useEffect, useMemo, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { ChevronRight } from "lucide-react-native";
import { colors, spacing } from "@/src/theme/tokens";
import { historyStyles as h } from "@/src/components/training/item-detail/historyStyles";
import { formatShortDate, lastDonePhrase } from "@/src/lib/exerciseHistory";
import { summarizeWorkoutHistory, durationText } from "@/src/lib/workoutHistory";
import type { WorkoutSessionRow } from "@/src/lib/workoutHistory";
import { loadWorkoutHistoryView, saveWorkoutHistoryView } from "@/src/lib/historyViewStore";
import type { HistoryView } from "@/src/lib/historyViewStore";

interface WorkoutHistoryBlockProps {
  userId: string;
  rows: WorkoutSessionRow[];
  /** YYYY-MM-DD, sampled once by the page. */
  today: string;
  onOpenSession: (sessionId: string) => void;
  onSeeAll: () => void;
}

export function WorkoutHistoryBlock({ userId, rows, today, onOpenSession, onSeeAll }: WorkoutHistoryBlockProps) {
  const [view, setView] = useState<HistoryView>("trend");
  useEffect(() => {
    let alive = true;
    loadWorkoutHistoryView(userId).then((p) => { if (alive) setView(p.view); });
    return () => { alive = false; };
  }, [userId]);
  const pick = (v: HistoryView) => {
    setView(v);
    saveWorkoutHistoryView(userId, { view: v });
  };

  const summary = useMemo(() => summarizeWorkoutHistory(rows), [rows]);

  if (!summary) {
    return (
      <View style={h.section}>
        <View style={h.headerRow}>
          <Text style={h.sectionTitle}>Your history</Text>
        </View>
        <View style={[h.card, styles.emptyCard]}>
          <Text style={styles.emptyText}>You haven't done this one yet.</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={h.section}>
      <View style={h.headerRow}>
        <Text style={h.sectionTitle}>Your history</Text>
        <View style={h.seg} accessibilityRole="tablist">
          {(["trend", "sessions"] as HistoryView[]).map((v) => {
            const on = v === view;
            return (
              <TouchableOpacity key={v} style={[h.segItem, on && h.segItemOn]} onPress={() => pick(v)}
                accessibilityRole="tab" accessibilityState={{ selected: on }}>
                <Text style={[h.segText, on && h.segTextOn]}>{v === "trend" ? "Trend" : "Sessions"}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      <View style={h.card}>
        {view === "trend" ? (
          <>
            <View style={[h.stats, styles.statsTight]}>
              <View style={h.stat}>
                <Text style={h.statLabel}>Last done</Text>
                <Text style={h.statValue} numberOfLines={1}>{lastDonePhrase(today, summary.lastDate)}</Text>
              </View>
              <View style={h.stat}>
                <Text style={h.statLabel}>Times</Text>
                <Text style={h.statValue} numberOfLines={1}>{summary.count}</Text>
              </View>
              <View style={h.stat}>
                <Text style={h.statLabel}>First done</Text>
                <Text style={h.statValue} numberOfLines={1}>{formatShortDate(summary.firstDate, today)}</Text>
              </View>
            </View>
            <Text style={h.caption}>Score tracking is coming — for now this counts the days you did it.</Text>
          </>
        ) : (
          <View>
            {summary.rows.map((r, i) => {
              const duration = durationText(r.durationSeconds);
              const date = formatShortDate(r.sessionDate, today);
              return (
                <TouchableOpacity
                  key={`${r.sessionDate}-${r.sessionId ?? i}`}
                  style={[h.row, i > 0 && h.rowBorder]}
                  onPress={() => r.sessionId && onOpenSession(r.sessionId)}
                  disabled={!r.sessionId}
                  accessibilityRole={r.sessionId ? "button" : "text"}
                  accessibilityLabel={`${date}${duration ? `, ${duration}` : ""}`}
                >
                  <Text style={h.rowDate}>{date}</Text>
                  <Text style={h.rowName} numberOfLines={1}>{duration ? `· ${duration}` : ""}</Text>
                  {r.sessionId && <ChevronRight size={16} color={colors.textMuted} />}
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </View>

      <TouchableOpacity style={h.seeAll} onPress={onSeeAll} accessibilityRole="button">
        <Text style={h.link}>See all {summary.count} {summary.count === 1 ? "session" : "sessions"}</Text>
        <ChevronRight size={16} color={colors.brand} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  statsTight: { marginBottom: spacing.sm },
  emptyCard: { alignItems: "center", paddingVertical: spacing.xl },
  emptyText: { fontSize: 14, color: colors.textMuted },
});
