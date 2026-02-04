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

export type RepSchemeType = 'descending' | 'fixed_rounds' | 'chipper' | 'ascending' | 'distance' | 'custom';

export interface WODMovementConfig {
  exercise_id: string;
  exercise_name: string;
  movement_order: number;

  // Equipment metadata (needed for edit modal)
  requires_weight?: boolean;
  requires_distance?: boolean;
  equipment_types?: string[];

  // Rep scheme override
  custom_rep_scheme?: string;
  follows_wod_scheme: boolean;

  // Rx scaling - Gender split for weights
  rx_reps?: number;
  rx_weight_men_lbs?: number;
  rx_weight_women_lbs?: number;
  rx_distance?: number; // DEPRECATED: Use rx_distance_value and rx_distance_unit
  rx_distance_value?: number;
  rx_distance_unit?: string;
  rx_time?: number;
  rx_movement_variation?: string;
  rx_alternative_exercise_id?: string;
  rx_alternative_exercise_name?: string;

  // L2 scaling - Gender split for weights
  l2_reps?: number | string; // Can be number (e.g., 15) or rep scheme (e.g., "15-12-9")
  l2_weight_men_lbs?: number;
  l2_weight_women_lbs?: number;
  l2_distance?: number; // DEPRECATED: Use l2_distance_value and l2_distance_unit
  l2_distance_value?: number;
  l2_distance_unit?: string;
  l2_time?: number;
  l2_movement_variation?: string;
  l2_alternative_exercise_id?: string;
  l2_alternative_exercise_name?: string;

  // L1 scaling - Gender split for weights
  l1_reps?: number | string; // Can be number (e.g., 15) or rep scheme (e.g., "15-12-9-6-3")
  l1_weight_men_lbs?: number;
  l1_weight_women_lbs?: number;
  l1_distance?: number; // DEPRECATED: Use l1_distance_value and l1_distance_unit
  l1_distance_value?: number;
  l1_distance_unit?: string;
  l1_time?: number;
  l1_movement_variation?: string;
  l1_alternative_exercise_id?: string;
  l1_alternative_exercise_name?: string;

  notes?: string;
}

export interface WODFormData {
  // Step 1: Basics
  name: string;
  category_id: string;  // Moved before format
  format_id: string;

  // For Time specific fields
  rep_scheme_type?: RepSchemeType;
  rep_scheme?: string;  // e.g., "21-18-15-12-9-6-3" or "3"

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
      if (!formData.category_id) {
        Alert.alert('Validation Error', 'Please select a category');
        return;
      }
      if (!formData.format_id) {
        Alert.alert('Validation Error', 'Please select a format');
        return;
      }

      // Validate For Time specific fields
      const selectedFormat = formats.find(f => f.id === formData.format_id);
      if (selectedFormat?.name === 'For Time') {
        if (!formData.rep_scheme_type) {
          Alert.alert('Validation Error', 'Please select a rep scheme type for For Time WODs');
          return;
        }
        if (!formData.rep_scheme?.trim()) {
          Alert.alert('Validation Error', 'Please enter a rep scheme');
          return;
        }

        // Validate rep scheme format based on type
        if (formData.rep_scheme_type === 'descending' || formData.rep_scheme_type === 'ascending') {
          // Should match pattern like "21-15-9" or "1-2-3-4-5"
          const repSchemePattern = /^\d+(-\d+)*$/;
          if (!repSchemePattern.test(formData.rep_scheme)) {
            Alert.alert('Validation Error', 'Rep scheme must be numbers separated by dashes (e.g., "21-15-9")');
            return;
          }
        } else if (formData.rep_scheme_type === 'fixed_rounds') {
          // Should be a single number
          if (!/^\d+$/.test(formData.rep_scheme)) {
            Alert.alert('Validation Error', 'Please enter a valid number of rounds (e.g., "3")');
            return;
          }
        }
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
              wodFormatName={formats.find(f => f.id === formData.format_id)?.name}
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
