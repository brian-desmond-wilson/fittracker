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
  fetchMovementWithAttributes,
} from '@/src/lib/supabase/crossfit';
import type {
  MuscleRegion,
  ScoringType,
  SkillLevel,
  MovementCategory,
  MovementFamily,
  GoalType,
  Exercise,
} from '@/src/types/crossfit';

interface Step2ClassificationProps {
  formData: MovementFormData;
  updateFormData: (updates: Partial<MovementFormData>) => void;
}

const SKILL_LEVELS: SkillLevel[] = ['Beginner', 'Intermediate', 'Advanced'];

// Fields that can be overridden even when inherited
type OverridableField = 'skill_level' | 'scoring_type_ids';

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

  // Attribute inheritance state
  const [parentMovement, setParentMovement] = useState<Exercise | null>(null);
  const [inheritedFields, setInheritedFields] = useState<Set<string>>(new Set());
  const [overriddenFields, setOverriddenFields] = useState<Set<OverridableField>>(new Set());

  useEffect(() => {
    loadReferenceData();
  }, []);

  // Load parent movement attributes when parent_exercise_id is set
  useEffect(() => {
    if (formData.parent_exercise_id && !formData.is_core) {
      loadParentAttributes();
    } else {
      setParentMovement(null);
      setInheritedFields(new Set());
    }
  }, [formData.parent_exercise_id, formData.is_core]);

  const loadParentAttributes = async () => {
    try {
      const parent = await fetchMovementWithAttributes(formData.parent_exercise_id!);
      setParentMovement(parent);

      // Auto-inherit attributes from parent
      const fieldsToInherit = new Set<string>();

      // Always inherit (locked fields)
      if (parent.movement_family_id) {
        updateFormData({ movement_family_id: parent.movement_family_id });
        fieldsToInherit.add('movement_family_id');
      }
      if (parent.movement_category_id) {
        updateFormData({ modality_id: parent.movement_category_id });
        fieldsToInherit.add('modality_id');
      }
      if (parent.goal_type_id) {
        updateFormData({ goal_type_ids: [parent.goal_type_id] });
        fieldsToInherit.add('goal_type_ids');
      }
      if (parent.plane_of_motion_id) {
        updateFormData({ plane_of_motion_ids: [parent.plane_of_motion_id] });
        fieldsToInherit.add('plane_of_motion_ids');
      }

      // Extract muscle regions from parent's exercise_muscle_regions array
      if (parent.muscle_regions && Array.isArray(parent.muscle_regions)) {
        const muscleRegionIds = parent.muscle_regions.map((mr: any) => mr.muscle_region_id);
        const primaryMuscleRegionIds = parent.muscle_regions
          .filter((mr: any) => mr.is_primary)
          .map((mr: any) => mr.muscle_region_id);

        updateFormData({
          muscle_region_ids: muscleRegionIds,
          primary_muscle_region_ids: primaryMuscleRegionIds,
        });
        fieldsToInherit.add('muscle_region_ids');
      }

      // Overridable fields (pre-fill but allow override)
      if (parent.skill_level && !overriddenFields.has('skill_level')) {
        updateFormData({ skill_level: parent.skill_level });
        fieldsToInherit.add('skill_level');
      }

      // Extract scoring types from parent's exercise_scoring_types array
      if (parent.scoring_types && Array.isArray(parent.scoring_types) && !overriddenFields.has('scoring_type_ids')) {
        const scoringTypeIds = parent.scoring_types.map((st: any) => st.scoring_type_id);
        updateFormData({ scoring_type_ids: scoringTypeIds });
        fieldsToInherit.add('scoring_type_ids');
      }

      setInheritedFields(fieldsToInherit);
    } catch (error) {
      console.error('Error loading parent attributes:', error);
    }
  };

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

  // Helper functions for inheritance
  const isFieldInherited = (fieldName: string): boolean => {
    return inheritedFields.has(fieldName) && !overriddenFields.has(fieldName as OverridableField);
  };

  const isFieldOverridden = (fieldName: OverridableField): boolean => {
    return overriddenFields.has(fieldName);
  };

  const handleOverride = (fieldName: OverridableField) => {
    setOverriddenFields(prev => new Set(prev).add(fieldName));
    setInheritedFields(prev => {
      const next = new Set(prev);
      next.delete(fieldName);
      return next;
    });
  };

  const renderInheritanceBadge = (fieldName: string) => {
    if (!formData.parent_movement_name) return null;

    if (isFieldOverridden(fieldName as OverridableField)) {
      return (
        <View style={styles.inheritanceBadge}>
          <Text style={styles.inheritanceText}>Overridden</Text>
        </View>
      );
    }

    if (isFieldInherited(fieldName)) {
      return (
        <View style={styles.inheritanceBadge}>
          <Text style={styles.inheritanceText}>Inherited from {formData.parent_movement_name}</Text>
        </View>
      );
    }

    return null;
  };

  const renderOverrideButton = (fieldName: OverridableField) => {
    if (!isFieldInherited(fieldName)) return null;

    return (
      <TouchableOpacity
        style={styles.overrideButton}
        onPress={() => handleOverride(fieldName)}
        activeOpacity={0.7}
      >
        <Text style={styles.overrideButtonText}>Override</Text>
      </TouchableOpacity>
    );
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
                <Text
                  style={[styles.segmentText, isSelected && styles.segmentTextSelected]}
                  numberOfLines={1}
                >
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
          Primary training goal for this movement
        </Text>
        <View style={styles.pillsContainer}>
          {goalTypes.map(goalType => {
            const isSelected = formData.goal_type_ids.includes(goalType.id);
            return (
              <TouchableOpacity
                key={goalType.id}
                style={[styles.pill, isSelected && styles.pillSelected]}
                onPress={() => {
                  const newGoalTypeIds = isSelected
                    ? formData.goal_type_ids.filter(id => id !== goalType.id)
                    : [...formData.goal_type_ids, goalType.id];
                  updateFormData({ goal_type_ids: newGoalTypeIds });
                }}
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
        <View style={styles.labelRow}>
          <Text style={styles.label}>Skill Level</Text>
          {renderOverrideButton('skill_level')}
        </View>
        {renderInheritanceBadge('skill_level')}
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
        <View style={styles.labelRow}>
          <Text style={styles.label}>Scoring Types</Text>
          {renderOverrideButton('scoring_type_ids')}
        </View>
        {renderInheritanceBadge('scoring_type_ids')}
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
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    minWidth: 0,
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
    textAlign: 'center',
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
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  inheritanceBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    backgroundColor: colors.muted,
    borderWidth: 1,
    borderColor: colors.border,
    alignSelf: 'flex-start',
  },
  inheritanceText: {
    fontSize: 12,
    color: colors.mutedForeground,
    fontStyle: 'italic',
  },
  overrideButton: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 4,
    backgroundColor: colors.primary,
  },
  overrideButtonText: {
    fontSize: 12,
    fontWeight: '600',
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
