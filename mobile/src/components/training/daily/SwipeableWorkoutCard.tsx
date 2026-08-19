// A captured workout card that can be swiped away, matching the WOD list.
//
// The card itself is what the Workouts tab always drew; the swipe is the new
// part. Deleting says out loud what it does and does not take, because the one
// thing a person fears here is losing exercises they had before the capture.
import React, { useRef } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Alert, Image } from "react-native";
import { Swipeable } from "react-native-gesture-handler";
import { ChevronRight } from "lucide-react-native";
import { colors } from "@/src/lib/colors";
import { SwipeDeleteAction } from "@/src/components/ui/SwipeDeleteAction";
import { supabase } from "@/src/lib/supabase";
import { deleteCapturedWorkout } from "@/src/lib/supabase/capture";
import { formatWorkoutHeadline } from "@/src/lib/workoutFormat";
import { BLOCK_ORDER, BLOCK_TITLES } from "@/src/lib/dailyBlockCompose";
import type { CapturedWorkoutEntry } from "@/src/types/capture";

interface SwipeableWorkoutCardProps {
  workout: CapturedWorkoutEntry;
  onPress: () => void;
  /** Reload the list — the tab's count comes from it. */
  onDeleted: () => void;
}

export function SwipeableWorkoutCard({
  workout,
  onPress,
  onDeleted,
}: SwipeableWorkoutCardProps) {
  const swipeableRef = useRef<Swipeable>(null);
  const roles = BLOCK_ORDER.filter((r) => workout.tags.blockRoles.includes(r));

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
