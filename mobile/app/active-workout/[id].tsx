import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  StatusBar,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  ChevronLeft,
  Plus,
  Minus,
  CheckCircle2,
  Timer,
  Star,
  Dumbbell,
} from "lucide-react-native";
import { colors } from "@/src/lib/colors";

interface ExerciseSet {
  setNumber: number;
  targetReps: string;
  targetWeight: number | null;
  completedReps: number | null;
  completedWeight: number | null;
  rpe: number | null;
  isCompleted: boolean;
}

interface Exercise {
  id: string;
  name: string;
  sets: ExerciseSet[];
  restSeconds: number;
}

// Mock workout data
const MOCK_WORKOUT = {
  id: "1",
  name: "Push Hypertrophy - Week 1 Day 2",
  date: new Date().toISOString(),
  exercises: [
    {
      id: "1",
      name: "Bench Press",
      sets: [
        { setNumber: 1, targetReps: "8-10", targetWeight: 185, completedReps: null, completedWeight: null, rpe: null, isCompleted: false },
        { setNumber: 2, targetReps: "8-10", targetWeight: 185, completedReps: null, completedWeight: null, rpe: null, isCompleted: false },
        { setNumber: 3, targetReps: "8-10", targetWeight: 185, completedReps: null, completedWeight: null, rpe: null, isCompleted: false },
        { setNumber: 4, targetReps: "8-10", targetWeight: 185, completedReps: null, completedWeight: null, rpe: null, isCompleted: false },
      ],
      restSeconds: 180,
    },
    {
      id: "2",
      name: "Incline Dumbbell Press",
      sets: [
        { setNumber: 1, targetReps: "10-12", targetWeight: 70, completedReps: null, completedWeight: null, rpe: null, isCompleted: false },
        { setNumber: 2, targetReps: "10-12", targetWeight: 70, completedReps: null, completedWeight: null, rpe: null, isCompleted: false },
        { setNumber: 3, targetReps: "10-12", targetWeight: 70, completedReps: null, completedWeight: null, rpe: null, isCompleted: false },
      ],
      restSeconds: 150,
    },
    {
      id: "3",
      name: "Cable Flys",
      sets: [
        { setNumber: 1, targetReps: "12-15", targetWeight: 50, completedReps: null, completedWeight: null, rpe: null, isCompleted: false },
        { setNumber: 2, targetReps: "12-15", targetWeight: 50, completedReps: null, completedWeight: null, rpe: null, isCompleted: false },
        { setNumber: 3, targetReps: "12-15", targetWeight: 50, completedReps: null, completedWeight: null, rpe: null, isCompleted: false },
      ],
      restSeconds: 120,
    },
  ],
};

