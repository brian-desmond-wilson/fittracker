import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { colors } from '@/src/lib/colors';
import type { MovementFormData } from '../AddMovementWizard';
import {
  fetchMuscleRegions,
  fetchScoringTypes,
  fetchMovementCategories,
  fetchMovementFamilies,
  fetchGoalTypes,
} from '@/src/lib/supabase/crossfit';
import type {
  MuscleRegion,
  ScoringType,
  SkillLevel,
  MovementCategory,
  MovementFamily,
  GoalType,
} from '@/src/types/crossfit';

interface Step2ClassificationProps {
  formData: MovementFormData;
  updateFormData: (updates: Partial<MovementFormData>) => void;
}

const SKILL_LEVELS: SkillLevel[] = ['Beginner', 'Intermediate', 'Advanced'];

// Modality to Movement Family filtering mapping
const MODALITY_TO_FAMILIES: Record<string, string[]> = {
  Gymnastics: ['Pull', 'Push/Press', 'Core', 'Inversion', 'Plyometric', 'Climb', 'Support/Hold', 'Ring/Bar', 'Mobility/Control'],
  Weightlifting: ['Squat', 'Hinge', 'Press', 'Pull', 'Carry', 'Throw', 'Lunge', 'Olympic'],
  Monostructural: ['Run', 'Row', 'Bike', 'Ski', 'Rope', 'Swim', 'Carry'],
  Recovery: ['Mobility', 'Stretching', 'Foam Rolling', 'Breath Work', 'Activation', 'Balance/Stability'],
};

