// The Today tab, rebuilt to the approved 2026-08-19 mockups: one context bar
// over a session named after its main workout, an AI day rationale, a time
// budget bar, and five interactive block cards (hero main). Talk-back lives
// here too — block/day adjust instructions, the recovery override, and the
// post-session debrief.
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator,
  RefreshControl,
} from "react-native";
import { useRouter } from "expo-router";
import {
  Check, ChevronDown, ChevronRight, Clock, Dumbbell, MapPin, Play, Sparkles, Zap,
} from "lucide-react-native";
import { colors, radii, spacing, tint, typography } from "@/src/theme/tokens";
import { useDailySession } from "@/src/hooks/useDailySession";
import { estimateSectionMinutes, totalSectionMinutes } from "@/src/lib/dailySectionMinutes";
import { builtinByKey } from "@/src/lib/dailyBuiltins";
import {
  blockDayShape, plannedBlockMinutes, BLOCK_TITLES, SECTION_FOR_BLOCK,
} from "@/src/lib/dailyBlockCompose";
import { isRecoveryDay } from "@/src/lib/dailyBlockShortlist";
import { GymSheet } from "./GymSheet";
import { SetupSheet } from "./SetupSheet";
import { AdjustSheet } from "./AdjustSheet";
import { DebriefSheet } from "./DebriefSheet";
import { BlockCard } from "./BlockCard";
import { SessionBudgetBar } from "./SessionBudgetBar";
import { RefreshIndicator } from "@/src/components/ui/RefreshIndicator";
import { fetchCapturedWorkout } from "@/src/lib/supabase/capture";
import {
  completeSession, fetchDebrief, rerollBlock, setBlockDismissed, setBlockLocked,
  setRecoveryOverride,
} from "@/src/lib/supabase/daily";
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
  const [setupVisible, setSetupVisible] = useState(false);
  // The adjust sheet's target: a block, "day" for the whole session, or
  // closed. One state, because only one can be open.
  const [adjustScope, setAdjustScope] = useState<BlockRole | "day" | null>(null);
  const [debriefVisible, setDebriefVisible] = useState(false);
  const { session, checkin, activeGym, gyms, loading, error, refetch, composeAnother, recomposeBlock } =
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
  const [markingDone, setMarkingDone] = useState(false);
  // Set once a mark-done write has been sent. `completeSession` logs its own
  // failures and answers nothing, so the only thing that can say the write
  // didn't land is the day coming back still unfinished.
  const [doneAttempted, setDoneAttempted] = useState(false);
  // Which support cards are open. Keyed by block, cleared by nothing — an
  // expanded card surviving a reload is what you want.
  const [expanded, setExpanded] = useState<Partial<Record<BlockRole, boolean>>>({});
  // Whether today's completed session already has a debrief — null while
  // unknown. Drives both the inline card and the one auto-open per mount.
  const [hasDebrief, setHasDebrief] = useState<boolean | null>(null);
  const debriefPromptedRef = useRef(false);
  const [togglingOverride, setTogglingOverride] = useState(false);

  // Any recompose invalidates a decline: the shortlists it was refused from
  // are exactly what a recompose rebuilds. Cleared here rather than at the
  // call sites so the setup sheet and the gym sheet cannot forget.
  const bump = () => {
    setRerollNote(null);
    setDoneAttempted(false);
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

  // The debrief follows the session's completion, not the Mark-done tap: a
  // day finished in the logging screen arrives here already completed.
  const sessionId = session?.id ?? null;
  const sessionCompleted = session?.status === "completed";
  useEffect(() => {
    if (!sessionId || !sessionCompleted) {
      setHasDebrief(null);
      return;
    }
    let alive = true;
    fetchDebrief(sessionId).then((d) => {
      if (!alive) return;
      setHasDebrief(d !== null);
      // Once per mount, and never over an already-debriefed day. Dismissing
      // the sheet leaves the inline card as the way back in.
      if (d === null && !debriefPromptedRef.current) {
        debriefPromptedRef.current = true;
        setDebriefVisible(true);
      }
    });
    return () => {
      alive = false;
    };
  }, [sessionId, sessionCompleted]);

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
  // A day whose every block is a built-in has block rows and nothing loggable
  // under them — built-in movements are app data, not exercise rows. The
  // logging screen has no first exercise to open and refuses the session, so
  // the day is finished from here instead.
  const nothingToLog = blocks.length > 0 && (session?.items.length ?? 0) === 0;
  // Only a still-suggested day rerolls; once it is accepted or done, the plan
  // is what happened and `rerollBlock` would refuse anyway.
  const canEdit = session?.status === "suggested";
  // A block day totals the blocks themselves, not the stored section minutes.
  // They normally agree — the compose writes one from the other — but a reroll
  // re-flows the stored total in a separate write that is allowed to fail, and
  // when it does, the blocks on screen are the ones telling the truth.
  const plannedMinutes = blocks.length > 0
    ? plannedBlockMinutes(blocks)
    : totalSectionMinutes(sectionMinutes);
  // The engine called recovery and the user has already said "train anyway".
  const overrodeRecovery =
    checkin !== null && checkin.overrideRecovery && isRecoveryDay(checkin);
  const soreCount = checkin ? Object.keys(checkin.soreness).length : 0;

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

  // Lock and dismiss are metadata, not compose inputs: the signature ignores
  // them on purpose, so the refetch that follows redraws the row without
  // recomposing the day.
  const toggleLock = async (blockId: string, locked: boolean) => {
    if (await setBlockLocked(blockId, !locked)) refetch();
  };
  const toggleDismissed = async (blockId: string, dismissed: boolean) => {
    if (await setBlockDismissed(blockId, !dismissed)) refetch();
  };

  const overrideRecoveryDay = async (value: boolean) => {
    if (!checkin || togglingOverride) return;
    setTogglingOverride(true);
    const ok = await setRecoveryOverride(checkin.id, value);
    setTogglingOverride(false);
    if (ok) bump();
  };

  // Nothing to log means nothing to start: the day is a plan you follow off
  // the card, and finishing it is one tap. `completeSession` stands the status
  // up and writes the usage ledger — which a day of built-ins has nothing to
  // put in, since a built-in carries no workout id.
  const markDone = async () => {
    if (!session || markingDone) return;
    setMarkingDone(true);
    await completeSession(session.id, []);
    setMarkingDone(false);
    setDoneAttempted(true);
    setRerollNote(null);
    setRefreshKey((k) => k + 1);
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

  const openWorkout = (workoutId: string) =>
    router.push(`/(tabs)/training/captured-workout/${workoutId}` as never);
  const openExercise = (exerciseId: string) =>
    router.push(`/(tabs)/training/exercise/${exerciseId}` as never);
  const openBody = () => {
    setSetupVisible(false);
    router.push("/(tabs)/training/body" as never);
  };

  // ---- Context bar: every chip opens the one setup sheet. The whole day's
  // inputs live together now; the gym chip keeps its identity for the
  // no-gym-yet case, where it opens the gym CRUD directly. ----
  const contextBar = (
    <View style={styles.ctxBar}>
      <TouchableOpacity
        style={styles.ctxChip}
        onPress={() => (activeGym ? setSetupVisible(true) : setGymSheetVisible(true))}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={activeGym ? `Gym: ${activeGym.name}. Open today's setup.` : "No gym set — tap to add one"}
      >
        <MapPin size={13} color={colors.brand} />
        <Text style={styles.ctxChipText} numberOfLines={1}>
          {activeGym ? activeGym.name : "No gym set"}
        </Text>
        <ChevronDown size={13} color={colors.textMuted} />
      </TouchableOpacity>
      {checkin && (
        <>
          <TouchableOpacity style={styles.ctxChip} onPress={() => setSetupVisible(true)}
            activeOpacity={0.7} accessibilityRole="button"
            accessibilityLabel={`Energy ${checkin.energy} of 10. Open today's setup.`}>
            <Zap size={13} color={colors.brand} />
            <Text style={styles.ctxChipText}>{checkin.energy}/10</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.ctxChip} onPress={() => setSetupVisible(true)}
            activeOpacity={0.7} accessibilityRole="button"
            accessibilityLabel={`${checkin.minutesAvailable} minutes available. Open today's setup.`}>
            <Clock size={13} color={colors.brand} />
            <Text style={styles.ctxChipText}>{checkin.minutesAvailable} min</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.ctxChip, soreCount > 0 && styles.ctxChipSore]}
            onPress={() => setSetupVisible(true)}
            activeOpacity={0.7} accessibilityRole="button"
            accessibilityLabel={
              soreCount > 0
                ? `${soreCount} sore ${soreCount === 1 ? "region" : "regions"}. Open today's setup.`
                : "Nothing sore. Open today's setup."
            }>
            <Text style={[styles.ctxChipText, soreCount > 0 && styles.ctxChipSoreText]}>
              {soreCount > 0 ? `${soreCount} sore` : "not sore"}
            </Text>
          </TouchableOpacity>
        </>
      )}
    </View>
  );

  return (
    <View style={styles.container}>
      {/* Every recompute keeps the plan on screen, so this is the only thing
          that says one is happening — and iOS never draws RefreshControl's
          own spinner, so the app draws this one. Covers the pull as well as
          the setup save, the gym switch, the adjusts and the reroll, all of
          which reload the day without a gesture. */}
      <RefreshIndicator visible={refreshing || (loading && session !== null)} />
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh}
            tintColor={colors.brand} colors={[colors.brand]} />
        }
      >
        {contextBar}

        {/* The session branch comes before the error branch on purpose. The
            hook keeps the day it last read, so a failed refresh still has a
            good plan in hand — showing "couldn't build" instead of that plan
            would throw away the day over a blip. An error with nothing behind
            it still takes the screen. */}
        {loading && !session ? (
          <View style={styles.center}><ActivityIndicator size="large" color={colors.brand} /></View>
        ) : !session ? (
          error ? (
            <View style={styles.center}>
              <Text style={styles.emptyTitle}>Couldn't build today's session</Text>
              <Text style={styles.emptyText}>{error.message}</Text>
            </View>
          ) : !checkin ? (
            <View style={styles.center}>
              <Sparkles size={32} color={colors.brand} />
              <Text style={styles.emptyTitle}>Set up today's session</Text>
              <Text style={styles.emptyText}>
                Ten seconds: gym, energy, time, and anything sore.
              </Text>
              <TouchableOpacity style={styles.button} onPress={() => setSetupVisible(true)}>
                <Text style={styles.buttonText}>Set up my day</Text>
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
                {overrodeRecovery && (
                  <Text style={styles.overrideBadge}>Recovery overridden</Text>
                )}
              </View>
              {/* The model's one sentence about the day, when it gave one;
                  the derived notes stand in when it didn't. */}
              {session.dayReason && !served && (
                <Text style={styles.dayReason}>{session.dayReason}</Text>
              )}
              {!session.dayReason && dayShape === "recovery" && (
                <Text style={styles.recoveryNote}>
                  You're beat up — mobility and stretching only today, on purpose.
                </Text>
              )}
              {/* Not a recovery day: you said you felt fine, and the catalog
                  had nothing that fits. Saying "you're beat up" here was the
                  app inventing a reason it doesn't have. */}
              {!session.dayReason && dayShape === "thin" && (
                <Text style={styles.thinNote}>
                  Nothing in your catalog fits a main workout
                  {checkin ? ` in ${checkin.minutesAvailable} minutes` : " today"} — this is
                  support work only. Capture a shorter workout to fill the main block.
                </Text>
              )}
              {canEdit && blocks.length > 0 && (
                <TouchableOpacity
                  style={styles.adjustDayChip}
                  onPress={() => setAdjustScope("day")}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel="Tell the recommender what to change about today"
                >
                  <Sparkles size={14} color={colors.brand} />
                  <Text style={styles.adjustDayText}>Adjust day</Text>
                </TouchableOpacity>
              )}
              {/* A workout served whole was not composed against your time or
                  soreness, so neither number describes it. */}
              {served && (
                <Text style={styles.servedMeta}>
                  {formatWorkoutHeadline(served.items.length, served.rounds)}
                </Text>
              )}
            </View>

            {!served && checkin && blocks.length > 0 && (
              <SessionBudgetBar blocks={blocks} minutesAvailable={checkin.minutesAvailable} />
            )}
            {!served && checkin && blocks.length === 0 && plannedMinutes > 0 && (
              <Text
                style={
                  plannedMinutes > checkin.minutesAvailable
                    ? styles.plannedTotalLong
                    : styles.plannedTotal
                }
              >
                ≈{plannedMinutes} min planned of {checkin.minutesAvailable}
                {plannedMinutes > checkin.minutesAvailable ? " — runs long" : ""}
              </Text>
            )}

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
                      onPress={() => openExercise(item.exerciseId)}
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
                      <ChevronRight size={18} color={colors.textMuted} />
                    </TouchableOpacity>
                  );
                })
              : blocks.length > 0
                ? blocks.map((block) => (
                    <BlockCard
                      key={block.id}
                      block={block}
                      // Items are stored under the SECTION the block explodes
                      // into, never under the block's own name — conditioning
                      // logs as `accessory`, and the map is what keeps the two
                      // vocabularies from crossing.
                      items={session.items.filter(
                        (i) => i.section === SECTION_FOR_BLOCK[block.block],
                      )}
                      hero={block.block === "main"}
                      canEdit={canEdit === true}
                      busy={rerollBusy}
                      rerolling={rerolling === block.block}
                      rerollNote={canEdit === true && rerollNote === block.block}
                      expanded={expanded[block.block] === true}
                      onToggleExpand={() =>
                        setExpanded((e) => ({ ...e, [block.block]: !e[block.block] }))
                      }
                      onOpenWorkout={() => block.workoutId && openWorkout(block.workoutId)}
                      onOpenExercise={openExercise}
                      onToggleLock={() => toggleLock(block.id, block.locked)}
                      onAdjust={() => setAdjustScope(block.block)}
                      onReroll={() => reroll(block.block)}
                      onToggleDismissed={() => toggleDismissed(block.id, block.dismissed)}
                      nudge={block.builtinKey !== null ? gapNudge(block.builtinKey) : null}
                    />
                  ))
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
                      onPress={() => openExercise(item.exerciseId)}
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
                      <ChevronRight size={18} color={colors.textMuted} />
                    </TouchableOpacity>
                  ))}
                </View>
              );
            })}

            {/* The write is silent about its own failure, so this reads the
                day that came back instead: still unfinished means it didn't
                land, and the button below is still there to try again. */}
            {doneAttempted && !loading && session.status !== "completed" && (
              <View style={styles.errorBanner}>
                <Text style={styles.errorBannerText}>
                  Couldn't mark today done — check your connection and try again.
                </Text>
              </View>
            )}

            {/* End of the scroll, never pinned — house rule. */}
            {session.status !== "completed" && (
              nothingToLog ? (
                <TouchableOpacity
                  style={styles.startButton}
                  onPress={markDone}
                  disabled={markingDone}
                  activeOpacity={0.8}
                  accessibilityRole="button"
                  accessibilityLabel="Mark today's session done"
                  accessibilityState={{ disabled: markingDone, busy: markingDone }}
                >
                  {markingDone
                    ? <ActivityIndicator size="small" color={colors.onBrand} />
                    : <Check size={18} color={colors.onBrand} />}
                  <Text style={styles.buttonText}>Mark today done</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity style={styles.startButton} onPress={startSession} activeOpacity={0.8}>
                  <Play size={18} color={colors.onBrand} />
                  <Text style={styles.buttonText}>
                    {session.workoutInstanceId ? "Continue session" : "Start session"}
                  </Text>
                </TouchableOpacity>
              )
            )}

            {/* The way out of a recovery day — and the way back. The recompose
                is soreness-aware: the shortlists still steer around what made
                the engine call recovery in the first place. */}
            {canEdit && dayShape === "recovery" && checkin && !overrodeRecovery && (
              <View style={styles.overrideWrap}>
                <TouchableOpacity
                  style={styles.secondaryButton}
                  onPress={() => overrideRecoveryDay(true)}
                  disabled={togglingOverride}
                  activeOpacity={0.8}
                  accessibilityRole="button"
                  accessibilityLabel="Skip the recovery day and build a real session"
                  accessibilityState={{ disabled: togglingOverride, busy: togglingOverride }}
                >
                  {togglingOverride
                    ? <ActivityIndicator size="small" color={colors.text} />
                    : <Dumbbell size={16} color={colors.text} />}
                  <Text style={styles.secondaryButtonText}>Train anyway — make it a real day</Text>
                </TouchableOpacity>
                <Text style={styles.overrideCaption}>
                  Rebuilds a full session that still avoids your sore areas.
                </Text>
              </View>
            )}
            {canEdit && overrodeRecovery && (
              <TouchableOpacity
                style={styles.overrideUndo}
                onPress={() => overrideRecoveryDay(false)}
                disabled={togglingOverride}
                accessibilityRole="button"
                accessibilityLabel="Go back to the recovery day"
              >
                <Text style={styles.overrideUndoText}>Back to the recovery day</Text>
              </TouchableOpacity>
            )}

            {/* A finished day: the debrief closes today's loop, and a second
                session opens another. End of the scroll, not pinned. */}
            {session.status === "completed" && !loading && (
              <View style={styles.anotherWrap}>
                {hasDebrief === false && (
                  <TouchableOpacity
                    style={styles.debriefCard}
                    onPress={() => setDebriefVisible(true)}
                    activeOpacity={0.7}
                    accessibilityRole="button"
                    accessibilityLabel="Log how the session landed"
                  >
                    <Text style={styles.debriefCardTitle}>How did it land?</Text>
                    <Text style={styles.debriefCardText}>
                      One tap shapes tomorrow's session.
                    </Text>
                  </TouchableOpacity>
                )}
                <Text style={styles.anotherCaption}>
                  Today's session is in the books. Going again? The next one
                  works around what you already hit.
                </Text>
                <TouchableOpacity
                  style={styles.anotherButton}
                  onPress={composeAnother}
                  activeOpacity={0.8}
                  accessibilityRole="button"
                  accessibilityLabel="Build another session for today"
                >
                  <Sparkles size={18} color={colors.onBrand} />
                  <Text style={styles.buttonText}>Build another session</Text>
                </TouchableOpacity>
              </View>
            )}
          </>
        )}
      </ScrollView>

      <GymSheet visible={gymSheetVisible} gyms={gyms}
        onClose={() => setGymSheetVisible(false)}
        onChanged={() => { setGymSheetVisible(false); bump(); }} />
      <SetupSheet visible={setupVisible} existing={checkin} gyms={gyms}
        onClose={() => setSetupVisible(false)}
        onSaved={() => { setSetupVisible(false); bump(); }}
        onManageGyms={() => { setSetupVisible(false); setGymSheetVisible(true); }}
        onOpenBody={openBody} />
      <AdjustSheet
        visible={adjustScope !== null}
        scope={adjustScope === "day" ? null : adjustScope}
        sessionId={session?.id ?? null}
        onClose={() => setAdjustScope(null)}
        onSubmitted={(scope) => {
          setAdjustScope(null);
          setRerollNote(null);
          setDoneAttempted(false);
          // A block-scoped instruction holds the rest of the day still for
          // this one recompose; a day instruction recomposes everything
          // unlocked (the new instruction already moved the signature).
          if (scope !== null) recomposeBlock(scope);
          else setRefreshKey((k) => k + 1);
        }} />
      <DebriefSheet
        visible={debriefVisible}
        sessionId={session?.id ?? null}
        onClose={() => setDebriefVisible(false)}
        onSaved={() => { setDebriefVisible(false); setHasDebrief(true); }} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, paddingBottom: 96 },
  ctxBar: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: spacing.lg },
  ctxChip: {
    flexDirection: "row", alignItems: "center", gap: 5,
    backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border,
    borderRadius: radii.pill, paddingHorizontal: 10, paddingVertical: 6,
    maxWidth: 170,
  },
  ctxChipText: { fontSize: 12.5, color: colors.text, fontWeight: "600" },
  ctxChipSore: { borderColor: tint(colors.warning, 0.5) },
  ctxChipSoreText: { color: colors.warning },
  center: { alignItems: "center", paddingVertical: 48, gap: 8 },
  emptyTitle: { fontSize: 17, fontWeight: "bold", color: colors.text },
  emptyText: { fontSize: 14, color: colors.textMuted, textAlign: "center", lineHeight: 20 },
  button: {
    backgroundColor: colors.brand, borderRadius: radii.control, paddingVertical: 12,
    paddingHorizontal: 28, marginTop: 12,
  },
  buttonText: { color: colors.onBrand, fontSize: 15, fontWeight: "600" },
  sessionHeader: { marginBottom: 4 },
  sessionTitle: { fontSize: 26, fontWeight: "800", color: colors.text, lineHeight: 31 },
  badges: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 6 },
  rampBadge: {
    fontSize: 11, color: colors.warning, borderWidth: 1, borderColor: colors.warning,
    borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2, overflow: "hidden",
  },
  sourceBadge: {
    fontSize: 11, color: colors.textMuted, borderWidth: 1,
    borderColor: colors.border, borderRadius: 10, paddingHorizontal: 8,
    paddingVertical: 2, overflow: "hidden",
  },
  overrideBadge: {
    fontSize: 11, color: colors.warning, borderWidth: 1,
    borderColor: tint(colors.warning, 0.5), borderRadius: 10, paddingHorizontal: 8,
    paddingVertical: 2, overflow: "hidden",
  },
  dayReason: {
    fontSize: 13, color: colors.brand, fontStyle: "italic", lineHeight: 19,
    marginTop: 8,
  },
  recoveryNote: { fontSize: 13, color: colors.textMuted, marginTop: 8, lineHeight: 18 },
  // Amber, like the gap nudges: this one is asking for a capture, not
  // describing a day that went to plan.
  thinNote: { fontSize: 13, color: colors.warning, marginTop: 8, lineHeight: 18 },
  adjustDayChip: {
    flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start",
    borderWidth: 1, borderColor: tint(colors.brand, 0.45), borderRadius: radii.pill,
    paddingHorizontal: 12, paddingVertical: 6, marginTop: 10,
  },
  adjustDayText: { fontSize: 13, color: colors.brand, fontWeight: "600" },
  servedMeta: { fontSize: 13, color: colors.brand, marginTop: 8 },
  servedDescription: {
    fontSize: 14, color: colors.textMuted, lineHeight: 20, marginTop: spacing.sm,
    marginBottom: 4,
  },
  plannedTotal: { fontSize: 13, color: colors.textMuted, marginTop: 4 },
  plannedTotalLong: { fontSize: 13, color: colors.warning, marginTop: 4 },
  errorBanner: {
    backgroundColor: tint(colors.warning, 0.1), borderWidth: 1, borderColor: colors.warning,
    borderRadius: 10, padding: 10, marginBottom: 12,
  },
  errorBannerText: { fontSize: 13, color: colors.warning, lineHeight: 18 },
  section: { marginTop: 16 },
  sectionHeader: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 12, color: colors.textMuted, textTransform: "uppercase",
    letterSpacing: 1,
  },
  sectionMinutes: { fontSize: 12, color: colors.textMuted, letterSpacing: 0.5 },
  itemCard: {
    flexDirection: "row", alignItems: "center", gap: 10,
    backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border,
    borderRadius: 10, padding: 12, marginBottom: 8,
  },
  itemBody: { flex: 1 },
  itemName: { fontSize: 15, fontWeight: "600", color: colors.text },
  itemMeta: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  itemReason: { fontSize: 12, color: colors.brand, marginTop: 6, fontStyle: "italic" },
  startButton: {
    flexDirection: "row", gap: 8, backgroundColor: colors.brand,
    borderRadius: radii.row, paddingVertical: 15, alignItems: "center",
    justifyContent: "center", marginTop: spacing.xl,
  },
  secondaryButton: {
    flexDirection: "row", gap: 8, backgroundColor: colors.surface2,
    borderWidth: 1, borderColor: colors.border, borderRadius: radii.row,
    paddingVertical: 13, alignItems: "center", justifyContent: "center",
  },
  secondaryButtonText: { color: colors.text, ...typography.buttonSm },
  overrideWrap: { marginTop: spacing.md, gap: 8 },
  overrideCaption: {
    fontSize: 11.5, color: colors.textFaint, textAlign: "center",
  },
  overrideUndo: { marginTop: spacing.md, alignItems: "center" },
  overrideUndoText: { fontSize: 13, color: colors.textMuted, textDecorationLine: "underline" },
  debriefCard: {
    backgroundColor: colors.surface, borderWidth: 1, borderColor: tint(colors.brand, 0.4),
    borderRadius: radii.panel, padding: spacing.lg, gap: 2,
  },
  debriefCardTitle: { fontSize: 15, fontWeight: "700", color: colors.text },
  debriefCardText: { fontSize: 12.5, color: colors.textMuted },
  anotherWrap: { marginTop: 24, gap: 10 },
  anotherCaption: {
    fontSize: 13, color: colors.textMuted, textAlign: "center",
    lineHeight: 18,
  },
  anotherButton: {
    flexDirection: "row", gap: 8, backgroundColor: colors.brand,
    borderRadius: radii.row, paddingVertical: 14, alignItems: "center",
    justifyContent: "center",
  },
});
