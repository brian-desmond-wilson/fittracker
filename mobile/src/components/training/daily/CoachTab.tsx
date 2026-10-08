// The coach's full prescription for an AI-composed day, read back from the
// saved session and nothing else — no agent call. Four areas: the pick (the
// blocks and their movements), why this session (the day's and each block's
// reason), per-movement weights, and the evidence the composer worked from.
// Today's session when it is AI-composed; yesterday's when today's isn't;
// an honest empty state otherwise.
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, RefreshControl, ActivityIndicator,
} from "react-native";
import { useRouter } from "expo-router";
import { Sparkles } from "lucide-react-native";
import { colors, radii, spacing, tint } from "@/src/theme/tokens";
import { supabase } from "@/src/lib/supabase";
import { fetchSessionSnapshot, fetchTodaySession } from "@/src/lib/supabase/daily";
import { addDays, getLocalDateString, parseLocalDate } from "@/src/lib/dates";
import { sessionTitle } from "@/src/lib/dailyFocus";
import { roundsBadge } from "@/src/lib/dailyRounds";
import { builtinByKey } from "@/src/lib/dailyBuiltins";
import { BLOCK_ORDER, BLOCK_TITLES, SECTION_FOR_BLOCK } from "@/src/lib/dailyBlockCompose";
import { catalogCardFacts } from "@/src/lib/catalogCardFacts";
import { sessionItemToCatalogEntry } from "@/src/lib/sessionItemFacts";
import { ExerciseCardContent } from "./ExerciseCardContent";
import { RefreshIndicator } from "@/src/components/ui/RefreshIndicator";
import type { StoredSession, StoredSessionItem } from "@/src/types/daily";
import type { StoredBlock } from "@/src/types/dailyBlocks";

interface Loaded {
  session: StoredSession;
  snapshot: Record<string, unknown> | null;
  /** "today" or "yesterday" — which day's coach notes these are. */
  day: "today" | "yesterday";
}

/** The composer's inputs, whichever of the two stored shapes they came in:
 *  the app nests the body under `aiBody`; the coach writes it flat. */
interface Evidence {
  energy: number | null;
  minutes: number | null;
  soreness: { region: string; severity: number }[];
  neglected: string[];
  yesterday: string[];
  yesterdayWasRest: boolean;
  composer: string | null;
  selectionEvidence: string | null;
}

