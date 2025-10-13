import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet } from "react-native";
import { HOUR_HEIGHT } from "./TimeGrid";

export function CurrentTimeIndicator() {
  const [position, setPosition] = useState(0);
  const [currentTime, setCurrentTime] = useState("");

  useEffect(() => {
    const updatePosition = () => {
      const now = new Date();
      const hours = now.getHours();
      const minutes = now.getMinutes();

      // Calculate hours from 5am
      let hoursFrom5am = hours - 5;
      if (hoursFrom5am < 0) hoursFrom5am += 24;

      // Calculate position in pixels
      const pos = hoursFrom5am * HOUR_HEIGHT + (minutes / 60) * HOUR_HEIGHT;
      setPosition(pos);

      // Format current time
      const timeStr = now.toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      });
      setCurrentTime(timeStr);
    };

    updatePosition();
    const interval = setInterval(updatePosition, 60000); // Update every minute

    return () => clearInterval(interval);
  }, []);

  return (
    <View
      style={[styles.container, { top: position }]}
      pointerEvents="none"
    >
      {/* Time label */}
      <View style={styles.timeLabel}>
        <Text style={styles.timeLabelText}>{currentTime}</Text>
      </View>

      {/* Line */}
      <View style={styles.line} />

      {/* Circle indicator */}
      <View style={styles.circle} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    left: 0,
    right: 0,
    zIndex: 20,
  },
  timeLabel: {
    position: "absolute",
    left: 48,
    top: -12,
    backgroundColor: "#22C55E",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
    transform: [{ translateX: -100 }],
    paddingRight: 12,
  },
  timeLabelText: {
    color: "#0A0F1E",
    fontSize: 12,
    fontWeight: "bold",
  },
  line: {
    position: "absolute",
    left: 48,
    right: 0,
    height: 2,
    backgroundColor: "#22C55E",
    shadowColor: "#22C55E",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 10,
    elevation: 2,
  },
  circle: {
    position: "absolute",
    left: 48,
    top: -6,
    width: 12,
    height: 12,
    backgroundColor: "#22C55E",
    borderRadius: 6,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
    zIndex: 10,
  },
});
