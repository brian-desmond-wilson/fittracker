import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert, ActivityIndicator } from 'react-native';
import { colors } from '@/src/lib/colors';
import { WODFormData } from './AddWODWizard';
import { createWOD } from '@/src/lib/supabase/crossfit';
import { supabase } from '@/src/lib/supabase';

interface WODPreviewStepProps {
  formData: WODFormData;
  formatName?: string;
  categoryName?: string;
  onSave: () => void;
  onClose: () => void;
}

export function WODPreviewStep({ formData, formatName, categoryName, onSave, onClose }: WODPreviewStepProps) {
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    try {
      setSaving(true);

      // Get current user
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) {
        Alert.alert('Error', 'You must be logged in to create a WOD');
        return;
      }

      // Transform wizard data to API input
      const wodInput = {
        name: formData.name,
        description: formData.description,
        format_id: formData.format_id,
        category_id: formData.category_id,
        time_cap_minutes: formData.time_cap_minutes,
        notes: formData.notes,
        movements: formData.movements.map((m, index) => ({
          exercise_id: m.exercise_id,
          movement_order: index,
          rx_reps: m.rx_reps,
          rx_weight_lbs: m.rx_weight_lbs,
          rx_distance: m.rx_distance,
          rx_time: m.rx_time,
          rx_movement_variation: m.rx_movement_variation,
          l2_reps: m.l2_reps,
          l2_weight_lbs: m.l2_weight_lbs,
          l2_distance: m.l2_distance,
          l2_time: m.l2_time,
          l2_movement_variation: m.l2_movement_variation,
          l1_reps: m.l1_reps,
          l1_weight_lbs: m.l1_weight_lbs,
          l1_distance: m.l1_distance,
          l1_time: m.l1_time,
          l1_movement_variation: m.l1_movement_variation,
          notes: m.notes,
        })),
      };

      const result = await createWOD(user.id, wodInput);

      if (result) {
        Alert.alert('Success', 'WOD created successfully!', [
          {
            text: 'OK',
            onPress: () => {
              onSave();
              onClose();
            },
          },
        ]);
      } else {
        Alert.alert('Error', 'Failed to create WOD. Please try again.');
      }
    } catch (error) {
      console.error('Error saving WOD:', error);
      Alert.alert('Error', 'An unexpected error occurred. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const getMovementSummary = (movement: typeof formData.movements[0], level: 'Rx' | 'L2' | 'L1') => {
    const parts: string[] = [];

    if (level === 'Rx') {
      if (movement.rx_reps) parts.push(`${movement.rx_reps} reps`);
      if (movement.rx_weight_lbs) parts.push(`@ ${movement.rx_weight_lbs}lbs`);
      if (movement.rx_distance) parts.push(`${movement.rx_distance}m`);
      if (movement.rx_time) parts.push(`${movement.rx_time}s`);
      if (movement.rx_movement_variation) parts.push(`(${movement.rx_movement_variation})`);
    } else if (level === 'L2') {
      if (movement.l2_reps) parts.push(`${movement.l2_reps} reps`);
      if (movement.l2_weight_lbs) parts.push(`@ ${movement.l2_weight_lbs}lbs`);
      if (movement.l2_distance) parts.push(`${movement.l2_distance}m`);
      if (movement.l2_time) parts.push(`${movement.l2_time}s`);
      if (movement.l2_movement_variation) parts.push(`(${movement.l2_movement_variation})`);
    } else {
      if (movement.l1_reps) parts.push(`${movement.l1_reps} reps`);
      if (movement.l1_weight_lbs) parts.push(`@ ${movement.l1_weight_lbs}lbs`);
      if (movement.l1_distance) parts.push(`${movement.l1_distance}m`);
      if (movement.l1_time) parts.push(`${movement.l1_time}s`);
      if (movement.l1_movement_variation) parts.push(`(${movement.l1_movement_variation})`);
    }

    return parts.join(' ');
  };

  const hasScaling = (movement: typeof formData.movements[0], level: 'L2' | 'L1') => {
    if (level === 'L2') {
      return movement.l2_reps || movement.l2_weight_lbs || movement.l2_distance ||
             movement.l2_time || movement.l2_movement_variation;
    }
    return movement.l1_reps || movement.l1_weight_lbs || movement.l1_distance ||
           movement.l1_time || movement.l1_movement_variation;
  };

  return (
    <View style={styles.container}>
      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
        {/* WOD Name */}
        <View style={styles.section}>
          <Text style={styles.wodName}>{formData.name}</Text>
        </View>

        {/* WOD Info */}
        <View style={styles.section}>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Format:</Text>
            <Text style={styles.infoValue}>{formatName || 'N/A'}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Category:</Text>
            <Text style={styles.infoValue}>{categoryName || 'N/A'}</Text>
          </View>
          {formData.time_cap_minutes && (
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Time Cap:</Text>
              <Text style={styles.infoValue}>{formData.time_cap_minutes} minutes</Text>
            </View>
          )}
        </View>

        {/* Description */}
        {formData.description && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Description</Text>
            <Text style={styles.description}>{formData.description}</Text>
          </View>
        )}

        {/* Movements */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Movements ({formData.movements.length})</Text>
          {formData.movements.map((movement, index) => (
            <View key={index} style={styles.movementCard}>
              <View style={styles.movementHeader}>
                <Text style={styles.movementNumber}>#{index + 1}</Text>
                <Text style={styles.movementName}>{movement.exercise_name}</Text>
              </View>

              {/* Rx */}
              <View style={styles.scalingSection}>
                <Text style={styles.scalingLabel}>Rx:</Text>
                <Text style={styles.scalingValue}>{getMovementSummary(movement, 'Rx')}</Text>
              </View>

              {/* L2 */}
              {hasScaling(movement, 'L2') && (
                <View style={styles.scalingSection}>
                  <Text style={styles.scalingLabel}>L2:</Text>
                  <Text style={styles.scalingValue}>{getMovementSummary(movement, 'L2')}</Text>
                </View>
              )}

              {/* L1 */}
              {hasScaling(movement, 'L1') && (
                <View style={styles.scalingSection}>
                  <Text style={styles.scalingLabel}>L1:</Text>
                  <Text style={styles.scalingValue}>{getMovementSummary(movement, 'L1')}</Text>
                </View>
              )}

              {/* Movement Notes */}
              {movement.notes && (
                <View style={styles.notesSection}>
                  <Text style={styles.notesLabel}>Notes:</Text>
                  <Text style={styles.notesText}>{movement.notes}</Text>
                </View>
              )}
            </View>
          ))}
        </View>

        {/* WOD Notes */}
        {formData.notes && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Notes</Text>
            <Text style={styles.description}>{formData.notes}</Text>
          </View>
        )}
      </ScrollView>

      {/* Save Button */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.saveButton, saving && styles.saveButtonDisabled]}
          onPress={handleSave}
          activeOpacity={0.8}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.saveButtonText}>Save WOD</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 20,
  },
  section: {
    marginBottom: 24,
  },
  wodName: {
    fontSize: 28,
    fontWeight: 'bold',
    color: colors.foreground,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.foreground,
    marginBottom: 12,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  infoLabel: {
    fontSize: 16,
    fontWeight: '500',
    color: colors.mutedForeground,
    width: 100,
  },
  infoValue: {
    fontSize: 16,
    color: colors.foreground,
    flex: 1,
  },
  description: {
    fontSize: 15,
    color: colors.foreground,
    lineHeight: 22,
  },
  movementCard: {
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    marginBottom: 12,
  },
  movementHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 8,
  },
  movementNumber: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.mutedForeground,
  },
  movementName: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.foreground,
    flex: 1,
  },
  scalingSection: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  scalingLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.primary,
    width: 40,
  },
  scalingValue: {
    fontSize: 14,
    color: colors.foreground,
    flex: 1,
  },
  notesSection: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  notesLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.mutedForeground,
    marginBottom: 4,
  },
  notesText: {
    fontSize: 13,
    color: colors.foreground,
    lineHeight: 18,
  },
  footer: {
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.background,
  },
  saveButton: {
    backgroundColor: colors.primary,
    paddingVertical: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    fontSize: 17,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});
