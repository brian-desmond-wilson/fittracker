// Step 2: classification — modality, family, goals, skill, muscles, scoring.
//
// The family list is driven by the movement_family_modalities truth table
// (which families are legal for the chosen modality) — the old hardcoded
// name map is gone, so merged/renamed families (Midline, Swing, Rotation…)
// are reachable the moment the dictionary says so. Muscle-region sections
// come from the dictionary's region_group, not display_order ranges.
//
// This step RENDERS only: dictionaries arrive from the wizard (fetched once
// at mount up there), and core inheritance is applied by the wizard when
// Step 1 explicitly picks a core — a remount of this step (back navigation,
// edit prefill) must never re-clobber the form with the core's values.
import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { colors } from '@/src/lib/colors';
import { colors as themeColors } from '@/src/theme/tokens';
import type { WizardFormData, WizardDictionaries } from '../CatalogItemWizard';
import type { OverridableInheritField } from '@/src/lib/catalogWizardForm';
import type { MuscleRegion, SkillLevel, MovementFamily } from '@/src/types/crossfit';

interface Step2ClassificationProps {
  formData: WizardFormData;
  updateFormData: (updates: Partial<WizardFormData>) => void;
  dictionaries: WizardDictionaries;
  /** Wizard-owned inheritance bookkeeping (survives step remounts). */
  inheritedFields: ReadonlySet<string>;
  overriddenFields: ReadonlySet<OverridableInheritField>;
  onOverride: (field: OverridableInheritField) => void;
}

const SKILL_LEVELS: SkillLevel[] = ['Beginner', 'Intermediate', 'Advanced'];

export function Step2Classification({
  formData,
  updateFormData,
  dictionaries,
  inheritedFields,
  overriddenFields,
  onOverride,
}: Step2ClassificationProps) {
  const {
    muscleRegions,
    scoringTypes,
    categories,
    families: allFamilies,
    familyModalities,
    goalTypes,
  } = dictionaries;
  const [showAllFamilies, setShowAllFamilies] = useState(false);

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
      updateFormData({
        primary_muscle_region_ids: formData.primary_muscle_region_ids.filter(id => id !== regionId),
      });
    } else {
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

  // Helper functions for inheritance badges (state lives in the wizard)
  const isFieldInherited = (fieldName: string): boolean => {
    return (
      inheritedFields.has(fieldName) &&
      !overriddenFields.has(fieldName as OverridableInheritField)
    );
  };

  const isFieldOverridden = (fieldName: OverridableInheritField): boolean => {
    return overriddenFields.has(fieldName);
  };

  const renderInheritanceBadge = (fieldName: string) => {
    if (!formData.core_movement_name) return null;

    if (isFieldOverridden(fieldName as OverridableInheritField)) {
      return (
        <View style={styles.inheritanceBadge}>
          <Text style={styles.inheritanceText}>Overridden</Text>
        </View>
      );
    }

    if (isFieldInherited(fieldName)) {
      return (
        <View style={styles.inheritanceBadge}>
          <Text style={styles.inheritanceText}>Inherited from {formData.core_movement_name}</Text>
        </View>
      );
    }

    return null;
  };

  const renderOverrideButton = (fieldName: OverridableInheritField) => {
    if (!isFieldInherited(fieldName)) return null;

    return (
      <TouchableOpacity
        style={styles.overrideButton}
        onPress={() => onOverride(fieldName)}
        activeOpacity={0.7}
      >
        <Text style={styles.overrideButtonText}>Override</Text>
      </TouchableOpacity>
    );
  };

  /** Family ids legal for a modality, straight from the truth table. */
  const allowedFamilyIds = (modalityId: string): Set<string> =>
    new Set(
      familyModalities
        .filter((fm) => fm.movement_category_id === modalityId)
        .map((fm) => fm.movement_family_id),
    );

  // Get filtered families based on selected modality
  const getFilteredFamilies = (): MovementFamily[] => {
    if (showAllFamilies || !formData.modality_id) {
      return allFamilies;
    }
    const allowed = allowedFamilyIds(formData.modality_id);
    return allFamilies.filter(f => allowed.has(f.id));
  };

  const filteredFamilies = getFilteredFamilies();
  const hasFilteredFamilies = formData.modality_id && !showAllFamilies;

  // "Show All Families" is an escape hatch: an off-table pick is allowed
  // (the DB does not enforce the truth table — it is a curation convention),
  // it just gets called out.
  const familyOffTable = !!(
    formData.movement_family_id &&
    formData.modality_id &&
    familyModalities.length > 0 &&
    !allowedFamilyIds(formData.modality_id).has(formData.movement_family_id)
  );

  /** Muscle regions grouped by the dictionary's region_group, in display order. */
  const muscleSections = muscleRegions.reduce<{ group: string; regions: MuscleRegion[] }[]>(
    (sections, region) => {
      const group = region.region_group || 'Other';
      const section = sections.find((s) => s.group === group);
      if (section) {
        section.regions.push(region);
      } else {
        sections.push({ group, regions: [region] });
      }
      return sections;
    },
    [],
  );

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
                  // Reset family selection when it is not legal under the new
                  // modality (per the truth table, not a name list).
                  if (
                    formData.movement_family_id &&
                    !allowedFamilyIds(category.id).has(formData.movement_family_id)
                  ) {
                    updateFormData({ movement_family_id: null });
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
        {familyOffTable && (
          <Text style={styles.offTableWarning}>
            This family is outside the usual set for this modality — allowed,
            just unusual.
          </Text>
        )}
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
        <View style={styles.labelRow}>
          <Text style={styles.label}>
            Goal Type <Text style={styles.required}>*</Text>
          </Text>
        </View>
        {renderInheritanceBadge('goal_type_ids')}
        <Text style={styles.helperText}>
          Training goals for this movement (select all that apply)
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
        {renderInheritanceBadge('muscle_region_ids')}
        <Text style={styles.helperText}>
          Tap to select as primary • Long press to toggle to secondary
        </Text>

        {muscleSections.map(({ group, regions }) => (
          <View key={group}>
            <Text style={styles.sectionHeader}>{group}</Text>
            <View style={styles.pillsContainer}>
              {regions.map(region => {
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
          </View>
        ))}
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
  offTableWarning: {
    fontSize: 13,
    color: themeColors.warning,
    fontStyle: 'italic',
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
