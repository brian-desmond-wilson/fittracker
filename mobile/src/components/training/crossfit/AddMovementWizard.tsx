import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, StatusBar, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import { colors } from '@/src/lib/colors';
import { supabase } from '@/src/lib/supabase';
import { createMovement } from '@/src/lib/supabase/crossfit';
import type { CreateMovementInput } from '@/src/types/crossfit';

// Step components
import { Step1Core } from './wizard/Step1Core';
import { Step2Classification } from './wizard/Step2Classification';
import { Step3Attributes } from './wizard/Step3Attributes';

export interface MovementFormData {
  // Step 1: Core Identity (required)
  is_core: boolean;
  parent_exercise_id: string | null;
  parent_movement_name: string; // For UI display
  name: string;
  modality_id: string | null;
  movement_family_id: string | null;
  goal_type_id: string | null;

  // Step 2: Classification (optional)
  skill_level: 'Beginner' | 'Intermediate' | 'Advanced' | null;
  muscle_region_ids: string[]; // With primary/secondary flag handled separately
  primary_muscle_region_ids: string[];
  scoring_type_ids: string[];

  // Step 3: Movement Attributes (optional)
  equipment_ids: string[];
  load_position_id: string | null;
  stance_id: string | null;
  plane_of_motion_id: string | null;
  movement_style_ids: string[]; // Multiple styles
  symmetry_id: string | null;
  range_depth_id: string | null;

  // Step 4: Details & Variations
  short_name: string;
  aliases: string[];
  description: string;
  video_url: string;
  image_url: string;

  // Step 5: Variations (optional)
  variation_option_ids: string[];
}

interface AddMovementWizardProps {
  onClose: () => void;
  onSave: () => void;
}

const STEPS = [
  { number: 1, title: 'Details', required: true },
  { number: 2, title: 'Classification', required: true },
  { number: 3, title: 'Attributes', required: false },
];

