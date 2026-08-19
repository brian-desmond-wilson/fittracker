import React, { useEffect, useMemo, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator,
  RefreshControl,
} from "react-native";
import { useRouter } from "expo-router";
import { ChevronDown, ChevronRight, MapPin, Play, RotateCw, Sparkles } from "lucide-react-native";
import { colors } from "@/src/lib/colors";
import { useDailySession } from "@/src/hooks/useDailySession";
import { estimateSectionMinutes, totalSectionMinutes } from "@/src/lib/dailySectionMinutes";
import { builtinByKey } from "@/src/lib/dailyBuiltins";
import { blockDayShape, SECTION_FOR_BLOCK } from "@/src/lib/dailyBlockCompose";
import { GymSheet } from "./GymSheet";
import { CheckinSheet } from "./CheckinSheet";
import { RefreshIndicator } from "@/src/components/ui/RefreshIndicator";
import { fetchCapturedWorkout } from "@/src/lib/supabase/capture";
import { rerollBlock } from "@/src/lib/supabase/daily";
import { formatWorkoutHeadline, formatWorkoutItem } from "@/src/lib/workoutFormat";
import type { SessionSection } from "@/src/types/daily";
import type { BlockRole } from "@/src/types/dailyBlocks";
import type { CapturedWorkoutEntry } from "@/src/types/capture";

const SECTION_TITLES: Record<SessionSection, string> = {
  warmup: "Warm-up",
  mobility: "Mobility",
  main: "Main work",
  accessory: "Accessories",
  bfr: "BFR finisher",
  cooldown: "Cooldown",
};
const SECTION_ORDER: SessionSection[] = ["warmup", "mobility", "main", "accessory", "bfr", "cooldown"];

const BLOCK_TITLES: Record<BlockRole, string> = {
  warmup: "Warm-up",
  mobility: "Mobility",
  main: "Main workout",
  conditioning: "Conditioning",
  cooldown: "Cool-down",
};
const NUDGE_FOCUS: Record<string, string> = {
  upper: "an upper-body", lower: "a lower-body", full: "a full-body",
};

/**
 * What to capture to stop this block falling back to a shipped routine.
 *
 * Takes the key rather than the routine so that a stored key this build no
 * longer ships still says something useful — the block is still a built-in,
 * we just can't name what would replace it.
 */
function gapNudge(builtinKey: string): string {
  const b = builtinByKey(builtinKey);
  if (!b) return "Capture a routine to replace this built-in.";
  return `Capture ${NUDGE_FOCUS[b.focus]} ${BLOCK_TITLES[b.role].toLowerCase()} routine to replace this built-in.`;
}