function asNumber(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
}
function asStrings(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

export function readEvidence(snapshot: Record<string, unknown> | null): Evidence | null {
  if (!snapshot) return null;
  const body = (snapshot.aiBody && typeof snapshot.aiBody === "object"
    ? snapshot.aiBody
    : snapshot) as Record<string, unknown>;
  const coverage = (body.coverage && typeof body.coverage === "object"
    ? body.coverage
    : {}) as Record<string, unknown>;
  const sorenessRaw = (body.soreness && typeof body.soreness === "object"
    ? body.soreness
    : {}) as Record<string, unknown>;
  const soreness = Object.entries(sorenessRaw)
    .map(([region, sev]) => ({ region, severity: asNumber(sev) ?? 0 }))
    .filter((s) => s.severity > 0);
  return {
    energy: asNumber(body.energy),
    minutes: asNumber(body.minutes),
    soreness,
    neglected: asStrings(coverage.neglected),
    yesterday: asStrings(coverage.yesterday),
    yesterdayWasRest: body.yesterdayWasRest === true,
    composer: typeof body.composer === "string" ? body.composer : null,
    selectionEvidence:
      typeof body.selection_evidence === "string" ? body.selection_evidence : null,
  };
}

function prescriptionLine(item: StoredSessionItem): string | null {
  const line = [
    item.targetSets ? `${item.targetSets} × ${item.targetReps ?? "?"}` : item.targetReps,
    item.restSeconds ? `${item.restSeconds}s` : null,
    item.weightNote,
  ].filter(Boolean).join(" · ");
  return line.length > 0 ? line : null;
}

function dayLabel(date: string): string {
  const d = parseLocalDate(date);
  return d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
}

export default function CoachTab() {
  const router = useRouter();
  const [loaded, setLoaded] = useState<Loaded | null | undefined>(undefined);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoaded(null); return; }
      const today = getLocalDateString();
      const todays = await fetchTodaySession(user.id, today);
      let session: StoredSession | null = null;
      let day: Loaded["day"] = "today";
      if (todays?.source === "ai") {
        session = todays;
      } else {
        const yesterday = getLocalDateString(addDays(parseLocalDate(today), -1));
        const prior = await fetchTodaySession(user.id, yesterday);
        if (prior?.source === "ai") { session = prior; day = "yesterday"; }
      }
      if (!session) { setLoaded(null); return; }
      const snapshot = await fetchSessionSnapshot(session.id);
      setLoaded({ session, snapshot, day });
    } catch (e) {
      console.error("CoachTab load failed:", e);
      setLoaded(null);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const openExercise = useCallback(
    (exerciseId: string) => router.push(`/(tabs)/training/exercise/${exerciseId}` as never),
    [router],
  );

  const evidence = useMemo(() => readEvidence(loaded?.snapshot ?? null), [loaded]);

  if (loaded === undefined) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.brand} />
      </View>
    );
  }

  if (loaded === null) {
    return (
      <ScrollView
        contentContainerStyle={styles.emptyWrap}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="transparent" />}
      >
        <RefreshIndicator visible={refreshing} />
        <Sparkles size={28} color={colors.textFaint} />
        <Text style={styles.emptyTitle}>No coach notes yet</Text>
        <Text style={styles.emptyText}>
          Neither today's nor yesterday's session was composed by the coach. When one is,
          its pick, reasons, weights and evidence show up here.
        </Text>
      </ScrollView>
    );
  }

  const { session, day } = loaded;
  const blocks: StoredBlock[] = [...session.blocks]
    .filter((b) => !b.dismissed)
    .sort((a, b) => BLOCK_ORDER.indexOf(a.block) - BLOCK_ORDER.indexOf(b.block));
  const itemsFor = (block: StoredBlock) =>
    session.items.filter((i) => i.section === SECTION_FOR_BLOCK[block.block]);
  const weighted = session.items.filter((i) => !!i.weightNote);
  const title = sessionTitle(
    session.dayReason,
    day === "today" ? "Today's Session" : "Yesterday's Session",
  );

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="transparent" />}
    >
      <RefreshIndicator visible={refreshing} />

      {/* Header */}
      <Text style={styles.title}>{title}</Text>
      <View style={styles.badges}>
        <Text style={styles.sourceBadge}>AI composed</Text>
        <Text style={styles.dateBadge}>{dayLabel(session.sessionDate)}</Text>
        <Text style={styles.dateBadge}>{session.status}</Text>
      </View>
      {day === "yesterday" && (
        <Text style={styles.fallbackNote}>
          Today's session isn't coach-composed, so these are yesterday's notes.
        </Text>
      )}

      {/* The pick */}
      <Text style={styles.sectionTitle}>The pick</Text>
      {blocks.length === 0 && (
        <Text style={styles.muted}>No blocks stored for this session.</Text>
      )}
      {blocks.map((block) => {
        const builtin = block.builtinKey ? builtinByKey(block.builtinKey) : null;
        const items = itemsFor(block);
        const badge = roundsBadge(block.roundsNote);
        const accent = colors.blocks[block.block];
        return (
          <View key={block.id} style={styles.blockCard}>
            <Text style={[styles.kicker, { color: accent }]}>
              {BLOCK_TITLES[block.block].toUpperCase()} · {block.minutes} MIN
            </Text>
            <View style={styles.blockNameRow}>
              <Text style={styles.blockName}>{block.name}</Text>
              {badge && (
                <Text style={[styles.roundsBadge, { color: accent, borderColor: tint(accent, 0.5) }]}>
                  {badge}
                </Text>
              )}
              {block.builtinKey !== null && <Text style={styles.builtinBadge}>BUILT-IN</Text>}
            </View>
            {builtin ? (
              builtin.movements.map((m) => (
                <View key={m.name} style={styles.builtinRow}>
                  <Text style={styles.builtinName}>{m.name}</Text>
                  <Text style={styles.builtinMeta}>{m.prescription}</Text>
                </View>
              ))
            ) : items.length > 0 ? (
              <View style={styles.itemList}>
                {items.map((item) => (
                  <View key={item.id} style={styles.itemCard}>
                    <ExerciseCardContent
                      name={item.name}
                      imageUrl={item.imageUrl}
                      facts={catalogCardFacts(sessionItemToCatalogEntry(item))}
                      prescription={prescriptionLine(item)}
                      onPress={() => openExercise(item.exerciseId)}
                      accessibilityLabel={`${item.name}. Open the exercise.`}
                    />
                  </View>
                ))}
              </View>
            ) : (
              <Text style={styles.muted}>No movements stored for this block.</Text>
            )}
          </View>
        );
      })}

      {/* Why this session */}
      <Text style={styles.sectionTitle}>Why this session</Text>
      <View style={styles.panel}>
        {session.dayReason
          ? <Text style={styles.reasonLead}>{session.dayReason}</Text>
          : <Text style={styles.muted}>The coach left no day-level reason.</Text>}
        {blocks.filter((b) => b.reason).map((b) => (
          <View key={b.id} style={styles.reasonRow}>
            <Text style={[styles.reasonKicker, { color: colors.blocks[b.block] }]}>
              {BLOCK_TITLES[b.block]}
            </Text>
            <Text style={styles.reasonText}>{b.reason}</Text>
          </View>
        ))}
      </View>

      {/* Weights — only when the coach prescribed any */}
      {weighted.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>Weights</Text>
          <View style={styles.panel}>
            {weighted.map((i) => (
              <View key={i.id} style={styles.weightRow}>
                <Text style={styles.weightName}>{i.name}</Text>
                <Text style={styles.weightNote}>{i.weightNote}</Text>
              </View>
            ))}
          </View>
        </>
      )}

      {/* Evidence */}
      <Text style={styles.sectionTitle}>The evidence</Text>
      <View style={styles.panel}>
        {evidence ? (
          <>
            <View style={styles.chips}>
              {evidence.energy !== null && <Chip label={`Energy ${evidence.energy}/10`} />}
              {evidence.minutes !== null && <Chip label={`${evidence.minutes} min`} />}
              <Chip
                label={
                  evidence.soreness.length === 0
                    ? "No soreness"
                    : `Sore: ${evidence.soreness.map((s) => `${s.region} ${s.severity}/3`).join(", ")}`
                }
                tone={evidence.soreness.length === 0 ? "ok" : "warn"}
              />
              <Chip
                label={
                  evidence.yesterdayWasRest
                    ? "Yesterday: rest"
                    : evidence.yesterday.length > 0
                      ? `Yesterday: ${evidence.yesterday.join(", ")}`
                      : "Yesterday: nothing logged"
                }
              />
              {evidence.neglected.length > 0 && (
                <Chip label={`Stale: ${evidence.neglected.join(", ")}`} tone="warn" />
              )}
              {evidence.composer && <Chip label={evidence.composer} />}
            </View>
            {evidence.selectionEvidence && (
              <Text style={styles.evidenceText}>{evidence.selectionEvidence}</Text>
            )}
          </>
        ) : (
          <Text style={styles.muted}>This session stored no composer inputs.</Text>
        )}
      </View>
    </ScrollView>
  );
}

