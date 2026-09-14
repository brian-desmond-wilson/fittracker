// A captured workout card that can be swiped away, matching the WOD list.
//
// The card summarises the workout the way the Exercises card summarises an
// exercise, but aggregated across the movements inside: equipment is every
// distinct piece any movement needs, and the muscle silhouettes are the
// workout's own tags. The thumbnail carries the provenance — the creator's
// avatar, the format, and whether it has been done — so the text side stays
// down to the title and the two summary rows. Facts are derived once in
// workoutCardFacts so this file is a plain renderer. The swipe-to-delete is
// unchanged; its confirmation is deliberate, because the one thing a person
// fears here is losing exercises they had before the capture.
import React, { useRef } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Alert, Image } from "react-native";
import { Swipeable } from "react-native-gesture-handler";
import { Check, ChevronRight } from "lucide-react-native";
import { colors, spacing, tint } from "@/src/theme/tokens";
import { SwipeDeleteAction } from "@/src/components/ui/SwipeDeleteAction";
import { EquipmentGlyph } from "@/src/components/ui/EquipmentGlyph";
import { MuscleIcon } from "@/src/components/ui/MuscleIcon";
import { supabase } from "@/src/lib/supabase";
import { deleteCapturedWorkout } from "@/src/lib/supabase/capture";
import { formatLastCompleted, isStale } from "@/src/lib/workoutCompletion";
import type { WorkoutCompletion } from "@/src/lib/workoutCompletion";
import { workoutCardFacts } from "@/src/lib/workoutCardFacts";
import type { CapturedWorkoutEntry } from "@/src/types/capture";

const CARD_RADIUS = 12;
const THUMB = 96;
const PRIMARY_ICON = 36;
const SECONDARY_ICON = 26;
// Past two, extra secondary icons stop informing and start crowding; the names line still lists them all.
const MAX_SECONDARY_ICONS = 2;
// A workout can pull in many kinds of gear; past six the row is noise. The
// rest collapse into a "+N" chip so the count still reads.
const MAX_EQUIP_ICONS = 6;

interface SwipeableWorkoutCardProps {
  workout: CapturedWorkoutEntry;
  onPress: () => void;
  /** Reload the list — the tab's count comes from it. */
  onDeleted: () => void;
  /** This workout's history, or null when it has never been completed. The
   *  card says "Never" in that case: now that the list can be sorted and
   *  filtered by history, a blank would read as missing data. */
  completion: WorkoutCompletion | null;
  /** Today's local date, passed in rather than read here so every card in one
   *  render agrees on what "Yesterday" means. */
  today: string;
}

