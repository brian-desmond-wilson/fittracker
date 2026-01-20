import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Animated,
} from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import { Plus, Trash2, Edit2, X, Layers } from 'lucide-react-native';
import { colors } from '@/src/lib/colors';
import { ExerciseSearchModal } from './ExerciseSearchModal';
import { ExerciseConfigModal } from './ExerciseConfigModal';
import type {
  WorkoutFormData,
  WorkoutExerciseConfig,
  WorkoutSection,
  Exercise,
  ExerciseGroup,
} from '@/src/types/training';
import { WORKOUT_SECTIONS, SECTION_DISPLAY_NAMES, SECTION_DESCRIPTIONS } from '@/src/types/training';

// Generate a UUID v4 for group_id (database expects UUID type)
const generateGroupId = (): string => {
  // Simple UUID v4 generator
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
};

// Display item for the exercise list (either single or group)
type ExerciseDisplayItem =
  | { type: 'single'; exercise: WorkoutExerciseConfig; globalIndex: number }
  | { type: 'group'; group: ExerciseGroup; exerciseIndices: number[] };

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
  // For adding alternatives to existing groups or converting to group
  const [addingAlternativeToGroupId, setAddingAlternativeToGroupId] = useState<string | null>(null);
  const [convertingToGroupIndex, setConvertingToGroupIndex] = useState<number | null>(null);
  const swipeableRefs = useRef<Map<number, Swipeable>>(new Map());

  // Group exercises by section and then by group_id for display
  const getDisplayItemsForSection = (section: WorkoutSection): ExerciseDisplayItem[] => {
    const sectionExercises = formData.exercises
      .map((ex, index) => ({ ex, globalIndex: index }))
      .filter(({ ex }) => ex.section === section);

    const displayItems: ExerciseDisplayItem[] = [];
    const processedGroupIds = new Set<string>();

    // Sort by exercise_order
    sectionExercises.sort((a, b) => a.ex.exercise_order - b.ex.exercise_order);

    for (const { ex, globalIndex } of sectionExercises) {
      if (ex.group_id && ex.group_type) {
        // This is part of a group
        if (processedGroupIds.has(ex.group_id)) {
          continue; // Already processed this group
        }
        processedGroupIds.add(ex.group_id);

        // Find all exercises in this group
        const groupExercises = sectionExercises
          .filter(({ ex: e }) => e.group_id === ex.group_id)
          .sort((a, b) => (a.ex.group_item_order ?? 0) - (b.ex.group_item_order ?? 0));

        const group: ExerciseGroup = {
          group_id: ex.group_id,
          group_type: ex.group_type,
          section: ex.section,
          exercise_order: ex.exercise_order,
          exercises: groupExercises.map(({ ex: e }) => e),
        };

        displayItems.push({
          type: 'group',
          group,
          exerciseIndices: groupExercises.map(({ globalIndex: gi }) => gi),
        });
      } else {
        // Standalone exercise
        displayItems.push({
          type: 'single',
          exercise: ex,
          globalIndex,
        });
      }
    }

    // Sort by exercise_order
    displayItems.sort((a, b) => {
      const orderA = a.type === 'single' ? a.exercise.exercise_order : a.group.exercise_order;
      const orderB = b.type === 'single' ? b.exercise.exercise_order : b.group.exercise_order;
      return orderA - orderB;
    });

    return displayItems;
  };

  const handleAddExercise = (section: WorkoutSection) => {
    setTargetSection(section);
    setEditingExerciseIndex(null);
    setAddingAlternativeToGroupId(null);
    setConvertingToGroupIndex(null);
    setShowSearchModal(true);
  };

  const handleAddAlternative = (groupId: string, section: WorkoutSection) => {
    setTargetSection(section);
    setEditingExerciseIndex(null);
    setAddingAlternativeToGroupId(groupId);
    setConvertingToGroupIndex(null);
    setShowSearchModal(true);
  };

  const handleConvertToGroup = (globalIndex: number) => {
    const exercise = formData.exercises[globalIndex];
    setTargetSection(exercise.section);
    setEditingExerciseIndex(null);
    setAddingAlternativeToGroupId(null);
    setConvertingToGroupIndex(globalIndex);
    setShowSearchModal(true);
  };

  const handleSelectExercise = (exercise: Exercise) => {
    setSelectedExercise(exercise);
    setShowSearchModal(false);
    setShowConfigModal(true);
  };

  const handleSaveExerciseConfig = (config: Omit<WorkoutExerciseConfig, 'exercise_order'>) => {
    const newExercises = [...formData.exercises];

    if (editingExerciseIndex !== null) {
      // Update existing exercise
      const existingEx = newExercises[editingExerciseIndex];

      // If editing a grouped exercise, update prescription for all in group
      if (existingEx.group_id) {
        newExercises.forEach((ex, i) => {
          if (ex.group_id === existingEx.group_id) {
            newExercises[i] = {
              ...ex,
              target_sets: config.target_sets,
              target_reps: config.target_reps,
              target_time_seconds: config.target_time_seconds,
              is_per_side: config.is_per_side,
              load_type: config.load_type,
              load_rpe: config.load_rpe,
              load_percentage_1rm: config.load_percentage_1rm,
              load_weight_lbs: config.load_weight_lbs,
              load_notes: config.load_notes,
              rest_seconds: config.rest_seconds,
              estimated_duration_minutes: config.estimated_duration_minutes,
              tempo: config.tempo,
              // Keep individual fields
              exercise_id: ex.exercise_id,
              exercise_name: ex.exercise_name,
              section: ex.section,
              exercise_order: ex.exercise_order,
              group_id: ex.group_id,
              group_type: ex.group_type,
              group_item_order: ex.group_item_order,
            };
          }
        });
      } else {
        newExercises[editingExerciseIndex] = {
          ...config,
          exercise_order: existingEx.exercise_order,
        };
      }
    } else if (convertingToGroupIndex !== null) {
      // Converting standalone exercise to a group by adding alternative
      const existingEx = newExercises[convertingToGroupIndex];
      const newGroupId = generateGroupId();

      // Update existing exercise to be part of new group
      newExercises[convertingToGroupIndex] = {
        ...existingEx,
        group_id: newGroupId,
        group_type: 'or',
        group_item_order: 0,
      };

      // Add new exercise to group with same prescription (exercise_order will be set below)
      newExercises.push({
        ...config,
        exercise_order: newExercises.length + 1, // Temporary, will be re-ordered
        group_id: newGroupId,
        group_type: 'or',
        group_item_order: 1,
        // Copy prescription from existing exercise
        target_sets: existingEx.target_sets,
        target_reps: existingEx.target_reps,
        target_time_seconds: existingEx.target_time_seconds,
        is_per_side: existingEx.is_per_side,
        load_type: existingEx.load_type,
        load_rpe: existingEx.load_rpe,
        load_percentage_1rm: existingEx.load_percentage_1rm,
        load_weight_lbs: existingEx.load_weight_lbs,
        load_notes: existingEx.load_notes,
        rest_seconds: existingEx.rest_seconds,
        estimated_duration_minutes: existingEx.estimated_duration_minutes,
        tempo: existingEx.tempo,
      });
    } else if (addingAlternativeToGroupId) {
      // Adding to existing group
      const groupExercises = newExercises.filter(ex => ex.group_id === addingAlternativeToGroupId);
      const firstInGroup = groupExercises[0];
      const maxItemOrder = Math.max(...groupExercises.map(ex => ex.group_item_order ?? 0));

      newExercises.push({
        ...config,
        exercise_order: newExercises.length + 1, // Temporary, will be re-ordered
        group_id: addingAlternativeToGroupId,
        group_type: 'or',
        group_item_order: maxItemOrder + 1,
        // Copy prescription from group
        target_sets: firstInGroup.target_sets,
        target_reps: firstInGroup.target_reps,
        target_time_seconds: firstInGroup.target_time_seconds,
        is_per_side: firstInGroup.is_per_side,
        load_type: firstInGroup.load_type,
        load_rpe: firstInGroup.load_rpe,
        load_percentage_1rm: firstInGroup.load_percentage_1rm,
        load_weight_lbs: firstInGroup.load_weight_lbs,
        load_notes: firstInGroup.load_notes,
        rest_seconds: firstInGroup.rest_seconds,
        estimated_duration_minutes: firstInGroup.estimated_duration_minutes,
        tempo: firstInGroup.tempo,
      });
    } else {
      // Add new standalone exercise
      newExercises.push({
        ...config,
        exercise_order: newExercises.length + 1,
      });
    }

    // Re-order ALL exercises to ensure unique exercise_order values
    // Grouping is determined by group_id, not exercise_order
    newExercises.forEach((ex, i) => {
      ex.exercise_order = i + 1;
    });

    onUpdate({ exercises: newExercises });
    setEditingExerciseIndex(null);
    setSelectedExercise(null);
    setAddingAlternativeToGroupId(null);
    setConvertingToGroupIndex(null);
  };

  const handleEditExercise = (index: number) => {
    const exercise = formData.exercises[index];
    setEditingExerciseIndex(index);
    setSelectedExercise({
      id: exercise.exercise_id,
      name: exercise.exercise_name,
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
    const exerciseToDelete = formData.exercises[index];
    let newExercises = formData.exercises.filter((_, i) => i !== index);

    // If deleted exercise was in a group, check if group now has only 1 exercise
    if (exerciseToDelete.group_id) {
      const remainingInGroup = newExercises.filter(ex => ex.group_id === exerciseToDelete.group_id);
      if (remainingInGroup.length === 1) {
        // Convert back to standalone
        const idx = newExercises.findIndex(ex => ex.group_id === exerciseToDelete.group_id);
        if (idx !== -1) {
          newExercises[idx] = {
            ...newExercises[idx],
            group_id: undefined,
            group_type: undefined,
            group_item_order: undefined,
          };
        }
      }
    }

    // Re-order
    newExercises.forEach((ex, i) => {
      ex.exercise_order = i + 1;
    });
    onUpdate({ exercises: newExercises });
  };

  const handleDeleteGroup = (groupId: string) => {
    const newExercises = formData.exercises.filter(ex => ex.group_id !== groupId);
    // Re-order
    newExercises.forEach((ex, i) => {
      ex.exercise_order = i + 1;
    });
    onUpdate({ exercises: newExercises });
  };

  const closeSwipeable = (index: number) => {
    const swipeable = swipeableRefs.current.get(index);
    if (swipeable) {
      swipeable.close();
    }
  };

  const renderRightActionsForSingle = (
    progress: Animated.AnimatedInterpolation<number>,
    dragX: Animated.AnimatedInterpolation<number>,
    globalIndex: number
  ) => {
    const translateX = dragX.interpolate({
      inputRange: [-180, 0],
      outputRange: [0, 180],
      extrapolate: 'clamp',
    });

    return (
      <Animated.View
        style={[styles.swipeActionsContainer, { transform: [{ translateX }] }]}
      >
        <TouchableOpacity
          style={styles.swipeActionAlt}
          onPress={() => {
            closeSwipeable(globalIndex);
            handleConvertToGroup(globalIndex);
          }}
        >
          <Layers size={18} color="#FFFFFF" />
          <Text style={styles.swipeActionText}>+ Alt</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.swipeActionEdit}
          onPress={() => {
            closeSwipeable(globalIndex);
            handleEditExercise(globalIndex);
          }}
        >
          <Edit2 size={18} color="#FFFFFF" />
          <Text style={styles.swipeActionText}>Edit</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.swipeActionDelete}
          onPress={() => {
            closeSwipeable(globalIndex);
            handleDeleteExercise(globalIndex);
          }}
        >
          <Trash2 size={18} color="#FFFFFF" />
          <Text style={styles.swipeActionText}>Delete</Text>
        </TouchableOpacity>
      </Animated.View>
    );
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
    const items = getDisplayItemsForSection(section);
    return items.reduce((count, item) => {
      return count + (item.type === 'single' ? 1 : item.group.exercises.length);
    }, 0);
  };

  const renderSingleExercise = (item: ExerciseDisplayItem & { type: 'single' }) => {
    const { exercise: ex, globalIndex } = item;
    const loadSummary = getLoadSummary(ex);
    const repsSummary = getRepsSummary(ex);

    return (
      <Swipeable
        key={`single-${ex.exercise_id}-${globalIndex}`}
        ref={(ref) => {
          if (ref) {
            swipeableRefs.current.set(globalIndex, ref);
          } else {
            swipeableRefs.current.delete(globalIndex);
          }
        }}
        renderRightActions={(progress, dragX) =>
          renderRightActionsForSingle(progress, dragX, globalIndex)
        }
        rightThreshold={40}
        overshootRight={false}
      >
        <View style={styles.exerciseCard}>
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
          {ex.estimated_duration_minutes ? (
            <Text style={styles.exerciseDuration}>{ex.estimated_duration_minutes} min</Text>
          ) : null}
        </View>
      </Swipeable>
    );
  };

  const renderGroupExercise = (item: ExerciseDisplayItem & { type: 'group' }) => {
    const { group, exerciseIndices } = item;
    const firstEx = group.exercises[0];
    const loadSummary = getLoadSummary(firstEx);
    const repsSummary = getRepsSummary(firstEx);

    return (
      <View key={`group-${group.group_id}`} style={styles.groupCard}>
        {/* Group Header */}
        <View style={styles.groupHeader}>
          <View style={styles.groupHeaderLeft}>
            <View style={styles.groupOrderBadge}>
              <Text style={styles.groupOrderText}>{firstEx.exercise_order}</Text>
            </View>
            <View style={styles.groupBadge}>
              <Layers size={12} color={colors.primary} />
              <Text style={styles.groupBadgeText}>PICK ONE</Text>
            </View>
          </View>
          <View style={styles.groupHeaderRight}>
            {repsSummary ? (
              <Text style={styles.groupPrescription}>{repsSummary}</Text>
            ) : null}
            {loadSummary ? (
              <Text style={styles.groupLoad}>{loadSummary}</Text>
            ) : null}
            {firstEx.estimated_duration_minutes ? (
              <Text style={styles.groupDuration}>{firstEx.estimated_duration_minutes} min</Text>
            ) : null}
          </View>
        </View>

        {/* Group Exercises */}
        <View style={styles.groupExercises}>
          {group.exercises.map((ex, idx) => {
            const globalIdx = exerciseIndices[idx];
            return (
              <View key={`${ex.exercise_id}-${idx}`}>
                <View style={styles.groupExerciseRow}>
                  <Text style={styles.groupExerciseName}>{ex.exercise_name}</Text>
                  <TouchableOpacity
                    style={styles.groupExerciseRemove}
                    onPress={() => handleDeleteExercise(globalIdx)}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  >
                    <X size={16} color={colors.mutedForeground} />
                  </TouchableOpacity>
                </View>
                {idx < group.exercises.length - 1 && (
                  <View style={styles.orDivider}>
                    <View style={styles.orLine} />
                    <Text style={styles.orText}>or</Text>
                    <View style={styles.orLine} />
                  </View>
                )}
              </View>
            );
          })}
        </View>

        {/* Group Actions */}
        <View style={styles.groupActions}>
          <TouchableOpacity
            style={styles.groupActionButton}
            onPress={() => handleAddAlternative(group.group_id, group.section)}
          >
            <Plus size={14} color={colors.primary} />
            <Text style={styles.groupActionText}>Add Alternative</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.groupActionButton}
            onPress={() => handleEditExercise(exerciseIndices[0])}
          >
            <Edit2 size={14} color={colors.primary} />
            <Text style={styles.groupActionText}>Edit</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.groupActionButton, styles.groupDeleteButton]}
            onPress={() => handleDeleteGroup(group.group_id)}
          >
            <Trash2 size={14} color="#EF4444" />
            <Text style={[styles.groupActionText, styles.groupDeleteText]}>Delete</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
      >
        {WORKOUT_SECTIONS.map((section) => {
          const displayItems = getDisplayItemsForSection(section);

          return (
            <View key={section} style={styles.sectionContainer}>
              {/* Section Header */}
              <View style={styles.sectionHeader}>
                <View style={styles.sectionTitleRow}>
                  <Text style={styles.sectionTitle}>{SECTION_DISPLAY_NAMES[section]}</Text>
                  <View style={styles.sectionBadge}>
                    <Text style={styles.sectionBadgeText}>{getSectionCount(section)}</Text>
                  </View>
                </View>
                <Text style={styles.sectionDescription}>{SECTION_DESCRIPTIONS[section]}</Text>
              </View>

              {/* Exercises/Groups in Section */}
              {displayItems.map((item) => {
                if (item.type === 'single') {
                  return renderSingleExercise(item);
                } else {
                  return renderGroupExercise(item);
                }
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
          );
        })}

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
        onClose={() => {
          setShowSearchModal(false);
          setAddingAlternativeToGroupId(null);
          setConvertingToGroupIndex(null);
        }}
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
          setAddingAlternativeToGroupId(null);
          setConvertingToGroupIndex(null);
        }}
        onSave={(config) => {
          // Always use targetSection for new exercises (including alternatives)
          // When editing, the config already has the correct section from existingConfig
          if (editingExerciseIndex !== null) {
            handleSaveExerciseConfig(config);
          } else {
            handleSaveExerciseConfig({ ...config, section: targetSection });
          }
        }}
        // Skip prescription if adding to existing group (inherits from group)
        skipPrescription={!!addingAlternativeToGroupId || convertingToGroupIndex !== null}
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
    marginBottom: 12,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
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
  sectionDescription: {
    fontSize: 13,
    color: colors.mutedForeground,
    marginTop: 4,
  },
  // Single Exercise Card
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
  exerciseDuration: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.mutedForeground,
    marginLeft: 8,
  },
  // Swipe Actions
  swipeActionsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  swipeActionAlt: {
    backgroundColor: '#8B5CF6',
    justifyContent: 'center',
    alignItems: 'center',
    width: 55,
    height: '100%',
    paddingVertical: 12,
  },
  swipeActionEdit: {
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    width: 55,
    height: '100%',
    paddingVertical: 12,
  },
  swipeActionDelete: {
    backgroundColor: '#EF4444',
    justifyContent: 'center',
    alignItems: 'center',
    width: 55,
    height: '100%',
    paddingVertical: 12,
  },
  swipeActionText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#FFFFFF',
    marginTop: 4,
  },
  // Group Card
  groupCard: {
    backgroundColor: colors.secondary,
    borderRadius: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colors.primary,
    overflow: 'hidden',
  },
  groupHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    backgroundColor: `${colors.primary}15`,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  groupHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  groupOrderBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  groupOrderText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  groupBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: `${colors.primary}20`,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  groupBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.primary,
    letterSpacing: 0.5,
  },
  groupHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  groupPrescription: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.primary,
  },
  groupLoad: {
    fontSize: 13,
    color: colors.mutedForeground,
  },
  groupDuration: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.mutedForeground,
  },
  // Group Exercises List
  groupExercises: {
    padding: 12,
  },
  groupExerciseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  groupExerciseName: {
    fontSize: 15,
    fontWeight: '500',
    color: colors.foreground,
    flex: 1,
  },
  groupExerciseRemove: {
    padding: 4,
  },
  orDivider: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
  },
  orLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.border,
  },
  orText: {
    fontSize: 11,
    color: colors.mutedForeground,
    paddingHorizontal: 12,
    fontStyle: 'italic',
  },
  // Group Actions
  groupActions: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  groupActionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 10,
    borderRightWidth: 1,
    borderRightColor: colors.border,
  },
  groupDeleteButton: {
    borderRightWidth: 0,
  },
  groupActionText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.primary,
  },
  groupDeleteText: {
    color: '#EF4444',
  },
  // Add Exercise Button
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
  // Footer
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
