// One meal, opened up.
//
// The form shows a meal as one line; this sheet is where that line is edited.
// Everything about a single dish lives here — name, slot, photo, the five
// numbers and the quantity — because five macro fields, a segmented control
// and a photo picker per meal is exactly what made the inline cards too tall
// to review a box on.
//
// The photo block has three sources and one rule. Camera photographs the food,
// Library picks a shot already taken, Search asks the web — scoped by vendor,
// because "Thistle Tahini-Java Smoothie" finds a product where the bare dish
// name finds recipes. Whatever the source, nothing attaches until a deliberate
// tap, and what attaches is always a URL the app owns: camera and library
// shots upload to the bucket, and a chosen search candidate is copied into it
// server-side before its URL comes back.
//
// The sheet edits the draft in place through onPatch — there is no local copy
// and no Cancel, the same live-editing contract the inline card had.
import React, { useState } from "react";
import {
  ActivityIndicator, Alert, Image, KeyboardAvoidingView, Modal, Platform,
  ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as ImagePicker from "expo-image-picker";
import { Camera, ImageIcon, ScanLine, Search, Trash2, X } from "lucide-react-native";
import { uploadImage } from "@/src/lib/imageUpload";
import { pickDishImage, type DishImageCandidate } from "@/src/lib/supabase/dishImageSearch";
import { DELIVERY_SLOTS, type PreparedMealDraft } from "@/src/lib/preparedMealDelivery";
import { sanitizeDecimal, sanitizeInteger } from "@/src/lib/numericInput";
import { colors, icons, radii, spacing, typography } from "@/src/theme/tokens";
import type { MealType } from "@/src/types/track";

const SLOT_LABELS: Record<MealType, string> = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
  snack: "Snack",
  dessert: "Dessert",
};

/** What the screen knows about a row's web search. `idle` means never asked. */
export interface DishSearchState {
  status: "idle" | "loading" | "done";
  candidates: DishImageCandidate[];
  /** False when the backend says the Google key is missing — the strip then
   *  explains itself instead of rendering an empty row that looks broken. */
  configured: boolean;
}

export const IDLE_SEARCH: DishSearchState = { status: "idle", candidates: [], configured: true };

interface MealEditorSheetProps {
  /** Null closes the sheet. */
  draft: PreparedMealDraft | null;
  /** 1-based position in the box, for the title. */
  index: number;
  vendorName: string | null;
  search: DishSearchState;
  onPatch: (changes: Partial<PreparedMealDraft>) => void;
  onRemove: () => void;
  onClose: () => void;
  /** Photograph the printed label and fill the fields — the transcription
   *  camera, distinct from the photo block's. */
  onScanLabel: () => void;
  scanningLabel: boolean;
  /** Ask the web for candidates for the current name. */
  onSearch: () => void;
}

