import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { Plus, Trash2, ChevronUp, ChevronDown, Edit2 } from 'lucide-react-native';
import { colors } from '@/src/lib/colors';
import { ExerciseSearchModal } from './ExerciseSearchModal';
import { ExerciseConfigModal } from './ExerciseConfigModal';
import type { WorkoutFormData, WorkoutExerciseConfig, WorkoutSection, Exercise } from '@/src/types/training';
import { WORKOUT_SECTIONS, SECTION_DISPLAY_NAMES } from '@/src/types/training';

interface WorkoutExercisesStepProps {
  formData: WorkoutFormData;
  onUpdate: (updates: Partial<WorkoutFormData>) => void;
  onNext: () => void;
}

export function WorkoutExercisesStep({ formData, onUpdate, onNext }: WorkoutExercisesStepProps) {
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [selectedExercise, setSelectedExercise] = useState<Exercise | null>(null);
  const [editingExerciseIndex, setEditingExerciseIndex] = useState<number | null>(null);
  const [targetSection, setTargetSection] = useState<WorkoutSection>('Strength');

  // Group exercises by section
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

  const handleAddExercise = (section: WorkoutSection) => {
    setTargetSection(section);
    setEditingExerciseIndex(null);
    setShowSearchModal(true);
  };

  const handleSelectExercise = (exercise: Exercise) => {
    setSelectedExercise(exercise);
    setShowConfigModal(true);
  };

  const handleSaveExerciseConfig = (config: Omit<WorkoutExerciseConfig, 'exercise_order'>) => {
    const newExercises = [...formData.exercises];

    if (editingExerciseIndex !== null) {
      // Update existing
      newExercises[editingExerciseIndex] = {
        ...config,
        exercise_order: editingExerciseIndex + 1,
      };
    } else {
      // Add new with order based on position
      newExercises.push({
        ...config,
        exercise_order: newExercises.length + 1,
      });
    }

    onUpdate({ exercises: newExercises });
    setEditingExerciseIndex(null);
    setSelectedExercise(null);
  };

  const handleEditExercise = (index: number) => {
    const exercise = formData.exercises[index];
    setEditingExerciseIndex(index);
    setSelectedExercise({
      id: exercise.exercise_id,
      name: exercise.exercise_name,
      // Include minimal exercise data needed
      slug: '',
      category: 'Compound',
      muscle_groups: [],
      equipment: [],
      description: null,
      created_at: '',
      updated_at: '',
      video_url: null,
      image_url: null,
    });
    setShowConfigModal(true);
  };

  const handleDeleteExercise = (index: number) => {
    const newExercises = formData.exercises.filter((_, i) => i !== index);
    // Re-order
    newExercises.forEach((ex, i) => {
      ex.exercise_order = i + 1;
    });
    onUpdate({ exercises: newExercises });
  };

  const handleMoveExercise = (index: number, direction: 'up' | 'down') => {
    const newExercises = [...formData.exercises];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;

    if (targetIndex < 0 || targetIndex >= newExercises.length) return;

    // Swap
    [newExercises[index], newExercises[targetIndex]] = [newExercises[targetIndex], newExercises[index]];

    // Re-order
    newExercises.forEach((ex, i) => {
      ex.exercise_order = i + 1;
    });

    onUpdate({ exercises: newExercises });
  };

  const getLoadSummary = (ex: WorkoutExerciseConfig) => {
    if (ex.load_type === 'rpe' && ex.load_rpe) return `RPE ${ex.load_rpe}`;
    if (ex.load_type === 'percentage_1rm' && ex.load_percentage_1rm) return `${ex.load_percentage_1rm}% 1RM`;
    if (ex.load_type === 'weight' && ex.load_weight_lbs) return `${ex.load_weight_lbs} lbs`;
    if (ex.load_type === 'notes' && ex.load_notes) return ex.load_notes;
    return null;
  };

  const getRepsSummary = (ex: WorkoutExerciseConfig) => {
    if (ex.target_time_seconds) {
      const timeStr = `${ex.target_time_seconds}s`;
      if (ex.target_sets) return `${ex.target_sets} x ${timeStr}`;
      return timeStr;
    }
    if (ex.target_sets && ex.target_reps) {
      const repsStr = ex.is_per_side ? `${ex.target_reps}/side` : `${ex.target_reps}`;
      return `${ex.target_sets} x ${repsStr}`;
    }
    if (ex.target_sets) return `${ex.target_sets} sets`;
    if (ex.target_reps) return `${ex.target_reps} reps`;
    return '';
  };

  const getSectionCount = (section: WorkoutSection) => {
    return exercisesBySection[section].length;
  };

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
      >
        {WORKOUT_SECTIONS.map((section) => (
          <View key={section} style={styles.sectionContainer}>
            {/* Section Header */}
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>{SECTION_DISPLAY_NAMES[section]}</Text>
              <View style={styles.sectionBadge}>
                <Text style={styles.sectionBadgeText}>{getSectionCount(section)}</Text>
              </View>
            </View>

            {/* Exercises in Section */}
            {exercisesBySection[section].map((ex) => {
              const globalIndex = formData.exercises.findIndex(
                (e) => e.exercise_id === ex.exercise_id && e.section === ex.section
              );
              const loadSummary = getLoadSummary(ex);
              const repsSummary = getRepsSummary(ex);

              return (
                <View key={`${ex.exercise_id}-${globalIndex}`} style={styles.exerciseCard}>
                  <View style={styles.exerciseContent}>
                    <View style={styles.exerciseOrderBadge}>
                      <Text style={styles.exerciseOrderText}>{ex.exercise_order}</Text>
                    </View>
                    <View style={styles.exerciseInfo}>
                      <Text style={styles.exerciseName}>{ex.exercise_name}</Text>
                      <View style={styles.exerciseMeta}>
                        {repsSummary ? (
                          <Text style={styles.exerciseReps}>{repsSummary}</Text>
                        ) : null}
                        {loadSummary ? (
                          <Text style={styles.exerciseLoad}>{loadSummary}</Text>
                        ) : null}
                      </View>
                    </View>
                  </View>

                  {/* Actions */}
                  <View style={styles.exerciseActions}>
                    <TouchableOpacity
                      style={styles.actionButton}
                      onPress={() => handleMoveExercise(globalIndex, 'up')}
                      disabled={globalIndex === 0}
                    >
                      <ChevronUp size={18} color={globalIndex === 0 ? colors.muted : colors.mutedForeground} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.actionButton}
                      onPress={() => handleMoveExercise(globalIndex, 'down')}
                      disabled={globalIndex === formData.exercises.length - 1}
                    >
                      <ChevronDown size={18} color={globalIndex === formData.exercises.length - 1 ? colors.muted : colors.mutedForeground} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.actionButton}
                      onPress={() => handleEditExercise(globalIndex)}
                    >
                      <Edit2 size={16} color={colors.primary} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.actionButton}
                      onPress={() => handleDeleteExercise(globalIndex)}
                    >
                      <Trash2 size={16} color="#EF4444" />
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })}

            {/* Add Exercise Button */}
            <TouchableOpacity
              style={styles.addExerciseButton}
              onPress={() => handleAddExercise(section)}
              activeOpacity={0.7}
            >
              <Plus size={18} color={colors.primary} />
              <Text style={styles.addExerciseText}>Add Exercise</Text>
            </TouchableOpacity>
          </View>
        ))}

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Footer */}
      <View style={styles.footer}>
        <TouchableOpacity style={styles.nextButton} onPress={onNext} activeOpacity={0.8}>
          <Text style={styles.nextButtonText}>Next: Review</Text>
        </TouchableOpacity>
      </View>

      {/* Search Modal */}
      <ExerciseSearchModal
        visible={showSearchModal}
        onClose={() => setShowSearchModal(false)}
        onSelectExercise={handleSelectExercise}
      />

      {/* Config Modal */}
      <ExerciseConfigModal
        visible={showConfigModal}
        exercise={selectedExercise}
        existingConfig={editingExerciseIndex !== null ? formData.exercises[editingExerciseIndex] : undefined}
        onClose={() => {
          setShowConfigModal(false);
          setSelectedExercise(null);
          setEditingExerciseIndex(null);
        }}
        onSave={(config) => {
          // Ensure section is set if coming from add button
          if (editingExerciseIndex === null) {
            handleSaveExerciseConfig({ ...config, section: targetSection });
          } else {
            handleSaveExerciseConfig(config);
          }
        }}
      />
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
  sectionContainer: {
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.foreground,
  },
  sectionBadge: {
    backgroundColor: colors.muted,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  sectionBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.mutedForeground,
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
  },
  exerciseContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  exerciseOrderBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  exerciseOrderText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  exerciseInfo: {
    flex: 1,
  },
  exerciseName: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.foreground,
    marginBottom: 4,
  },
  exerciseMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  exerciseReps: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.primary,
  },
  exerciseLoad: {
    fontSize: 13,
    color: colors.mutedForeground,
  },
  exerciseActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  actionButton: {
    padding: 6,
  },
  addExerciseButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.primary,
    borderStyle: 'dashed',
  },
  addExerciseText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.primary,
  },
  footer: {
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.background,
  },
  nextButton: {
    backgroundColor: colors.primary,
    paddingVertical: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  nextButtonText: {
    fontSize: 17,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});
