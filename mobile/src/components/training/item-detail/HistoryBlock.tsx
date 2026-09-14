// mobile/src/components/training/item-detail/HistoryBlock.tsx
// "Your history" (mock frame 2): a segmented Trend | Sessions toggle in the
// header, one card, the skill note as the card's footer, and "See all N
// sessions" under it. Every number comes from lib/exerciseHistory; this file
// only draws. Hidden by the page when there are no working sets.
import React, { useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { ChevronRight, TrendingUp, TrendingDown, Minus } from "lucide-react-native";
import { colors, spacing } from "@/src/theme/tokens";
import { historyStyles as h, BAR_MAX_HEIGHT } from "./historyStyles";
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
            <View style={h.stats}>
              <View style={h.stat}>
                <Text style={h.statLabel}>Last done</Text>
                <Text style={h.statValue} numberOfLines={1}>{lastDonePhrase(today, lastDate)}</Text>
              </View>
              <View style={h.stat}>
                <Text style={h.statLabel}>Best set</Text>
                <Text style={h.statValue} numberOfLines={1}>{formatSet(best)}</Text>
              </View>
              <View style={h.stat}>
                <Text style={h.statLabel}>Sessions</Text>
                <Text style={h.statValue} numberOfLines={1}>{count}</Text>
              </View>
            </View>
            <View style={h.bars} accessible={true} accessibilityLabel={`Top set over the last ${bars.length} sessions`}>
              {bars.map((b) => (
                <View key={b.sessionId} style={h.barSlot}>
                  <View style={[
                    h.bar,
                    { height: Math.max(4, Math.round(b.height * BAR_MAX_HEIGHT)) },
                    b.best && h.barBest,
                  ]} />
                </View>
              ))}
            </View>
            <View style={h.captionRow}>
              <Text style={h.caption}>Top set, last {bars.length} sessions</Text>
              {direction !== null && (
                <View style={h.direction}>
                  <DirectionIcon size={13} color={direction === "down" ? colors.warning : colors.brand} />
                  <Text style={[h.directionText, direction === "down" && h.directionDown]}>
                    {TREND_LABELS[direction]}
                  </Text>
                </View>
              )}
            </View>
          </>
        ) : (
          <View>
            {rows.slice(0, SESSION_ROWS).map((r, i) => (
              <TouchableOpacity key={r.sessionId} style={[h.row, i > 0 && h.rowBorder]}
                onPress={() => onOpenSession(r.sessionId)} accessibilityRole="button"
                accessibilityLabel={`${formatShortDate(r.sessionDate, today)}, ${r.sessionName}, ${formatSet(r.topSet)}${r.isPr ? ", personal record" : ""}`}>
                <Text style={h.rowDate}>{formatShortDate(r.sessionDate, today)}</Text>
                <Text style={h.rowName} numberOfLines={1}>· {r.sessionName}</Text>
                <Text style={h.rowSet}>{formatSet(r.topSet)}</Text>
                {r.isPr && (
                  <View style={h.pr}><Text style={h.prText}>PR</Text></View>
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
              <Text style={h.link}>Re-rate</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      <TouchableOpacity style={h.seeAll} onPress={onSeeAll} accessibilityRole="button">
        <Text style={h.link}>See all {count} {count === 1 ? "session" : "sessions"}</Text>
        <ChevronRight size={16} color={colors.brand} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  footer: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm,
    marginTop: spacing.md, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.border,
  },
  footerText: { flex: 1, fontSize: 13, color: colors.textMuted },
  footerStrong: { fontWeight: "700", color: colors.text },
});