export function MealEditorSheet({
  draft, index, vendorName, search,
  onPatch, onRemove, onClose, onScanLabel, scanningLabel, onSearch,
}: MealEditorSheetProps) {
  const insets = useSafeAreaInsets();
  // Which busy spinner the photo well shows: an upload from camera/library,
  // or a candidate being copied into the bucket.
  const [attaching, setAttaching] = useState(false);

  if (!draft) return null;

  const shoot = async (source: "camera" | "library") => {
    const opts: ImagePicker.ImagePickerOptions = {
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7,
    };
    let uri: string | null = null;
    try {
      if (source === "camera") {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        const shot = perm.granted
          ? await ImagePicker.launchCameraAsync(opts).catch(() => null)
          : null;
        // The simulator has no camera; falling through to the library keeps
        // the button meaning "get a picture" rather than erroring.
        const picked = shot && !shot.canceled ? shot : await ImagePicker.launchImageLibraryAsync(opts);
        if (picked.canceled) return;
        uri = picked.assets?.[0]?.uri ?? null;
      } else {
        const picked = await ImagePicker.launchImageLibraryAsync(opts);
        if (picked.canceled) return;
        uri = picked.assets?.[0]?.uri ?? null;
      }
    } catch (e) {
      console.error("meal photo picker failed:", e);
      Alert.alert("Couldn't open the picker", "Try the photo library instead.");
      return;
    }
    if (!uri) return;

    setAttaching(true);
    const url = await uploadImage(uri, `meal_${Date.now()}`);
    setAttaching(false);
    if (!url) {
      Alert.alert("Couldn't save the photo", "The meal is unchanged. Try again.");
      return;
    }
    onPatch({ imageUrl: url });
  };

  const chooseCandidate = async (candidate: DishImageCandidate) => {
    setAttaching(true);
    const url = await pickDishImage(candidate, draft.name || "dish");
    setAttaching(false);
    if (!url) {
      Alert.alert("Couldn't fetch that image", "Try another candidate, or the camera.");
      return;
    }
    onPatch({ imageUrl: url });
  };

  const canSearch = draft.name.trim() !== "";

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        {/* The visible list behind is the same list being edited; tapping out
            is closing, not cancelling. */}
        <TouchableOpacity style={styles.backdropTouch} activeOpacity={1} onPress={onClose} />
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]}>
            <View style={styles.grab} />

            <View style={styles.head}>
              <Text style={styles.headTitle}>Meal {index}</Text>
              <View style={styles.headActions}>
                {/* Reads the printed label into the fields. Not the photo
                    camera: a picture of a lid full of small print is a
                    terrible portrait of the food. */}
                <TouchableOpacity
                  onPress={onScanLabel}
                  disabled={scanningLabel}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  accessibilityRole="button"
                  accessibilityLabel="Photograph the label to fill these fields"
                >
                  <ScanLine
                    size={icons.md}
                    color={scanningLabel ? colors.brand : colors.textMuted}
                    strokeWidth={icons.strokeWidth}
                  />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={onRemove}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  accessibilityRole="button"
                  accessibilityLabel={`Remove meal ${index}`}
                >
                  <Trash2 size={icons.md} color={colors.danger} strokeWidth={icons.strokeWidth} />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={onClose}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  accessibilityRole="button"
                  accessibilityLabel="Done editing this meal"
                >
                  <X size={icons.md} color={colors.text} strokeWidth={icons.strokeWidth} />
                </TouchableOpacity>
              </View>
            </View>

            <ScrollView
              style={styles.body}
              contentContainerStyle={styles.bodyContent}
              keyboardShouldPersistTaps="handled"
            >
              <TextInput
                style={styles.nameInput}
                placeholder={scanningLabel ? "Reading the label…" : "Meal name"}
                placeholderTextColor={colors.textFaint}
                value={draft.name}
                onChangeText={(t) => onPatch({ name: t })}
                multiline
              />

              <View style={styles.segTrack}>
                {DELIVERY_SLOTS.map((slot) => {
                  const active = draft.slot === slot;
                  return (
                    <TouchableOpacity
                      key={slot}
                      style={[styles.segItem, active && styles.segItemActive]}
                      onPress={() => onPatch({ slot })}
                      accessibilityRole="button"
                      accessibilityState={{ selected: active }}
                    >
                      <Text style={[styles.segText, active && styles.segTextActive]} numberOfLines={1}>
                        {SLOT_LABELS[slot]}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <Text style={styles.blockLabel}>Photo</Text>
              <View style={styles.photoBlock}>
                <View style={styles.well}>
                  {attaching ? (
                    <ActivityIndicator color={colors.brand} />
                  ) : draft.imageUrl ? (
                    <Image source={{ uri: draft.imageUrl }} style={styles.wellImage} resizeMode="cover" />
                  ) : (
                    <ImageIcon size={icons.lg} color={colors.textFaint} strokeWidth={icons.strokeWidth} />
                  )}
                </View>

                <View style={styles.photoSide}>
                  <View style={styles.sourceRow}>
                    {([
                      ["Camera", Camera, () => shoot("camera"), true],
                      ["Library", ImageIcon, () => shoot("library"), true],
                      ["Search", Search, onSearch, canSearch],
                    ] as const).map(([label, Icon, onPress, enabled]) => (
                      <TouchableOpacity
                        key={label}
                        style={[styles.sourceBtn, !enabled && styles.sourceBtnDisabled]}
                        onPress={onPress}
                        disabled={!enabled || attaching}
                        accessibilityRole="button"
                        accessibilityLabel={`${label} photo for meal ${index}`}
                      >
                        <Icon size={icons.sm} color={colors.textMuted} strokeWidth={icons.strokeWidth} />
                        <Text style={styles.sourceText}>{label}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  {search.status === "loading" && (
                    <View style={styles.candidateNote}>
                      <ActivityIndicator size="small" color={colors.textMuted} />
                      <Text style={styles.noteText}>Searching the web…</Text>
                    </View>
                  )}

                  {search.status === "done" && !search.configured && (
                    <Text style={styles.noteText}>
                      Image search isn't set up yet — it needs a Google search key on the server.
                    </Text>
                  )}

                  {search.status === "done" && search.configured && search.candidates.length === 0 && (
                    <Text style={styles.noteText}>Nothing found. Try the camera or library.</Text>
                  )}

                  {search.candidates.length > 0 && (
                    <>
                      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                        <View style={styles.candidateRow}>
                          {search.candidates.map((c) => (
                            <TouchableOpacity
                              key={c.imageUrl}
                              onPress={() => chooseCandidate(c)}
                              disabled={attaching}
                              accessibilityRole="button"
                              accessibilityLabel="Use this image"
                            >
                              <Image source={{ uri: c.thumbUrl }} style={styles.candidate} />
                            </TouchableOpacity>
                          ))}
                        </View>
                      </ScrollView>
                      <Text style={styles.noteText}>
                        Web results{vendorName ? ` for ${vendorName}` : ""} — tap one to use it
                      </Text>
                    </>
                  )}
                </View>
              </View>

              <View style={styles.macroGrid}>
                {([
                  ["Cal", draft.calories, (t: string) => onPatch({ calories: sanitizeInteger(t) }), "number-pad"],
                  ["Protein", draft.protein, (t: string) => onPatch({ protein: sanitizeDecimal(t) }), "decimal-pad"],
                  ["Fiber", draft.fiber, (t: string) => onPatch({ fiber: sanitizeDecimal(t) }), "decimal-pad"],
                  ["Sat fat", draft.saturatedFat, (t: string) => onPatch({ saturatedFat: sanitizeDecimal(t) }), "decimal-pad"],
                  ["Na mg", draft.sodium, (t: string) => onPatch({ sodium: sanitizeInteger(t) }), "number-pad"],
                  ["Qty", draft.quantity, (t: string) => onPatch({ quantity: sanitizeInteger(t) }), "number-pad"],
                ] as const).map(([label, value, onChange, keyboard]) => (
                  <View key={label} style={styles.macroField}>
                    <Text style={styles.macroLabel}>{label}</Text>
                    <TextInput
                      style={styles.macroInput}
                      placeholder={label === "Qty" ? "1" : "—"}
                      placeholderTextColor={colors.textFaint}
                      value={value}
                      onChangeText={onChange}
                      keyboardType={keyboard}
                      accessibilityLabel={`${label} for meal ${index}`}
                    />
                  </View>
                ))}
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: colors.scrim },
  backdropTouch: { flex: 1 },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radii.panel, borderTopRightRadius: radii.panel,
    paddingHorizontal: spacing.lg, paddingTop: spacing.sm,
    maxHeight: "88%",
  },
  grab: {
    width: 36, height: 4, borderRadius: 2, alignSelf: "center",
    backgroundColor: colors.border, marginBottom: spacing.sm,
  },
  head: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingBottom: spacing.sm,
  },
  headTitle: { ...typography.rowTitle, color: colors.text },
  headActions: { flexDirection: "row", alignItems: "center", gap: spacing.xl },
  body: { flexGrow: 0 },
  bodyContent: { gap: spacing.md, paddingBottom: spacing.sm },
  nameInput: {
    ...typography.body, color: colors.text,
    backgroundColor: colors.surface2,
    borderWidth: 1, borderColor: colors.border, borderRadius: radii.control,
    paddingHorizontal: spacing.md, paddingVertical: spacing.md,
    minHeight: 44,
  },
  segTrack: {
    flexDirection: "row", flexWrap: "wrap", gap: spacing.xs,
    backgroundColor: colors.surface2,
    borderRadius: radii.pill,
    borderWidth: 1, borderColor: colors.border,
    padding: spacing.xs,
  },
  segItem: {
    flexGrow: 1, minWidth: 90,
    alignItems: "center", justifyContent: "center",
    paddingVertical: spacing.sm, paddingHorizontal: spacing.xs,
    borderRadius: radii.pill,
  },
  segItemActive: { backgroundColor: colors.brand },
  segText: { ...typography.caption, color: colors.textMuted },
  segTextActive: { color: colors.onBrand, fontWeight: "600" },
  blockLabel: { ...typography.section, color: colors.textMuted },
  photoBlock: { flexDirection: "row", gap: spacing.md },
  well: {
    width: 96, height: 96, borderRadius: radii.row,
    backgroundColor: colors.surface2,
    borderWidth: 1, borderColor: colors.border,
    alignItems: "center", justifyContent: "center",
    overflow: "hidden",
  },
  wellImage: { width: "100%", height: "100%" },
  photoSide: { flex: 1, gap: spacing.sm },
  sourceRow: { flexDirection: "row", gap: spacing.sm },
  sourceBtn: {
    flex: 1, alignItems: "center", gap: spacing.xs,
    backgroundColor: colors.surface2,
    borderWidth: 1, borderColor: colors.border, borderRadius: radii.control,
    paddingVertical: spacing.sm,
  },
  sourceBtnDisabled: { opacity: 0.4 },
  sourceText: { ...typography.caption, color: colors.textMuted },
  candidateNote: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  candidateRow: { flexDirection: "row", gap: spacing.sm },
  candidate: {
    width: 56, height: 56, borderRadius: radii.control,
    backgroundColor: colors.surface2,
  },
  noteText: { ...typography.caption, color: colors.textFaint },
  macroGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  macroField: { flexBasis: "30%", flexGrow: 1, gap: spacing.xs },
  macroLabel: { ...typography.caption, color: colors.textFaint },
  macroInput: {
    ...typography.body, color: colors.text, textAlign: "center",
    backgroundColor: colors.surface2,
    borderWidth: 1, borderColor: colors.border, borderRadius: radii.control,
    paddingVertical: spacing.sm,
  },
});
