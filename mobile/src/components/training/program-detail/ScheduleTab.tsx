import React, { useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from "react-native";
import { Dumbbell, Calendar, Plus } from "lucide-react-native";
import { colors } from "@/src/lib/colors";

interface ScheduleTabProps {
  programId: string;
  durationWeeks: number;
}

interface Workout {
  id: string;
  day: number;
  name: string;
  type: string;
}

// TODO: Fetch workouts from database based on programId and selectedWeek
// For now, workouts will be empty until we implement workout creation

export default function ScheduleTab({ programId, durationWeeks }: ScheduleTabProps) {
  const [selectedWeek, setSelectedWeek] = useState(1);
  const [workouts, setWorkouts] = useState<Workout[]>([]);

  const weeks = Array.from({ length: durationWeeks }, (_, i) => i + 1);

  // TODO: Fetch workouts for selected week from database
  // useEffect(() => { fetchWorkoutsForWeek(programId, selectedWeek) }, [programId, selectedWeek]);

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

        {workouts.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateTitle}>No workouts scheduled</Text>
            <Text style={styles.emptyStateText}>
              Add workouts to this week to get started!
            </Text>
            <TouchableOpacity style={styles.addButton} activeOpacity={0.8}>
              <Plus size={20} color={colors.primaryForeground} />
              <Text style={styles.addButtonText}>Add Workout</Text>
            </TouchableOpacity>
          </View>
        ) : (
          workouts.map((workout) => (
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
          ))
        )}

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
  emptyState: {
    alignItems: "center",
    paddingVertical: 60,
    paddingHorizontal: 20,
  },
  emptyStateTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: colors.foreground,
    marginBottom: 8,
  },
  emptyStateText: {
    fontSize: 14,
    color: colors.mutedForeground,
    textAlign: "center",
    marginBottom: 24,
  },
  addButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: colors.primary,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
  },
  addButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.primaryForeground,
  },
});
