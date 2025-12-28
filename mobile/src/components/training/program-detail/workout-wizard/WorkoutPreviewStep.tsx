import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Dumbbell, Clock, Calendar, Layers } from 'lucide-react-native';
import { colors } from '@/src/lib/colors';
import { createProgramWorkout, updateProgramWorkout } from '@/src/lib/supabase/training';
import type { WorkoutFormData, WorkoutExerciseConfig, WorkoutSection, CreateProgramWorkoutInput, ExerciseGroup } from '@/src/types/training';
import { WORKOUT_SECTIONS, SECTION_DISPLAY_NAMES } from '@/src/types/training';

// Display item for the exercise list (either single or group)
type ExerciseDisplayItem =
  | { type: 'single'; exercise: WorkoutExerciseConfig }
  | { type: 'group'; group: ExerciseGroup };

interface WorkoutPreviewStepProps {
  formData: WorkoutFormData;
  programId: string;
  weekNumber: number;
  onSave: () => void;
  onClose: () => void;
  /** If true, wizard is in edit mode */
  isEditMode?: boolean;
  /** Workout ID for edit mode */
  workoutId?: string;
}

export function WorkoutPreviewStep({
  formData,
  programId,
  weekNumber,
  onSave,
  onClose,
  isEditMode = false,
  workoutId,
}: WorkoutPreviewStepProps) {
  const [saving, setSaving] = useState(false);

  // Group exercises by section, handling OR groups
  const getDisplayItemsForSection = (section: WorkoutSection): ExerciseDisplayItem[] => {
    const sectionExercises = formData.exercises.filter((ex) => ex.section === section);
    const items: ExerciseDisplayItem[] = [];
    const processedGroupIds = new Set<string>();

    // Sort by exercise_order first
    const sorted = [...sectionExercises].sort((a, b) => a.exercise_order - b.exercise_order);

    for (const ex of sorted) {
      if (ex.group_id) {
        // This is part of a group
        if (!processedGroupIds.has(ex.group_id)) {
          processedGroupIds.add(ex.group_id);
          // Find all exercises in this group
          const groupExercises = sorted
            .filter((e) => e.group_id === ex.group_id)
            .sort((a, b) => (a.group_item_order ?? 0) - (b.group_item_order ?? 0));

          items.push({
            type: 'group',
            group: {
              group_id: ex.group_id,
              group_type: ex.group_type || 'or',
              section,
              exercise_order: ex.exercise_order,
              exercises: groupExercises,
            },
          });
        }
      } else {
        // Standalone exercise
        items.push({ type: 'single', exercise: ex });
      }
    }

    return items;
  };

  // Get sections that have exercises
  const exercisesBySection: Record<WorkoutSection, WorkoutExerciseConfig[]> = {
    Warmup: [],
    Prehab: [],
    Strength: [],
    Accessory: [],
    Isometric: [],
    Cooldown: [],
  };

  formData.exercises.forEach((ex) => {
    if (ex.section && exercisesBySection[ex.section]) {
      exercisesBySection[ex.section].push(ex);
    }
  });

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

  const getLoadSummary = (ex: WorkoutExerciseConfig) => {
    if (ex.load_type === 'rpe' && ex.load_rpe) return `@ RPE ${ex.load_rpe}`;
    if (ex.load_type === 'percentage_1rm' && ex.load_percentage_1rm) return `@ ${ex.load_percentage_1rm}% 1RM`;
    if (ex.load_type === 'weight' && ex.load_weight_lbs) return `@ ${ex.load_weight_lbs} lbs`;
    if (ex.load_type === 'notes' && ex.load_notes) return `(${ex.load_notes})`;
    return '';
  };

  const getRepsSummary = (ex: WorkoutExerciseConfig) => {
    if (ex.target_time_seconds) {
      const timeStr = `${ex.target_time_seconds}s`;
      const perSide = ex.is_per_side ? '/side' : '';
      if (ex.target_sets) return `${ex.target_sets} x ${timeStr}${perSide}`;
      return `${timeStr}${perSide}`;
    }
    if (ex.target_sets && ex.target_reps) {
      const perSide = ex.is_per_side ? '/side' : '';
      return `${ex.target_sets} x ${ex.target_reps}${perSide}`;
    }
    if (ex.target_sets) return `${ex.target_sets} sets`;
    if (ex.target_reps) {
      const perSide = ex.is_per_side ? '/side' : '';
      return `${ex.target_reps} reps${perSide}`;
    }
    return '';
  };

  const handleSave = async () => {
    try {
      setSaving(true);

      const exerciseData = formData.exercises.map((ex) => ({
        exercise_id: ex.exercise_id,
        section: ex.section,
        exercise_order: ex.exercise_order,
        // Group fields
        group_id: ex.group_id,
        group_type: ex.group_type,
        group_item_order: ex.group_item_order,
        // Prescription fields
        target_sets: ex.target_sets,
        target_reps: ex.target_reps,
        target_time_seconds: ex.target_time_seconds,
        is_per_side: ex.is_per_side,
        load_type: ex.load_type,
        load_rpe: ex.load_rpe,
        load_percentage_1rm: ex.load_percentage_1rm,
        load_weight_lbs: ex.load_weight_lbs,
        load_notes: ex.load_notes,
        rest_seconds: ex.rest_seconds,
        estimated_duration_minutes: ex.estimated_duration_minutes,
        video_url: ex.video_url,
        exercise_notes: ex.exercise_notes,
        tempo: ex.tempo,
      }));

      let result;

      if (isEditMode && workoutId) {
        // Update existing workout
        result = await updateProgramWorkout(workoutId, {
          day_number: formData.day_number,
          name: formData.name,
          workout_type: formData.workout_type,
          estimated_duration_minutes: formData.estimated_duration_minutes,
          warmup_instructions: formData.warmup_instructions,
          cooldown_instructions: formData.cooldown_instructions,
          notes: formData.notes,
          exercises: exerciseData,
        });
      } else {
        // Create new workout
        const input: CreateProgramWorkoutInput = {
          program_id: programId,
          week_number: weekNumber,
          day_number: formData.day_number,
          name: formData.name,
          workout_type: formData.workout_type,
          estimated_duration_minutes: formData.estimated_duration_minutes,
          warmup_instructions: formData.warmup_instructions,
          cooldown_instructions: formData.cooldown_instructions,
          notes: formData.notes,
          exercises: exerciseData,
        };
        result = await createProgramWorkout(input);
      }

      if (result) {
        onSave();
      } else {
        Alert.alert('Error', `Failed to ${isEditMode ? 'update' : 'save'} workout. Please try again.`);
      }
    } catch (error) {
      console.error('Error saving workout:', error);
      Alert.alert('Error', 'An unexpected error occurred. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const sectionsWithExercises = WORKOUT_SECTIONS.filter(
    (section) => exercisesBySection[section].length > 0
  );

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
      >
        {/* Workout Header Card */}
        <View style={styles.headerCard}>
          <View style={styles.headerTop}>
            <View style={styles.dayBadge}>
              <Text style={styles.dayBadgeText}>Day {formData.day_number}</Text>
            </View>
            <View style={[styles.typeBadge, { backgroundColor: `${getWorkoutTypeColor(formData.workout_type)}20` }]}>
              <Text style={[styles.typeBadgeText, { color: getWorkoutTypeColor(formData.workout_type) }]}>
                {formData.workout_type}
              </Text>
            </View>
          </View>

          <Text style={styles.workoutName}>{formData.name}</Text>

          <View style={styles.headerMeta}>
            <View style={styles.metaItem}>
              <Calendar size={16} color={colors.mutedForeground} />
              <Text style={styles.metaText}>Week {weekNumber}</Text>
            </View>
            {formData.estimated_duration_minutes && (
              <View style={styles.metaItem}>
                <Clock size={16} color={colors.mutedForeground} />
                <Text style={styles.metaText}>{formData.estimated_duration_minutes} min</Text>
              </View>
            )}
            <View style={styles.metaItem}>
              <Dumbbell size={16} color={colors.mutedForeground} />
              <Text style={styles.metaText}>{formData.exercises.length} exercises</Text>
            </View>
          </View>
        </View>

        {/* Exercises by Section */}
        {sectionsWithExercises.map((section) => {
          const displayItems = getDisplayItemsForSection(section);
          let itemIndex = 0;

          return (
            <View key={section} style={styles.sectionContainer}>
              <Text style={styles.sectionTitle}>{SECTION_DISPLAY_NAMES[section]}</Text>

              {displayItems.map((item) => {
                itemIndex++;
                const currentIndex = itemIndex;

                if (item.type === 'group') {
                  // Render OR group
                  const firstEx = item.group.exercises[0];
                  const repsSummary = getRepsSummary(firstEx);
                  const loadSummary = getLoadSummary(firstEx);

                  return (
                    <View key={item.group.group_id} style={styles.groupCard}>
                      <View style={styles.groupHeader}>
                        <View style={styles.exerciseOrderDot}>
                          <Text style={styles.exerciseOrderText}>{currentIndex}</Text>
                        </View>
                        <View style={styles.groupBadge}>
                          <Layers size={12} color={colors.primary} />
                          <Text style={styles.groupBadgeText}>PICK ONE</Text>
                        </View>
                      </View>

                      <View style={styles.groupExercises}>
                        {item.group.exercises.map((ex, exIndex) => (
                          <View key={`${ex.exercise_id}-${exIndex}`}>
                            {exIndex > 0 && (
                              <View style={styles.orDivider}>
                                <View style={styles.orLine} />
                                <Text style={styles.orText}>or</Text>
                                <View style={styles.orLine} />
                              </View>
                            )}
                            <Text style={styles.groupExerciseName}>{ex.exercise_name}</Text>
                          </View>
                        ))}
                      </View>

                      <View style={styles.groupPrescription}>
                        <Text style={styles.exercisePrescription}>
                          {repsSummary} {loadSummary}
                        </Text>
                        {firstEx.tempo && (
                          <Text style={styles.exerciseTempo}>Tempo: {firstEx.tempo}</Text>
                        )}
                        {firstEx.rest_seconds && (
                          <Text style={styles.exerciseRest}>Rest: {firstEx.rest_seconds}s</Text>
                        )}
                        {firstEx.exercise_notes && (
                          <Text style={styles.exerciseNotes}>{firstEx.exercise_notes}</Text>
                        )}
                      </View>
                    </View>
                  );
                }

                // Render single exercise
                const ex = item.exercise;
                const repsSummary = getRepsSummary(ex);
                const loadSummary = getLoadSummary(ex);

                return (
                  <View key={`${ex.exercise_id}-${currentIndex}`} style={styles.exerciseRow}>
                    <View style={styles.exerciseOrderDot}>
                      <Text style={styles.exerciseOrderText}>{currentIndex}</Text>
                    </View>
                    <View style={styles.exerciseDetails}>
                      <Text style={styles.exerciseName}>{ex.exercise_name}</Text>
                      <Text style={styles.exercisePrescription}>
                        {repsSummary} {loadSummary}
                      </Text>
                      {ex.tempo && (
                        <Text style={styles.exerciseTempo}>Tempo: {ex.tempo}</Text>
                      )}
                      {ex.rest_seconds && (
                        <Text style={styles.exerciseRest}>Rest: {ex.rest_seconds}s</Text>
                      )}
                      {ex.exercise_notes && (
                        <Text style={styles.exerciseNotes}>{ex.exercise_notes}</Text>
                      )}
                    </View>
                  </View>
                );
              })}
            </View>
          );
        })}

        {/* Notes Section */}
        {(formData.warmup_instructions || formData.cooldown_instructions || formData.notes) && (
          <View style={styles.notesSection}>
            {formData.warmup_instructions && (
              <View style={styles.noteBlock}>
                <Text style={styles.noteTitle}>Warmup Instructions</Text>
                <Text style={styles.noteText}>{formData.warmup_instructions}</Text>
              </View>
            )}
            {formData.cooldown_instructions && (
              <View style={styles.noteBlock}>
                <Text style={styles.noteTitle}>Cooldown Instructions</Text>
                <Text style={styles.noteText}>{formData.cooldown_instructions}</Text>
              </View>
            )}
            {formData.notes && (
              <View style={styles.noteBlock}>
                <Text style={styles.noteTitle}>Notes</Text>
                <Text style={styles.noteText}>{formData.notes}</Text>
              </View>
            )}
          </View>
        )}

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Footer */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.saveButton, saving && styles.saveButtonDisabled]}
          onPress={handleSave}
          disabled={saving}
          activeOpacity={0.8}
        >
          {saving ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.saveButtonText}>
              {isEditMode ? 'Save Changes' : 'Save Workout'}
            </Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  contentContainer: {
    padding: 20,
  },
  headerCard: {
    backgroundColor: colors.secondary,
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: colors.border,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  dayBadge: {
    backgroundColor: colors.primary,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  dayBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  typeBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  typeBadgeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  workoutName: {
    fontSize: 22,
    fontWeight: 'bold',
    color: colors.foreground,
    marginBottom: 12,
  },
  headerMeta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  metaText: {
    fontSize: 14,
    color: colors.mutedForeground,
  },
  sectionContainer: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.foreground,
    marginBottom: 12,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  exerciseRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 12,
    paddingLeft: 4,
  },
  exerciseOrderDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.muted,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 2,
  },
  exerciseOrderText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.mutedForeground,
  },
  exerciseDetails: {
    flex: 1,
  },
  exerciseName: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.foreground,
    marginBottom: 4,
  },
  exercisePrescription: {
    fontSize: 14,
    color: colors.primary,
    fontWeight: '500',
  },
  exerciseTempo: {
    fontSize: 13,
    color: colors.mutedForeground,
    marginTop: 2,
  },
  exerciseRest: {
    fontSize: 13,
    color: colors.mutedForeground,
    marginTop: 2,
  },
  exerciseNotes: {
    fontSize: 13,
    color: colors.mutedForeground,
    fontStyle: 'italic',
    marginTop: 4,
  },
  // Group styles
  groupCard: {
    backgroundColor: colors.secondary,
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  groupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
  },
  groupBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: `${colors.primary}20`,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  groupBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.primary,
  },
  groupExercises: {
    paddingLeft: 34,
    marginBottom: 8,
  },
  groupExerciseName: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.foreground,
  },
  orDivider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 6,
    gap: 8,
  },
  orLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.border,
    maxWidth: 40,
  },
  orText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.mutedForeground,
    textTransform: 'lowercase',
  },
  groupPrescription: {
    paddingLeft: 34,
  },
  notesSection: {
    marginTop: 8,
  },
  noteBlock: {
    backgroundColor: colors.muted,
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
  },
  noteTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.foreground,
    marginBottom: 6,
  },
  noteText: {
    fontSize: 14,
    color: colors.mutedForeground,
    lineHeight: 20,
  },
  footer: {
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.background,
  },
  saveButton: {
    backgroundColor: colors.primary,
    paddingVertical: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    fontSize: 17,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});