function Chip({ label, tone = "plain" }: { label: string; tone?: "plain" | "ok" | "warn" }) {
  const color = tone === "ok" ? colors.success : tone === "warn" ? colors.warning : colors.textMuted;
  return (
    <Text style={[styles.chip, { color, borderColor: tint(color, 0.5) }]}>{label}</Text>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", paddingTop: 48 },
  content: { padding: spacing.lg, paddingBottom: 48 },
  emptyWrap: { padding: spacing.lg, paddingTop: 48, alignItems: "center", gap: 8 },
  emptyTitle: { fontSize: 17, fontWeight: "700", color: colors.text, marginTop: 8 },
  emptyText: { fontSize: 14, color: colors.textMuted, textAlign: "center", lineHeight: 20 },
  title: { fontSize: 26, fontWeight: "800", color: colors.text, lineHeight: 31 },
  badges: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 6 },
  sourceBadge: {
    fontSize: 11, color: colors.brand, borderWidth: 1, borderColor: tint(colors.brand, 0.5),
    borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2, overflow: "hidden",
  },
  dateBadge: {
    fontSize: 11, color: colors.textMuted, borderWidth: 1, borderColor: colors.border,
    borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2, overflow: "hidden",
    textTransform: "capitalize",
  },
  fallbackNote: { fontSize: 12.5, color: colors.warning, marginTop: 8, fontStyle: "italic" },
  sectionTitle: {
    fontSize: 12, fontWeight: "700", letterSpacing: 1.1, color: colors.textFaint,
    marginTop: spacing.xl, marginBottom: spacing.sm, textTransform: "uppercase",
  },
  panel: {
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    borderRadius: radii.panel, padding: spacing.lg, gap: 10,
  },
  blockCard: {
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    borderRadius: radii.panel, padding: spacing.lg, marginBottom: spacing.sm + 2, gap: 4,
  },
  kicker: { fontSize: 10.5, fontWeight: "700", letterSpacing: 1.1 },
  blockNameRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, flexWrap: "wrap" },
  blockName: { fontSize: 17, fontWeight: "700", color: colors.text, flexShrink: 1 },
  roundsBadge: {
    fontSize: 10.5, fontWeight: "700", letterSpacing: 1, borderWidth: 1,
    borderRadius: radii.pill, paddingHorizontal: 8, paddingVertical: 2, overflow: "hidden",
  },
  builtinBadge: {
    fontSize: 10, color: colors.textMuted, borderWidth: 1, borderColor: colors.border,
    borderRadius: 8, paddingHorizontal: 6, paddingVertical: 1, overflow: "hidden",
    letterSpacing: 0.5,
  },
  builtinRow: {
    flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border,
  },
  builtinName: { flex: 1, fontSize: 14, color: colors.text },
  builtinMeta: { fontSize: 12.5, color: colors.textMuted },
  itemList: { marginTop: 6, gap: spacing.md },
  itemCard: { borderRadius: 12, overflow: "hidden" },
  muted: { fontSize: 13, color: colors.textMuted, lineHeight: 18 },
  reasonLead: { fontSize: 14, color: colors.brand, fontStyle: "italic", lineHeight: 20 },
  reasonRow: { gap: 2, paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  reasonKicker: { fontSize: 11, fontWeight: "700", letterSpacing: 0.8, textTransform: "uppercase" },
  reasonText: { fontSize: 13.5, color: colors.text, lineHeight: 19 },
  weightRow: { gap: 2 },
  weightName: { fontSize: 14, fontWeight: "600", color: colors.text },
  weightNote: { fontSize: 13, color: colors.textMuted, lineHeight: 18 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    fontSize: 11.5, borderWidth: 1, borderRadius: radii.pill, paddingHorizontal: 9,
    paddingVertical: 3, overflow: "hidden",
  },
  evidenceText: { fontSize: 12.5, color: colors.textMuted, lineHeight: 18, marginTop: 4 },
});