export function SwipeableWorkoutCard({
  workout,
  onPress,
  onDeleted,
  completion,
  today,
}: SwipeableWorkoutCardProps) {
  const swipeableRef = useRef<Swipeable>(null);
  const facts = workoutCardFacts(workout);
  const shownEquip = facts.equipment.slice(0, MAX_EQUIP_ICONS);
  const extraEquip = facts.equipment.length - shownEquip.length;
  // Stale history is drawn muted so the green means "this is current training"
  // rather than merely "this happened once".
  const stale = completion ? isStale(completion, today) : false;
  const lastLabel = completion ? formatLastCompleted(completion, today) : null;
  const handle = workout.source?.posterHandle ?? null;

  const a11y = [
    workout.name,
    completion
      ? `Completed ${completion.count} ${completion.count === 1 ? "time" : "times"}` +
        (lastLabel ? `, last ${lastLabel.toLowerCase()}` : "")
      : "Never done",
    facts.formatTag,
    `${facts.movementCount} ${facts.movementCount === 1 ? "movement" : "movements"}`,
    facts.equipment.length ? `Uses ${facts.equipment.join(", ")}` : null,
    facts.primaryMuscle ? `Primary ${facts.primaryMuscle}` : null,
    facts.secondaryMuscles.length ? `also ${facts.secondaryMuscles.join(", ")}` : null,
    handle ? `By ${handle}` : null,
    "Open the workout.",
  ].filter(Boolean).join(". ");

  const handleDelete = () => {
    Alert.alert(
      "Delete workout",
      `Delete "${workout.name}"? Its movement list goes with it. The exercises stay in your library. This can't be undone.`,
      [
        {
          text: "Cancel",
          style: "cancel",
          onPress: () => swipeableRef.current?.close(),
        },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) {
              Alert.alert("Not signed in", "Sign in again and try that once more.");
              swipeableRef.current?.close();
              return;
            }
            const ok = await deleteCapturedWorkout(workout.workoutId, user.id);
            if (!ok) {
              Alert.alert("Couldn't delete", "That workout is still there. Try again.");
              swipeableRef.current?.close();
              return;
            }
            onDeleted();
          },
        },
      ],
    );
  };

  return (
    <Swipeable
      ref={swipeableRef}
      renderRightActions={(progress) => (
        <SwipeDeleteAction
          progress={progress}
          onPress={handleDelete}
          radius={CARD_RADIUS}
          accessibilityLabel={`Delete ${workout.name}`}
        />
      )}
      overshootRight={false}
      friction={2}
      containerStyle={styles.swipeContainer}
    >
      <TouchableOpacity
        style={styles.card}
        onPress={onPress}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={a11y}
      >
        {/* The post's still, full-bleed like the exercise card's photo — and
            already the creator's face, so no avatar rides on it. Its corners
            carry the workout's own facts: done-state top-left, format
            bottom-right. No still yet: the primary-muscle silhouette stands in
            so the slot reads as intentional. */}
        <View style={styles.thumbWrap}>
          {workout.source?.thumbnailUrl ? (
            <Image source={{ uri: workout.source.thumbnailUrl }} style={styles.thumb} />
          ) : (
            <View style={[styles.thumb, styles.thumbEmpty]}>
              {facts.primaryMuscle && <MuscleIcon muscle={facts.primaryMuscle} size={52} dim />}
            </View>
          )}

          {completion ? (
            <View style={[styles.overlay, styles.statusOverlay, styles.doneOverlay]}>
              <Check size={11} strokeWidth={3} color={stale ? colors.textMuted : colors.brand} />
              <Text style={[styles.doneText, stale && styles.doneTextStale]}>
                {completion.count}×
              </Text>
            </View>
          ) : (
            <View style={[styles.overlay, styles.statusOverlay, styles.neverOverlay]}>
              <Text style={styles.neverText}>New</Text>
            </View>
          )}

          {facts.formatTag && (
            <View style={[styles.overlay, styles.formatOverlay]}>
              <Text style={styles.formatText}>{facts.formatTag}</Text>
            </View>
          )}
        </View>

        <View style={styles.body}>
          {/* Row 1: name. One line — shrinks to a floor rather than wrapping. */}
          <Text style={styles.name} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.82}>
            {workout.name}
          </Text>

          {/* Row 2: aggregated equipment — every distinct piece any movement
              needs, in grid order, overflow collapsed to "+N". */}
          {shownEquip.length > 0 && (
            <View style={styles.equipment}>
              {shownEquip.map((e) => (
                <View key={e} style={styles.equipBadge}>
                  <EquipmentGlyph name={e} size={16} color={colors.brand} />
                </View>
              ))}
              {extraEquip > 0 && (
                <View style={[styles.equipBadge, styles.equipMore]}>
                  <Text style={styles.equipMoreText}>+{extraEquip}</Text>
                </View>
              )}
            </View>
          )}

          {/* Row 3: muscles — primary large, up to two dimmed secondaries, all named. */}
          {facts.primaryMuscle && (
            <View style={styles.muscles}>
              <MuscleIcon muscle={facts.primaryMuscle} size={PRIMARY_ICON} />
              {facts.secondaryMuscles.slice(0, MAX_SECONDARY_ICONS).map((m) => (
                <MuscleIcon key={m} muscle={m} size={SECONDARY_ICON} dim />
              ))}
              <View style={styles.muscleNames}>
                <Text style={styles.musclePrimary} numberOfLines={1}>{facts.primaryMuscle}</Text>
                {facts.secondaryMuscles.length > 0 && (
                  <Text style={styles.muscleSecondary} numberOfLines={1}>
                    {facts.secondaryMuscles.join(", ")}
                  </Text>
                )}
              </View>
            </View>
          )}
        </View>

        <View style={styles.chevron}>
          <ChevronRight size={18} color={colors.textMuted} />
        </View>
      </TouchableOpacity>
    </Swipeable>
  );
}

