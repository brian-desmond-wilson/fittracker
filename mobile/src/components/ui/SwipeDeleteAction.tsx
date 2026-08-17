// The red Delete panel revealed by swiping a card left.
//
// Three lists wanted the same panel and each kept its own copy, so a fix to
// one left the others behind — which is how they came to disagree with their
// cards' corners in the first place.
//
// The geometry is the point of this file. The panel measures 80, which is how
// far Swipeable slides the card; the red itself is wider and hangs `radius` to
// the left, tucked behind the card. Without that overlap a rounded card meets
// a square panel and the background shows through the curve as a dark notch.
// With it, the red fills the curve and the two read as one rounded rectangle
// at every point in the swipe, not only when the row is fully open.
import React from "react";
import { Text, StyleSheet, TouchableOpacity, Animated } from "react-native";
import { Trash2 } from "lucide-react-native";

const PANEL_WIDTH = 80;
/** Matches the card's own corner radius — they have to agree. */
const DEFAULT_RADIUS = 12;

interface SwipeDeleteActionProps {
  /** Swipeable's drag progress, straight from renderRightActions. */
  progress: Animated.AnimatedInterpolation<number>;
  onPress: () => void;
  /** The corner radius of the card this sits against. */
  radius?: number;
  /** Names the row for a screen reader, e.g. "Delete Full Body Workout". */
  accessibilityLabel?: string;
}

export function SwipeDeleteAction({
  progress,
  onPress,
  radius = DEFAULT_RADIUS,
  accessibilityLabel,
}: SwipeDeleteActionProps) {
  const translateX = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [PANEL_WIDTH, 0],
  });

  return (
    <Animated.View style={[styles.action, { transform: [{ translateX }] }]}>
      <TouchableOpacity
        style={[
          styles.button,
          {
            width: PANEL_WIDTH + radius,
            marginLeft: -radius,
            paddingLeft: radius,
            // Only the outer corners round; the left pair sits behind the card.
            borderTopRightRadius: radius,
            borderBottomRightRadius: radius,
          },
        ]}
        onPress={onPress}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel ?? "Delete"}
      >
        <Trash2 size={20} color="#FFFFFF" />
        <Text style={styles.text}>Delete</Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  action: {
    width: PANEL_WIDTH,
    justifyContent: "center",
    alignItems: "flex-end",
    overflow: "visible",
  },
  button: {
    backgroundColor: "#EF4444",
    justifyContent: "center",
    alignItems: "center",
    height: "100%",
    gap: 4,
  },
  text: { color: "#FFFFFF", fontSize: 12, fontWeight: "600" },
});
