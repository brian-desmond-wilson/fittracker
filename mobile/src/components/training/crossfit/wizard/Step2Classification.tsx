import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { colors } from '@/src/lib/colors';
import type { MovementFormData } from '../AddMovementWizard';
import { fetchMuscleRegions, fetchScoringTypes } from '@/src/lib/supabase/crossfit';
import type { MuscleRegion, ScoringType, SkillLevel } from '@/src/types/crossfit';

interface Step2ClassificationProps {
  formData: MovementFormData;
  updateFormData: (updates: Partial<MovementFormData>) => void;
}

const SKILL_LEVELS: SkillLevel[] = ['Beginner', 'Intermediate', 'Advanced'];

export function Step2Classification({ formData, updateFormData }: Step2ClassificationProps) {
  const [muscleRegions, setMuscleRegions] = useState<MuscleRegion[]>([]);
  const [scoringTypes, setScoringTypes] = useState<ScoringType[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadReferenceData();
  }, []);

  const loadReferenceData = async () => {
    try {
      setLoading(true);
      const [regionsData, scoringData] = await Promise.all([
        fetchMuscleRegions(),
        fetchScoringTypes(),
      ]);

      setMuscleRegions(regionsData);
      setScoringTypes(scoringData);
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
      {/* Skill Level */}
      <View style={styles.field}>
        <Text style={styles.label}>Skill Level</Text>
        <Text style={styles.helperText}>
          Technical difficulty required to perform this movement
        </Text>
        <View style={styles.pillsContainer}>
          {SKILL_LEVELS.map(level => {
            const isSelected = formData.skill_level === level;
            return (
              <TouchableOpacity
                key={level}
                style={[styles.pill, isSelected && styles.pillSelected]}
                onPress={() => updateFormData({ skill_level: isSelected ? null : level })}
                activeOpacity={0.7}
              >
                <Text style={[styles.pillText, isSelected && styles.pillTextSelected]}>
                  {level}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* Muscle Regions */}
      <View style={styles.field}>
        <Text style={styles.label}>Muscle Regions</Text>
        <Text style={styles.helperText}>
          Tap to select as primary • Long press to toggle to secondary
        </Text>
        <View style={styles.pillsContainer}>
          {muscleRegions.map(region => {
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

      {/* Scoring Types */}
      <View style={styles.field}>
        <Text style={styles.label}>Scoring Types</Text>
        <Text style={styles.helperText}>
          How this movement can be measured (select all that apply)
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
  helperText: {
    fontSize: 14,
    color: colors.mutedForeground,
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
});
