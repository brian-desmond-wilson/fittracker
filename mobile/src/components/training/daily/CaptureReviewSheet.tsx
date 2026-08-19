import React, { useState } from "react";
import {
  Modal, View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, ActivityIndicator,
} from "react-native";
import { X, Link2, Link2Off, Pencil, Info } from "lucide-react-native";
import { colors } from "@/src/lib/colors";
import { supabase } from "@/src/lib/supabase";
import { saveCapture } from "@/src/lib/supabase/capture";
import { draftWorkoutFromExercises, draftWorkoutName } from "@/src/lib/captureReview";
import { formatWorkoutHeadline } from "@/src/lib/workoutFormat";
import type {
  CaptureCategory, CaptureSkillLevel, ExtractedPost, ExtractedWorkoutItem,
  ResolvedPost,
} from "@/src/types/capture";

const CATEGORIES: CaptureCategory[] = [
  "strength", "conditioning", "mobility", "stretching", "warmup", "skill",
];
const LEVELS: CaptureSkillLevel[] = ["Beginner", "Intermediate", "Advanced"];

interface CaptureReviewSheetProps {
  visible: boolean;
  payload: {
    resolved: ResolvedPost;
    sourceUrl: string;
    post: ExtractedPost;
    rawExtraction: unknown;
  } | null;
  /** Name of the matched library exercise per index, for the link chip. */
  matchNames: Map<string, string>;
  onClose: () => void;
  onSaved: () => void;
}

