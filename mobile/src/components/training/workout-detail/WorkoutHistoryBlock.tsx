// mobile/src/components/training/workout-detail/WorkoutHistoryBlock.tsx
// "Your history" for a workout (spec 2026-09-13 session-score §4.4): the
// exercise page's frame with the workout's scores — Best in the score's own
// units, the eight-session bars (taller is better; time and capped invert),
// the direction caption, PR badges, and a row that adds or edits a score.
// Every number comes from lib/workoutHistory and lib/workoutScore; this
// file only draws.
import React, { useEffect, useMemo, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { ChevronRight, TrendingUp, TrendingDown, Minus } from "lucide-react-native";
import { colors, spacing } from "@/src/theme/tokens";
import { historyStyles as h, BAR_MAX_HEIGHT } from "@/src/components/training/item-detail/historyStyles";
import { formatShortDate, lastDonePhrase, TREND_LABELS } from "@/src/lib/exerciseHistory";
import { summarizeWorkoutHistory, durationText } from "@/src/lib/workoutHistory";
import type { WorkoutSessionRow } from "@/src/lib/workoutHistory";
import {
  bestScore, formatScore, isChartable, scoreSessionRows, trendScoreBars, trendScoreDirection,
} from "@/src/lib/workoutScore";
import { loadWorkoutHistoryView, saveWorkoutHistoryView } from "@/src/lib/historyViewStore";
import type { HistoryView } from "@/src/lib/historyViewStore";

interface WorkoutHistoryBlockProps {
  userId: string;
  rows: WorkoutSessionRow[];
  /** YYYY-MM-DD, sampled once by the page. */
  today: string;
  /** Long-press: the Track session, when the day has one. */
  onOpenSession: (sessionId: string) => void;
  /** Tap: add or edit that day's score. */
  onScoreRow: (row: WorkoutSessionRow) => void;
  onSeeAll: () => void;
}

export function WorkoutHistoryBlock({ userId, rows, today, onOpenSession, onScoreRow, onSeeAll }: WorkoutHistoryBlockProps) {
  const [view, setView] = useState<HistoryView>("trend");
  useEffect(() => {
    let alive = true;
    loadWorkoutHistoryView(userId).then((p) => { if (alive) setView(p.view); }).catch(console.error);
    return () => { alive = false; };
  }, [userId]);
  const pick = (v: HistoryView) => {
    setView(v);
    saveWorkoutHistoryView(userId, { view: v }).catch(console.error);
  };

  const summary = useMemo(() => summarizeWorkoutHistory(rows), [rows]);
  // Scores hang off the generated session; the pure rules key on that id.
  const scored = useMemo(
    () => rows.map((r) => ({ sessionId: r.generatedSessionId, sessionDate: r.sessionDate, score: r.score })),
    [rows],
  );
  const best = useMemo(() => bestScore(scored), [scored]);
  const bars = useMemo(() => trendScoreBars(scored), [scored]);
  const direction = useMemo(() => trendScoreDirection(scored), [scored]);
  const sessionRows = useMemo(() => scoreSessionRows(scored), [scored]);
  const byId = useMemo(() => new Map(rows.map((r) => [r.generatedSessionId, r])), [rows]);

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

  const chartable = best !== null && isChartable(best.score.type);
  const DirectionIcon = direction === "up" ? TrendingUp : direction === "down" ? TrendingDown : Minus;
  const caption = best === null
    ? "Add a score to see your trend."
    : !chartable
      ? "Rated, not scored."
      : `Score, last ${bars.length} ${bars.length === 1 ? "session" : "sessions"}`;

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
            <View style={[h.stats, !chartable && styles.statsTight]}>
              <View style={h.stat}>
                <Text style={h.statLabel}>Last done</Text>
                <Text style={h.statValue} numberOfLines={1}>{lastDonePhrase(today, summary.lastDate)}</Text>
              </View>
              <View style={h.stat}>
                <Text style={h.statLabel}>Best</Text>
                <Text style={[h.statValue, best === null && styles.statEmpty]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
                  {best ? formatScore(best.score) : "—"}
                </Text>
              </View>
              <View style={h.stat}>
                <Text style={h.statLabel}>Times</Text>
                <Text style={h.statValue} numberOfLines={1}>{summary.count}</Text>
              </View>
            </View>
            {chartable && bars.length > 0 && (
              <View style={h.bars} accessible accessibilityLabel={`Score over the last ${bars.length} sessions`}>
                {bars.map((b) => (
                  <View key={b.sessionId} style={h.barSlot}>
                    <View style={[h.bar, { height: Math.max(4, Math.round(b.height * BAR_MAX_HEIGHT)) }, b.best && h.barBest]} />
                  </View>
                ))}
              </View>
            )}
            <View style={h.captionRow}>
              <Text style={h.caption}>{caption}</Text>
              {chartable && direction !== null && (
                <View style={h.direction}>
                  <DirectionIcon size={13} color={direction === "down" ? colors.warning : colors.brand} />
                  <Text style={[h.directionText, direction === "down" && h.directionDown]}>{TREND_LABELS[direction]}</Text>
                </View>
              )}
            </View>
          </>
        ) : (
          <View>
            {sessionRows.slice(0, summary.rows.length).map((r, i) => {
              const row = byId.get(r.sessionId);
              if (!row) return null;
              const date = formatShortDate(r.sessionDate, today);
              const scoreText = r.score ? formatScore(r.score) : null;
              const duration = durationText(row.durationSeconds);
              const a11y = [date, scoreText ?? "no score yet", r.isPr ? "personal record" : null, duration]
                .filter(Boolean).join(", ");
              return (
                <TouchableOpacity
                  key={r.sessionId}
                  style={[h.row, i > 0 && h.rowBorder]}
                  onPress={() => onScoreRow(row)}
                  onLongPress={row.sessionId ? () => onOpenSession(row.sessionId!) : undefined}
                  delayLongPress={350}
                  accessibilityRole="button"
                  accessibilityLabel={a11y}
                  accessibilityHint={scoreText ? "Edits the score. Long-press opens the session." : "Adds a score. Long-press opens the session."}
                >
                  <Text style={h.rowDate}>{date}</Text>
                  {duration ? (
                    <Text style={h.rowName} numberOfLines={1}>· {duration}</Text>
                  ) : (
                    <View style={h.rowSpacer} />
                  )}
                  {scoreText ? (
                    <Text style={h.rowSet}>{scoreText}</Text>
                  ) : (
                    <Text style={h.link}>Add score</Text>
                  )}
                  {r.isPr && <View style={h.pr}><Text style={h.prText}>PR</Text></View>}
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
  statEmpty: { color: colors.textFaint },
  emptyCard: { alignItems: "center", paddingVertical: spacing.xl },
  emptyText: { fontSize: 14, color: colors.textMuted },
});
