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
  fetchEquipment,
} from '@/src/lib/supabase/crossfit';
import type {
  LoadPosition,
  Stance,
  PlaneOfMotion,
  MovementStyle,
  Symmetry,
  RangeDepth,
  Equipment,
} from '@/src/types/crossfit';

interface Step3AttributesProps {
  formData: MovementFormData;
  updateFormData: (updates: Partial<MovementFormData>) => void;
}

export function Step3Attributes({ formData, updateFormData }: Step3AttributesProps) {
  const [equipment, setEquipment] = useState<Equipment[]>([]);
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
        equipmentData,
        loadPosData,
        stancesData,
        planesData,
        stylesData,
        symmetriesData,
        depthsData,
      ] = await Promise.all([
        fetchEquipment(),
        fetchLoadPositions(),
        fetchStances(),
        fetchPlanesOfMotion(),
        fetchMovementStyles(),
        fetchSymmetries(),
        fetchRangeDepths(),
      ]);

      setEquipment(equipmentData);
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

  const toggleEquipment = (equipmentId: string) => {
    const isSelected = formData.equipment_ids.includes(equipmentId);
    if (isSelected) {
      updateFormData({
        equipment_ids: formData.equipment_ids.filter(id => id !== equipmentId),
      });
    } else {
      updateFormData({
        equipment_ids: [...formData.equipment_ids, equipmentId],
      });
    }
  };

  const toggleMovementStyle = (styleId: string) => {
    const isSelected = formData.movement_style_ids.includes(styleId);
    if (isSelected) {
      updateFormData({
        movement_style_ids: formData.movement_style_ids.filter(id => id !== styleId),
      });
    } else {
      updateFormData({
        movement_style_ids: [...formData.movement_style_ids, styleId],
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

  // Group equipment by category
  const equipmentByCategory = equipment.reduce((acc, item) => {
    if (!acc[item.category]) {
      acc[item.category] = [];
    }
    acc[item.category].push(item);
    return acc;
  }, {} as Record<string, Equipment[]>);

  // Define category order
  const categoryOrder = [
    'Free Weights',
    'Implements',
    'Machines',
    'Bodyweight / Apparatus',
    'Supports / Surfaces',
    'Recovery Tools',
  ];

  return (
    <View style={styles.container}>
      {/* Equipment */}
      <View style={styles.field}>
        <Text style={styles.label}>Equipment</Text>
        <Text style={styles.helperText}>
          {formData.equipment_ids.length > 0
            ? formData.equipment_ids.length === 1
              ? equipment.find(e => e.id === formData.equipment_ids[0])?.name || '1 item selected'
              : formData.equipment_ids.length === 2
              ? equipment
                  .filter(e => formData.equipment_ids.includes(e.id))
                  .map(e => e.name)
                  .join(', ')
              : `${formData.equipment_ids.length} items selected`
            : 'Select all equipment used for this movement'}
        </Text>

        {categoryOrder.map(category => {
          const items = equipmentByCategory[category] || [];
          if (items.length === 0) return null;

          return (
            <View key={category}>
              <Text style={styles.sectionHeader}>{category}</Text>
              <View style={styles.pillsContainer}>
                {items.map(item => {
                  const isSelected = formData.equipment_ids.includes(item.id);
                  return (
                    <TouchableOpacity
                      key={item.id}
                      style={[styles.pill, isSelected && styles.pillSelected]}
                      onPress={() => toggleEquipment(item.id)}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.pillText, isSelected && styles.pillTextSelected]}>
                        {item.name}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          );
        })}
      </View>

      <View style={styles.separator} />

      {/* Load Position */}
      <View style={styles.field}>
        <Text style={styles.label}>Load Position</Text>
        <Text style={styles.helperText}>
          {formData.load_position_id
            ? loadPositions.find(p => p.id === formData.load_position_id)?.description || 'How external weight is held or positioned'
            : 'How external weight is held or positioned'}
        </Text>

        {['Barbell', 'Dumbbell / KB', 'Unloaded', 'Odd Object'].map(category => {
          const categoryPositions = loadPositions.filter(p => p.category === category);
          if (categoryPositions.length === 0) return null;

          return (
            <View key={category}>
              <Text style={styles.sectionHeader}>{category}</Text>
              <View style={styles.pillsContainer}>
                {categoryPositions.map(position => {
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
          );
        })}
      </View>

      <View style={styles.separator} />

      {/* Stance */}
      <View style={styles.field}>
        <Text style={styles.label}>Stance</Text>
        <Text style={styles.helperText}>
          {formData.stance_id
            ? stances.find(s => s.id === formData.stance_id)?.description || 'Foot and leg positioning during movement'
            : 'Foot and leg positioning during movement'}
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

      <View style={styles.separator} />

      {/* Range Depth */}
      <View style={styles.field}>
        <Text style={styles.label}>Range Depth</Text>
        <Text style={styles.helperText}>
          {formData.range_depth_id
            ? depths.find(d => d.id === formData.range_depth_id)?.description || 'Depth or range of motion specification'
            : 'Depth or range of motion specification'}
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

      <View style={styles.separator} />

      {/* Movement Style */}
      <View style={styles.field}>
        <Text style={styles.label}>Movement Style</Text>
        <Text style={styles.helperText}>
          {formData.movement_style_ids.length > 0
            ? formData.movement_style_ids.length === 1
              ? movementStyles.find(s => s.id === formData.movement_style_ids[0])?.name || '1 item selected'
              : formData.movement_style_ids.length === 2
              ? movementStyles
                  .filter(s => formData.movement_style_ids.includes(s.id))
                  .map(s => s.name)
                  .join(', ')
              : `${formData.movement_style_ids.length} items selected`
            : 'Tempo and execution variation (Strict, Kipping, Pause, etc.)'}
        </Text>

        {['Execution Control', 'Dynamic Power', 'Assistance / Load Variant'].map(category => {
          const categoryStyles = movementStyles.filter(s => s.category === category);
          if (categoryStyles.length === 0) return null;

          return (
            <View key={category}>
              <Text style={styles.sectionHeader}>{category}</Text>
              <View style={styles.pillsContainer}>
                {categoryStyles.map(style => {
                  const isSelected = formData.movement_style_ids.includes(style.id);
                  return (
                    <TouchableOpacity
                      key={style.id}
                      style={[styles.pill, isSelected && styles.pillSelected]}
                      onPress={() => toggleMovementStyle(style.id)}
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
          );
        })}
      </View>

      <View style={styles.separator} />

      {/* Symmetry */}
      <View style={styles.field}>
        <Text style={styles.label}>Symmetry</Text>
        <Text style={styles.helperText}>
          {formData.symmetry_id
            ? symmetries.find(sym => sym.id === formData.symmetry_id)?.description || 'Bilateral vs unilateral loading pattern'
            : 'Bilateral vs unilateral loading pattern'}
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

      <View style={styles.separator} />

      {/* Plane of Motion */}
      <View style={styles.field}>
        <Text style={styles.label}>Plane of Motion</Text>
        <Text style={styles.helperText}>
          {formData.plane_of_motion_id
            ? planes.find(p => p.id === formData.plane_of_motion_id)?.description || 'Primary anatomical plane of movement'
            : 'Primary anatomical plane of movement'}
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
  helperText: {
    fontSize: 14,
    color: '#94A3B8', // Lighter gray for better visibility
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
