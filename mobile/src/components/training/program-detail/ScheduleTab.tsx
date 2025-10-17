import React, { useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from "react-native";
import { Dumbbell, Calendar } from "lucide-react-native";
import { colors } from "@/src/lib/colors";

interface ScheduleTabProps {
  programId: string;
}

// Mock workout data
const MOCK_WORKOUTS = [
  { id: "1", day: 1, name: "Leg Strength", type: "Strength" },
  { id: "2", day: 2, name: "Push Hypertrophy", type: "Hypertrophy" },
  { id: "3", day: 3, name: "Pull Strength", type: "Strength" },
  { id: "4", day: 4, name: "Leg Hypertrophy", type: "Hypertrophy" },
  { id: "5", day: 5, name: "Push Strength", type: "Strength" },
  { id: "6", day: 6, name: "Pull Hypertrophy", type: "Hypertrophy" },
  { id: "7", day: 7, name: "Rest Day", type: "Rest" },
  { id: "8", day: 8, name: "Full Body Power", type: "Power" },
];

export default function ScheduleTab({ programId }: ScheduleTabProps) {
  const [selectedWeek, setSelectedWeek] = useState(1);

  const weeks = Array.from({ length: 14 }, (_, i) => i + 1);

  const getWorkoutTypeColor = (type: string) => {
    switch (type) {
      case "Strength":
        return "#EF4444";
      case "Hypertrophy":
        return "#8B5CF6";
      case "Power":
        return "#F59E0B";
      case "Rest":
        return "#6B7280";
      default:
        return colors.mutedForeground;
    }
  };

  return (
    <View style={styles.container}>
      {/* Week Selector */}
      <View style={styles.weekSelectorContainer}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.weekScrollContent}
        >
          {weeks.map((week) => (
            <TouchableOpacity
              key={week}
              style={[styles.weekButton, selectedWeek === week && styles.weekButtonActive]}
              onPress={() => setSelectedWeek(week)}
            >
              <Text
                style={[styles.weekButtonText, selectedWeek === week && styles.weekButtonTextActive]}
              >
                Week {week}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Workout List */}
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.weekHeader}>
          <Calendar size={18} color={colors.primary} />
          <Text style={styles.weekTitle}>Week {selectedWeek} Schedule</Text>
        </View>

        {MOCK_WORKOUTS.map((workout) => (
          <TouchableOpacity key={workout.id} style={styles.workoutCard} activeOpacity={0.7}>
            <View style={styles.dayBadge}>
              <Text style={styles.dayText}>Day {workout.day}</Text>
            </View>

            <View style={styles.workoutInfo}>
              <View style={styles.workoutHeader}>
                <Dumbbell size={18} color={getWorkoutTypeColor(workout.type)} />
                <Text style={styles.workoutName}>{workout.name}</Text>
              </View>
              <View
                style={[
                  styles.typeBadge,
                  { backgroundColor: `${getWorkoutTypeColor(workout.type)}20` },
                ]}
              >
                <Text style={[styles.typeText, { color: getWorkoutTypeColor(workout.type) }]}>
                  {workout.type}
                </Text>
              </View>
            </View>
          </TouchableOpacity>
        ))}

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  weekSelectorContainer: {
    backgroundColor: colors.secondary,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  weekScrollContent: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
  },
  weekButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
  },
  weekButtonActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  weekButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.mutedForeground,
  },
  weekButtonTextActive: {
    color: colors.primaryForeground,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
  },
  weekHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 16,
  },
  weekTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.foreground,
  },
  workoutCard: {
    flexDirection: "row",
    backgroundColor: colors.secondary,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    gap: 16,
  },
  dayBadge: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: colors.primary,
    justifyContent: "center",
    alignItems: "center",
  },
  dayText: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.primaryForeground,
  },
  workoutInfo: {
    flex: 1,
  },
  workoutHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  workoutName: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.foreground,
  },
  typeBadge: {
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  typeText: {
    fontSize: 12,
    fontWeight: "600",
  },
});
