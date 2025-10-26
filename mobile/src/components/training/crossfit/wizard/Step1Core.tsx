import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ActivityIndicator } from 'react-native';
import { colors } from '@/src/lib/colors';
import type { MovementFormData } from '../AddMovementWizard';
import {
  fetchMovementCategories,
  fetchMovementFamilies,
  fetchGoalTypes,
} from '@/src/lib/supabase/crossfit';
import type { MovementCategory, MovementFamily, GoalType } from '@/src/types/crossfit';

interface Step1CoreProps {
  formData: MovementFormData;
  updateFormData: (updates: Partial<MovementFormData>) => void;
}

// Modality to Movement Family filtering mapping
const MODALITY_TO_FAMILIES: Record<string, string[]> = {
  Gymnastics: ['Pull', 'Push/Press', 'Core', 'Inversion', 'Plyometric', 'Climb', 'Support/Hold', 'Ring/Bar', 'Mobility/Control'],
  Weightlifting: ['Squat', 'Hinge', 'Press', 'Pull', 'Carry', 'Throw', 'Lunge', 'Olympic'],
  Monostructural: ['Run', 'Row', 'Bike', 'Ski', 'Rope', 'Swim', 'Carry'],
  Recovery: ['Mobility', 'Stretching', 'Foam Rolling', 'Breath Work', 'Activation', 'Balance/Stability'],
};