export function CaptureReviewSheet({
  visible, payload, matchNames, onClose, onSaved,
}: CaptureReviewSheetProps) {
  // Editable copy of the extraction. Re-seeded each time a new payload opens.
  const [post, setPost] = useState<ExtractedPost | null>(null);
  const [saving, setSaving] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [seededFor, setSeededFor] = useState<string | null>(null);

  if (visible && payload && seededFor !== payload.sourceUrl) {
    setPost(JSON.parse(JSON.stringify(payload.post)));
    setSeededFor(payload.sourceUrl);
    setErrorText(null);
  }

  if (!payload || !post) {
    return (
      <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
        <View style={styles.container} />
      </Modal>
    );
  }

  const patchExercise = (i: number, patch: Partial<ExtractedPost["exercises"][number]>) => {
    setPost((p) => {
      if (!p) return p;
      const next = { ...p, exercises: [...p.exercises] };
      next.exercises[i] = { ...next.exercises[i], ...patch };
      return next;
    });
  };

  const patchWorkout = (patch: Partial<NonNullable<ExtractedPost["workout"]>>) => {
    setPost((p) => (p?.workout ? { ...p, workout: { ...p.workout, ...patch } } : p));
  };

  /** The override for a post the AI read as exercises-only. Building the
   *  workout here — in the sheet, before anything is written — means the save
   *  path sees an ordinary reviewed workout and needs no special case. */
  const toggleWorkout = () => {
    setPost((p) => {
      if (!p) return p;
      if (p.workout) return { ...p, workout: null, postType: "single_exercise" };
      const workout = draftWorkoutFromExercises(p, draftWorkoutName(payload.resolved.captionText));
      return { ...p, workout, postType: "full_workout" };
    });
  };

  const patchItem = (i: number, patch: Partial<ExtractedWorkoutItem>) => {
    setPost((p) => {
      if (!p?.workout) return p;
      const items = [...p.workout.items];
      items[i] = { ...items[i], ...patch };
      return { ...p, workout: { ...p.workout, items } };
    });
  };

  /** Empty input means "the creator didn't say", which is a real answer here —
   *  it must round-trip to null rather than to 0 or "". */
  const asText = (v: string): string | null => (v.trim() === "" ? null : v.trim());
  const asCount = (v: string): number | null => {
    const n = parseInt(v.replace(/[^0-9]/g, ""), 10);
    return Number.isFinite(n) && n > 0 ? n : null;
  };

  const handleAccept = async () => {
    setSaving(true);
    setErrorText(null);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setErrorText("Not signed in.");
      setSaving(false);
      return;
    }
    const sourceId = await saveCapture({
      userId: user.id,
      sourceUrl: payload.sourceUrl,
      platform: payload.resolved.platform,
      posterHandle: payload.resolved.posterHandle,
      captionText: payload.resolved.captionText,
      thumbnailUrl: payload.resolved.thumbnailUrl,
      rawExtraction: payload.rawExtraction,
      post,
    });
    setSaving(false);
    if (!sourceId) {
      setErrorText("Save failed. Nothing was added — try again.");
      return;
    }
    setSeededFor(null);
    onSaved();
  };

  const close = () => { setSeededFor(null); onClose(); };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={close}>
      <View style={styles.container}>
        <View style={styles.header}>
          <View>
            {/* What the AI found, not what the sheet currently holds — the
                title must not flip while the user works the override below. */}
            <Text style={styles.title}>
              {payload.post.workout
                ? "Workout found"
                : payload.post.exercises.length > 1
                  ? "Exercises found"
                  : "Exercise found"}
            </Text>
            {payload.resolved.posterHandle && (
              <Text style={styles.subtitle}>from {payload.resolved.posterHandle}</Text>
            )}
          </View>
          <TouchableOpacity onPress={close} disabled={saving}>
            <X size={24} color={colors.mutedForeground} />
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.scroll} contentContainerStyle={{ paddingBottom: 24 }}>
          {post.exercises.map((ex, i) => (
            <View key={i} style={styles.card}>
              {/* The name reads as a heading, so without the pencil and the
                  framed field nobody discovers it can be corrected. */}
              <Text style={styles.fieldLabel}>Exercise name</Text>
              <View style={styles.nameRow}>
                <TextInput
                  style={styles.nameInput}
                  value={ex.name}
                  onChangeText={(t) => patchExercise(i, { name: t })}
                  placeholder="Name this exercise"
                  placeholderTextColor={colors.mutedForeground}
                  editable={!ex.libraryMatchId}
                />
                {!ex.libraryMatchId && <Pencil size={15} color={colors.mutedForeground} />}
              </View>

              {ex.libraryMatchId ? (
                // A matched exercise saves AS the library entry, untouched —
                // so nothing about it is editable here. Showing live editors
                // whose values get discarded is a lie; unlinking is the one
                // action that makes edits real.
                <TouchableOpacity
                  style={styles.matchChip}
                  onPress={() => patchExercise(i, { libraryMatchId: null })}
                  activeOpacity={0.7}
                >
                  <Link2 size={14} color={colors.primary} />
                  <Text style={styles.matchText}>
                    Saves as your existing “{matchNames.get(ex.libraryMatchId) ?? "library exercise"}” — tap to create a new entry you can edit
                  </Text>
                </TouchableOpacity>
              ) : (
                <View style={styles.newChip}>
                  <Link2Off size={14} color={colors.mutedForeground} />
                  <Text style={styles.newText}>New library entry</Text>
                </View>
              )}

              {!ex.libraryMatchId && (<>
              <Text style={styles.fieldLabel}>Category</Text>
              <View style={styles.pillRow}>
                {CATEGORIES.map((c) => (
                  <TouchableOpacity
                    key={c}
                    style={[styles.pill, ex.category === c && styles.pillActive]}
                    onPress={() => patchExercise(i, { category: c })}
                  >
                    <Text style={[styles.pillText, ex.category === c && styles.pillTextActive]}>{c}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.fieldLabel}>Skill level</Text>
              <View style={styles.pillRow}>
                {LEVELS.map((l) => (
                  <TouchableOpacity
                    key={l}
                    style={[styles.pill, ex.skillLevel === l && styles.pillActive]}
                    onPress={() => patchExercise(i, { skillLevel: l })}
                  >
                    <Text style={[styles.pillText, ex.skillLevel === l && styles.pillTextActive]}>{l}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {(ex.primaryMuscles.length > 0 || ex.secondaryMuscles.length > 0) && (
                <>
                  <Text style={styles.fieldLabel}>Muscles (tap to remove)</Text>
                  <View style={styles.pillRow}>
                    {ex.primaryMuscles.map((m) => (
                      <TouchableOpacity
                        key={`p-${m}`}
                        style={[styles.pill, styles.pillActive]}
                        onPress={() =>
                          patchExercise(i, { primaryMuscles: ex.primaryMuscles.filter((x) => x !== m) })
                        }
                      >
                        <Text style={styles.pillTextActive}>{m}</Text>
                      </TouchableOpacity>
                    ))}
                    {ex.secondaryMuscles.map((m) => (
                      <TouchableOpacity
                        key={`s-${m}`}
                        style={styles.pill}
                        onPress={() =>
                          patchExercise(i, { secondaryMuscles: ex.secondaryMuscles.filter((x) => x !== m) })
                        }
                      >
                        <Text style={styles.pillText}>{m}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </>
              )}

              {ex.equipment.length > 0 && (
                <>
                  <Text style={styles.fieldLabel}>Equipment (tap to remove)</Text>
                  <View style={styles.pillRow}>
                    {ex.equipment.map((eq) => (
                      <TouchableOpacity
                        key={eq}
                        style={styles.pill}
                        onPress={() =>
                          patchExercise(i, { equipment: ex.equipment.filter((x) => x !== eq) })
                        }
                      >
                        <Text style={styles.pillText}>{eq}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </>
              )}
              </>)}
            </View>
          ))}

          {/* A post with several movements and no workout looks like a broken
              import. Say why it happened and offer the way out, in the place
              the workout itself would have been. */}
          {post.workoutGap && (
            <View style={styles.noticeCard}>
              <View style={styles.noticeHead}>
                <Info size={16} color={colors.mutedForeground} />
                <Text style={styles.noticeTitle}>
                  {post.workout ? "You're building this workout" : "No workout — exercises only"}
                </Text>
              </View>
              <Text style={styles.noticeBody}>
                {post.workoutGap === "no_prescription"
                  ? "The caption names the movements but never gives sets or reps, so nothing was read as a workout. These save to your catalog as individual exercises."
                  : "The caption looked like a workout, but its sets and reps couldn't be matched to these movements. They save to your catalog as individual exercises."}
                {post.workout
                  ? " Fill in what you want below — anything you leave blank stays blank, and you can edit it later."
                  : " If it is a workout, build it yourself:"}
              </Text>
              <TouchableOpacity
                style={[styles.overrideButton, post.workout && styles.overrideButtonOn]}
                onPress={toggleWorkout}
                activeOpacity={0.7}
              >
                <Text style={[styles.overrideText, post.workout && styles.overrideTextOn]}>
                  {post.workout ? "Don't save a workout" : "Save as a workout anyway"}
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {post.workout && (
            <View style={styles.card}>
              <Text style={styles.fieldLabel}>Workout name</Text>
              <View style={styles.nameRow}>
                <TextInput
                  style={styles.nameInput}
                  value={post.workout.name}
                  onChangeText={(t) => patchWorkout({ name: t })}
                />
                <Pencil size={15} color={colors.mutedForeground} />
              </View>

              <Text style={styles.headline}>
                {formatWorkoutHeadline(post.workout.items.length, post.workout.rounds)}
              </Text>

              <Text style={styles.fieldLabel}>
                Rounds through the whole list (blank if each exercise has its own sets)
              </Text>
              <TextInput
                style={styles.roundsInput}
                value={post.workout.rounds ?? ""}
                onChangeText={(t) => patchWorkout({ rounds: asText(t) })}
                placeholder="e.g. 3-4"
                placeholderTextColor={colors.mutedForeground}
              />

              {post.workout.items.map((item, i) => (
                <View key={i} style={styles.itemBlock}>
                  <Text style={styles.itemName}>
                    {post.exercises[item.exerciseIndex]?.name}
                  </Text>
                  <View style={styles.itemGrid}>
                    {([
                      ["Sets", item.sets === null ? "" : String(item.sets),
                        (t: string) => patchItem(i, { sets: asCount(t) }), "—"],
                      ["Reps", item.reps ?? "",
                        (t: string) => patchItem(i, { reps: asText(t) }), "8R/8L"],
                      ["Weight", item.weight ?? "",
                        (t: string) => patchItem(i, { weight: asText(t) }), "24kg"],
                      ["Duration", item.duration ?? "",
                        (t: string) => patchItem(i, { duration: asText(t) }), "30s"],
                      ["Rest (s)", item.restSeconds === null ? "" : String(item.restSeconds),
                        (t: string) => patchItem(i, { restSeconds: asCount(t) }), "60"],
                    ] as [string, string, (t: string) => void, string][]).map(
                      ([label, value, onChange, hint]) => (
                        <View key={label} style={styles.field}>
                          <Text style={styles.microLabel}>{label}</Text>
                          <TextInput
                            style={styles.microInput}
                            value={value}
                            onChangeText={onChange}
                            placeholder={hint}
                            placeholderTextColor={colors.mutedForeground}
                          />
                        </View>
                      ),
                    )}
                  </View>
                </View>
              ))}

              {post.workout.rawProtocol && (
                <>
                  <Text style={styles.fieldLabel}>As the creator wrote it</Text>
                  <Text style={styles.protocol}>{post.workout.rawProtocol}</Text>
                </>
              )}
            </View>
          )}
        </ScrollView>

        {errorText && <Text style={styles.error}>{errorText}</Text>}

        <TouchableOpacity
          style={[styles.button, saving && { opacity: 0.6 }]}
          onPress={handleAccept}
          disabled={saving}
          activeOpacity={0.8}
        >
          {saving ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.buttonText}>
              Add to catalog
              {post.exercises.length > 1 ? ` (${post.exercises.length} exercises` : ""}
              {post.exercises.length > 1 ? (post.workout ? " + workout)" : ")") : ""}
            </Text>
          )}
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, padding: 20 },
  header: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start",
    marginBottom: 16,
  },
  title: { fontSize: 20, fontWeight: "700", color: colors.foreground },
  subtitle: { fontSize: 14, color: colors.mutedForeground, marginTop: 2 },
  scroll: { flex: 1 },
  card: {
    backgroundColor: colors.muted, borderRadius: 12, padding: 16, marginBottom: 12,
    borderWidth: 1, borderColor: colors.border,
  },
  nameRow: {
    flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10,
    backgroundColor: colors.input, borderRadius: 8, borderWidth: 1,
    borderColor: colors.border, paddingHorizontal: 10,
  },
  nameInput: {
    flex: 1, fontSize: 17, fontWeight: "600", color: colors.foreground,
    paddingVertical: 9,
  },
  headline: { fontSize: 13, color: colors.primary, marginBottom: 4 },
  roundsInput: {
    backgroundColor: colors.input, borderRadius: 8, borderWidth: 1,
    borderColor: colors.border, paddingHorizontal: 10, paddingVertical: 8,
    fontSize: 15, color: colors.foreground, marginBottom: 4,
  },
  itemBlock: {
    marginTop: 14, paddingTop: 12,
    borderTopWidth: 1, borderTopColor: colors.border,
  },
  itemName: { fontSize: 15, fontWeight: "600", color: colors.foreground, marginBottom: 8 },
  itemGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  field: { width: 88 },
  microLabel: { fontSize: 11, color: colors.mutedForeground, marginBottom: 4 },
  microInput: {
    backgroundColor: colors.input, borderRadius: 6, borderWidth: 1,
    borderColor: colors.border, paddingHorizontal: 8, paddingVertical: 7,
    fontSize: 14, color: colors.foreground,
  },
  protocol: {
    fontSize: 13, color: colors.mutedForeground, lineHeight: 19,
    backgroundColor: colors.input, borderRadius: 8, padding: 10,
  },
  noticeCard: {
    backgroundColor: colors.muted, borderRadius: 12, padding: 16, marginBottom: 12,
    borderWidth: 1, borderColor: colors.border, borderLeftWidth: 3,
    borderLeftColor: colors.mutedForeground,
  },
  noticeHead: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 6 },
  noticeTitle: { fontSize: 15, fontWeight: "600", color: colors.foreground },
  noticeBody: { fontSize: 13, color: colors.mutedForeground, lineHeight: 19 },
  overrideButton: {
    marginTop: 12, borderRadius: 8, paddingVertical: 11, alignItems: "center",
    borderWidth: 1, borderColor: colors.primary,
  },
  overrideButtonOn: { borderColor: colors.border },
  overrideText: { fontSize: 15, fontWeight: "600", color: colors.primary },
  overrideTextOn: { color: colors.mutedForeground },
  matchChip: {
    flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 10,
  },
  matchText: { fontSize: 13, color: colors.primary, flexShrink: 1 },
  newChip: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 10 },
  newText: { fontSize: 13, color: colors.mutedForeground },
  fieldLabel: { fontSize: 12, color: colors.mutedForeground, marginTop: 8, marginBottom: 6 },
  pillRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  pill: {
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 14,
    backgroundColor: colors.input, borderWidth: 1, borderColor: colors.border,
  },
  pillActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  pillText: { fontSize: 12, color: colors.mutedForeground },
  pillTextActive: { fontSize: 12, color: "#FFFFFF", fontWeight: "600" },
  error: { color: "#F87171", fontSize: 14, marginBottom: 8 },
  button: {
    backgroundColor: colors.primary, borderRadius: 8, paddingVertical: 14,
    alignItems: "center",
  },
  buttonText: { color: "#FFFFFF", fontSize: 16, fontWeight: "600" },
});
