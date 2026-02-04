import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Modal,
  ActivityIndicator,
} from "react-native";
import { useRouter } from "expo-router";
import { Dumbbell, Calendar, Plus, Clock } from "lucide-react-native";
import { colors } from "@/src/lib/colors";
import { fetchWorkoutsForWeek } from "@/src/lib/supabase/training";
import { AddWorkoutWizard } from "./workout-wizard/AddWorkoutWizard";
import type { ProgramWorkoutWithRelations } from "@/src/types/training";

interface ScheduleTabProps {
  programId: string;
  durationWeeks: number;
  daysPerWeek: number;
}

export default function ScheduleTab({ programId, durationWeeks, daysPerWeek }: ScheduleTabProps) {
  const router = useRouter();
  const [selectedWeek, setSelectedWeek] = useState(1);
  const [workouts, setWorkouts] = useState<ProgramWorkoutWithRelations[]>([]);
  const [loading, setLoading] = useState(false);
  const [showWizard, setShowWizard] = useState(false);

  const weeks = Array.from({ length: durationWeeks }, (_, i) => i + 1);

  useEffect(() => {
    loadWorkouts();
  }, [programId, selectedWeek]);

  const loadWorkouts = async () => {
    try {
      setLoading(true);
      const data = await fetchWorkoutsForWeek(programId, selectedWeek);
      setWorkouts(data);
    } catch (error) {
      console.error("Error loading workouts:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddWorkout = () => {
    setShowWizard(true);
  };

  const handleWizardClose = () => {
    setShowWizard(false);
  };

  const handleWizardSave = () => {
    setShowWizard(false);
    loadWorkouts(); // Refresh workouts after saving
  };

  const getWorkoutTypeColor = (type: string) => {
    switch (type) {
      case "Strength":
        return "#EF4444";
      case "Hypertrophy":
        return "#8B5CF6";
      case "Power":
        return "#F59E0B";
      case "Endurance":
        return "#22C55E";
      case "Rest":
        return "#6B7280";
      case "Deload":
        return "#3B82F6";
      default:
        return colors.mutedForeground;
    }
  };

  const getExerciseCount = (workout: ProgramWorkoutWithRelations) => {
    return workout.exercises?.length || 0;
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

        {loading ? (
          <View style={styles.loadingState}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : workouts.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateTitle}>No workouts scheduled</Text>
            <Text style={styles.emptyStateText}>
              Add workouts to this week to get started!
            </Text>
            <TouchableOpacity
              style={styles.addButton}
              activeOpacity={0.8}
              onPress={handleAddWorkout}
            >
              <Plus size={20} color={colors.primaryForeground} />
              <Text style={styles.addButtonText}>Add Workout</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {workouts.map((workout) => (
              <TouchableOpacity
                key={workout.id}
                style={styles.workoutCard}
                activeOpacity={0.7}
                onPress={() => router.push(`/(tabs)/training/workout/${workout.id}`)}
              >
                <View style={styles.dayBadge}>
                  <Text style={styles.dayText}>Day {workout.day_number}</Text>
                </View>

                <View style={styles.workoutInfo}>
                  <View style={styles.workoutHeader}>
                    <Dumbbell size={18} color={getWorkoutTypeColor(workout.workout_type)} />
                    <Text style={styles.workoutName}>{workout.name}</Text>
                  </View>
                  <View style={styles.workoutMeta}>
                    <View
                      style={[
                        styles.typeBadge,
                        { backgroundColor: `${getWorkoutTypeColor(workout.workout_type)}20` },
                      ]}
                    >
                      <Text style={[styles.typeText, { color: getWorkoutTypeColor(workout.workout_type) }]}>
                        {workout.workout_type}
                      </Text>
                    </View>
                    <View style={styles.metaItem}>
                      <Dumbbell size={14} color={colors.mutedForeground} />
                      <Text style={styles.metaText}>{getExerciseCount(workout)} exercises</Text>
                    </View>
                    {workout.estimated_duration_minutes && (
                      <View style={styles.metaItem}>
                        <Clock size={14} color={colors.mutedForeground} />
                        <Text style={styles.metaText}>{workout.estimated_duration_minutes} min</Text>
                      </View>
                    )}
                  </View>
                </View>
              </TouchableOpacity>
            ))}

            {/* Add More Button */}
            <TouchableOpacity
              style={styles.addMoreButton}
              activeOpacity={0.7}
              onPress={handleAddWorkout}
            >
              <Plus size={18} color={colors.primary} />
              <Text style={styles.addMoreText}>Add Another Workout</Text>
            </TouchableOpacity>
          </>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Add Workout Wizard Modal */}
      <Modal
        visible={showWizard}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={handleWizardClose}
      >
        <AddWorkoutWizard
          programId={programId}
          weekNumber={selectedWeek}
          daysPerWeek={daysPerWeek}
          onClose={handleWizardClose}
          onSave={handleWizardSave}
        />
      </Modal>
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
  loadingState: {
    paddingVertical: 60,
    alignItems: "center",
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
  workoutMeta: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 10,
  },
  typeBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  typeText: {
    fontSize: 12,
    fontWeight: "600",
  },
  metaItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  metaText: {
    fontSize: 12,
    color: colors.mutedForeground,
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
  addMoreButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.primary,
    borderStyle: "dashed",
    marginTop: 4,
  },
  addMoreText: {
    fontSize: 15,
    fontWeight: "600",
    color: colors.primary,
  },
});