const styles = StyleSheet.create({
  // The gap between cards lives out here: inside the Swipeable it would leave
  // a stripe of red showing under the next card.
  swipeContainer: { marginBottom: spacing.md },
  // No padding on the card: the thumbnail sits flush to the edges and the
  // card's rounded corners (overflow: hidden) clip it.
  card: {
    flexDirection: "row", alignItems: "stretch",
    backgroundColor: colors.surface2,
    borderRadius: CARD_RADIUS, borderWidth: 1, borderColor: colors.border,
    overflow: "hidden",
  },
  thumbWrap: { width: THUMB, alignSelf: "stretch" },
  thumb: { width: "100%", flex: 1 },
  thumbEmpty: { backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" },
  // Every corner chip shares the dark scrim so its text reads on any image.
  overlay: {
    position: "absolute",
    borderRadius: 5, paddingHorizontal: 5, paddingVertical: 2, borderWidth: 1,
    backgroundColor: tint(colors.bg, 0.82),
    flexDirection: "row", alignItems: "center", gap: 3,
  },
  // Format sits bottom-right; the done-state top-left, so the two never meet.
  formatOverlay: { bottom: spacing.sm, right: spacing.sm, borderColor: colors.brand },
  formatText: {
    fontSize: 10, fontWeight: "800", letterSpacing: 0.5,
    textTransform: "uppercase", color: colors.brand,
  },
  statusOverlay: { top: spacing.sm, left: spacing.sm },
  doneOverlay: { borderColor: colors.brand },
  doneText: { fontSize: 10, fontWeight: "800", color: colors.brand },
  doneTextStale: { color: colors.textMuted, fontWeight: "600" },
  neverOverlay: { borderColor: colors.border },
  neverText: {
    fontSize: 10, fontWeight: "800", letterSpacing: 0.5,
    textTransform: "uppercase", color: colors.textMuted,
  },
  body: { flex: 1, minWidth: 0, gap: spacing.sm, padding: spacing.md, justifyContent: "center" },
  name: { fontSize: 16, fontWeight: "700", color: colors.text, letterSpacing: -0.2 },
  equipment: { flexDirection: "row", alignItems: "center", gap: 6, flexShrink: 1, minWidth: 0, flexWrap: "wrap" },
  // Each glyph sits in its own rounded-square badge, styled like a selected
  // equipment tile on the Filters page: brand icon + border on a brand tint.
  equipBadge: {
    width: 24, height: 24, borderRadius: 6, alignItems: "center", justifyContent: "center",
    backgroundColor: tint(colors.brand), borderWidth: 1, borderColor: colors.brand,
  },
  // The overflow chip: same frame, muted, so "+3" reads as "more" not "gear".
  equipMore: { backgroundColor: colors.surface, borderColor: colors.border },
  equipMoreText: { fontSize: 11, fontWeight: "700", color: colors.textMuted },
  muscles: { flexDirection: "row", alignItems: "center", gap: 6, flexShrink: 1, minWidth: 0 },
  muscleNames: { flexShrink: 1, minWidth: 0 },
  musclePrimary: { fontSize: 11.5, fontWeight: "600", color: colors.text, lineHeight: 14 },
  muscleSecondary: { fontSize: 11.5, color: colors.textMuted, lineHeight: 14 },
  chevron: { justifyContent: "center", paddingRight: spacing.md },
});
