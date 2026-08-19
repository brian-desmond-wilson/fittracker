import React, { useCallback, useState } from "react";
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView, Linking, Image,
  ActivityIndicator, StatusBar, TextInput, Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useFocusEffect, router } from "expo-router";
import {
  ChevronLeft, ChevronRight, ChevronUp, ChevronDown, ExternalLink, Play, Plus,
  Trash2,
} from "lucide-react-native";
import { colors } from "@/src/lib/colors";
import { supabase } from "@/src/lib/supabase";
import { adoptCapturedWorkout, fetchDayStatus } from "@/src/lib/supabase/daily";
import { getLocalDateString } from "@/src/components/workout-session/helpers";
import { StartModeSheet } from "@/src/components/workout-session/StartModeSheet";
import type { SessionMode } from "@/src/components/workout-session/StartModeSheet";
import {
  fetchCapturedWorkout,
  replaceCapturedWorkoutItems,
  summarizeCaption,
  updateCapturedWorkout,
} from "@/src/lib/supabase/capture";
import { formatWorkoutHeadline, formatWorkoutItem } from "@/src/lib/workoutFormat";
import { sanitizeInteger } from "@/src/lib/numericInput";
import { ExerciseSearchModal } from "@/src/components/training/program-detail/workout-wizard/ExerciseSearchModal";
import {
  classifyWorkout,
  fetchMuscleRegionNames,
  saveWorkoutTags,
} from "@/src/lib/supabase/workoutTags";
import type { BlockRole, WorkoutIntensity } from "@/src/types/dailyBlocks";
import type { CapturedWorkoutEntry, CapturedWorkoutItemEntry } from "@/src/types/capture";

const BLOCK_ROLES: BlockRole[] = [
  "warmup", "mobility", "main", "conditioning", "cooldown",
];
const INTENSITIES: WorkoutIntensity[] = ["low", "moderate", "high"];

/** The captured_workouts.est_minutes CHECK, mirrored so a rejected number is
 *  named on screen rather than lost to a failed write. */
const MAX_EST_MINUTES = 240;

/** The form's copy of the workout. Editing works on this, so backing out of
 *  edit mode discards without touching what is on screen underneath. */
interface Draft {
  name: string;
  rounds: string;
  notes: string;
  description: string;
  items: CapturedWorkoutItemEntry[];
  // Recommender tags. Muscles and skill level are deliberately absent: they
  // are the classifier's to assign, and the save passes the workout's own
  // through untouched, so nothing here can clear them.
  blockRoles: BlockRole[];
  /** Text, because it is a TextInput. Parsed and range-checked in `save`. */
  estMinutes: string;
  intensity: WorkoutIntensity | null;
}

const draftFrom = (w: CapturedWorkoutEntry): Draft => ({
  name: w.name,
  rounds: w.rounds ?? "",
  notes: w.notes ?? "",
  description: w.description ?? "",
  items: w.items.map((i) => ({ ...i })),
  blockRoles: [...w.tags.blockRoles],
  estMinutes: w.tags.estMinutes === null ? "" : String(w.tags.estMinutes),
  intensity: w.tags.intensity,
});

/** What still keeps a classified workout out of every session. The classifier
 *  degrades a missing duration to null rather than rejecting the answer,
 *  precisely because this screen can repair it (workoutTagValidate's header) —
 *  so the gap has to be visible here or it is visible nowhere. */
const tagGaps = (w: CapturedWorkoutEntry): string[] => {
  const gaps: string[] = [];
  if (w.tags.blockRoles.length === 0) gaps.push("a block to serve");
  // fitToEnvelope returns null without one, which drops the workout from
  // every shortlist while the screen still reads "tagged".
  if (w.tags.estMinutes === null) gaps.push("an estimated duration");
  // The soreness gate reads primaries only, so a workout without one can
  // never be held back on a sore day. Not fixable here — only the classifier
  // assigns muscles.
  if (!w.tags.muscles.some((m) => m.isPrimary)) gaps.push("a primary muscle");
  return gaps;
};

const blank = (v: string): string | null => (v.trim() === "" ? null : v.trim());

/** "a and b", "a, b and c" — the gaps read as a sentence, not a bullet list. */
const listPhrase = (parts: string[]): string =>
  parts.length <= 1
    ? parts.join("")
    : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;

