import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  StatusBar,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ChevronLeft,
  ChevronDown,
  ChevronUp,
  Clock,
  Dumbbell,
  Timer,
  FileText,
  Play,
} from 'lucide-react-native';
import { colors } from '@/src/lib/colors';
import { supabase } from '@/src/lib/supabase';
import type {
  ProgramWorkoutWithRelations,
  ProgramWorkoutExercise,
  Exercise,
  WorkoutSection,
} from '@/src/types/training';
import {
  WORKOUT_SECTIONS,
  SECTION_DISPLAY_NAMES,
  SECTION_DESCRIPTIONS,
} from '@/src/types/training';

// Extended type for exercises with joined exercise data
type WorkoutExerciseWithDetails = ProgramWorkoutExercise & {
  exercise?: Exercise;
};

export default function WorkoutDetailPage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [workout, setWorkout] = useState<ProgramWorkoutWithRelations | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedSections, setExpandedSections] = useState<Set<WorkoutSection>>(
    new Set(WORKOUT_SECTIONS)
  );
  const [showInstructions, setShowInstructions] = useState(false);

  useEffect(() => {
    loadWorkout();
  }, [id]);

  const loadWorkout = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('program_workouts')
        .select(`
          *,
          exercises:program_workout_exercises(
            *,
            exercise:exercises(*)
          )
        `)
        .eq('id', id)
        .single();

      if (error) throw error;
      setWorkout(data as ProgramWorkoutWithRelations);
    } catch (error) {
      console.error('Error loading workout:', error);
    } finally {
      setLoading(false);
    }
  };

  const getWorkoutTypeColor = (type: string) => {
    switch (type) {
      case 'Strength':
        return '#EF4444';
      case 'Hypertrophy':
        return '#8B5CF6';
      case 'Power':
        return '#F59E0B';
      case 'Endurance':
        return '#22C55E';
      case 'Rest':
        return '#6B7280';
      case 'Deload':
        return '#3B82F6';
      default:
        return colors.mutedForeground;
    }
  };

  const getSectionColor = (section: WorkoutSection) => {
    switch (section) {
      case 'Warmup':
        return '#F59E0B';
      case 'Prehab':
        return '#8B5CF6';
      case 'Strength':
        return '#EF4444';
      case 'Accessory':
        return '#3B82F6';
      case 'Isometric':
        return '#06B6D4';
      case 'Cooldown':
        return '#22C55E';
      default:
        return colors.mutedForeground;
    }
  };

  const toggleSection = (section: WorkoutSection) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(section)) {
        next.delete(section);
      } else {
        next.add(section);
      }
      return next;
    });
  };

  const groupExercisesBySection = () => {
    if (!workout?.exercises) return {};

    const grouped: Record<WorkoutSection, WorkoutExerciseWithDetails[]> = {
      Warmup: [],
      Prehab: [],
      Strength: [],
      Accessory: [],
      Isometric: [],
      Cooldown: [],
    };

    workout.exercises.forEach((ex) => {
      const section = (ex.section as WorkoutSection) || 'Strength';
      if (grouped[section]) {
        grouped[section].push(ex as WorkoutExerciseWithDetails);
      }
    });

    // Sort by exercise_order within each section
    Object.keys(grouped).forEach((section) => {
      grouped[section as WorkoutSection].sort((a, b) => a.exercise_order - b.exercise_order);
    });

    return grouped;
  };

  const getLoadSummary = (ex: WorkoutExerciseWithDetails) => {
    if (ex.load_type === 'rpe' && (ex.target_rpe_min || ex.target_rpe_max)) {
      if (ex.target_rpe_min === ex.target_rpe_max) {
        return `RPE ${ex.target_rpe_min}`;
      }
      return `RPE ${ex.target_rpe_min}-${ex.target_rpe_max}`;
    }
    if (ex.load_type === 'percentage_1rm' && ex.load_percentage_1rm) {
      return `${ex.load_percentage_1rm}% 1RM`;
    }
    if (ex.load_type === 'weight' && ex.load_weight_lbs) {
      return `${ex.load_weight_lbs} lbs`;
    }
    if (ex.load_type === 'notes' && ex.load_notes) {
      return ex.load_notes;
    }
    return null;
  };

  const getRepsSummary = (ex: WorkoutExerciseWithDetails) => {
    if (ex.target_time_seconds) {
      const timeStr = `${ex.target_time_seconds}s`;
      if (ex.target_sets) return `${ex.target_sets} × ${timeStr}`;
      return timeStr;
    }
    if (ex.target_sets && (ex.target_reps_min || ex.target_reps_max)) {
      let repsStr = '';
      if (ex.target_reps_min === ex.target_reps_max) {
        repsStr = `${ex.target_reps_min}`;
      } else if (ex.target_reps_min && ex.target_reps_max) {
        repsStr = `${ex.target_reps_min}-${ex.target_reps_max}`;
      } else {
        repsStr = `${ex.target_reps_min || ex.target_reps_max}`;
      }
      if (ex.is_per_side) repsStr += '/side';
      return `${ex.target_sets} × ${repsStr}`;
    }
    if (ex.target_sets) return `${ex.target_sets} sets`;
    return '';
  };

  const getTotalStats = () => {
    if (!workout?.exercises) return { sets: 0, exercises: 0, muscles: new Set<string>() };

    let totalSets = 0;
    const muscles = new Set<string>();

    workout.exercises.forEach((ex) => {
      totalSets += ex.target_sets || 0;
      if (ex.exercise?.muscle_groups) {
        ex.exercise.muscle_groups.forEach((m) => muscles.add(m));
      }
    });

    return {
      sets: totalSets,
      exercises: workout.exercises.length,
      muscles,
    };
  };

  const hasInstructions = workout?.warmup_instructions || workout?.cooldown_instructions || workout?.notes;

  if (loading) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <StatusBar barStyle="light-content" />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </View>
    );
  }

  if (!workout) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <StatusBar barStyle="light-content" />
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <ChevronLeft size={24} color={colors.foreground} />
            <Text style={styles.backText}>Back</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>Workout not found</Text>
        </View>
      </View>
    );
  }

  const groupedExercises = groupExercisesBySection();
  const stats = getTotalStats();
  const typeColor = getWorkoutTypeColor(workout.workout_type);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar barStyle="light-content" />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <ChevronLeft size={24} color={colors.foreground} />
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Workout Title Section */}
        <View style={styles.titleSection}>
          <View style={[styles.typeBadge, { backgroundColor: `${typeColor}20` }]}>
            <Dumbbell size={14} color={typeColor} />
            <Text style={[styles.typeBadgeText, { color: typeColor }]}>{workout.workout_type}</Text>
          </View>
          <Text style={styles.workoutTitle}>{workout.name}</Text>
          <Text style={styles.dayWeekText}>
            Day {workout.day_number} · Week {workout.week_number}
          </Text>
        </View>

        {/* Quick Stats */}
        <View style={styles.statsRow}>
          <View style={styles.statItem}>
            <Clock size={18} color={colors.primary} />
            <Text style={styles.statValue}>
              {workout.estimated_duration_minutes || '—'} min
            </Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Dumbbell size={18} color={colors.primary} />
            <Text style={styles.statValue}>{stats.exercises} exercises</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Timer size={18} color={colors.primary} />
            <Text style={styles.statValue}>{stats.sets} sets</Text>
          </View>
        </View>

        {/* Instructions Card (Collapsible) */}
        {hasInstructions && (
          <TouchableOpacity
            style={styles.instructionsCard}
            onPress={() => setShowInstructions(!showInstructions)}
            activeOpacity={0.7}
          >
            <View style={styles.instructionsHeader}>
              <View style={styles.instructionsHeaderLeft}>
                <FileText size={18} color={colors.primary} />
                <Text style={styles.instructionsTitle}>Instructions & Notes</Text>
              </View>
              {showInstructions ? (
                <ChevronUp size={20} color={colors.mutedForeground} />
              ) : (
                <ChevronDown size={20} color={colors.mutedForeground} />
              )}
            </View>
            {showInstructions && (
              <View style={styles.instructionsContent}>
                {workout.warmup_instructions && (
                  <View style={styles.instructionBlock}>
                    <Text style={styles.instructionLabel}>Warm-up</Text>
                    <Text style={styles.instructionText}>{workout.warmup_instructions}</Text>
                  </View>
                )}
                {workout.cooldown_instructions && (
                  <View style={styles.instructionBlock}>
                    <Text style={styles.instructionLabel}>Cool-down</Text>
                    <Text style={styles.instructionText}>{workout.cooldown_instructions}</Text>
                  </View>
                )}
                {workout.notes && (
                  <View style={styles.instructionBlock}>
                    <Text style={styles.instructionLabel}>Notes</Text>
                    <Text style={styles.instructionText}>{workout.notes}</Text>
                  </View>
                )}
              </View>
            )}
          </TouchableOpacity>
        )}

        {/* Exercise Sections */}
        {WORKOUT_SECTIONS.map((section) => {
          const exercises = groupedExercises[section];
          if (!exercises || exercises.length === 0) return null;

          const isExpanded = expandedSections.has(section);
          const sectionColor = getSectionColor(section);

          return (
            <View key={section} style={styles.sectionContainer}>
              <TouchableOpacity
                style={styles.sectionHeader}
                onPress={() => toggleSection(section)}
                activeOpacity={0.7}
              >
                <View style={styles.sectionHeaderLeft}>
                  <View style={[styles.sectionIcon, { backgroundColor: `${sectionColor}20` }]}>
                    <Dumbbell size={16} color={sectionColor} />
                  </View>
                  <View>
                    <Text style={styles.sectionTitle}>{SECTION_DISPLAY_NAMES[section]}</Text>
                    <Text style={styles.sectionDescription}>
                      {exercises.length} exercise{exercises.length !== 1 ? 's' : ''}
                    </Text>
                  </View>
                </View>
                {isExpanded ? (
                  <ChevronUp size={20} color={colors.mutedForeground} />
                ) : (
                  <ChevronDown size={20} color={colors.mutedForeground} />
                )}
              </TouchableOpacity>

              {isExpanded && (
                <View style={styles.exercisesList}>
                  {exercises.map((ex, index) => {
                    const repsSummary = getRepsSummary(ex);
                    const loadSummary = getLoadSummary(ex);

                    return (
                      <TouchableOpacity
                        key={ex.id}
                        style={[
                          styles.exerciseCard,
                          index === exercises.length - 1 && styles.exerciseCardLast,
                        ]}
                        onPress={() => {
                          if (ex.exercise_id) {
                            router.push(`/(tabs)/training/exercise/${ex.exercise_id}`);
                          }
                        }}
                        activeOpacity={0.7}
                      >
                        <View style={[styles.exerciseOrder, { backgroundColor: sectionColor }]}>
                          <Text style={styles.exerciseOrderText}>{ex.exercise_order}</Text>
                        </View>

                        <View style={styles.exerciseContent}>
                          <Text style={styles.exerciseName}>
                            {ex.exercise?.name || 'Unknown Exercise'}
                          </Text>
                          <View style={styles.exerciseDetails}>
                            {repsSummary ? (
                              <Text style={styles.exerciseReps}>{repsSummary}</Text>
                            ) : null}
                            {loadSummary ? (
                              <Text style={styles.exerciseLoad}>{loadSummary}</Text>
                            ) : null}
                            {ex.rest_seconds ? (
                              <Text style={styles.exerciseRest}>{ex.rest_seconds}s rest</Text>
                            ) : null}
                          </View>
                          {ex.tempo && (
                            <Text style={styles.exerciseTempo}>Tempo: {ex.tempo}</Text>
                          )}
                          {ex.exercise_notes && (
                            <Text style={styles.exerciseNotes} numberOfLines={2}>
                              {ex.exercise_notes}
                            </Text>
                          )}
                        </View>

                        <ChevronLeft
                          size={18}
                          color={colors.mutedForeground}
                          style={{ transform: [{ rotate: '180deg' }] }}
                        />
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}
            </View>
          );
        })}

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Start Workout Button */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
        <TouchableOpacity style={styles.startButton} activeOpacity={0.8}>
          <Play size={20} color="#FFFFFF" fill="#FFFFFF" />
          <Text style={styles.startButtonText}>Start Workout</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    fontSize: 16,
    color: colors.mutedForeground,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  backText: {
    fontSize: 17,
    color: colors.foreground,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
  },
  titleSection: {
    marginBottom: 20,
  },
  typeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    marginBottom: 12,
  },
  typeBadgeText: {
    fontSize: 13,
    fontWeight: '600',
  },
  workoutTitle: {
    fontSize: 26,
    fontWeight: 'bold',
    color: colors.foreground,
    marginBottom: 4,
  },
  dayWeekText: {
    fontSize: 15,
    color: colors.mutedForeground,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.secondary,
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: colors.border,
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
    justifyContent: 'center',
  },
  statValue: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.foreground,
  },
  statDivider: {
    width: 1,
    height: 24,
    backgroundColor: colors.border,
  },
  instructionsCard: {
    backgroundColor: colors.secondary,
    borderRadius: 12,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  instructionsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
  },
  instructionsHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  instructionsTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.foreground,
  },
  instructionsContent: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    gap: 16,
  },
  instructionBlock: {
    gap: 4,
  },
  instructionLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.primary,
  },
  instructionText: {
    fontSize: 14,
    color: colors.mutedForeground,
    lineHeight: 20,
  },
  sectionContainer: {
    marginBottom: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.secondary,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sectionHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  sectionIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.foreground,
  },
  sectionDescription: {
    fontSize: 13,
    color: colors.mutedForeground,
    marginTop: 2,
  },
  exercisesList: {
    marginTop: 8,
    marginLeft: 18,
    borderLeftWidth: 2,
    borderLeftColor: colors.border,
    paddingLeft: 16,
  },
  exerciseCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.secondary,
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 12,
  },
  exerciseCardLast: {
    marginBottom: 0,
  },
  exerciseOrder: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  exerciseOrderText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  exerciseContent: {
    flex: 1,
  },
  exerciseName: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.foreground,
    marginBottom: 4,
  },
  exerciseDetails: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 10,
  },
  exerciseReps: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.primary,
  },
  exerciseLoad: {
    fontSize: 13,
    color: colors.mutedForeground,
  },
  exerciseRest: {
    fontSize: 13,
    color: colors.mutedForeground,
  },
  exerciseTempo: {
    fontSize: 12,
    color: colors.mutedForeground,
    marginTop: 4,
  },
  exerciseNotes: {
    fontSize: 12,
    color: colors.mutedForeground,
    fontStyle: 'italic',
    marginTop: 4,
  },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 16,
    backgroundColor: colors.background,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  startButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: colors.primary,
    paddingVertical: 16,
    borderRadius: 12,
  },
  startButtonText: {
    fontSize: 17,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});