export function Step2Classification({ formData, updateFormData }: Step2ClassificationProps) {
  const [muscleRegions, setMuscleRegions] = useState<MuscleRegion[]>([]);
  const [scoringTypes, setScoringTypes] = useState<ScoringType[]>([]);
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
      const [regionsData, scoringData, categoriesData, familiesData, goalTypesData] = await Promise.all([
        fetchMuscleRegions(),
        fetchScoringTypes(),
        fetchMovementCategories(),
        fetchMovementFamilies(),
        fetchGoalTypes(),
      ]);

      setMuscleRegions(regionsData);
      setScoringTypes(scoringData);
      setCategories(categoriesData);
      setAllFamilies(familiesData);
      setGoalTypes(goalTypesData);
    } catch (error) {
      console.error('Error loading reference data:', error);
    } finally {
      setLoading(false);
    }
  };

  const toggleMuscleRegion = (regionId: string) => {
    const isCurrentlySelected = formData.muscle_region_ids.includes(regionId);

    if (isCurrentlySelected) {
      // Remove from both arrays
      updateFormData({
        muscle_region_ids: formData.muscle_region_ids.filter(id => id !== regionId),
        primary_muscle_region_ids: formData.primary_muscle_region_ids.filter(id => id !== regionId),
      });
    } else {
      // Add as PRIMARY by default (first tap = primary)
      updateFormData({
        muscle_region_ids: [...formData.muscle_region_ids, regionId],
        primary_muscle_region_ids: [...formData.primary_muscle_region_ids, regionId],
      });
    }
  };

  const togglePrimaryMuscle = (regionId: string) => {
    const isPrimary = formData.primary_muscle_region_ids.includes(regionId);

    if (isPrimary) {
      // Remove from primary
      updateFormData({
        primary_muscle_region_ids: formData.primary_muscle_region_ids.filter(id => id !== regionId),
      });
    } else {
      // Add to primary
      updateFormData({
        primary_muscle_region_ids: [...formData.primary_muscle_region_ids, regionId],
      });
    }
  };

  const toggleScoringType = (typeId: string) => {
    const isSelected = formData.scoring_type_ids.includes(typeId);

    if (isSelected) {
      updateFormData({
        scoring_type_ids: formData.scoring_type_ids.filter(id => id !== typeId),
      });
    } else {
      updateFormData({
        scoring_type_ids: [...formData.scoring_type_ids, typeId],
      });
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

      <View style={styles.separator} />

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

      <View style={styles.separator} />

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

      <View style={styles.separator} />

      {/* Skill Level */}
      <View style={styles.field}>
        <Text style={styles.label}>Skill Level</Text>
        <Text style={styles.helperText}>
          Technical difficulty required to perform this movement
        </Text>
        <View style={styles.segmentedControl}>
          {SKILL_LEVELS.map((level, index) => {
            const isSelected = formData.skill_level === level;
            const isFirst = index === 0;
            const isLast = index === SKILL_LEVELS.length - 1;
            return (
              <TouchableOpacity
                key={level}
                style={[
                  styles.segment,
                  isFirst && styles.segmentFirst,
                  isLast && styles.segmentLast,
                  isSelected && styles.segmentSelected
                ]}
                onPress={() => updateFormData({ skill_level: isSelected ? null : level })}
                activeOpacity={0.7}
              >
                <Text style={[styles.segmentText, isSelected && styles.segmentTextSelected]}>
                  {level}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      <View style={styles.separator} />

      {/* Muscle Regions */}
      <View style={styles.field}>
        <Text style={styles.label}>Muscle Regions</Text>
        <Text style={styles.helperText}>
          Tap to select as primary • Long press to toggle to secondary
        </Text>

        {/* Upper Body Section - display_order 1-8 */}
        <Text style={styles.sectionHeader}>Upper Body</Text>
        <View style={styles.pillsContainer}>
          {muscleRegions.filter(r => r.display_order >= 1 && r.display_order <= 8).map(region => {
            const isSelected = formData.muscle_region_ids.includes(region.id);
            const isPrimary = formData.primary_muscle_region_ids.includes(region.id);

            return (
              <TouchableOpacity
                key={region.id}
                style={[
                  styles.musclePill,
                  isSelected && styles.musclePillSelected,
                  isPrimary && styles.musclePillPrimary,
                ]}
                onPress={() => toggleMuscleRegion(region.id)}
                onLongPress={() => {
                  if (isSelected) {
                    togglePrimaryMuscle(region.id);
                  }
                }}
                activeOpacity={0.7}
                delayLongPress={300}
              >
                <Text
                  style={[
                    styles.musclePillText,
                    isSelected && styles.musclePillTextSelected,
                    isPrimary && styles.musclePillTextPrimary,
                  ]}
                >
                  {region.name}
                </Text>
                {isPrimary && <Text style={styles.primaryBadge}>●</Text>}
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Core / Midline Section - display_order 9-11 */}
        <Text style={styles.sectionHeader}>Core / Midline</Text>
        <View style={styles.pillsContainer}>
          {muscleRegions.filter(r => r.display_order >= 9 && r.display_order <= 11).map(region => {
            const isSelected = formData.muscle_region_ids.includes(region.id);
            const isPrimary = formData.primary_muscle_region_ids.includes(region.id);

            return (
              <TouchableOpacity
                key={region.id}
                style={[
                  styles.musclePill,
                  isSelected && styles.musclePillSelected,
                  isPrimary && styles.musclePillPrimary,
                ]}
                onPress={() => toggleMuscleRegion(region.id)}
                onLongPress={() => {
                  if (isSelected) {
                    togglePrimaryMuscle(region.id);
                  }
                }}
                activeOpacity={0.7}
                delayLongPress={300}
              >
                <Text
                  style={[
                    styles.musclePillText,
                    isSelected && styles.musclePillTextSelected,
                    isPrimary && styles.musclePillTextPrimary,
                  ]}
                >
                  {region.name}
                </Text>
                {isPrimary && <Text style={styles.primaryBadge}>●</Text>}
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Lower Body Section - display_order 12-18 */}
        <Text style={styles.sectionHeader}>Lower Body</Text>
        <View style={styles.pillsContainer}>
          {muscleRegions.filter(r => r.display_order >= 12 && r.display_order <= 18).map(region => {
            const isSelected = formData.muscle_region_ids.includes(region.id);
            const isPrimary = formData.primary_muscle_region_ids.includes(region.id);

            return (
              <TouchableOpacity
                key={region.id}
                style={[
                  styles.musclePill,
                  isSelected && styles.musclePillSelected,
                  isPrimary && styles.musclePillPrimary,
                ]}
                onPress={() => toggleMuscleRegion(region.id)}
                onLongPress={() => {
                  if (isSelected) {
                    togglePrimaryMuscle(region.id);
                  }
                }}
                activeOpacity={0.7}
                delayLongPress={300}
              >
                <Text
                  style={[
                    styles.musclePillText,
                    isSelected && styles.musclePillTextSelected,
                    isPrimary && styles.musclePillTextPrimary,
                  ]}
                >
                  {region.name}
                </Text>
                {isPrimary && <Text style={styles.primaryBadge}>●</Text>}
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Whole Body Section - display_order 19+ */}
        <Text style={styles.sectionHeader}>Whole Body</Text>
        <View style={styles.pillsContainer}>
          {muscleRegions.filter(r => r.display_order >= 19).map(region => {
            const isSelected = formData.muscle_region_ids.includes(region.id);
            const isPrimary = formData.primary_muscle_region_ids.includes(region.id);

            return (
              <TouchableOpacity
                key={region.id}
                style={[
                  styles.musclePill,
                  isSelected && styles.musclePillSelected,
                  isPrimary && styles.musclePillPrimary,
                ]}
                onPress={() => toggleMuscleRegion(region.id)}
                onLongPress={() => {
                  if (isSelected) {
                    togglePrimaryMuscle(region.id);
                  }
                }}
                activeOpacity={0.7}
                delayLongPress={300}
              >
                <Text
                  style={[
                    styles.musclePillText,
                    isSelected && styles.musclePillTextSelected,
                    isPrimary && styles.musclePillTextPrimary,
                  ]}
                >
                  {region.name}
                </Text>
                {isPrimary && <Text style={styles.primaryBadge}>●</Text>}
              </TouchableOpacity>
            );
          })}
        </View>
        {formData.muscle_region_ids.length > 0 && (
          <Text style={styles.infoText}>
            Primary: {formData.primary_muscle_region_ids.length} •
            Secondary: {formData.muscle_region_ids.length - formData.primary_muscle_region_ids.length}
          </Text>
        )}
      </View>

      <View style={styles.separator} />

      {/* Scoring Types */}
      <View style={styles.field}>
        <Text style={styles.label}>Scoring Types</Text>
        <Text style={styles.helperText}>
          {formData.scoring_type_ids.length > 0
            ? scoringTypes
                .filter(t => formData.scoring_type_ids.includes(t.id))
                .map(t => t.description)
                .join(' • ')
            : 'How this movement can be measured (select all that apply)'}
        </Text>
        <View style={styles.pillsContainer}>
          {scoringTypes.map(type => {
            const isSelected = formData.scoring_type_ids.includes(type.id);
            return (
              <TouchableOpacity
                key={type.id}
                style={[styles.pill, isSelected && styles.pillSelected]}
                onPress={() => toggleScoringType(type.id)}
                activeOpacity={0.7}
              >
                <Text style={[styles.pillText, isSelected && styles.pillTextSelected]}>
                  {type.name}
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
  separator: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: 8,
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
  sectionHeader: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.mutedForeground,
    marginTop: 16,
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
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
  musclePill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: colors.muted,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 6,
  },
  musclePillSelected: {
    backgroundColor: colors.primary + '40', // 40% opacity
    borderColor: colors.primary,
  },
  musclePillPrimary: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
    borderWidth: 2,
  },
  musclePillText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.foreground,
  },
  musclePillTextSelected: {
    color: colors.primary,
    fontWeight: '600',
  },
  musclePillTextPrimary: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  primaryBadge: {
    fontSize: 8,
    color: '#FFFFFF',
  },
  infoText: {
    fontSize: 12,
    color: colors.mutedForeground,
    fontStyle: 'italic',
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