export function CapturedWorkoutScreen() {
  // A pushed screen carries an id, not the row — it loads its own copy, so a
  // stale list can't put stale numbers on screen.
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const [workout, setWorkout] = useState<CapturedWorkoutEntry | null>(null);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [starting, setStarting] = useState(false);
  const [tagging, setTagging] = useState(false);
  const [modeSheetOpen, setModeSheetOpen] = useState(false);

  const editing = draft !== null;

  const load = useCallback(() => {
    if (!id) return;
    return fetchCapturedWorkout(id).then((w) => {
      setWorkout(w);
      setLoading(false);
      return w;
    });
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      // Re-reading on focus would throw away half-typed edits when the
      // exercise picker closes, so a session in progress owns the screen.
      if (editing) return;
      // Same reason, other cause: backgrounding mid-classification refires
      // this on resume, and that read would be racing the one the classify
      // does when it lands. Held until it finishes — then this re-runs, and
      // the row it reads is the tagged one.
      if (tagging) return;
      if (!id) return;
      fetchCapturedWorkout(id).then((w) => {
        if (!alive) return;
        setWorkout(w);
        setLoading(false);
      });
      return () => {
        alive = false;
      };
    }, [id, editing, tagging]),
  );

  const startEditing = () => workout && setDraft(draftFrom(workout));

  const cancelEditing = () => setDraft(null);

  const patch = (fields: Partial<Draft>) =>
    setDraft((d) => (d ? { ...d, ...fields } : d));

  const patchItem = (index: number, fields: Partial<CapturedWorkoutItemEntry>) =>
    setDraft((d) =>
      d
        ? { ...d, items: d.items.map((it, i) => (i === index ? { ...it, ...fields } : it)) }
        : d,
    );

  const moveItem = (index: number, by: -1 | 1) =>
    setDraft((d) => {
      if (!d) return d;
      const to = index + by;
      if (to < 0 || to >= d.items.length) return d;
      const items = [...d.items];
      [items[index], items[to]] = [items[to], items[index]];
      return { ...d, items };
    });

  const removeItem = (index: number) =>
    setDraft((d) => (d ? { ...d, items: d.items.filter((_, i) => i !== index) } : d));

  const addExercise = (exercise: { id: string; name: string }) => {
    setPickerOpen(false);
    setDraft((d) =>
      d
        ? {
            ...d,
            items: [
              ...d.items,
              {
                exerciseId: exercise.id,
                name: exercise.name,
                sets: null, reps: null, weight: null,
                duration: null, restSeconds: null, notes: null,
              },
            ],
          }
        : d,
    );
  };

  const suggestDescription = async () => {
    if (!workout?.source?.captionText) return;
    setSuggesting(true);
    const summary = await summarizeCaption(
      workout.source.captionText,
      workout.source.posterHandle,
    );
    setSuggesting(false);
    if (!summary) {
      Alert.alert("Couldn't write one", "Try again, or write the description yourself.");
      return;
    }
    patch({ description: summary });
  };

  /** Ask the classifier for this workout's tags, then re-read the row.
   *
   *  Only offered in view mode, and Edit is held shut while it runs, so it can
   *  never land a fresh row underneath a draft that was seeded from the stale
   *  one. Backgrounding mid-call costs nothing: `classifyWorkout` saves the
   *  tags itself, so the durable half is already done, and the focus re-read
   *  on resume shows them whether or not this continuation survived. */
  const tagForRecommender = async () => {
    if (!workout || tagging) return;
    setTagging(true);
    try {
      // [] on a failed read; classifyWorkout refuses that without spending a
      // request, since the model cannot name a muscle it wasn't given.
      const names = await fetchMuscleRegionNames();
      const tags = await classifyWorkout(workout, names);
      if (!tags) {
        Alert.alert(
          "Couldn't tag it",
          "The classifier didn't come back with anything usable. Try again in a moment.",
        );
        return;
      }
      await load();
    } finally {
      setTagging(false);
    }
  };

  const save = async () => {
    if (!draft || !workout) return;
    if (draft.name.trim() === "") {
      Alert.alert("Name it first", "A workout needs a name to be findable later.");
      return;
    }

    // ---- Tags. Written only when they actually changed: an untouched save
    // must not restamp classified_at, and an unclassified workout's empty tag
    // fields must not be mistaken for an attempt to tag it by hand.
    // Digits or empty — sanitizeInteger guarantees it on the way in. Empty is
    // a deliberate "no estimate", which the recommender reads as "can't fit
    // this into a block"; out of range is a typo and is refused below.
    const typedEst = draft.estMinutes.trim();
    const est = typedEst === "" ? null : Number(typedEst);
    const estOk =
      est === null || (Number.isInteger(est) && est >= 1 && est <= MAX_EST_MINUTES);
    const rolesChanged =
      draft.blockRoles.length !== workout.tags.blockRoles.length ||
      draft.blockRoles.some((r) => !workout.tags.blockRoles.includes(r));
    const tagsChanged =
      rolesChanged ||
      est !== workout.tags.estMinutes ||
      draft.intensity !== workout.tags.intensity;

    if (tagsChanged) {
      // Refused, never coerced. parseInt would read "35kg" as 35 and "abc" as
      // NaN, and the plan's fallback turned every one of those — plus 0 and
      // 999 — into null, silently deleting the one number that decides whether
      // this workout can be fitted into a block at all.
      if (!estOk) {
        Alert.alert(
          "Check the minutes",
          `Give a whole number of minutes between 1 and ${MAX_EST_MINUTES}, or leave it empty.`,
        );
        return;
      }
      // Both of these are also refused by saveWorkoutTags, which writes
      // nothing and returns false — indistinguishable there from a network
      // failure. Catching them here is what lets a false below mean "the write
      // failed" and nothing else.
      if (draft.blockRoles.length === 0) {
        Alert.alert(
          "Pick at least one block",
          "A workout that serves no block is never offered — the recommender has nowhere to put it.",
        );
        return;
      }
      // Not repairable here: muscles come from the classifier, and one with no
      // primary is permanently immune to the soreness gate.
      if (!workout.tags.muscles.some((m) => m.isPrimary)) {
        Alert.alert(
          "Needs classifying first",
          "This workout has no muscles on it, so the recommender can't hold it back on a sore day. Cancel, then use “Tag for the recommender”.",
        );
        return;
      }
    }

    setSaving(true);
    const wroteWorkout = await updateCapturedWorkout(workout.workoutId, {
      name: draft.name.trim(),
      rounds: blank(draft.rounds),
      description: blank(draft.description),
      notes: blank(draft.notes),
    });
    const wroteItems = await replaceCapturedWorkoutItems(
      workout.workoutId,
      draft.items.map((i) => ({
        exerciseId: i.exerciseId,
        sets: i.sets,
        reps: i.reps,
        weight: i.weight,
        duration: i.duration,
        restSeconds: i.restSeconds,
        notes: i.notes,
      })),
    );
    // Stop before the stamp. These two report failure by returning false
    // rather than throwing, so without this the tag write would run anyway and
    // land classified_at with the new roles on top of the OLD movement list —
    // the exact state the ordering below exists to prevent. The draft is kept,
    // all three writes are idempotent, so a retry converges.
    if (!wroteWorkout || !wroteItems) {
      setSaving(false);
      Alert.alert("Couldn't save", "Your changes are still here. Try again.");
      return;
    }

    // Last, deliberately — the same ordering saveWorkoutTags argues for
    // internally. This write carries classified_at, the stamp that makes a
    // workout visible to the recommender, so it goes after the writes that
    // change what the workout IS. A failure here leaves the tags stale or
    // absent, which costs the workout a day in the shortlist; the other order
    // would stamp a workout as freshly classified while the movements those
    // tags describe never landed.
    //
    // A false is very nearly always a failed write: the two refusals — no
    // block role, no muscles — are ruled out above. It can also mean no muscle
    // name on the workout still matches a region row, which needs one renamed
    // or deleted between the load and this save. "Try again" cannot clear that
    // one, hence the second sentence in the alert.
    const wroteTags =
      !tagsChanged ||
      (await saveWorkoutTags(workout.workoutId, {
        blockRoles: draft.blockRoles,
        // Straight through: this screen never edits muscles or skill level.
        muscles: workout.tags.muscles,
        skillLevel: workout.tags.skillLevel,
        estMinutes: est,
        intensity: draft.intensity,
      }));
    setSaving(false);

    if (!wroteTags) {
      // The workout itself did save; only the tags didn't. Said plainly, so
      // backing out now is a known trade rather than a silent one.
      Alert.alert(
        "Saved, but not the tags",
        "The workout is updated. Its recommender tags aren't — try saving again, or re-tag it if that keeps failing.",
      );
      return;
    }
    setDraft(null);
    await load();
  };

  /** Two buttons, resolved to the user's answer. */
  const confirm = (title: string, message: string, go: string): Promise<boolean> =>
    new Promise((resolve) => {
      Alert.alert(title, message, [
        { text: "Cancel", style: "cancel", onPress: () => resolve(false) },
        { text: go, onPress: () => resolve(true) },
      ]);
    });

  // Adopts this workout as today's session and hands off to the logging screen
  // the Today tab uses — from there it IS a daily session, so acceptance,
  // completion and the performed backfill all work unchanged.
  const start = async (recordMode: SessionMode, startedAtMs: number) => {
    if (!workout || starting) return;
    setStarting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        Alert.alert("Not signed in", "Sign in to start a workout.");
        return;
      }
      const today = getLocalDateString(); // one clock sample
      const day = await fetchDayStatus(user.id, today);

      // No check-in gate: you have overridden the recommendation by choosing
      // this, so there is nothing left for a check-in to shape.
      if (day.inProgress) {
        const ok = await confirm(
          "Start this instead?",
          "You're partway through today's session. It'll be set aside — what you've already logged is kept.",
          "Start this",
        );
        if (!ok) return;
      } else if (day.hasCompleted && !day.hasPending) {
        const ok = await confirm(
          "Start this as well?",
          "You've already trained today. This will be a second session.",
          "Start it",
        );
        if (!ok) return;
      }

      const sessionId = await adoptCapturedWorkout({
        userId: user.id,
        capturedWorkoutId: workout.workoutId,
        date: today,
      });
      if (!sessionId) {
        Alert.alert("Couldn't start it", "Something went wrong setting up the session. Try again.");
        return;
      }
      router.push({
        pathname: `/workout/${sessionId}`,
        params: {
          mode: "daily",
          recordMode,
          startedAtMs: String(startedAtMs),
        },
      });
    } finally {
      setStarting(false);
    }
  };

  const header = (
    <View style={styles.header}>
      <TouchableOpacity
        onPress={() => (editing ? cancelEditing() : router.back())}
        style={styles.backButton}
        activeOpacity={0.7}
      >
        {editing ? (
          <Text style={styles.headerAction}>Cancel</Text>
        ) : (
          <ChevronLeft size={24} color={colors.foreground} />
        )}
      </TouchableOpacity>
      {workout && (
        <TouchableOpacity
          onPress={editing ? save : startEditing}
          // Shut while a classification is in flight: a draft seeded from the
          // pre-classify row would be saved back over the tags it just wrote.
          disabled={saving || tagging}
          activeOpacity={0.7}
          style={styles.headerRight}
        >
          <Text
            style={[styles.headerAction, (saving || tagging) && styles.headerActionMuted]}
          >
            {editing ? (saving ? "Saving…" : "Save") : "Edit"}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );

  if (loading) {
    return (
      <>
        <StatusBar barStyle="light-content" />
        <View style={[styles.container, { paddingTop: insets.top }]}>
          {header}
          <View style={styles.center}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        </View>
      </>
    );
  }

  if (!workout) {
    return (
      <>
        <StatusBar barStyle="light-content" />
        <View style={[styles.container, { paddingTop: insets.top }]}>
          {header}
          <View style={styles.center}>
            <Text style={styles.missing}>That workout is no longer in your catalog.</Text>
          </View>
        </View>
      </>
    );
  }

  const shownItems = draft ? draft.items : workout.items;
  const shownRounds = draft ? blank(draft.rounds) : workout.rounds;
  const shownDescription = draft ? draft.description : workout.description ?? "";
  const shownNotes = draft ? draft.notes : workout.notes ?? "";

  // Read off the loaded row, never the draft: "has this been classified" and
  // "which muscles are on it" are the classifier's answers, and the draft
  // holds neither.
  const classified = workout.tags.classifiedAt !== null;
  const primaryMuscles = workout.tags.muscles.filter((m) => m.isPrimary).map((m) => m.name);
  const secondaryMuscles = workout.tags.muscles.filter((m) => !m.isPrimary).map((m) => m.name);
  const gaps = tagGaps(workout);

  return (
    <>
      <StatusBar barStyle="light-content" />
      <View style={[styles.container, { paddingTop: insets.top }]}>
        {header}
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          {editing ? (
            <TextInput
              style={[styles.title, styles.titleInput]}
              value={draft!.name}
              onChangeText={(name) => patch({ name })}
              placeholder="Workout name"
              placeholderTextColor={colors.mutedForeground}
            />
          ) : (
            <Text style={styles.title}>{workout.name}</Text>
          )}
          <Text style={styles.headline}>
            {formatWorkoutHeadline(shownItems.length, shownRounds)}
          </Text>

          {workout.source?.thumbnailUrl && (
            <Image source={{ uri: workout.source.thumbnailUrl }} style={styles.hero} />
          )}

          {/* What this workout IS, in a sentence — written at capture from
              the post, not lifted out of it. The caption itself is one tap
              away on the source link, and its prescription lines are already
              below as the protocol; repeating either here would just be the
              same words twice. */}
          {editing ? (
            <>
              <View style={styles.labelRow}>
                <Text style={styles.fieldLabel}>Description</Text>
                {!!workout.source?.captionText && (
                  <TouchableOpacity onPress={suggestDescription} disabled={suggesting}>
                    <Text style={[styles.suggest, suggesting && styles.headerActionMuted]}>
                      {suggesting ? "Writing…" : "Suggest from the post"}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
              <TextInput
                style={[styles.input, styles.multiline]}
                value={draft!.description}
                onChangeText={(description) => patch({ description })}
                multiline
                placeholder="What this workout is, in a sentence"
                placeholderTextColor={colors.mutedForeground}
              />
            </>
          ) : (
            shownDescription !== "" && (
              <Text style={styles.description}>{shownDescription}</Text>
            )
          )}

          {/* What the recommender knows about this workout. Four states: the
              summary when it is tagged, the classify action when it is not,
              the editor while editing a tagged one, and a pointer back to the
              action while editing an untagged one — you cannot hand-tag a
              workout the classifier has never seen, because the muscles the
              soreness gate reads only ever come from it. */}
          {!editing && classified && (
            <View style={styles.tagBlock}>
              <Text style={styles.tagSummary}>
                {[
                  workout.tags.blockRoles.join(" · "),
                  workout.tags.estMinutes === null
                    ? null
                    : `~${workout.tags.estMinutes} min`,
                  workout.tags.intensity,
                  workout.tags.skillLevel,
                ]
                  .filter(Boolean)
                  .join("   ·   ")}
              </Text>
              {primaryMuscles.length > 0 && (
                <Text style={styles.tagMuscles}>
                  Hits {primaryMuscles.join(", ")}
                  {secondaryMuscles.length > 0 && ` (also ${secondaryMuscles.join(", ")})`}
                </Text>
              )}
              {gaps.length > 0 && (
                <Text style={styles.tagGap}>
                  Not offered in a session yet — it still needs {listPhrase(gaps)}.
                </Text>
              )}
            </View>
          )}

          {!editing && !classified && (
            <TouchableOpacity
              style={styles.tagButton}
              onPress={tagForRecommender}
              disabled={tagging}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Tag this workout for the recommender"
            >
              <Text style={styles.tagButtonText}>
                {tagging ? "Tagging…" : "Tag for the recommender"}
              </Text>
            </TouchableOpacity>
          )}

          {editing && !classified && (
            <Text style={styles.tagHint}>
              Not tagged for the recommender yet. Save or cancel, then use
              “Tag for the recommender” — the muscles it needs are the
              classifier's to assign.
            </Text>
          )}

          {editing && classified && (
            <View style={styles.tagBlock}>
              <Text style={styles.fieldLabel}>Serves as</Text>
              <View style={styles.pillRow}>
                {BLOCK_ROLES.map((role) => {
                  const on = draft!.blockRoles.includes(role);
                  return (
                    <TouchableOpacity
                      key={role}
                      style={[styles.pill, on && styles.pillActive]}
                      onPress={() =>
                        setDraft((d) =>
                          d
                            ? {
                                ...d,
                                blockRoles: on
                                  ? d.blockRoles.filter((r) => r !== role)
                                  : [...d.blockRoles, role],
                              }
                            : d,
                        )
                      }
                      accessibilityRole="button"
                      accessibilityState={{ selected: on }}
                    >
                      <Text style={[styles.pillText, on && styles.pillTextActive]}>
                        {role}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* All the rounds as written, not a midpoint. The fitter trims
                  down from this number — it drops rounds until the workout
                  fits the block, and advertises the trimmed figure — so an
                  estimate that has already been averaged gets shortened a
                  second time and every session runs light. */}
              <Text style={styles.fieldLabel}>
                Estimated minutes (all rounds as written)
              </Text>
              <TextInput
                style={[styles.input, styles.estInput]}
                keyboardType="number-pad"
                value={draft!.estMinutes}
                // keyboardType is only a hint — a paste or a hardware keyboard
                // gets past it. Sanitising as typed means "35kg" becomes 35 in
                // front of you rather than being argued with at save time.
                onChangeText={(v) => patch({ estMinutes: sanitizeInteger(v) })}
                placeholder="e.g. 35"
                placeholderTextColor={colors.mutedForeground}
              />

              <Text style={styles.fieldLabel}>Intensity</Text>
              <View style={styles.pillRow}>
                {INTENSITIES.map((level) => {
                  const on = draft!.intensity === level;
                  return (
                    <TouchableOpacity
                      key={level}
                      style={[styles.pill, on && styles.pillActive]}
                      // Tapping the chosen one clears it: intensity is
                      // nullable, and there is no other way back to null.
                      onPress={() => patch({ intensity: on ? null : level })}
                      accessibilityRole="button"
                      accessibilityState={{ selected: on }}
                    >
                      <Text style={[styles.pillText, on && styles.pillTextActive]}>
                        {level}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {primaryMuscles.length > 0 && (
                <Text style={styles.tagMuscles}>
                  Hits {primaryMuscles.join(", ")}
                  {secondaryMuscles.length > 0 && ` (also ${secondaryMuscles.join(", ")})`}
                  {" — re-tag to change these."}
                </Text>
              )}
            </View>
          )}

          {shownItems.map((item, i) => {
            const prescription = formatWorkoutItem(item);
            if (editing) {
              return (
                <View key={`${item.exerciseId}-${i}`} style={styles.editRow}>
                  <View style={styles.editRowHead}>
                    <Text style={styles.index}>{i + 1}</Text>
                    <Text style={styles.movement} numberOfLines={1}>{item.name}</Text>
                    <TouchableOpacity onPress={() => moveItem(i, -1)} disabled={i === 0}>
                      <ChevronUp
                        size={20}
                        color={i === 0 ? colors.border : colors.mutedForeground}
                      />
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => moveItem(i, 1)}
                      disabled={i === shownItems.length - 1}
                    >
                      <ChevronDown
                        size={20}
                        color={
                          i === shownItems.length - 1 ? colors.border : colors.mutedForeground
                        }
                      />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => removeItem(i)}>
                      <Trash2 size={18} color="#DC2626" />
                    </TouchableOpacity>
                  </View>
                  <View style={styles.fieldRow}>
                    <TextInput
                      style={[styles.input, styles.small]}
                      value={item.sets == null ? "" : String(item.sets)}
                      onChangeText={(v) =>
                        patchItem(i, { sets: v.trim() === "" ? null : parseInt(v, 10) || null })
                      }
                      keyboardType="number-pad"
                      placeholder="sets"
                      placeholderTextColor={colors.mutedForeground}
                    />
                    <TextInput
                      style={[styles.input, styles.grow]}
                      value={item.reps ?? ""}
                      onChangeText={(v) => patchItem(i, { reps: blank(v) })}
                      placeholder="reps (8, 8R/8L, 21-15-9)"
                      placeholderTextColor={colors.mutedForeground}
                    />
                  </View>
                  <View style={styles.fieldRow}>
                    <TextInput
                      style={[styles.input, styles.grow]}
                      value={item.weight ?? ""}
                      onChangeText={(v) => patchItem(i, { weight: blank(v) })}
                      placeholder="weight"
                      placeholderTextColor={colors.mutedForeground}
                    />
                    <TextInput
                      style={[styles.input, styles.grow]}
                      value={item.duration ?? ""}
                      onChangeText={(v) => patchItem(i, { duration: blank(v) })}
                      placeholder="duration"
                      placeholderTextColor={colors.mutedForeground}
                    />
                    <TextInput
                      style={[styles.input, styles.small]}
                      value={item.restSeconds == null ? "" : String(item.restSeconds)}
                      onChangeText={(v) =>
                        patchItem(i, {
                          restSeconds: v.trim() === "" ? null : parseInt(v, 10) || null,
                        })
                      }
                      keyboardType="number-pad"
                      placeholder="rest"
                      placeholderTextColor={colors.mutedForeground}
                    />
                  </View>
                  <TextInput
                    style={[styles.input, styles.grow]}
                    value={item.notes ?? ""}
                    onChangeText={(v) => patchItem(i, { notes: blank(v) })}
                    placeholder="note on this movement"
                    placeholderTextColor={colors.mutedForeground}
                  />
                </View>
              );
            }
            return (
              <TouchableOpacity
                key={`${item.exerciseId}-${i}`}
                style={styles.row}
                activeOpacity={0.7}
                disabled={!item.exerciseId}
                onPress={() =>
                  router.push(`/(tabs)/training/exercise/${item.exerciseId}` as never)
                }
                accessibilityRole="button"
                accessibilityLabel={`${item.name}. Open the exercise.`}
              >
                <Text style={styles.index}>{i + 1}</Text>
                <View style={styles.rowBody}>
                  <Text style={styles.movement}>{item.name}</Text>
                  {/* Silence beats invention: when the creator prescribed
                      nothing, the movement stands on its own. */}
                  {prescription !== "" && (
                    <Text style={styles.prescription}>{prescription}</Text>
                  )}
                  {item.notes && <Text style={styles.notes}>{item.notes}</Text>}
                </View>
                {!!item.exerciseId && (
                  <ChevronRight size={18} color={colors.mutedForeground} />
                )}
              </TouchableOpacity>
            );
          })}

          {editing && (
            <TouchableOpacity
              style={styles.addRow}
              onPress={() => setPickerOpen(true)}
              activeOpacity={0.7}
            >
              <Plus size={18} color={colors.primary} />
              <Text style={styles.addText}>Add a movement</Text>
            </TouchableOpacity>
          )}

          {editing ? (
            <>
              <Text style={styles.fieldLabel}>Rounds</Text>
              <TextInput
                style={styles.input}
                value={draft!.rounds}
                onChangeText={(rounds) => patch({ rounds })}
                placeholder="e.g. 4, or 3-4"
                placeholderTextColor={colors.mutedForeground}
              />
            </>
          ) : (
            shownRounds && (
              <Text style={styles.repeat}>
                Repeat the whole list {shownRounds} times.
              </Text>
            )
          )}

          {editing ? (
            <>
              <Text style={styles.fieldLabel}>Your notes</Text>
              <TextInput
                style={[styles.input, styles.multiline]}
                value={draft!.notes}
                onChangeText={(notes) => patch({ notes })}
                multiline
                placeholder="Anything you want to remember about this one"
                placeholderTextColor={colors.mutedForeground}
              />
            </>
          ) : (
            shownNotes !== "" && (
              <>
                <Text style={styles.sectionLabel}>Your notes</Text>
                <Text style={styles.protocol}>{shownNotes}</Text>
              </>
            )
          )}

          {/* The creator's own prescription lines, verbatim. The description
              above says what the workout is; this says what they wrote, and
              seeing it is how you tell a bad parse from a bad post. */}
          {!editing && workout.rawProtocol && (
            <>
              <Text style={styles.sectionLabel}>As the creator wrote it</Text>
              <Text style={styles.protocol}>{workout.rawProtocol}</Text>
            </>
          )}

          {!editing && workout.source && (
            <TouchableOpacity
              style={styles.sourceRow}
              onPress={() => Linking.openURL(workout.source!.sourceUrl)}
              activeOpacity={0.7}
            >
              <ExternalLink size={15} color={colors.primary} />
              <Text style={styles.sourceText}>
                {workout.source.posterHandle ?? workout.source.platform}
              </Text>
            </TouchableOpacity>
          )}

          {/* The last thing on the page, scrolling with it: you read the
              workout, and starting it is what you do at the end. Not while
              editing — you're changing the workout, not starting it. A workout
              with no movements has nothing to log. */}
          {!editing && shownItems.length > 0 && (
            <TouchableOpacity
              style={styles.startButton}
              onPress={() => setModeSheetOpen(true)}
              disabled={starting}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel={`Start ${workout.name} as today's session`}
            >
              {starting ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Play size={18} color="#FFFFFF" />
              )}
              <Text style={styles.startText}>
                {starting ? "Starting…" : "Start Workout"}
              </Text>
            </TouchableOpacity>
          )}
        </ScrollView>

      </View>

      <ExerciseSearchModal
        visible={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onSelectExercise={addExercise}
      />

      {workout && (
        <StartModeSheet
          visible={modeSheetOpen}
          workoutName={workout.name}
          onStart={(recordMode, startedAtMs) => {
            setModeSheetOpen(false);
            start(recordMode, startedAtMs);
          }}
          onClose={() => setModeSheetOpen(false)}
        />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    paddingHorizontal: 8, paddingVertical: 8,
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
  },
  backButton: { minWidth: 40, height: 40, alignItems: "flex-start", justifyContent: "center", paddingHorizontal: 8 },
  headerRight: { height: 40, justifyContent: "center", paddingHorizontal: 12 },
  headerAction: { fontSize: 16, color: colors.primary, fontWeight: "600" },
  headerActionMuted: { opacity: 0.5 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 40 },
  missing: { fontSize: 15, color: colors.mutedForeground, textAlign: "center" },
  scroll: { paddingHorizontal: 20, paddingBottom: 40 },
  startButton: {
    flexDirection: "row", gap: 8, marginTop: 28,
    backgroundColor: colors.primary, borderRadius: 10, paddingVertical: 14,
    alignItems: "center", justifyContent: "center",
  },
  startText: { color: "#FFFFFF", fontSize: 15, fontWeight: "600" },
  title: { fontSize: 24, fontWeight: "700", color: colors.foreground },
  titleInput: {
    backgroundColor: colors.input, borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 8,
  },
  headline: { fontSize: 14, color: colors.primary, marginTop: 4, marginBottom: 16 },
  hero: { width: "100%", height: 180, borderRadius: 12, marginBottom: 16 },
  description: {
    fontSize: 15, color: colors.foreground, lineHeight: 22, marginBottom: 16,
  },
  fieldLabel: {
    fontSize: 12, color: colors.mutedForeground, marginTop: 16, marginBottom: 6,
    textTransform: "uppercase", letterSpacing: 1,
  },
  labelRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
  },
  suggest: { fontSize: 13, color: colors.primary, marginTop: 16, marginBottom: 6 },
  input: {
    backgroundColor: colors.input, borderRadius: 8, paddingHorizontal: 12,
    paddingVertical: 10, fontSize: 15, color: colors.foreground,
  },
  multiline: { minHeight: 90, textAlignVertical: "top" },
  fieldRow: { flexDirection: "row", gap: 8, marginTop: 8 },
  small: { width: 68 },
  grow: { flex: 1, marginTop: 8 },
  row: { flexDirection: "row", gap: 12, paddingVertical: 10, alignItems: "center" },
  editRow: {
    borderWidth: 1, borderColor: colors.border, borderRadius: 10,
    padding: 12, marginTop: 12,
  },
  editRowHead: { flexDirection: "row", alignItems: "center", gap: 12 },
  index: {
    fontSize: 13, fontWeight: "700", color: colors.mutedForeground,
    width: 20, paddingTop: 2,
  },
  rowBody: { flex: 1 },
  movement: { fontSize: 16, fontWeight: "600", color: colors.foreground, flex: 1 },
  prescription: { fontSize: 14, color: colors.mutedForeground, marginTop: 2 },
  notes: { fontSize: 13, color: colors.mutedForeground, marginTop: 4, fontStyle: "italic" },
  addRow: {
    flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 16,
  },
  addText: { fontSize: 15, color: colors.primary, fontWeight: "600" },
  repeat: {
    fontSize: 14, color: colors.foreground, marginTop: 12, marginBottom: 4,
    fontWeight: "600",
  },
  sectionLabel: {
    fontSize: 12, color: colors.mutedForeground, marginTop: 20, marginBottom: 6,
    textTransform: "uppercase",
  },
  protocol: {
    fontSize: 13, color: colors.mutedForeground, lineHeight: 19,
    backgroundColor: colors.input, borderRadius: 8, padding: 12,
  },
  sourceRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 24 },
  sourceText: { fontSize: 14, color: colors.primary },
  // Recommender tags. The pill family matches CaptureReviewSheet's, the other
  // place in this folder where the same kind of choice is made.
  tagBlock: { marginBottom: 16 },
  tagSummary: { fontSize: 13, color: colors.mutedForeground },
  tagMuscles: { fontSize: 13, color: colors.mutedForeground, marginTop: 4 },
  tagGap: { fontSize: 13, color: colors.destructive, marginTop: 6, lineHeight: 18 },
  tagHint: {
    fontSize: 13, color: colors.mutedForeground, lineHeight: 19, marginTop: 16,
  },
  tagButton: {
    alignSelf: "flex-start", borderWidth: 1, borderColor: colors.primary,
    borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 16,
  },
  tagButtonText: { color: colors.primary, fontSize: 13, fontWeight: "600" },
  pillRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  pill: {
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 14,
    backgroundColor: colors.input, borderWidth: 1, borderColor: colors.border,
  },
  pillActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  pillText: { fontSize: 12, color: colors.mutedForeground },
  pillTextActive: { fontSize: 12, color: colors.primaryForeground, fontWeight: "600" },
  estInput: { alignSelf: "flex-start", minWidth: 100 },
});
