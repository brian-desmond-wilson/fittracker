import React, { useState } from "react";
import {
  Modal, View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, ActivityIndicator,
} from "react-native";
import { X, Link2, Link2Off } from "lucide-react-native";
import { colors } from "@/src/lib/colors";
import { supabase } from "@/src/lib/supabase";
import { saveCapture } from "@/src/lib/supabase/capture";
import type {
  CaptureCategory, CaptureSkillLevel, ExtractedPost, ResolvedPost,
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
            <Text style={styles.title}>
              {post.postType === "full_workout" ? "Workout found" : "Exercise found"}
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
              <TextInput
                style={styles.nameInput}
                value={ex.name}
                onChangeText={(t) => patchExercise(i, { name: t })}
              />

              {ex.libraryMatchId ? (
                <TouchableOpacity
                  style={styles.matchChip}
                  onPress={() => patchExercise(i, { libraryMatchId: null })}
                  activeOpacity={0.7}
                >
                  <Link2 size={14} color={colors.primary} />
                  <Text style={styles.matchText}>
                    Matches “{matchNames.get(ex.libraryMatchId) ?? "library exercise"}” — tap to create new instead
                  </Text>
                </TouchableOpacity>
              ) : (
                <View style={styles.newChip}>
                  <Link2Off size={14} color={colors.mutedForeground} />
                  <Text style={styles.newText}>New library entry</Text>
                </View>
              )}

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
            </View>
          ))}

          {post.workout && (
            <View style={styles.card}>
              <Text style={styles.workoutTitle}>Saved as workout: {post.workout.name}</Text>
              {post.workout.items.map((item, i) => (
                <Text key={i} style={styles.workoutItem}>
                  {post.exercises[item.exerciseIndex]?.name}
                  {item.sets ? ` — ${item.sets}×${item.reps ?? "?"}` : ""}
                  {item.restSeconds ? `, rest ${item.restSeconds}s` : ""}
                </Text>
              ))}
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
              Add to catalog{post.exercises.length > 1 ? ` (${post.exercises.length} exercises)` : ""}
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
  nameInput: {
    fontSize: 17, fontWeight: "600", color: colors.foreground,
    borderBottomWidth: 1, borderBottomColor: colors.border, paddingVertical: 6,
    marginBottom: 10,
  },
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
  workoutTitle: { fontSize: 15, fontWeight: "600", color: colors.foreground, marginBottom: 8 },
  workoutItem: { fontSize: 13, color: colors.mutedForeground, marginBottom: 4 },
  error: { color: "#F87171", fontSize: 14, marginBottom: 8 },
  button: {
    backgroundColor: colors.primary, borderRadius: 8, paddingVertical: 14,
    alignItems: "center",
  },
  buttonText: { color: "#FFFFFF", fontSize: 16, fontWeight: "600" },
});
