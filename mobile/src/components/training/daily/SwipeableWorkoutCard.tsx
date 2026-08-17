// A captured workout card that can be swiped away, matching the WOD list.
//
// The card itself is what the Workouts tab always drew; the swipe is the new
// part. Deleting says out loud what it does and does not take, because the one
// thing a person fears here is losing exercises they had before the capture.
import React, { useRef } from "react";
import {
  View, Text, StyleSheet, TouchableOpacity, Animated, Alert, Image,
} from "react-native";
import { Swipeable } from "react-native-gesture-handler";
import { ChevronRight, Trash2 } from "lucide-react-native";
import { colors } from "@/src/lib/colors";
import { supabase } from "@/src/lib/supabase";
import { deleteCapturedWorkout } from "@/src/lib/supabase/capture";
import { formatWorkoutHeadline } from "@/src/lib/workoutFormat";
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

  const renderRightActions = (progress: Animated.AnimatedInterpolation<number>) => {
    const translateX = progress.interpolate({
      inputRange: [0, 1],
      outputRange: [80, 0],
    });
    return (
      <Animated.View style={[styles.deleteAction, { transform: [{ translateX }] }]}>
        <TouchableOpacity style={styles.deleteButton} onPress={handleDelete} activeOpacity={0.7}>
          <Trash2 size={20} color="#FFFFFF" />
          <Text style={styles.deleteText}>Delete</Text>
        </TouchableOpacity>
      </Animated.View>
    );
  };

  return (
    <Swipeable
      ref={swipeableRef}
      renderRightActions={renderRightActions}
      overshootRight={false}
      friction={2}
      containerStyle={styles.swipeContainer}
    >
      <TouchableOpacity
        style={styles.card}
        onPress={onPress}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={`${workout.name}. Open the workout.`}
      >
        {workout.source?.thumbnailUrl && (
          <Image source={{ uri: workout.source.thumbnailUrl }} style={styles.thumb} />
        )}
        <View style={styles.cardBody}>
          <Text style={styles.cardName}>{workout.name}</Text>
          <Text style={styles.cardMeta}>
            {formatWorkoutHeadline(workout.items.length, workout.rounds)}
          </Text>
          {workout.source?.posterHandle && (
            <Text style={styles.handle}>{workout.source.posterHandle}</Text>
          )}
        </View>
        <ChevronRight size={18} color={colors.mutedForeground} />
      </TouchableOpacity>
    </Swipeable>
  );
}

const styles = StyleSheet.create({
  // The gap between cards lives out here: inside the Swipeable it would leave
  // a stripe of red showing under the next card.
  swipeContainer: { marginBottom: 12 },
  card: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: colors.muted, borderRadius: 12,
    borderWidth: 1, borderColor: colors.border,
    overflow: "hidden", paddingRight: 12,
  },
  thumb: { width: 72, height: 72 },
  cardBody: { flex: 1, padding: 12 },
  cardName: { fontSize: 16, fontWeight: "600", color: colors.foreground },
  cardMeta: { fontSize: 13, color: colors.mutedForeground, marginTop: 2 },
  handle: { fontSize: 13, color: colors.primary, marginTop: 4 },
  deleteAction: { justifyContent: "center", alignItems: "flex-end", width: 80 },
  deleteButton: {
    backgroundColor: "#EF4444", justifyContent: "center", alignItems: "center",
    width: 80, height: "100%", gap: 4,
    borderTopRightRadius: 12, borderBottomRightRadius: 12,
  },
  deleteText: { color: "#FFFFFF", fontSize: 12, fontWeight: "600" },
});