export default function TodayTab() {
  const router = useRouter();
  const [refreshKey, setRefreshKey] = useState(0);
  const [gymSheetVisible, setGymSheetVisible] = useState(false);
  const [checkinVisible, setCheckinVisible] = useState(false);
  const { session, checkin, activeGym, gyms, loading, error, refetch } =
    useDailySession(refreshKey);
  const [refreshing, setRefreshing] = useState(false);
  // Set when today's session is a workout served whole — either one you
  // started from the catalog, or one the composer chose to serve.
  const [served, setServed] = useState<CapturedWorkoutEntry | null>(null);
  const [rerolling, setRerolling] = useState<BlockRole | null>(null);
  // A declined reroll, kept beside the block that declined it. `rerollBlock`
  // answers a plain false whether the block has nowhere left to go, the day
  // has moved past `suggested`, or a write failed part-way — so the line it
  // sets must not name a cause. The write-failure case is the one that
  // matters: it can leave the new workout's items under the old block's name,
  // and telling the user there was simply nothing to swap in would be the one
  // reading with consequences behind it.
  const [rerollNote, setRerollNote] = useState<BlockRole | null>(null);

  // Any recompose invalidates a decline: the shortlists it was refused from
  // are exactly what a recompose rebuilds. Cleared here rather than at the
  // call sites so the check-in sheet and the gym sheet cannot forget.
  const bump = () => {
    setRerollNote(null);
    setRefreshKey((k) => k + 1);
  };

  const servedId = session?.servedCapturedWorkoutId ?? null;
  useEffect(() => {
    if (!servedId) {
      setServed(null);
      return;
    }
    let alive = true;
    fetchCapturedWorkout(servedId).then((w) => {
      if (alive) setServed(w);
    });
    return () => {
      alive = false;
    };
  }, [servedId]);

  // The estimate stored with the session, or one derived from the items on
  // screen when there is none — a session composed before these existed, or a
  // day the model's timings didn't survive validation.
  const sectionMinutes = useMemo(() => {
    if (!session) return {};
    return Object.keys(session.sectionMinutes).length > 0
      ? session.sectionMinutes
      : estimateSectionMinutes(session.items);
  }, [session]);

  const blocks = session?.blocks ?? [];
  const mainBlock = blocks.find((b) => b.block === "main") ?? null;
  // Why there is no main, when there is none: a check-in that called for
  // recovery, or a catalog with nothing that fits today. Derived once, in the
  // block vocabulary's own module, because the two read identically from here.
  const dayShape = blockDayShape(blocks);
  // Only a still-suggested day rerolls; once it is accepted or done, the plan
  // is what happened and `rerollBlock` would refuse anyway.
  const canReroll = session?.status === "suggested";
  // A block day totals the blocks themselves, not the stored section minutes.
  // They normally agree — the compose writes one from the other — but a reroll
  // re-flows the stored total in a separate write that is allowed to fail, and
  // when it does, the blocks on screen are the ones telling the truth.
  const plannedMinutes = blocks.length > 0
    ? blocks.reduce((sum, b) => sum + b.minutes, 0)
    : totalSectionMinutes(sectionMinutes);
  // A complete day that runs long is composed on purpose: the durations are
  // the creators', and dropping a block would be worse than overrunning. Say
  // so rather than presenting the overrun as a plan that fits.
  const runsLong = checkin !== null && plannedMinutes > checkin.minutesAvailable;

  const onRefresh = async () => {
    setRefreshing(true);
    bump();
    setTimeout(() => setRefreshing(false), 600);
  };

  // A reload can replace the very blocks these controls sit on, so they are
  // out of action for its duration as well as for another block's swap.
  const rerollBusy = rerolling !== null || loading;

  const reroll = async (block: BlockRole) => {
    if (!session || rerollBusy) return;
    setRerolling(block);
    setRerollNote(null);
    const changed = await rerollBlock(session.id, block);
    setRerolling(null);
    if (changed) bump();
    else setRerollNote(block);
  };

  const startSession = () => {
    if (!session) return;
    router.push({
      pathname: `/workout/${session.id}`,
      params: {
        mode: "daily",
        ...(session.workoutInstanceId ? { instanceId: session.workoutInstanceId } : {}),
      },
    });
  };

  const gymChip = (
    <TouchableOpacity style={styles.gymChip} onPress={() => setGymSheetVisible(true)} activeOpacity={0.7}>
      <MapPin size={14} color={colors.primary} />
      <Text style={styles.gymChipText}>
        {activeGym ? `at: ${activeGym.name}` : "No gym set — tap to add"}
      </Text>
      <ChevronDown size={14} color={colors.mutedForeground} />
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      {/* Every recompute keeps the plan on screen, so this is the only thing
          that says one is happening — and iOS never draws RefreshControl's
          own spinner, so the app draws this one. Covers the pull as well as
          the check-in save, the gym switch and the reroll, all of which
          reload the day without a gesture. */}
      <RefreshIndicator visible={refreshing || (loading && session !== null)} />
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh}
            tintColor={colors.primary} colors={[colors.primary]} />
        }
      >
        {gymChip}

        {/* The session branch comes before the error branch on purpose. The
            hook keeps the day it last read, so a failed refresh still has a
            good plan in hand — showing "couldn't build" instead of that plan
            would throw away the day over a blip. An error with nothing behind
            it still takes the screen.

            The full-screen spinner is for having nothing to show, and only
            that. Every reload re-runs the whole compute — auth, gyms,
            check-in, catalog, ledger, the classification backfill — so
            blanking on `loading` threw the plan away for seconds at a time
            over a one-block reroll or a check-in edit. The plan stays;
            RefreshIndicator above says a reload is running. */}
        {loading && !session ? (
          <View style={styles.center}><ActivityIndicator size="large" color={colors.primary} /></View>
        ) : !session ? (
          error ? (
            <View style={styles.center}>
              <Text style={styles.emptyTitle}>Couldn't build today's session</Text>
              <Text style={styles.emptyText}>{error.message}</Text>
            </View>
          ) : !checkin ? (
            <View style={styles.center}>
              <Sparkles size={32} color={colors.primary} />
              <Text style={styles.emptyTitle}>Check in to build today's session</Text>
              <Text style={styles.emptyText}>
                Ten seconds: soreness, energy, and how long you've got.
              </Text>
              <TouchableOpacity style={styles.button} onPress={() => setCheckinVisible(true)}>
                <Text style={styles.buttonText}>Check in</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.center}>
              <Text style={styles.emptyTitle}>Nothing to work with yet</Text>
              <Text style={styles.emptyText}>
                Capture some exercises in the Exercises tab and pull to refresh.
              </Text>
            </View>
          )
        ) : (
          <>
            {error && (
              <View style={styles.errorBanner}>
                <Text style={styles.errorBannerText}>
                  Couldn't refresh — this is the plan as it last stood. {error.message}
                </Text>
              </View>
            )}
            <View style={styles.sessionHeader}>
              {/* A block day is named after the workout it is built around,
                  because it is not a push, pull or legs day — it stamps no
                  split at all, and calling it one made every block day read
                  as a leg day. */}
              <Text style={styles.sessionTitle}>
                {served
                  ? served.name
                  : mainBlock
                    ? mainBlock.name
                    : dayShape === "recovery"
                      ? "Recovery day"
                      : dayShape === "thin"
                        ? "Support work only"
                        : session.splitDay === "push"
                          ? "Push day"
                          : session.splitDay === "pull"
                            ? "Pull day"
                            : "Leg day"}
              </Text>
              <View style={styles.badges}>
                {session.rampWeek <= 2 && (
                  <Text style={styles.rampBadge}>Re-entry week {session.rampWeek}</Text>
                )}
                <Text style={styles.sourceBadge}>
                  {session.source === "user_pick"
                    ? "From your catalog"
                    : session.source === "ai"
                      ? "AI composed"
                      : "Rules composed"}
                </Text>
              </View>
              {dayShape === "recovery" && (
                <Text style={styles.recoveryNote}>
                  You're beat up — mobility and stretching only today, on purpose.
                </Text>
              )}
              {/* Not a recovery day: you said you felt fine, and the catalog
                  had nothing that fits. Saying "you're beat up" here was the
                  app inventing a reason it doesn't have. */}
              {dayShape === "thin" && (
                <Text style={styles.thinNote}>
                  Nothing in your catalog fits a main workout
                  {checkin ? ` in ${checkin.minutesAvailable} minutes` : " today"} — this is
                  support work only. Capture a shorter workout to fill the main block.
                </Text>
              )}
              {/* A workout served whole was not composed against your time or
                  soreness, so neither number describes it. */}
              {!served && checkin && (
                <>
                  <TouchableOpacity onPress={() => setCheckinVisible(true)}>
                    <Text style={styles.editCheckin}>
                      Energy {checkin.energy}/10 · {checkin.minutesAvailable} min · edit
                    </Text>
                  </TouchableOpacity>
                  {plannedMinutes > 0 && (
                    <Text style={runsLong ? styles.plannedTotalLong : styles.plannedTotal}>
                      ≈{plannedMinutes} min planned of {checkin.minutesAvailable}
                      {runsLong ? " — runs long" : ""}
                    </Text>
                  )}
                </>
              )}
              {served && (
                <Text style={styles.editCheckin}>
                  {formatWorkoutHeadline(served.items.length, served.rounds)}
                </Text>
              )}
            </View>

            {served && served.description && (
              <Text style={styles.servedDescription}>{served.description}</Text>
            )}

            {/* One unsectioned list: we did not compose this workout, so
                imposing our warm-up/accessory/cooldown headings on it would
                assert a shape the creator never gave it. */}
            {served
              ? served.items.map((item, i) => {
                  const prescription = formatWorkoutItem(item);
                  return (
                    <TouchableOpacity
                      key={`${item.exerciseId}-${i}`}
                      style={styles.itemCard}
                      activeOpacity={0.7}
                      onPress={() =>
                        router.push(`/(tabs)/training/exercise/${item.exerciseId}` as never)
                      }
                      accessibilityRole="button"
                      accessibilityLabel={`${item.name}. Open the exercise.`}
                    >
                      <View style={styles.itemBody}>
                        <Text style={styles.itemName}>{item.name}</Text>
                        {prescription !== "" && (
                          <Text style={styles.itemMeta}>{prescription}</Text>
                        )}
                        {item.notes && <Text style={styles.itemReason}>{item.notes}</Text>}
                      </View>
                      <ChevronRight size={18} color={colors.mutedForeground} />
                    </TouchableOpacity>
                  );
                })
              : blocks.length > 0
                ? blocks.map((block) => {
                    const builtinKey = block.builtinKey;
                    const builtin = builtinKey ? builtinByKey(builtinKey) : null;
                    // Items are stored under the SECTION the block explodes
                    // into, never under the block's own name — conditioning
                    // logs as `accessory`, and the map is what keeps the two
                    // vocabularies from crossing.
                    const items = session.items.filter(
                      (i) => i.section === SECTION_FOR_BLOCK[block.block],
                    );
                    // A built-in has no logged items and a deleted workout has
                    // no source left; either way the card must not come out
                    // blank.
                    const orphaned = !builtinKey && !block.workoutId;
                    return (
                      <View key={block.id} style={styles.section}>
                        <View style={styles.sectionHeader}>
                          <Text style={styles.sectionTitle}>
                            {BLOCK_TITLES[block.block]}
                          </Text>
                          <View style={styles.blockHeaderRight}>
                            <Text style={styles.sectionMinutes}>~{block.minutes} min</Text>
                            {canReroll && (
                              <TouchableOpacity
                                onPress={() => reroll(block.block)}
                                disabled={rerollBusy}
                                style={
                                  rerollBusy && rerolling !== block.block
                                    ? styles.rerollDisabled
                                    : undefined
                                }
                                accessibilityRole="button"
                                accessibilityLabel={`Swap the ${BLOCK_TITLES[block.block].toLowerCase()} for another one`}
                                accessibilityState={{
                                  disabled: rerollBusy,
                                  busy: rerolling === block.block,
                                }}
                                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                              >
                                {rerolling === block.block
                                  ? <ActivityIndicator size="small" color={colors.primary} />
                                  : <RotateCw size={15} color={colors.primary} />}
                              </TouchableOpacity>
                            )}
                          </View>
                        </View>
                        <View style={styles.blockCard}>
                          <View style={styles.blockNameRow}>
                            <Text style={styles.itemName}>{block.name}</Text>
                            {builtinKey !== null && (
                              <Text style={styles.builtinBadge}>BUILT-IN</Text>
                            )}
                          </View>
                          {block.roundsNote && (
                            <Text style={styles.itemMeta}>{block.roundsNote}</Text>
                          )}
                          {block.reason && (
                            <Text style={styles.itemReason}>{block.reason}</Text>
                          )}
                          {builtin
                            ? builtin.movements.map((m) => (
                                <View key={m.name} style={styles.blockItemRow}>
                                  <Text style={styles.blockItemName}>{m.name}</Text>
                                  <Text style={styles.itemMeta}>{m.prescription}</Text>
                                </View>
                              ))
                            : items.map((item) => (
                                <TouchableOpacity
                                  key={item.id}
                                  style={styles.blockItemRow}
                                  activeOpacity={0.7}
                                  onPress={() =>
                                    router.push(`/(tabs)/training/exercise/${item.exerciseId}` as never)
                                  }
                                  accessibilityRole="button"
                                  accessibilityLabel={`${item.name}. Open the exercise.`}
                                >
                                  <Text style={styles.blockItemName}>{item.name}</Text>
                                  <Text style={styles.itemMeta}>
                                    {[
                                      item.targetSets
                                        ? `${item.targetSets} × ${item.targetReps ?? "?"}`
                                        : item.targetReps,
                                    ].filter(Boolean).join(" · ")}
                                  </Text>
                                </TouchableOpacity>
                              ))}
                          {/* A built-in is never empty-looking — it either
                              lists its movements or, for a key this build no
                              longer ships, says so in the nudge below. */}
                          {builtinKey === null && items.length === 0 && (
                            <Text style={styles.blockEmpty}>
                              {orphaned
                                ? "This workout is no longer in your catalog — the block keeps its name as history."
                                : "No movements stored for this block yet. Pull to refresh."}
                            </Text>
                          )}
                          {builtinKey !== null && (
                            <Text style={styles.nudge}>{gapNudge(builtinKey)}</Text>
                          )}
                          {canReroll && rerollNote === block.block && (
                            <Text style={styles.blockEmpty}>
                              Couldn't swap this block right now.
                            </Text>
                          )}
                        </View>
                      </View>
                    );
                  })
                : SECTION_ORDER.map((section) => {
              const items = session.items.filter((i) => i.section === section);
              if (items.length === 0) return null;
              return (
                <View key={section} style={styles.section}>
                  <View style={styles.sectionHeader}>
                    <Text style={styles.sectionTitle}>{SECTION_TITLES[section]}</Text>
                    {sectionMinutes[section] !== undefined && (
                      <Text style={styles.sectionMinutes}>
                        ~{sectionMinutes[section]} min
                      </Text>
                    )}
                  </View>
                  {items.map((item) => (
                    <TouchableOpacity
                      key={item.id}
                      style={styles.itemCard}
                      activeOpacity={0.7}
                      onPress={() =>
                        router.push(`/(tabs)/training/exercise/${item.exerciseId}` as never)
                      }
                      accessibilityRole="button"
                      accessibilityLabel={`${item.name}. Open the exercise.`}
                    >
                      <View style={styles.itemBody}>
                        <Text style={styles.itemName}>{item.name}</Text>
                        <Text style={styles.itemMeta}>
                          {[
                            item.targetSets ? `${item.targetSets} × ${item.targetReps ?? "?"}` : item.targetReps,
                            item.restSeconds ? `rest ${item.restSeconds}s` : null,
                          ].filter(Boolean).join(" · ")}
                        </Text>
                        {item.reason && <Text style={styles.itemReason}>{item.reason}</Text>}
                      </View>
                      <ChevronRight size={18} color={colors.mutedForeground} />
                    </TouchableOpacity>
                  ))}
                </View>
              );
            })}
          </>
        )}
      </ScrollView>

      {session && session.status !== "completed" && (
        <TouchableOpacity style={styles.startButton} onPress={startSession} activeOpacity={0.8}>
          <Play size={18} color="#FFFFFF" />
          <Text style={styles.buttonText}>
            {session.workoutInstanceId ? "Continue session" : "Start session"}
          </Text>
        </TouchableOpacity>
      )}

      <GymSheet visible={gymSheetVisible} gyms={gyms}
        onClose={() => setGymSheetVisible(false)}
        onChanged={() => { setGymSheetVisible(false); bump(); }} />
      <CheckinSheet visible={checkinVisible} existing={checkin}
        onClose={() => setCheckinVisible(false)}
        onSaved={() => { setCheckinVisible(false); bump(); }} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: 16, paddingBottom: 96 },
  gymChip: {
    flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start",
    backgroundColor: colors.muted, borderWidth: 1, borderColor: colors.border,
    borderRadius: 16, paddingHorizontal: 12, paddingVertical: 7, marginBottom: 16,
  },
  gymChipText: { fontSize: 13, color: colors.foreground, fontWeight: "600" },
  center: { alignItems: "center", paddingVertical: 48, gap: 8 },
  emptyTitle: { fontSize: 17, fontWeight: "bold", color: colors.foreground },
  emptyText: { fontSize: 14, color: colors.mutedForeground, textAlign: "center", lineHeight: 20 },
  button: {
    backgroundColor: colors.primary, borderRadius: 8, paddingVertical: 12,
    paddingHorizontal: 28, marginTop: 12,
  },
  buttonText: { color: "#FFFFFF", fontSize: 15, fontWeight: "600" },
  sessionHeader: { marginBottom: 12 },
  sessionTitle: { fontSize: 22, fontWeight: "700", color: colors.foreground },
  badges: { flexDirection: "row", gap: 8, marginTop: 6 },
  rampBadge: {
    fontSize: 11, color: "#F59E0B", borderWidth: 1, borderColor: "#F59E0B",
    borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2, overflow: "hidden",
  },
  sourceBadge: {
    fontSize: 11, color: colors.mutedForeground, borderWidth: 1,
    borderColor: colors.border, borderRadius: 10, paddingHorizontal: 8,
    paddingVertical: 2, overflow: "hidden",
  },
  editCheckin: { fontSize: 13, color: colors.primary, marginTop: 8 },
  servedDescription: {
    fontSize: 14, color: colors.mutedForeground, lineHeight: 20, marginBottom: 4,
  },
  plannedTotal: { fontSize: 13, color: colors.mutedForeground, marginTop: 4 },
  plannedTotalLong: { fontSize: 13, color: "#F59E0B", marginTop: 4 },
  recoveryNote: { fontSize: 13, color: colors.mutedForeground, marginTop: 6 },
  // Amber, like the gap nudges: this one is asking for a capture, not
  // describing a day that went to plan.
  thinNote: { fontSize: 13, color: "#F59E0B", marginTop: 6, lineHeight: 18 },
  errorBanner: {
    backgroundColor: "#F59E0B1A", borderWidth: 1, borderColor: "#F59E0B",
    borderRadius: 10, padding: 10, marginBottom: 12,
  },
  errorBannerText: { fontSize: 13, color: "#F59E0B", lineHeight: 18 },
  blockHeaderRight: { flexDirection: "row", alignItems: "center", gap: 10 },
  rerollDisabled: { opacity: 0.4 },
  blockCard: {
    backgroundColor: colors.muted, borderWidth: 1, borderColor: colors.border,
    borderRadius: 10, padding: 12, gap: 4,
  },
  blockNameRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  builtinBadge: {
    fontSize: 10, color: colors.mutedForeground, borderWidth: 1,
    borderColor: colors.border, borderRadius: 8, paddingHorizontal: 6,
    paddingVertical: 1, overflow: "hidden", letterSpacing: 0.5,
  },
  blockItemRow: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    paddingVertical: 6, borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  blockItemName: { fontSize: 14, color: colors.foreground, flex: 1, marginRight: 8 },
  blockEmpty: { fontSize: 12, color: colors.mutedForeground, marginTop: 6 },
  nudge: { fontSize: 12, color: "#F59E0B", marginTop: 6, fontStyle: "italic" },
  section: { marginTop: 16 },
  sectionHeader: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 12, color: colors.mutedForeground, textTransform: "uppercase",
    letterSpacing: 1,
  },
  sectionMinutes: { fontSize: 12, color: colors.mutedForeground, letterSpacing: 0.5 },
  itemCard: {
    flexDirection: "row", alignItems: "center", gap: 10,
    backgroundColor: colors.muted, borderWidth: 1, borderColor: colors.border,
    borderRadius: 10, padding: 12, marginBottom: 8,
  },
  itemBody: { flex: 1 },
  itemName: { fontSize: 15, fontWeight: "600", color: colors.foreground },
  itemMeta: { fontSize: 13, color: colors.mutedForeground, marginTop: 2 },
  itemReason: { fontSize: 12, color: colors.primary, marginTop: 6, fontStyle: "italic" },
  startButton: {
    position: "absolute", left: 16, right: 16, bottom: 16, flexDirection: "row",
    gap: 8, backgroundColor: colors.primary, borderRadius: 10, paddingVertical: 14,
    alignItems: "center", justifyContent: "center",
    shadowColor: "#000", shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 8, elevation: 8,
  },
});