export function AddMovementWizard({ onClose, onSave }: AddMovementWizardProps) {
  const insets = useSafeAreaInsets();
  const [currentStep, setCurrentStep] = useState(1);
  const [formData, setFormData] = useState<MovementFormData>({
    is_core: true,
    parent_exercise_id: null,
    parent_movement_name: '',
    name: '',
    modality_id: null,
    movement_family_id: null,
    goal_type_id: null,
    skill_level: null,
    muscle_region_ids: [],
    primary_muscle_region_ids: [],
    scoring_type_ids: [],
    equipment_ids: [],
    load_position_id: null,
    stance_id: null,
    plane_of_motion_id: null,
    movement_style_ids: [],
    symmetry_id: null,
    range_depth_id: null,
    short_name: '',
    aliases: [],
    description: '',
    video_url: '',
    image_url: '',
    variation_option_ids: [],
  });

  const updateFormData = (updates: Partial<MovementFormData>) => {
    setFormData(prev => ({ ...prev, ...updates }));
  };

  const canProceed = () => {
    if (currentStep === 1) {
      // Step 1 validation: require name
      // If variation, also require parent_exercise_id
      if (!formData.name.trim()) return false;
      if (!formData.is_core && !formData.parent_exercise_id) return false;
      return true;
    }
    if (currentStep === 2) {
      // Step 2 validation: require modality, family, goal type
      return (
        formData.modality_id !== null &&
        formData.movement_family_id !== null &&
        formData.goal_type_id !== null
      );
    }
    // Step 3 is optional
    return true;
  };

  const handleNext = () => {
    if (currentStep < STEPS.length) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleSkip = () => {
    if (currentStep < STEPS.length) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handleSave = async () => {
    try {
      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        Alert.alert('Error', 'You must be logged in to create a movement');
        return;
      }

      // Map form data to API input
      const input: CreateMovementInput = {
        name: formData.name,
        description: formData.description,
        goal_type_id: formData.goal_type_id!,
        movement_category_id: formData.modality_id!,

        // Movement Hierarchy
        is_core: formData.is_core,
        parent_exercise_id: formData.parent_exercise_id || undefined,

        // Core metadata
        movement_family_id: formData.movement_family_id,
        plane_of_motion_id: formData.plane_of_motion_id,
        skill_level: formData.skill_level,
        short_name: formData.short_name || formData.name,
        aliases: formData.aliases.length > 0 ? formData.aliases : undefined,

        // Attributes
        load_position_id: formData.load_position_id,
        stance_id: formData.stance_id,
        range_depth_id: formData.range_depth_id,
        movement_style_ids: formData.movement_style_ids.length > 0 ? formData.movement_style_ids : undefined,
        symmetry_id: formData.symmetry_id,

        // Media
        video_url: formData.video_url || undefined,
        image_url: formData.image_url || undefined,

        // Ownership
        is_movement: true,
        is_official: false,
        created_by: user.id,

        // Relations
        variation_option_ids: formData.variation_option_ids.length > 0 ? formData.variation_option_ids : undefined,
        scoring_type_ids: formData.scoring_type_ids.length > 0 ? formData.scoring_type_ids : undefined,
        muscle_region_ids: formData.muscle_region_ids.length > 0 ? formData.muscle_region_ids : undefined,
        primary_muscle_region_ids: formData.primary_muscle_region_ids.length > 0 ? formData.primary_muscle_region_ids : undefined,
      };

      await createMovement(input);

      Alert.alert('Success', 'Movement created successfully!', [
        {
          text: 'OK',
          onPress: () => {
            onSave();
            onClose();
          },
        },
      ]);
    } catch (error) {
      console.error('Error creating movement:', error);
      Alert.alert('Error', 'Failed to create movement. Please try again.');
    }
  };

  const renderStep = () => {
    switch (currentStep) {
      case 1:
        return <Step1Core formData={formData} updateFormData={updateFormData} />;
      case 2:
        return <Step2Classification formData={formData} updateFormData={updateFormData} />;
      case 3:
        return <Step3Attributes formData={formData} updateFormData={updateFormData} />;
      default:
        return null;
    }
  };

  const currentStepInfo = STEPS[currentStep - 1];
  const isLastStep = currentStep === STEPS.length;
  const isFirstStep = currentStep === 1;

  return (
    <>
      <StatusBar barStyle="light-content" />
      <View style={[styles.container, { paddingTop: insets.top }]}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.headerButton}>
            <ChevronLeft size={24} color="#FFFFFF" />
            <Text style={styles.headerButtonText}>Cancel</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Add Movement</Text>
          <View style={styles.headerButton} />
        </View>

        {/* Progress Indicator */}
        <View style={styles.progressContainer}>
          <View style={styles.progressBar}>
            {STEPS.map((step, index) => (
              <View
                key={step.number}
                style={[
                  styles.progressDot,
                  currentStep >= step.number && styles.progressDotActive,
                  currentStep === step.number && styles.progressDotCurrent,
                ]}
              />
            ))}
          </View>
          <Text style={styles.stepTitle}>
            Step {currentStep} of {STEPS.length}: {currentStepInfo.title}
            {!currentStepInfo.required && <Text style={styles.optionalBadge}></Text>}
          </Text>
        </View>

        {/* Step Content */}
        <ScrollView
          style={styles.content}
          contentContainerStyle={styles.contentContainer}
          showsVerticalScrollIndicator={false}
        >
          {renderStep()}
        </ScrollView>

        {/* Footer Navigation */}
        <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
          <View style={styles.footerButtons}>
            {!isFirstStep && (
              <TouchableOpacity onPress={handleBack} style={styles.secondaryButton}>
                <ChevronLeft size={20} color={colors.primary} />
                <Text style={styles.secondaryButtonText}>Back</Text>
              </TouchableOpacity>
            )}

            {!isFirstStep && !isLastStep && (
              <TouchableOpacity onPress={handleSkip} style={styles.secondaryButton}>
                <Text style={styles.secondaryButtonText}>Skip</Text>
              </TouchableOpacity>
            )}

            {isLastStep ? (
              <TouchableOpacity
                onPress={handleSave}
                style={[styles.primaryButton, !canProceed() && styles.primaryButtonDisabled]}
                disabled={!canProceed()}
              >
                <Text style={styles.primaryButtonText}>Save Movement</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                onPress={handleNext}
                style={[styles.primaryButton, !canProceed() && styles.primaryButtonDisabled]}
                disabled={!canProceed()}
              >
                <Text style={styles.primaryButtonText}>Next</Text>
                <ChevronRight size={20} color="#FFFFFF" />
              </TouchableOpacity>
            )}
          </View>
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
  headerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minWidth: 80,
  },
  headerButtonText: {
    fontSize: 17,
    color: '#FFFFFF',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  progressContainer: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  progressBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  progressDot: {
    flex: 1,
    height: 4,
    backgroundColor: colors.muted,
    marginHorizontal: 2,
    borderRadius: 2,
  },
  progressDotActive: {
    backgroundColor: colors.primary,
  },
  progressDotCurrent: {
    backgroundColor: colors.primary,
    opacity: 1,
  },
  stepTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.foreground,
  },
  optionalBadge: {
    fontSize: 14,
    fontWeight: '400',
    color: colors.mutedForeground,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 20,
  },
  footer: {
    paddingHorizontal: 20,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.background,
  },
  footerButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 8,
    gap: 8,
    flex: 1,
  },
  primaryButtonDisabled: {
    opacity: 0.5,
  },
  primaryButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  secondaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 20,
    gap: 4,
  },
  secondaryButtonText: {
    fontSize: 16,
    fontWeight: '500',
    color: colors.primary,
  },
});
