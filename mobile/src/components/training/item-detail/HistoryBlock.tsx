// mobile/src/components/training/item-detail/HistoryBlock.tsx
// "Your history" (mock frame 2): a segmented Trend | Sessions toggle in the
// header, one card, the skill note as the card's footer, and "See all N
// sessions" under it. Every number comes from lib/exerciseHistory; this file
// only draws. Hidden by the page when there are no working sets.
import React, { useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { ChevronRight, TrendingUp, TrendingDown, Minus } from "lucide-react-native";
import { colors, radii, spacing, tint, typography } from "@/src/theme/tokens";
import {
  bestSet, formatSet, formatShortDate, lastDonePhrase, sessionCount, sessionRows,
  trendBars, trendDirection, TREND_LABELS,
} from "@/src/lib/exerciseHistory";
import type { WorkingSet } from "@/src/lib/exerciseHistory";
import { loadHistoryView, saveHistoryView } from "@/src/lib/historyViewStore";
import type { HistoryView } from "@/src/lib/historyViewStore";
import type { LatestRating } from "@/src/lib/supabase/rerateMovement";
import type { MovementRating } from "@/src/lib/dailySkill";

const RATING_WORDS: Record<MovementRating, string> = {
  too_easy: "too easy",
  right: "just right",
  too_hard: "too hard",
};

/** At most this many rows in the Sessions view (spec §4.2). */
const SESSION_ROWS = 4;
const BAR_MAX_HEIGHT = 56;

interface HistoryBlockProps {
  userId: string;
  sets: WorkingSet[];
  /** YYYY-MM-DD, sampled once by the page. */
  today: string;
  /** Null hides the footer: the reader never rated this exercise. */
  skillNote: LatestRating | null;
  onOpenSession: (sessionId: string) => void;
  onSeeAll: () => void;
  onRerate: () => void;
}

export function HistoryBlock({
  userId, sets, today, skillNote, onOpenSession, onSeeAll, onRerate,
}: HistoryBlockProps) {
  const [view, setView] = useState<HistoryView>("trend");
  useEffect(() => {
    let alive = true;
    loadHistoryView(userId).then((p) => { if (alive) setView(p.view); });
    return () => { alive = false; };
  }, [userId]);
  const pick = (v: HistoryView) => {
    setView(v);
    saveHistoryView(userId, { view: v });
  };

  const best = useMemo(() => bestSet(sets), [sets]);
  const count = useMemo(() => sessionCount(sets), [sets]);
  const bars = useMemo(() => trendBars(sets), [sets]);
  const direction = useMemo(() => trendDirection(sets), [sets]);
  const rows = useMemo(() => sessionRows(sets), [sets]);
  const lastDate = rows[0]?.sessionDate ?? null;

  if (sets.length === 0 || best === null || lastDate === null) return null;

  const DirectionIcon = direction === "up" ? TrendingUp : direction === "down" ? TrendingDown : Minus;

  return (
    <View style={styles.section}>
      <View style={styles.headerRow}>
        <Text style={styles.sectionTitle}>Your history</Text>
        <View style={styles.seg} accessibilityRole="tablist">
          {(["trend", "sessions"] as HistoryView[]).map((v) => {
            const on = v === view;
            return (
              <TouchableOpacity key={v} style={[styles.segItem, on && styles.segItemOn]} onPress={() => pick(v)}
                accessibilityRole="tab" accessibilityState={{ selected: on }}>
                <Text style={[styles.segText, on && styles.segTextOn]}>{v === "trend" ? "Trend" : "Sessions"}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      <View style={styles.card}>
        {view === "trend" ? (
          <>
            <View style={styles.stats}>
              <View style={styles.stat}>
                <Text style={styles.statLabel}>Last done</Text>
                <Text style={styles.statValue} numberOfLines={1}>{lastDonePhrase(today, lastDate)}</Text>
              </View>
              <View style={styles.stat}>
                <Text style={styles.statLabel}>Best set</Text>
                <Text style={styles.statValue} numberOfLines={1}>{formatSet(best)}</Text>
              </View>
              <View style={styles.stat}>
                <Text style={styles.statLabel}>Sessions</Text>
                <Text style={styles.statValue} numberOfLines={1}>{count}</Text>
              </View>
            </View>
            <View style={styles.bars} accessible={true} accessibilityLabel={`Top set over the last ${bars.length} sessions`}>
              {bars.map((b) => (
                <View key={b.sessionId} style={styles.barSlot}>
                  <View style={[
                    styles.bar,
                    { height: Math.max(4, Math.round(b.height * BAR_MAX_HEIGHT)) },
                    b.best && styles.barBest,
                  ]} />
                </View>
              ))}
            </View>
            <View style={styles.captionRow}>
              <Text style={styles.caption}>Top set, last {bars.length} sessions</Text>
              {direction !== null && (
                <View style={styles.direction}>
                  <DirectionIcon size={13} color={direction === "down" ? colors.warning : colors.brand} />
                  <Text style={[styles.directionText, direction === "down" && styles.directionDown]}>
                    {TREND_LABELS[direction]}
                  </Text>
                </View>
              )}
            </View>
          </>
        ) : (
          <View>
            {rows.slice(0, SESSION_ROWS).map((r, i) => (
              <TouchableOpacity key={r.sessionId} style={[styles.row, i > 0 && styles.rowBorder]}
                onPress={() => onOpenSession(r.sessionId)} accessibilityRole="button"
                accessibilityLabel={`${formatShortDate(r.sessionDate, today)}, ${r.sessionName}, ${formatSet(r.topSet)}${r.isPr ? ", personal record" : ""}`}>
                <Text style={styles.rowDate}>{formatShortDate(r.sessionDate, today)}</Text>
                <Text style={styles.rowName} numberOfLines={1}>· {r.sessionName}</Text>
                <Text style={styles.rowSet}>{formatSet(r.topSet)}</Text>
                {r.isPr && (
                  <View style={styles.pr}><Text style={styles.prText}>PR</Text></View>
                )}
              </TouchableOpacity>
            ))}
          </View>
        )}

        {skillNote && (
          <View style={styles.footer}>
            <Text style={styles.footerText} numberOfLines={2}>
              You rated this <Text style={styles.footerStrong}>{RATING_WORDS[skillNote.rating]}</Text> on {formatShortDate(skillNote.sessionDate, today)}
            </Text>
            <TouchableOpacity onPress={onRerate} accessibilityRole="button" accessibilityLabel="Re-rate this exercise"
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={styles.link}>Re-rate</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      <TouchableOpacity style={styles.seeAll} onPress={onSeeAll} accessibilityRole="button">
        <Text style={styles.link}>See all {count} {count === 1 ? "session" : "sessions"}</Text>
        <ChevronRight size={16} color={colors.brand} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { padding: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.border },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.md },
  sectionTitle: { fontSize: 18, fontWeight: "600", color: colors.text },
  seg: { flexDirection: "row", backgroundColor: colors.surface2, borderRadius: radii.control, padding: 2 },
  segItem: { paddingHorizontal: spacing.md, paddingVertical: 5, borderRadius: radii.control - 2 },
  segItemOn: { backgroundColor: colors.brand },
  segText: { fontSize: 12, fontWeight: "600", color: colors.textMuted },
  segTextOn: { color: colors.onBrand },
  card: { backgroundColor: colors.surface, borderRadius: radii.row, borderWidth: 1, borderColor: colors.border, padding: spacing.lg },
  stats: { flexDirection: "row", gap: spacing.md, marginBottom: spacing.lg },
  stat: { flex: 1 },
  statLabel: { ...typography.caption, textTransform: "uppercase", letterSpacing: 0.5, fontSize: 11, marginBottom: 2 },
  statValue: { fontSize: 16, fontWeight: "700", color: colors.text },
  bars: { flexDirection: "row", alignItems: "flex-end", gap: spacing.sm, height: BAR_MAX_HEIGHT },
  barSlot: { flex: 1, justifyContent: "flex-end" },
  bar: { backgroundColor: tint(colors.brand, 0.35), borderRadius: 3 },
  barBest: { backgroundColor: colors.brand },
  captionRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: spacing.sm },
  caption: { ...typography.caption },
  direction: { flexDirection: "row", alignItems: "center", gap: 4 },
  directionText: { fontSize: 12, fontWeight: "600", color: colors.brand },
  directionDown: { color: colors.warning },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: spacing.sm },
  rowBorder: { borderTopWidth: 1, borderTopColor: colors.border },
  rowDate: { fontSize: 14, fontWeight: "600", color: colors.text },
  rowName: { flex: 1, fontSize: 14, color: colors.textMuted },
  rowSet: { fontSize: 14, fontWeight: "600", color: colors.text },
  pr: { backgroundColor: tint(colors.success), borderRadius: radii.control, paddingHorizontal: 6, paddingVertical: 2 },
  prText: { fontSize: 10, fontWeight: "700", color: colors.success, letterSpacing: 0.5 },
  footer: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm,
    marginTop: spacing.md, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.border,
  },
  footerText: { flex: 1, fontSize: 13, color: colors.textMuted },
  footerStrong: { fontWeight: "700", color: colors.text },
  link: { fontSize: 14, fontWeight: "600", color: colors.brand },
  seeAll: { flexDirection: "row", alignItems: "center", gap: 2, paddingTop: spacing.md, alignSelf: "flex-start" },
});
