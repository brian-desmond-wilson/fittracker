import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";

export const HOUR_HEIGHT = 80; // Height in pixels for each hour
const HOURS = Array.from({ length: 24 }, (_, i) => (i + 5) % 24); // 5am-4am

interface TimeGridProps {
  onTimeSlotClick?: (hour: number, minute: number) => void;
}

export function TimeGrid({ onTimeSlotClick }: TimeGridProps) {
  const formatHour = (hour: number) => {
    if (hour === 0) return "12 AM";
    if (hour === 12) return "12 PM";
    if (hour < 12) return `${hour} AM`;
    return `${hour - 12} PM`;
  };

  const handleSlotClick = (hour: number, quarterIndex: number) => {
    if (onTimeSlotClick) {
      const minute = quarterIndex * 15;
      onTimeSlotClick(hour, minute);
    }
  };

  return (
    <View style={styles.container} pointerEvents="box-none">
      <View style={[styles.grid, { paddingLeft: 48 }]}>
        {HOURS.map((hour, index) => (
          <View
            key={`hour-${index}`}
            style={[
              styles.hourRow,
              { top: index * HOUR_HEIGHT, height: HOUR_HEIGHT },
            ]}
          >
            {/* Hour label */}
            <View style={styles.hourLabel}>
              <Text style={styles.hourText}>{formatHour(hour)}</Text>
            </View>

            {/* Clickable 15-minute interval slots */}
            {onTimeSlotClick && (
              <>
                <TouchableOpacity
                  onPress={() => handleSlotClick(hour, 0)}
                  style={[styles.timeSlot, { top: 0, height: HOUR_HEIGHT / 4 }]}
                  activeOpacity={0.8}
                />
                <TouchableOpacity
                  onPress={() => handleSlotClick(hour, 1)}
                  style={[
                    styles.timeSlot,
                    { top: HOUR_HEIGHT / 4, height: HOUR_HEIGHT / 4 },
                  ]}
                  activeOpacity={0.8}
                />
                <TouchableOpacity
                  onPress={() => handleSlotClick(hour, 2)}
                  style={[
                    styles.timeSlot,
                    { top: HOUR_HEIGHT / 2, height: HOUR_HEIGHT / 4 },
                  ]}
                  activeOpacity={0.8}
                />
                <TouchableOpacity
                  onPress={() => handleSlotClick(hour, 3)}
                  style={[
                    styles.timeSlot,
                    { top: (HOUR_HEIGHT * 3) / 4, height: HOUR_HEIGHT / 4 },
                  ]}
                  activeOpacity={0.8}
                />
              </>
            )}

            {/* 15-minute interval lines */}
            <View
              style={[styles.quarterLine, { top: HOUR_HEIGHT / 4, opacity: 0.3 }]}
            />
            <View
              style={[styles.halfLine, { top: HOUR_HEIGHT / 2 }]}
            />
            <View
              style={[styles.quarterLine, { top: (HOUR_HEIGHT * 3) / 4, opacity: 0.3 }]}
            />
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  grid: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  hourRow: {
    position: "absolute",
    left: 0,
    right: 0,
    borderTopWidth: 1,
    borderTopColor: "#1F2937",
  },
  hourLabel: {
    position: "absolute",
    left: 4,
    top: -12,
    backgroundColor: "#0A0F1E",
    paddingHorizontal: 4,
  },
  hourText: {
    fontSize: 12,
    color: "#6B7280",
    fontWeight: "500",
  },
  timeSlot: {
    position: "absolute",
    left: 48,
    right: 0,
  },
  quarterLine: {
    position: "absolute",
    left: 48,
    right: 0,
    height: 1,
    backgroundColor: "#111827",
  },
  halfLine: {
    position: "absolute",
    left: 48,
    right: 0,
    height: 1,
    backgroundColor: "#1F2937",
  },
});
