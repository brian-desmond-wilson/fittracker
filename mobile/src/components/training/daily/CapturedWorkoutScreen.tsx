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
import {
  fetchCapturedWorkout,
  replaceCapturedWorkoutItems,
  summarizeCaption,
  updateCapturedWorkout,
} from "@/src/lib/supabase/capture";
import { formatWorkoutHeadline, formatWorkoutItem } from "@/src/lib/workoutFormat";
import { ExerciseSearchModal } from "@/src/components/training/program-detail/workout-wizard/ExerciseSearchModal";
import type { CapturedWorkoutEntry, CapturedWorkoutItemEntry } from "@/src/types/capture";

/** The form's copy of the workout. Editing works on this, so backing out of
 *  edit mode discards without touching what is on screen underneath. */
interface Draft {
  name: string;
  rounds: string;
  notes: string;
  description: string;
  items: CapturedWorkoutItemEntry[];
}

const draftFrom = (w: CapturedWorkoutEntry): Draft => ({
  name: w.name,
  rounds: w.rounds ?? "",
  notes: w.notes ?? "",
  description: w.description ?? "",
  items: w.items.map((i) => ({ ...i })),
});

const blank = (v: string): string | null => (v.trim() === "" ? null : v.trim());

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
      if (!id) return;
      fetchCapturedWorkout(id).then((w) => {
        if (!alive) return;
        setWorkout(w);
        setLoading(false);
      });
      return () => {
        alive = false;
      };
    }, [id, editing]),
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

  const save = async () => {
    if (!draft || !workout) return;
    if (draft.name.trim() === "") {
      Alert.alert("Name it first", "A workout needs a name to be findable later.");
      return;
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
    setSaving(false);

    if (!wroteWorkout || !wroteItems) {
      // The draft is kept so nothing typed is lost to a failed write.
      Alert.alert("Couldn't save", "Your changes are still here. Try again.");
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
  const start = async () => {
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
      router.push({ pathname: `/workout/${sessionId}`, params: { mode: "daily" } });
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
          disabled={saving}
          activeOpacity={0.7}
          style={styles.headerRight}
        >
          <Text style={[styles.headerAction, saving && styles.headerActionMuted]}>
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
              onPress={start}
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
});