export default function ActiveWorkout() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const insets = useSafeAreaInsets();

  const workoutId = params.id as string;

  const [exercises, setExercises] = useState<Exercise[]>(MOCK_WORKOUT.exercises);
  const [currentExerciseIndex, setCurrentExerciseIndex] = useState(0);
  const [restTimerActive, setRestTimerActive] = useState(false);
  const [restSecondsRemaining, setRestSecondsRemaining] = useState(0);

  // Rest timer effect
  useEffect(() => {
    if (!restTimerActive || restSecondsRemaining <= 0) {
      return;
    }

    const timer = setInterval(() => {
      setRestSecondsRemaining((prev) => {
        if (prev <= 1) {
          setRestTimerActive(false);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [restTimerActive, restSecondsRemaining]);

  const startRestTimer = (seconds: number) => {
    setRestSecondsRemaining(seconds);
    setRestTimerActive(true);
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const updateSet = (
    exerciseId: string,
    setNumber: number,
    field: "completedReps" | "completedWeight" | "rpe",
    value: number | null
  ) => {
    setExercises((prev) =>
      prev.map((ex) =>
        ex.id === exerciseId
          ? {
              ...ex,
              sets: ex.sets.map((set) =>
                set.setNumber === setNumber ? { ...set, [field]: value } : set
              ),
            }
          : ex
      )
    );
  };

  const completeSet = (exerciseId: string, setNumber: number) => {
    const exercise = exercises.find((ex) => ex.id === exerciseId);
    const set = exercise?.sets.find((s) => s.setNumber === setNumber);

    if (!set?.completedReps || !set?.completedWeight || !set?.rpe) {
      Alert.alert("Incomplete Set", "Please fill in reps, weight, and RPE before completing the set.");
      return;
    }

    setExercises((prev) =>
      prev.map((ex) =>
        ex.id === exerciseId
          ? {
              ...ex,
              sets: ex.sets.map((s) =>
                s.setNumber === setNumber ? { ...s, isCompleted: true } : s
              ),
            }
          : ex
      )
    );

    // Start rest timer
    if (exercise) {
      startRestTimer(exercise.restSeconds);
    }
  };

  const finishWorkout = () => {
    const allCompleted = exercises.every((ex) => ex.sets.every((set) => set.isCompleted));

    if (!allCompleted) {
      Alert.alert(
        "Incomplete Workout",
        "Some sets are not completed yet. Are you sure you want to finish?",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Finish Anyway",
            style: "destructive",
            onPress: () => {
              // TODO: Save workout to database
              router.back();
            },
          },
        ]
      );
      return;
    }

    Alert.alert("Great Work!", "Workout completed successfully!", [
      {
        text: "OK",
        onPress: () => {
          // TODO: Save workout to database
          router.back();
        },
      },
    ]);
  };

  const currentExercise = exercises[currentExerciseIndex];
  const completedSets = currentExercise?.sets.filter((s) => s.isCompleted).length || 0;
  const totalSets = currentExercise?.sets.length || 0;

  return (
    <>
      <StatusBar barStyle="light-content" />
      <View style={[styles.container, { paddingTop: insets.top }]}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <ChevronLeft size={24} color="#FFFFFF" />
            <Text style={styles.backText}>Exit</Text>
          </TouchableOpacity>
        </View>

        {/* Workout Title */}
        <View style={styles.titleSection}>
          <Text style={styles.workoutName}>{MOCK_WORKOUT.name}</Text>
          <Text style={styles.workoutProgress}>
            Exercise {currentExerciseIndex + 1} of {exercises.length}
          </Text>
        </View>

        {/* Rest Timer (if active) */}
        {restTimerActive && (
          <View style={styles.restTimer}>
            <Timer size={20} color={colors.primary} />
            <Text style={styles.restTimerText}>Rest: {formatTime(restSecondsRemaining)}</Text>
            <TouchableOpacity onPress={() => setRestTimerActive(false)} style={styles.skipRestButton}>
              <Text style={styles.skipRestText}>Skip</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Exercise Tabs */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.exerciseTabsContainer}
          style={styles.exerciseTabs}
        >
          {exercises.map((exercise, index) => (
            <TouchableOpacity
              key={exercise.id}
              style={[
                styles.exerciseTab,
                currentExerciseIndex === index && styles.exerciseTabActive,
              ]}
              onPress={() => setCurrentExerciseIndex(index)}
            >
              <Text
                style={[
                  styles.exerciseTabText,
                  currentExerciseIndex === index && styles.exerciseTabTextActive,
                ]}
              >
                {exercise.name}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Current Exercise */}
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.exerciseHeader}>
            <View style={styles.exerciseHeaderLeft}>
              <Dumbbell size={24} color={colors.primary} />
              <View>
                <Text style={styles.exerciseName}>{currentExercise.name}</Text>
                <Text style={styles.exerciseProgress}>
                  {completedSets}/{totalSets} sets completed
                </Text>
              </View>
            </View>
          </View>

          {/* Sets */}
          {currentExercise.sets.map((set) => (
            <View
              key={set.setNumber}
              style={[styles.setCard, set.isCompleted && styles.setCardCompleted]}
            >
              <View style={styles.setHeader}>
                <Text style={styles.setNumber}>Set {set.setNumber}</Text>
                <Text style={styles.setTarget}>
                  Target: {set.targetReps} reps @ {set.targetWeight} lbs
                </Text>
              </View>

              {!set.isCompleted ? (
                <>
                  <View style={styles.inputRow}>
                    <View style={styles.inputGroup}>
                      <Text style={styles.inputLabel}>Reps</Text>
                      <View style={styles.inputContainer}>
                        <TouchableOpacity
                          style={styles.inputButton}
                          onPress={() =>
                            updateSet(
                              currentExercise.id,
                              set.setNumber,
                              "completedReps",
                              Math.max(0, (set.completedReps || 0) - 1)
                            )
                          }
                        >
                          <Minus size={16} color={colors.foreground} />
                        </TouchableOpacity>
                        <TextInput
                          style={styles.input}
                          keyboardType="number-pad"
                          value={set.completedReps?.toString() || ""}
                          onChangeText={(text) =>
                            updateSet(
                              currentExercise.id,
                              set.setNumber,
                              "completedReps",
                              text ? parseInt(text) : null
                            )
                          }
                          placeholder="0"
                          placeholderTextColor={colors.mutedForeground}
                        />
                        <TouchableOpacity
                          style={styles.inputButton}
                          onPress={() =>
                            updateSet(
                              currentExercise.id,
                              set.setNumber,
                              "completedReps",
                              (set.completedReps || 0) + 1
                            )
                          }
                        >
                          <Plus size={16} color={colors.foreground} />
                        </TouchableOpacity>
                      </View>
                    </View>

                    <View style={styles.inputGroup}>
                      <Text style={styles.inputLabel}>Weight (lbs)</Text>
                      <TextInput
                        style={styles.weightInput}
                        keyboardType="decimal-pad"
                        value={set.completedWeight?.toString() || ""}
                        onChangeText={(text) =>
                          updateSet(
                            currentExercise.id,
                            set.setNumber,
                            "completedWeight",
                            text ? parseFloat(text) : null
                          )
                        }
                        placeholder={set.targetWeight?.toString() || "0"}
                        placeholderTextColor={colors.mutedForeground}
                      />
                    </View>
                  </View>

                  <View style={styles.rpeSection}>
                    <Text style={styles.inputLabel}>RPE (Rate of Perceived Exertion)</Text>
                    <View style={styles.rpeButtons}>
                      {[6, 7, 8, 9, 10].map((rpe) => (
                        <TouchableOpacity
                          key={rpe}
                          style={[
                            styles.rpeButton,
                            set.rpe === rpe && styles.rpeButtonActive,
                          ]}
                          onPress={() =>
                            updateSet(currentExercise.id, set.setNumber, "rpe", rpe)
                          }
                        >
                          <Text
                            style={[
                              styles.rpeButtonText,
                              set.rpe === rpe && styles.rpeButtonTextActive,
                            ]}
                          >
                            {rpe}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>

                  <TouchableOpacity
                    style={styles.completeSetButton}
                    onPress={() => completeSet(currentExercise.id, set.setNumber)}
                    activeOpacity={0.8}
                  >
                    <CheckCircle2 size={20} color={colors.primaryForeground} />
                    <Text style={styles.completeSetButtonText}>Complete Set</Text>
                  </TouchableOpacity>
                </>
              ) : (
                <View style={styles.completedSetInfo}>
                  <CheckCircle2 size={24} color="#22C55E" />
                  <View style={styles.completedSetDetails}>
                    <Text style={styles.completedSetText}>
                      {set.completedReps} reps @ {set.completedWeight} lbs
                    </Text>
                    <View style={styles.rpeDisplay}>
                      <Star size={14} color="#F59E0B" fill="#F59E0B" />
                      <Text style={styles.rpeDisplayText}>RPE {set.rpe}</Text>
                    </View>
                  </View>
                </View>
              )}
            </View>
          ))}

          {/* Finish Workout Button */}
          <TouchableOpacity
            style={styles.finishButton}
            onPress={finishWorkout}
            activeOpacity={0.8}
          >
            <Text style={styles.finishButtonText}>Finish Workout</Text>
          </TouchableOpacity>

          <View style={{ height: 40 }} />
        </ScrollView>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  backText: {
    fontSize: 17,
    color: "#FFFFFF",
    fontWeight: "500",
  },
  titleSection: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  workoutName: {
    fontSize: 22,
    fontWeight: "700",
    color: colors.foreground,
    marginBottom: 4,
  },
  workoutProgress: {
    fontSize: 14,
    color: colors.mutedForeground,
  },
  restTimer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(34, 197, 94, 0.15)",
    paddingVertical: 12,
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(34, 197, 94, 0.3)",
  },
  restTimerText: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.primary,
  },
  skipRestButton: {
    marginLeft: 12,
    paddingHorizontal: 12,
    paddingVertical: 4,
    backgroundColor: colors.secondary,
    borderRadius: 6,
  },
  skipRestText: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.foreground,
  },
  exerciseTabs: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  exerciseTabsContainer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
  },
  exerciseTab: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: colors.secondary,
  },
  exerciseTabActive: {
    backgroundColor: colors.primary,
  },
  exerciseTabText: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.mutedForeground,
  },
  exerciseTabTextActive: {
    color: colors.primaryForeground,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
  },
  exerciseHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  exerciseHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
  },
  exerciseName: {
    fontSize: 20,
    fontWeight: "700",
    color: colors.foreground,
  },
  exerciseProgress: {
    fontSize: 13,
    color: colors.mutedForeground,
    marginTop: 2,
  },
  setCard: {
    backgroundColor: colors.secondary,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  setCardCompleted: {
    borderColor: "#22C55E",
    backgroundColor: "rgba(34, 197, 94, 0.1)",
  },
  setHeader: {
    marginBottom: 16,
  },
  setNumber: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.foreground,
    marginBottom: 4,
  },
  setTarget: {
    fontSize: 13,
    color: colors.mutedForeground,
  },
  inputRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 16,
  },
  inputGroup: {
    flex: 1,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.foreground,
    marginBottom: 8,
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.background,
    borderRadius: 8,
    overflow: "hidden",
  },
  inputButton: {
    padding: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  input: {
    flex: 1,
    textAlign: "center",
    fontSize: 18,
    fontWeight: "600",
    color: colors.foreground,
    paddingVertical: 12,
  },
  weightInput: {
    backgroundColor: colors.background,
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 18,
    fontWeight: "600",
    color: colors.foreground,
    textAlign: "center",
  },
  rpeSection: {
    marginBottom: 16,
  },
  rpeButtons: {
    flexDirection: "row",
    gap: 8,
  },
  rpeButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: colors.background,
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.border,
  },
  rpeButtonActive: {
    backgroundColor: "#F59E0B",
    borderColor: "#F59E0B",
  },
  rpeButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.foreground,
  },
  rpeButtonTextActive: {
    color: "#000000",
  },
  completeSetButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primary,
    borderRadius: 8,
    paddingVertical: 12,
    gap: 8,
  },
  completeSetButtonText: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.primaryForeground,
  },
  completedSetInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  completedSetDetails: {
    flex: 1,
  },
  completedSetText: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.foreground,
    marginBottom: 4,
  },
  rpeDisplay: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  rpeDisplayText: {
    fontSize: 13,
    color: colors.mutedForeground,
  },
  finishButton: {
    backgroundColor: "#22C55E",
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: 20,
  },
  finishButtonText: {
    fontSize: 17,
    fontWeight: "700",
    color: "#000000",
  },
});
