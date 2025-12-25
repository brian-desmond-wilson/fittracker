import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, StatusBar, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeft } from 'lucide-react-native';
import { colors } from '@/src/lib/colors';
import { WorkoutBasicsStep } from './WorkoutBasicsStep';
import { WorkoutExercisesStep } from './WorkoutExercisesStep';
import { WorkoutPreviewStep } from './WorkoutPreviewStep';
import type { WorkoutFormData, WorkoutType, WorkoutExerciseConfig } from '@/src/types/training';

interface AddWorkoutWizardProps {
  programId: string;
  weekNumber: number;
  daysPerWeek: number;
  onClose: () => void;
  onSave: () => void;
}

export function AddWorkoutWizard({
  programId,
  weekNumber,
  daysPerWeek,
  onClose,
  onSave
}: AddWorkoutWizardProps) {
  const insets = useSafeAreaInsets();
  const [currentStep, setCurrentStep] = useState(1);
  const [formData, setFormData] = useState<WorkoutFormData>({
    name: '',
    day_number: 1,
    workout_type: 'Strength' as WorkoutType,
    exercises: [],
  });

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
      case 1: return 'Workout Basics';
      case 2: return 'Add Exercises';
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
