import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, StatusBar, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeft } from 'lucide-react-native';
import { colors } from '@/src/lib/colors';
import { WorkoutBasicsStep } from './WorkoutBasicsStep';
import { WorkoutExercisesStep } from './WorkoutExercisesStep';
import { WorkoutPreviewStep } from './WorkoutPreviewStep';
import type {
  WorkoutFormData,
  WorkoutType,
  WorkoutExerciseConfig,
  ProgramWorkoutWithRelations,
  WorkoutSection,
  LoadType,
} from '@/src/types/training';

interface AddWorkoutWizardProps {
  programId: string;
  weekNumber: number;
  daysPerWeek: number;
  onClose: () => void;
  onSave: () => void;
  /** If provided, wizard operates in edit mode */
  existingWorkout?: ProgramWorkoutWithRelations;
}

export function AddWorkoutWizard({
  programId,
  weekNumber,
  daysPerWeek,
  onClose,
  onSave,
  existingWorkout,
}: AddWorkoutWizardProps) {
  const insets = useSafeAreaInsets();
  const [currentStep, setCurrentStep] = useState(1);
  const isEditMode = !!existingWorkout;

  // Convert existing workout to form data format
  const getInitialFormData = (): WorkoutFormData => {
    if (!existingWorkout) {
      return {
        name: '',
        day_number: 1,
        workout_type: 'Strength' as WorkoutType,
        exercises: [],
      };
    }

    // Map exercises from database format to form format
    const exercises: WorkoutExerciseConfig[] = (existingWorkout.exercises || []).map((ex) => ({
      exercise_id: ex.exercise_id,
      exercise_name: ex.exercise?.name || 'Unknown Exercise',
      section: (ex.section as WorkoutSection) || 'Strength',
      exercise_order: ex.exercise_order,
      target_sets: ex.target_sets || undefined,
      target_reps: ex.target_reps_min || undefined,
      target_time_seconds: ex.target_time_seconds || undefined,
      is_per_side: ex.is_per_side,
      load_type: (ex.load_type as LoadType) || 'none',
      load_rpe: ex.target_rpe_min || undefined,
      load_percentage_1rm: ex.load_percentage_1rm || undefined,
      load_weight_lbs: ex.load_weight_lbs || undefined,
      load_notes: ex.load_notes || undefined,
      rest_seconds: ex.rest_seconds || undefined,
      estimated_duration_minutes: ex.estimated_duration_minutes || undefined,
      video_url: ex.video_url || undefined,
      exercise_notes: ex.exercise_notes || undefined,
      tempo: ex.tempo || undefined,
    }));

    return {
      name: existingWorkout.name,
      day_number: existingWorkout.day_number,
      workout_type: existingWorkout.workout_type as WorkoutType,
      estimated_duration_minutes: existingWorkout.estimated_duration_minutes || undefined,
      warmup_instructions: existingWorkout.warmup_instructions || undefined,
      cooldown_instructions: existingWorkout.cooldown_instructions || undefined,
      notes: existingWorkout.notes || undefined,
      exercises,
    };
  };

  const [formData, setFormData] = useState<WorkoutFormData>(getInitialFormData);

  const handleNext = () => {
    // Validate current step before proceeding
    if (currentStep === 1) {
      if (!formData.name.trim()) {
        Alert.alert('Validation Error', 'Workout name is required');
        return;
      }
      if (!formData.day_number || formData.day_number < 1 || formData.day_number > daysPerWeek) {
        Alert.alert('Validation Error', `Please select a day (1-${daysPerWeek})`);
        return;
      }
    }

    if (currentStep === 2) {
      if (formData.exercises.length === 0) {
        Alert.alert('Validation Error', 'Please add at least one exercise');
        return;
      }
    }

    setCurrentStep(prev => Math.min(prev + 1, 3));
  };

  const handleBack = () => {
    setCurrentStep(prev => Math.max(prev - 1, 1));
  };

  const handleCancel = () => {
    const hasChanges = formData.name.trim() || formData.exercises.length > 0;

    if (hasChanges) {
      Alert.alert(
        'Discard Changes?',
        'You have unsaved changes. Are you sure you want to discard them?',
        [
          { text: 'Keep Editing', style: 'cancel' },
          { text: 'Discard', style: 'destructive', onPress: onClose },
        ]
      );
    } else {
      onClose();
    }
  };

  const updateFormData = (updates: Partial<WorkoutFormData>) => {
    setFormData(prev => ({ ...prev, ...updates }));
  };

  const getStepTitle = () => {
    switch (currentStep) {
      case 1: return isEditMode ? 'Edit Basics' : 'Workout Basics';
      case 2: return isEditMode ? 'Edit Exercises' : 'Add Exercises';
      case 3: return 'Review';
      default: return '';
    }
  };

  return (
    <>
      <StatusBar barStyle="light-content" />
      <View style={[styles.container, { paddingTop: insets.top }]}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={currentStep === 1 ? handleCancel : handleBack} style={styles.backButton}>
            <ChevronLeft size={24} color="#FFFFFF" />
            <Text style={styles.backText}>{currentStep === 1 ? 'Cancel' : 'Back'}</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{getStepTitle()}</Text>
          <View style={styles.headerRight}>
            <Text style={styles.stepIndicator}>Step {currentStep}/3</Text>
          </View>
        </View>

        {/* Step Content */}
        <View style={styles.content}>
          {currentStep === 1 && (
            <WorkoutBasicsStep
              formData={formData}
              daysPerWeek={daysPerWeek}
              onUpdate={updateFormData}
              onNext={handleNext}
            />
          )}
          {currentStep === 2 && (
            <WorkoutExercisesStep
              formData={formData}
              onUpdate={updateFormData}
              onNext={handleNext}
            />
          )}
          {currentStep === 3 && (
            <WorkoutPreviewStep
              formData={formData}
              programId={programId}
              weekNumber={weekNumber}
              onSave={onSave}
              onClose={onClose}
              isEditMode={isEditMode}
              workoutId={existingWorkout?.id}
            />
          )}
        </View>
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
    minWidth: 80,
  },
  backText: {
    fontSize: 17,
    color: '#FFFFFF',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  headerRight: {
    minWidth: 80,
    alignItems: 'flex-end',
  },
  stepIndicator: {
    fontSize: 14,
    color: colors.mutedForeground,
  },
  content: {
    flex: 1,
  },
});
