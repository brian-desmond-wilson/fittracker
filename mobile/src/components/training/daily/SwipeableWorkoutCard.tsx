// A captured workout card that can be swiped away, matching the WOD list.
//
// The card itself is what the Workouts tab always drew; the swipe is the new
// part. Deleting says out loud what it does and does not take, because the one
// thing a person fears here is losing exercises they had before the capture.
import React, { useRef } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Alert, Image } from "react-native";
import { Swipeable } from "react-native-gesture-handler";
import { Check, ChevronRight } from "lucide-react-native";
import { colors } from "@/src/lib/colors";
import { SwipeDeleteAction } from "@/src/components/ui/SwipeDeleteAction";
import { supabase } from "@/src/lib/supabase";
import { deleteCapturedWorkout } from "@/src/lib/supabase/capture";
import { formatWorkoutHeadline } from "@/src/lib/workoutFormat";
import { BLOCK_ORDER, BLOCK_TITLES } from "@/src/lib/dailyBlockCompose";
import { formatLastCompleted, isStale } from "@/src/lib/workoutCompletion";
import type { WorkoutCompletion } from "@/src/lib/workoutCompletion";
import type { CapturedWorkoutEntry } from "@/src/types/capture";

interface SwipeableWorkoutCardProps {
  workout: CapturedWorkoutEntry;
  onPress: () => void;
  /** Reload the list — the tab's count comes from it. */
  onDeleted: () => void;
  /** This workout's history, or null when it has never been completed. The
   *  card draws nothing at all in that case — an empty state here would be a
   *  row of dashes on every workout you have not got round to yet. */
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
  const roles = BLOCK_ORDER.filter((r) => workout.tags.blockRoles.includes(r));
  // Stale history is drawn muted so the green means "this is current training"
  // rather than merely "this happened once". The date can still come back null
  // on an unreadable value, in which case the count stands alone.
  const stale = completion ? isStale(completion, today) : false;
  const lastLabel = completion ? formatLastCompleted(completion, today) : null;

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
        accessibilityLabel={[
          workout.name,
          completion
            ? `Completed ${completion.count} ${completion.count === 1 ? "time" : "times"}` +
              (lastLabel ? `, last ${lastLabel.toLowerCase()}` : "")
            : null,
          workout.tags.classifiedAt === null
            ? "Not yet tagged for the recommender"
            : roles.length > 0
              ? `Serves as ${roles.map((r) => BLOCK_TITLES[r].toLowerCase()).join(", ")}`
              : null,
          "Open the workout.",
        ].filter(Boolean).join(". ")}
      >
        {workout.source?.thumbnailUrl && (
          <Image source={{ uri: workout.source.thumbnailUrl }} style={styles.thumb} />
        )}
        <View style={styles.cardBody}>
          <Text style={styles.cardName}>{workout.name}</Text>
          <Text style={styles.cardMeta}>
            {formatWorkoutHeadline(workout.items.length, workout.rounds)}
          </Text>
          {/* What you have actually done with it. Its own line rather than an
              extra segment on the meta above: a long name and a long date
              would otherwise compete for one row on a narrow phone, and this
              line has to be able to vanish whole. */}
          {completion && (
            <View style={styles.histLine}>
              <Check
                size={13}
                strokeWidth={2.4}
                color={stale ? colors.mutedForeground : colors.primary}
              />
              <Text style={[styles.histCount, stale && styles.histCountStale]}>
                {completion.count}×
              </Text>
              {lastLabel && <Text style={styles.histWhen}>· {lastLabel}</Text>}
            </View>
          )}
          {/* Which parts of a day this can serve. Ordered by BLOCK_ORDER, not
              by however the tags came back, so the same workout always reads
              the same way. An untagged workout says so instead — it is
              invisible to the recommender until someone classifies it. */}
          {workout.tags.classifiedAt === null ? (
            <View style={styles.roleRow}>
              <Text style={[styles.rolePill, styles.rolePillUntagged]}>Untagged</Text>
            </View>
          ) : roles.length > 0 ? (
            <View style={styles.roleRow}>
              {roles.map((role) => (
                <Text key={role} style={styles.rolePill}>
                  {BLOCK_TITLES[role]}
                </Text>
              ))}
            </View>
          ) : null}
          {workout.source?.posterHandle && (
            <Text style={styles.handle}>{workout.source.posterHandle}</Text>
          )}
        </View>
        <ChevronRight size={18} color={colors.mutedForeground} />
      </TouchableOpacity>
    </Swipeable>
  );
}

/** Shared by the card and the delete panel — they have to agree. */
const CARD_RADIUS = 12;

const styles = StyleSheet.create({
  // The gap between cards lives out here: inside the Swipeable it would leave
  // a stripe of red showing under the next card.
  swipeContainer: { marginBottom: 12 },
  card: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: colors.muted, borderRadius: CARD_RADIUS,
    borderWidth: 1, borderColor: colors.border,
    overflow: "hidden", paddingRight: 12,
  },
  thumb: { width: 72, height: 72 },
  cardBody: { flex: 1, padding: 12 },
  cardName: { fontSize: 16, fontWeight: "600", color: colors.foreground },
  cardMeta: { fontSize: 13, color: colors.mutedForeground, marginTop: 2 },
  handle: { fontSize: 13, color: colors.primary, marginTop: 4 },
  histLine: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 5 },
  histCount: { fontSize: 13, fontWeight: "600", color: colors.primary },
  histCountStale: { color: colors.mutedForeground, fontWeight: "400" },
  histWhen: { fontSize: 13, color: colors.mutedForeground },
  roleRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 6 },
  rolePill: {
    fontSize: 11, color: colors.primary, borderWidth: 1,
    borderColor: colors.primary, borderRadius: 10,
    paddingHorizontal: 8, paddingVertical: 2,
    // overflow:hidden makes the radius clip on iOS, where a Text's background
    // and border otherwise square off at the corners.
    overflow: "hidden",
  },
  rolePillUntagged: { color: colors.mutedForeground, borderColor: colors.border },
});
