import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { colors } from '@/src/lib/colors';
import type { MovementFormData } from '../AddMovementWizard';
import {
  fetchLoadPositions,
  fetchStances,
  fetchPlanesOfMotion,
  fetchMovementStyles,
  fetchSymmetries,
  fetchRangeDepths,
} from '@/src/lib/supabase/crossfit';
import type {
  LoadPosition,
  Stance,
  PlaneOfMotion,
  MovementStyle,
  Symmetry,
  RangeDepth,
} from '@/src/types/crossfit';

interface Step3AttributesProps {
  formData: MovementFormData;
  updateFormData: (updates: Partial<MovementFormData>) => void;
}

export function Step3Attributes({ formData, updateFormData }: Step3AttributesProps) {
  const [loadPositions, setLoadPositions] = useState<LoadPosition[]>([]);
  const [stances, setStances] = useState<Stance[]>([]);
  const [planes, setPlanes] = useState<PlaneOfMotion[]>([]);
  const [movementStyles, setMovementStyles] = useState<MovementStyle[]>([]);
  const [symmetries, setSymmetries] = useState<Symmetry[]>([]);
  const [depths, setDepths] = useState<RangeDepth[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadReferenceData();
  }, []);

  const loadReferenceData = async () => {
    try {
      setLoading(true);
      const [
        loadPosData,
        stancesData,
        planesData,
        stylesData,
        symmetriesData,
        depthsData,
      ] = await Promise.all([
        fetchLoadPositions(),
        fetchStances(),
        fetchPlanesOfMotion(),
        fetchMovementStyles(),
        fetchSymmetries(),
        fetchRangeDepths(),
      ]);

      setLoadPositions(loadPosData);
      setStances(stancesData);
      setPlanes(planesData);
      setMovementStyles(stylesData);
      setSymmetries(symmetriesData);
      setDepths(depthsData);
    } catch (error) {
      console.error('Error loading reference data:', error);
    } finally {
      setLoading(false);
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
      {/* Info */}
      <View style={styles.infoBox}>
        <Text style={styles.infoText}>
          These attributes help classify the specific characteristics of the movement.
          All fields are optional.
        </Text>
      </View>

      {/* Load Position */}
      <View style={styles.field}>
        <Text style={styles.label}>Load Position</Text>
        <Text style={styles.helperText}>
          How external weight is held or positioned
        </Text>
        <View style={styles.pillsContainer}>
          {loadPositions.map(position => {
            const isSelected = formData.load_position_id === position.id;
            return (
              <TouchableOpacity
                key={position.id}
                style={[styles.pill, isSelected && styles.pillSelected]}
                onPress={() =>
                  updateFormData({ load_position_id: isSelected ? null : position.id })
                }
                activeOpacity={0.7}
              >
                <Text style={[styles.pillText, isSelected && styles.pillTextSelected]}>
                  {position.name}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* Stance */}
      <View style={styles.field}>
        <Text style={styles.label}>Stance</Text>
        <Text style={styles.helperText}>
          Foot and leg positioning during movement
        </Text>
        <View style={styles.pillsContainer}>
          {stances.map(stance => {
            const isSelected = formData.stance_id === stance.id;
            return (
              <TouchableOpacity
                key={stance.id}
                style={[styles.pill, isSelected && styles.pillSelected]}
                onPress={() =>
                  updateFormData({ stance_id: isSelected ? null : stance.id })
                }
                activeOpacity={0.7}
              >
                <Text style={[styles.pillText, isSelected && styles.pillTextSelected]}>
                  {stance.name}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* Range Depth */}
      <View style={styles.field}>
        <Text style={styles.label}>Range Depth</Text>
        <Text style={styles.helperText}>
          Depth or range of motion specification
        </Text>
        <View style={styles.pillsContainer}>
          {depths.map(depth => {
            const isSelected = formData.range_depth_id === depth.id;
            return (
              <TouchableOpacity
                key={depth.id}
                style={[styles.pill, isSelected && styles.pillSelected]}
                onPress={() =>
                  updateFormData({ range_depth_id: isSelected ? null : depth.id })
                }
                activeOpacity={0.7}
              >
                <Text style={[styles.pillText, isSelected && styles.pillTextSelected]}>
                  {depth.name}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* Movement Style */}
      <View style={styles.field}>
        <Text style={styles.label}>Movement Style</Text>
        <Text style={styles.helperText}>
          Tempo and execution variation (Strict, Kipping, Pause, etc.)
        </Text>
        <View style={styles.pillsContainer}>
          {movementStyles.map(style => {
            const isSelected = formData.movement_style_id === style.id;
            return (
              <TouchableOpacity
                key={style.id}
                style={[styles.pill, isSelected && styles.pillSelected]}
                onPress={() =>
                  updateFormData({ movement_style_id: isSelected ? null : style.id })
                }
                activeOpacity={0.7}
              >
                <Text style={[styles.pillText, isSelected && styles.pillTextSelected]}>
                  {style.name}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* Symmetry */}
      <View style={styles.field}>
        <Text style={styles.label}>Symmetry</Text>
        <Text style={styles.helperText}>
          Bilateral vs unilateral loading pattern
        </Text>
        <View style={styles.pillsContainer}>
          {symmetries.map(symmetry => {
            const isSelected = formData.symmetry_id === symmetry.id;
            return (
              <TouchableOpacity
                key={symmetry.id}
                style={[styles.pill, isSelected && styles.pillSelected]}
                onPress={() =>
                  updateFormData({ symmetry_id: isSelected ? null : symmetry.id })
                }
                activeOpacity={0.7}
              >
                <Text style={[styles.pillText, isSelected && styles.pillTextSelected]}>
                  {symmetry.name}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* Plane of Motion */}
      <View style={styles.field}>
        <Text style={styles.label}>Plane of Motion</Text>
        <Text style={styles.helperText}>
          Primary anatomical plane of movement
        </Text>
        <View style={styles.pillsContainer}>
          {planes.map(plane => {
            const isSelected = formData.plane_of_motion_id === plane.id;
            return (
              <TouchableOpacity
                key={plane.id}
                style={[styles.pill, isSelected && styles.pillSelected]}
                onPress={() =>
                  updateFormData({ plane_of_motion_id: isSelected ? null : plane.id })
                }
                activeOpacity={0.7}
              >
                <Text style={[styles.pillText, isSelected && styles.pillTextSelected]}>
                  {plane.name}
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
  infoBox: {
    backgroundColor: colors.muted,
    padding: 12,
    borderRadius: 8,
    borderLeftWidth: 3,
    borderLeftColor: colors.primary,
  },
  infoText: {
    fontSize: 14,
    color: colors.foreground, // Changed from mutedForeground for better visibility
    lineHeight: 20,
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
    color: '#94A3B8', // Lighter gray for better visibility
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
    backgroundColor: '#1E293B',
    borderWidth: 1.5,
    borderColor: '#334155', // Lighter border for visibility
  },
  pillSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  pillText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#F9FAFB', // Explicit white for visibility
  },
  pillTextSelected: {
    color: '#FFFFFF',
  },
});
