// One meal, opened up.
//
// The form shows a meal as one line; this sheet is where that line is edited.
// Everything about a single dish lives here — name, slot, photo, the five
// numbers and the quantity — because five macro fields, a segmented control
// and a photo picker per meal is exactly what made the inline cards too tall
// to review a box on.
//
// The photo block has four sources and one rule. Camera photographs the food,
// Library picks a shot already taken, Search asks the web — scoped by vendor,
// because "Thistle Tahini-Java Smoothie" finds a product where the bare dish
// name finds recipes — and Link takes an address pasted from wherever the
// vendor already publishes the picture.
//
// Whatever the source, nothing attaches until a deliberate tap, and what
// attaches is always a URL the app owns: camera and library shots upload to
// the bucket, and a search candidate or a pasted address is fetched and copied
// into it server-side before its URL comes back. Never a hot link — a picture
// on somebody else's CDN is one redesign away from a grey box.
//
// The sheet edits the draft in place through onPatch — there is no local copy
// and no Cancel, the same live-editing contract the inline card had.
//
// The slot control is the Meal Builder's, deliberately: a delivered meal is
// filed under the same five slots a built meal is, and two different-looking
// controls for one decision is two things to learn.
import React, { useLayoutEffect, useRef, useState } from "react";
import {
  ActivityIndicator, Alert, Animated, Image, PanResponder,
  ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { Camera, ImageIcon, Link as LinkIcon, ScanLine, Search, Trash2, X } from "lucide-react-native";
import { uploadImage } from "@/src/lib/imageUpload";
import { pickDishImage, type DishImageCandidate } from "@/src/lib/supabase/dishImageSearch";
import { DELIVERY_SLOTS, type PreparedMealDraft } from "@/src/lib/preparedMealDelivery";
import { sanitizeDecimal, sanitizeInteger } from "@/src/lib/numericInput";
import { colors, icons, radii, spacing, tint, typography } from "@/src/theme/tokens";
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

// The same thresholds the meal log sheet dismisses on, so a throw-away flick
// feels identical wherever a sheet appears.
const DISMISS_DISTANCE = 110;
const DISMISS_VELOCITY = 0.7;
const EXIT_TRAVEL = 900;

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
  // Which busy spinner the photo well shows: an upload from camera/library,
  // or a candidate being copied into the bucket.
  const [attaching, setAttaching] = useState(false);
  // The paste-an-address field, hidden until asked for.
  const [linkOpen, setLinkOpen] = useState(false);
  const [link, setLink] = useState("");
  // Only an http(s) address can be fetched. Checked here so the button is
  // plainly dead rather than failing after a round trip.
  const canUseLink = /^https?:\/\/\S+$/i.test(link.trim());

  // Swipe down to dismiss.
  //
  // The handlers sit on the sheet's HEAD — grab handle and title row — and
  // never on the scroller below. A responder spanning both would have to guess
  // on every touch whether a downward drag means "close this" or "scroll the
  // macros up", and it would guess wrong at the top of the list where the two
  // gestures are identical.
  const dragY = useRef(new Animated.Value(0)).current;
  // The responder is built once, so it must not close over a stale `onClose`.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const pan = useRef(
    PanResponder.create({
      // Only a deliberate downward drag, so a tap on the head still taps.
      onMoveShouldSetPanResponder: (_e, g) => g.dy > 6 && g.dy > Math.abs(g.dx),
      // Downward only: dragging up would lift the sheet off its own bottom
      // edge and show the page behind it.
      onPanResponderMove: (_e, g) => dragY.setValue(Math.max(0, g.dy)),
      onPanResponderRelease: (_e, g) => {
        if (g.dy > DISMISS_DISTANCE || g.vy > DISMISS_VELOCITY) {
          Animated.timing(dragY, {
            toValue: EXIT_TRAVEL,
            duration: 180,
            useNativeDriver: true,
          }).start(() => onCloseRef.current());
          return;
        }
        Animated.spring(dragY, { toValue: 0, useNativeDriver: true, bounciness: 0 }).start();
      },
      onPanResponderTerminate: () => {
        Animated.spring(dragY, { toValue: 0, useNativeDriver: true, bounciness: 0 }).start();
      },
    }),
  ).current;

  // A sheet thrown away is left parked off-screen; opening the next meal must
  // start from rest. `useLayoutEffect` so the reset lands before the first
  // paint rather than one frame into it.
  const openKey = draft?.key ?? null;
  useLayoutEffect(() => {
    if (openKey) dragY.setValue(0);
  }, [openKey, dragY]);

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
    const { url, reason } = await pickDishImage(candidate, draft.name || "dish");
    setAttaching(false);
    if (!url) {
      // The server's own words when it has them — which result to try next
      // depends on why this one failed.
      Alert.alert("Couldn't use that picture", reason ?? "Try another candidate, or the camera.");
      return;
    }
    onPatch({ imageUrl: url });
  };

  /**
   * A pasted address, taken the same way a chosen search result is: fetched
   * server-side and copied into our own bucket. Hot-linking somebody's CDN
   * would leave the inventory pointing at a picture that can vanish, and the
   * URL in hand is exactly the kind that does — a share link, an asset id.
   */
  const useLink = async () => {
    const address = link.trim();
    if (!canUseLink) return;
    setAttaching(true);
    const { url, reason } = await pickDishImage(
      { thumbUrl: address, imageUrl: address, sourcePage: null },
      draft.name || "dish",
    );
    setAttaching(false);
    if (!url) {
      Alert.alert(
        "Couldn't use that address",
        reason ?? "Check the address points straight at an image file, not the page around it.",
      );
      return;
    }
    onPatch({ imageUrl: url });
    setLink("");
    setLinkOpen(false);
  };

  const canSearch = draft.name.trim() !== "";

  // No Modal. A modal hosts its content in a separate native window, and the
  // drag responder never gets the gesture in there — the sheet could be closed
  // but not thrown. The meal log sheet renders inline over its page, so this
  // does too, and the gesture behaves identically because it is the same
  // mechanism. The cost is the tab bar showing beneath, exactly as it does on
  // that sheet.
  return (
    <>
      <View style={styles.root} pointerEvents="box-none">
        {/* The scrim thins as the sheet is dragged away, so the drag reads as
            one movement rather than a card sliding under a fixed pane. */}
        <Animated.View
          style={[
            styles.scrim,
            {
              opacity: dragY.interpolate({
                inputRange: [0, DISMISS_DISTANCE * 2],
                outputRange: [1, 0.15],
                extrapolate: "clamp",
              }),
            },
          ]}
        >
          {/* The visible list behind is the same list being edited; tapping
              out is closing, not cancelling. */}
          <TouchableOpacity
            style={styles.scrimFill}
            activeOpacity={1}
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Close this meal"
          />
        </Animated.View>
        {/* Pinned to the bottom of the window by position, not by a flex
            parent. A sheet laid out by a flex column would not follow the
            finger: the transform fights the layout instead of moving the card,
            which is the difference between this and the meal log sheet. */}
        <Animated.View
          style={[
            styles.sheet,
            // The tab bar sits below this sheet and already clears the home
            // indicator, so the padding is the reference sheet's, unadjusted.
            { paddingBottom: spacing.xxl },
            { transform: [{ translateY: dragY }] },
          ]}
        >
            <View {...pan.panHandlers} style={styles.dragArea}>
              <View
                style={styles.grab}
                accessible
                accessibilityRole="adjustable"
                accessibilityLabel="Drag down to close"
              />

            <View style={styles.head}>
              <Text style={styles.headTitle}>Meal {index}</Text>
              <View style={styles.headActions}>
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
            </View>

            <ScrollView
              style={styles.body}
              contentContainerStyle={styles.bodyContent}
              keyboardShouldPersistTaps="handled"
            >
              {/* Above the fields it fills, spelled out. This was an unlabelled
                  viewfinder between Delete and Close, where it read as chrome
                  rather than an action — findable only by someone who already
                  knew it was there. Not the photo block's camera: that
                  photographs the food, this reads the small print. */}
              <TouchableOpacity
                style={styles.scanLabel}
                onPress={onScanLabel}
                disabled={scanningLabel}
                accessibilityRole="button"
                accessibilityLabel="Photograph the label to fill in this meal"
              >
                {scanningLabel ? (
                  <ActivityIndicator size="small" color={colors.brand} />
                ) : (
                  <ScanLine size={icons.sm} color={colors.brand} strokeWidth={icons.strokeWidth} />
                )}
                <Text style={styles.scanLabelText}>
                  {scanningLabel
                    ? "Reading the label…"
                    : "Photograph the label and I'll fill this in"}
                </Text>
              </TouchableOpacity>

              <TextInput
                style={styles.nameInput}
                placeholder={scanningLabel ? "Reading the label…" : "Meal name"}
                placeholderTextColor={colors.textFaint}
                value={draft.name}
                onChangeText={(t) => onPatch({ name: t })}
                multiline
              />

              <View style={styles.segTrack}>
                {DELIVERY_SLOTS.map((slot, i) => {
                  const active = draft.slot === slot;
                  return (
                    <TouchableOpacity
                      key={slot}
                      style={[
                        styles.segItem,
                        i > 0 && styles.segDivider,
                        active && styles.segItemActive,
                      ]}
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
                      ["Link", LinkIcon, () => setLinkOpen((v) => !v), true],
                    ] as const).map(([label, Icon, onPress, enabled]) => (
                      <TouchableOpacity
                        key={label}
                        style={[
                          styles.sourceBtn,
                          !enabled && styles.sourceBtnDisabled,
                          label === "Link" && linkOpen && styles.sourceBtnOpen,
                        ]}
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

                  {/* Appears on tap rather than sitting there always: pasting a
                      URL is the rarest of the four ways in, and a text field is
                      the loudest thing you can put in a row of buttons. */}
                  {linkOpen && (
                    <View style={styles.linkRow}>
                      <TextInput
                        style={styles.linkInput}
                        placeholder="https://…"
                        placeholderTextColor={colors.textFaint}
                        value={link}
                        onChangeText={setLink}
                        autoCapitalize="none"
                        autoCorrect={false}
                        keyboardType="url"
                        returnKeyType="done"
                        onSubmitEditing={useLink}
                        accessibilityLabel={`Image address for meal ${index}`}
                      />
                      <TouchableOpacity
                        style={[styles.linkGo, !canUseLink && styles.sourceBtnDisabled]}
                        onPress={useLink}
                        disabled={!canUseLink || attaching}
                        accessibilityRole="button"
                        accessibilityLabel="Use this image address"
                      >
                        <Text style={styles.linkGoText}>Use</Text>
                      </TouchableOpacity>
                    </View>
                  )}

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

              {/* The same panel Edit Product asks for, in its order. A
                  delivered meal is a product like any other, and two forms
                  capturing different halves of one nutrition label is how a
                  650-calorie pasta ended up recorded as carb-free. */}
              <View style={styles.macroGrid}>
                {([
                  ["Calories", draft.calories, (t: string) => onPatch({ calories: sanitizeInteger(t) }), "number-pad"],
                  ["Protein (g)", draft.protein, (t: string) => onPatch({ protein: sanitizeDecimal(t) }), "decimal-pad"],
                  ["Carbs (g)", draft.carbs, (t: string) => onPatch({ carbs: sanitizeDecimal(t) }), "decimal-pad"],
                  ["Fats (g)", draft.fats, (t: string) => onPatch({ fats: sanitizeDecimal(t) }), "decimal-pad"],
                  ["Saturated Fat (g)", draft.saturatedFat, (t: string) => onPatch({ saturatedFat: sanitizeDecimal(t) }), "decimal-pad"],
                  ["Sugars (g)", draft.sugars, (t: string) => onPatch({ sugars: sanitizeDecimal(t) }), "decimal-pad"],
                  ["Fiber (g)", draft.fiber, (t: string) => onPatch({ fiber: sanitizeDecimal(t) }), "decimal-pad"],
                  ["Sodium (mg)", draft.sodium, (t: string) => onPatch({ sodium: sanitizeInteger(t) }), "number-pad"],
                  ["Quantity", draft.quantity, (t: string) => onPatch({ quantity: sanitizeInteger(t) }), "number-pad"],
                ] as const).map(([label, value, onChange, keyboard]) => (
                  <View key={label} style={styles.macroField}>
                    <Text style={styles.macroLabel}>{label}</Text>
                    <TextInput
                      style={styles.macroInput}
                      placeholder={label === "Quantity" ? "1" : "—"}
                      placeholderTextColor={colors.textFaint}
                      value={value}
                      onChangeText={onChange}
                      keyboardType={keyboard}
                      accessibilityLabel={`${label} for meal ${index}`}
                    />
                  </View>
                ))}
              </View>

              {/* Full width and last, because it is words rather than a
                  figure, and because "1 meal" is right often enough that it
                  is the one field usually left alone. */}
              <View style={styles.servingField}>
                <Text style={styles.macroLabel}>Serving Size</Text>
                <TextInput
                  style={styles.servingInput}
                  placeholder="1 meal"
                  placeholderTextColor={colors.textFaint}
                  value={draft.servingSize}
                  onChangeText={(t) => onPatch({ servingSize: t })}
                  accessibilityLabel={`Serving Size for meal ${index}`}
                />
              </View>
          </ScrollView>
        </Animated.View>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  // Over the page it belongs to, not over the window.
  root: { ...StyleSheet.absoluteFillObject },
  scrim: { ...StyleSheet.absoluteFillObject, backgroundColor: colors.scrim },
  scrimFill: { flex: 1 },
  // Against the bottom of the WINDOW — the modal covers the tab bar, so the
  // sheet reaches past where the tab bar sits rather than stopping at the edge
  // of the page that opened it.
  sheet: {
    position: "absolute", left: 0, right: 0, bottom: 0,
    backgroundColor: colors.surface,
    borderTopWidth: 1, borderTopColor: colors.border,
    borderTopLeftRadius: radii.panel, borderTopRightRadius: radii.panel,
    paddingHorizontal: spacing.lg, paddingTop: spacing.sm,
    maxHeight: "88%",
  },
  // The grip. A background of its own, so the responder has a real surface to
  // claim rather than the gaps between a 4pt handle and a row of icons.
  dragArea: { backgroundColor: colors.surface },
  // Same handle the meal log sheet draws, down to the margins: it is the grip
  // the gesture is learned on, and two sizes would read as two gestures.
  grab: {
    width: 38, height: 4, borderRadius: radii.pill, alignSelf: "center",
    backgroundColor: colors.surface2,
    marginTop: spacing.sm, marginBottom: spacing.md,
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
  // The Meal Builder's control, borrowed whole: five divided cells in one
  // row, the chosen one tinted rather than filled. A pill track needed 90pt a
  // segment and wrapped to two rows on a phone; this fits five across because
  // the cells share their borders and the label carries the state.
  segTrack: {
    flexDirection: "row",
    borderWidth: 1, borderColor: colors.border, borderRadius: radii.control,
    overflow: "hidden",
  },
  segItem: {
    flex: 1, alignItems: "center", justifyContent: "center",
    paddingVertical: spacing.sm, paddingHorizontal: 2,
  },
  segDivider: { borderLeftWidth: 1, borderLeftColor: colors.border },
  segItemActive: { backgroundColor: tint(colors.brand) },
  segText: { ...typography.caption, color: colors.textMuted },
  segTextActive: { color: colors.brand, fontWeight: "700" },
  blockLabel: { ...typography.section, color: colors.textMuted },
  scanLabel: {
    flexDirection: "row", alignItems: "center", gap: spacing.sm,
    backgroundColor: tint(colors.brand),
    borderWidth: 1, borderColor: colors.brand, borderRadius: radii.control,
    paddingHorizontal: spacing.md, paddingVertical: spacing.md,
  },
  scanLabelText: { ...typography.caption, color: colors.brand, fontWeight: "600", flexShrink: 1 },
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
  // The button stays lit while its field is showing, so it reads as a toggle
  // rather than something that did nothing.
  sourceBtnOpen: { borderColor: colors.brand },
  sourceText: { ...typography.caption, color: colors.textMuted },
  linkRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  linkInput: {
    ...typography.body, color: colors.text, flex: 1,
    backgroundColor: colors.surface2,
    borderWidth: 1, borderColor: colors.border, borderRadius: radii.control,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
  },
  linkGo: {
    backgroundColor: colors.surface2,
    borderWidth: 1, borderColor: colors.brand, borderRadius: radii.control,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
  },
  linkGoText: { ...typography.buttonSm, color: colors.brand },
  candidateNote: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  candidateRow: { flexDirection: "row", gap: spacing.sm },
  candidate: {
    width: 56, height: 56, borderRadius: radii.control,
    backgroundColor: colors.surface2,
  },
  noteText: { ...typography.caption, color: colors.textFaint },
  macroGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  macroField: { flexBasis: "30%", flexGrow: 1, gap: spacing.xs },
  servingField: { gap: spacing.xs },
  servingInput: {
    ...typography.body, color: colors.text,
    backgroundColor: colors.surface2,
    borderWidth: 1, borderColor: colors.border, borderRadius: radii.control,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
  },
  macroLabel: { ...typography.caption, color: colors.textFaint },
  macroInput: {
    ...typography.body, color: colors.text, textAlign: "center",
    backgroundColor: colors.surface2,
    borderWidth: 1, borderColor: colors.border, borderRadius: radii.control,
    paddingVertical: spacing.sm,
  },
});
