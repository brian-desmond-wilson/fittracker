import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, StatusBar, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeft } from 'lucide-react-native';
import { colors } from '@/src/lib/colors';
import { WODBasicsStep } from './WODBasicsStep';
import { WODMovementsStep } from './WODMovementsStep';
import { WODPreviewStep } from './WODPreviewStep';
import { fetchWODFormats, fetchWODCategories } from '@/src/lib/supabase/crossfit';
import type { WODFormat, WODCategory } from '@/src/types/crossfit';

interface AddWODWizardProps {
  onClose: () => void;
  onSave: () => void;
}

export interface WODMovementConfig {
  exercise_id: string;
  exercise_name: string;
  movement_order: number;

  // Rx scaling (required)
  rx_reps?: number;
  rx_weight_lbs?: number;
  rx_distance?: number;
  rx_time?: number;
  rx_movement_variation?: string;

  // L2 scaling (optional)
  l2_reps?: number;
  l2_weight_lbs?: number;
  l2_distance?: number;
  l2_time?: number;
  l2_movement_variation?: string;

  // L1 scaling (optional)
  l1_reps?: number;
  l1_weight_lbs?: number;
  l1_distance?: number;
  l1_time?: number;
  l1_movement_variation?: string;

  // Special configs
  round_pattern?: string; // "21-15-9"
  emom_minute?: number;
  notes?: string;
}

export interface WODFormData {
  // Step 1: Basics
  name: string;
  format_id: string;
  category_id: string;
  time_cap_minutes?: number;
  description?: string;
  notes?: string;

  // Step 2: Movements
  movements: WODMovementConfig[];
}

export function AddWODWizard({ onClose, onSave }: AddWODWizardProps) {
  const insets = useSafeAreaInsets();
  const [currentStep, setCurrentStep] = useState(1);
  const [formData, setFormData] = useState<WODFormData>({
    name: '',
    format_id: '',
    category_id: '',
    movements: [],
  });
  const [formats, setFormats] = useState<WODFormat[]>([]);
  const [categories, setCategories] = useState<WODCategory[]>([]);

  useEffect(() => {
    loadReferenceData();
  }, []);

  const loadReferenceData = async () => {
    try {
      const [formatsData, categoriesData] = await Promise.all([
        fetchWODFormats(),
        fetchWODCategories(),
      ]);
      setFormats(formatsData);
      setCategories(categoriesData);
    } catch (error) {
      console.error('Error loading reference data:', error);
    }
  };

  const handleNext = () => {
    // Validate current step before proceeding
    if (currentStep === 1) {
      if (!formData.name.trim()) {
        Alert.alert('Validation Error', 'WOD name is required');
        return;
      }
      if (!formData.format_id) {
        Alert.alert('Validation Error', 'Please select a format');
        return;
      }
      if (!formData.category_id) {
        Alert.alert('Validation Error', 'Please select a category');
        return;
      }
    }

    if (currentStep === 2) {
      if (formData.movements.length === 0) {
        Alert.alert('Validation Error', 'Please add at least one movement');
        return;
      }
    }

    setCurrentStep(prev => Math.min(prev + 1, 3));
  };

  const handleBack = () => {
    setCurrentStep(prev => Math.max(prev - 1, 1));
  };

  const handleCancel = () => {
    const hasChanges = formData.name.trim() || formData.movements.length > 0;

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

  const updateFormData = (updates: Partial<WODFormData>) => {
    setFormData(prev => ({ ...prev, ...updates }));
  };

  const getStepTitle = () => {
    switch (currentStep) {
      case 1: return 'WOD Basics';
      case 2: return 'Add Movements';
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
            <WODBasicsStep
              formData={formData}
              onUpdate={updateFormData}
              onNext={handleNext}
            />
          )}
          {currentStep === 2 && (
            <WODMovementsStep
              formData={formData}
              onUpdate={updateFormData}
              onNext={handleNext}
            />
          )}
          {currentStep === 3 && (
            <WODPreviewStep
              formData={formData}
              formatName={formats.find(f => f.id === formData.format_id)?.name}
              categoryName={categories.find(c => c.id === formData.category_id)?.name}
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