export function Step1Core({ formData, updateFormData }: Step1CoreProps) {
  const [categories, setCategories] = useState<MovementCategory[]>([]);
  const [allFamilies, setAllFamilies] = useState<MovementFamily[]>([]);
  const [goalTypes, setGoalTypes] = useState<GoalType[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAllFamilies, setShowAllFamilies] = useState(false);

  useEffect(() => {
    loadReferenceData();
  }, []);

  const loadReferenceData = async () => {
    try {
      setLoading(true);
      const [categoriesData, familiesData, goalTypesData] = await Promise.all([
        fetchMovementCategories(),
        fetchMovementFamilies(),
        fetchGoalTypes(),
      ]);

      setCategories(categoriesData);
      setAllFamilies(familiesData);
      setGoalTypes(goalTypesData);
    } catch (error) {
      console.error('Error loading reference data:', error);
    } finally {
      setLoading(false);
    }
  };

  // Get filtered families based on selected modality
  const getFilteredFamilies = (): MovementFamily[] => {
    if (showAllFamilies || !formData.modality_id) {
      return allFamilies;
    }

    const selectedModality = categories.find(c => c.id === formData.modality_id);
    if (!selectedModality) {
      return allFamilies;
    }

    const allowedFamilyNames = MODALITY_TO_FAMILIES[selectedModality.name] || [];
    return allFamilies.filter(f => allowedFamilyNames.includes(f.name));
  };

  const filteredFamilies = getFilteredFamilies();
  const hasFilteredFamilies = formData.modality_id && !showAllFamilies;

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Movement Name */}
      <View style={styles.field}>
        <Text style={styles.label}>
          Movement Name <Text style={styles.required}>*</Text>
        </Text>
        <TextInput
          style={styles.input}
          placeholder="e.g., Pike Walk, Box Jump, etc."
          placeholderTextColor={colors.mutedForeground}
          value={formData.name}
          onChangeText={text => {
            updateFormData({ name: text });
            // Auto-populate short_name if it's empty
            if (!formData.short_name) {
              updateFormData({ short_name: text });
            }
          }}
          autoCapitalize="words"
          autoFocus
        />
      </View>

      {/* Modality */}
      <View style={styles.field}>
        <Text style={styles.label}>
          Modality <Text style={styles.required}>*</Text>
        </Text>
        <Text style={styles.helperText}>
          {formData.modality_id
            ? categories.find(c => c.id === formData.modality_id)?.description || 'Select the primary modality for this movement'
            : 'Select the primary modality for this movement'}
        </Text>
        <View style={styles.segmentedControl}>
          {categories.map((category, index) => {
            const isSelected = formData.modality_id === category.id;
            const isFirst = index === 0;
            const isLast = index === categories.length - 1;

            // Short labels for better fit
            const labelMap: Record<string, string> = {
              'Weightlifting': 'Lifting',
              'Gymnastics': 'Gym',
              'Monostructural': 'Cardio',
              'Recovery': 'Recovery'
            };
            const displayLabel = labelMap[category.name] || category.name;

            return (
              <TouchableOpacity
                key={category.id}
                style={[
                  styles.segment,
                  isFirst && styles.segmentFirst,
                  isLast && styles.segmentLast,
                  isSelected && styles.segmentSelected
                ]}
                onPress={() => {
                  updateFormData({ modality_id: category.id });
                  // Reset family selection when modality changes
                  if (formData.movement_family_id) {
                    const selectedFamily = allFamilies.find(f => f.id === formData.movement_family_id);
                    const newAllowedFamilies = MODALITY_TO_FAMILIES[category.name] || [];
                    if (selectedFamily && !newAllowedFamilies.includes(selectedFamily.name)) {
                      updateFormData({ movement_family_id: null });
                    }
                  }
                  setShowAllFamilies(false);
                }}
                activeOpacity={0.7}
              >
                <Text style={[styles.segmentText, isSelected && styles.segmentTextSelected]}>
                  {displayLabel}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* Movement Family */}
      <View style={styles.field}>
        <Text style={styles.label}>
          Movement Family <Text style={styles.required}>*</Text>
        </Text>
        <Text style={styles.helperText}>
          {formData.movement_family_id
            ? allFamilies.find(f => f.id === formData.movement_family_id)?.description || 'Select the functional movement pattern'
            : hasFilteredFamilies
            ? `Showing families for ${categories.find(c => c.id === formData.modality_id)?.name}`
            : 'Select the functional movement pattern'}
        </Text>
        <View style={styles.pillsContainer}>
          {filteredFamilies.map(family => {
            const isSelected = formData.movement_family_id === family.id;
            return (
              <TouchableOpacity
                key={family.id}
                style={[styles.pill, isSelected && styles.pillSelected]}
                onPress={() => updateFormData({ movement_family_id: family.id })}
                activeOpacity={0.7}
              >
                <Text style={[styles.pillText, isSelected && styles.pillTextSelected]}>
                  {family.name}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
        {hasFilteredFamilies && (
          <TouchableOpacity
            onPress={() => setShowAllFamilies(true)}
            style={styles.showAllButton}
          >
            <Text style={styles.showAllText}>Show All Families</Text>
          </TouchableOpacity>
        )}
        {showAllFamilies && formData.modality_id && (
          <TouchableOpacity
            onPress={() => setShowAllFamilies(false)}
            style={styles.showAllButton}
          >
            <Text style={styles.showAllText}>Show Filtered Families</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Goal Type */}
      <View style={styles.field}>
        <Text style={styles.label}>
          Goal Type <Text style={styles.required}>*</Text>
        </Text>
        <Text style={styles.helperText}>
          {formData.goal_type_id
            ? goalTypes.find(g => g.id === formData.goal_type_id)?.description || 'Primary training goal for this movement'
            : 'Primary training goal for this movement'}
        </Text>
        <View style={styles.pillsContainer}>
          {goalTypes.map(goalType => {
            const isSelected = formData.goal_type_id === goalType.id;
            return (
              <TouchableOpacity
                key={goalType.id}
                style={[styles.pill, isSelected && styles.pillSelected]}
                onPress={() => updateFormData({ goal_type_id: goalType.id })}
                activeOpacity={0.7}
              >
                <Text style={[styles.pillText, isSelected && styles.pillTextSelected]}>
                  {goalType.name}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 24,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: colors.mutedForeground,
  },
  field: {
    gap: 8,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.foreground,
  },
  required: {
    color: colors.destructive,
  },
  helperText: {
    fontSize: 14,
    color: colors.mutedForeground,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
    color: colors.foreground,
    backgroundColor: colors.input,
  },
  segmentedControl: {
    flexDirection: 'row',
    backgroundColor: colors.muted,
    borderRadius: 10,
    padding: 2,
    borderWidth: 1,
    borderColor: colors.border,
  },
  segment: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
  },
  segmentFirst: {
    // Optional: specific styling for first segment
  },
  segmentLast: {
    // Optional: specific styling for last segment
  },
  segmentSelected: {
    backgroundColor: colors.primary,
  },
  segmentText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.mutedForeground,
  },
  segmentTextSelected: {
    color: '#FFFFFF',
  },
  pillsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  pill: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: colors.muted,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pillSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  pillText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.foreground,
  },
  pillTextSelected: {
    color: '#FFFFFF',
  },
  showAllButton: {
    paddingVertical: 8,
    alignItems: 'center',
  },
  showAllText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.primary,
    textDecorationLine: 'underline',
  },
});
