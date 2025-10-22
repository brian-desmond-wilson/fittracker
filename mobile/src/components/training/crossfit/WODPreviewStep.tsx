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

        // For Time specific fields
        rep_scheme_type: formData.rep_scheme_type,
        rep_scheme: formData.rep_scheme,

        time_cap_minutes: formData.time_cap_minutes,
        notes: formData.notes,
        movements: formData.movements.map((m, index) => ({
          exercise_id: m.exercise_id,
          movement_order: index,

          // Rx - Gender split weights
          rx_reps: m.rx_reps,
          rx_weight_men_lbs: m.rx_weight_men_lbs,
          rx_weight_women_lbs: m.rx_weight_women_lbs,
          rx_distance: m.rx_distance,
          rx_time: m.rx_time,
          rx_movement_variation: m.rx_movement_variation,

          // L2 - Gender split weights
          l2_reps: m.l2_reps,
          l2_weight_men_lbs: m.l2_weight_men_lbs,
          l2_weight_women_lbs: m.l2_weight_women_lbs,
          l2_distance: m.l2_distance,
          l2_time: m.l2_time,
          l2_movement_variation: m.l2_movement_variation,

          // L1 - Gender split weights
          l1_reps: m.l1_reps,
          l1_weight_men_lbs: m.l1_weight_men_lbs,
          l1_weight_women_lbs: m.l1_weight_women_lbs,
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

  const getRepScheme = (movement: typeof formData.movements[0]) => {
    // Use custom rep scheme if specified, otherwise use WOD-level scheme
    if (!movement.follows_wod_scheme && movement.custom_rep_scheme) {
      return movement.custom_rep_scheme;
    }
    return formData.rep_scheme || '';
  };

  const getMovementSummary = (movement: typeof formData.movements[0], level: 'Rx' | 'L2' | 'L1') => {
    const repScheme = getRepScheme(movement);
    let mainText = '';
    let variationText = '';

    if (level === 'Rx') {
      // Build main text (rep scheme + weight on one line)
      const parts: string[] = [];
      if (repScheme) parts.push(repScheme);

      // Show weight if configured
      if (movement.rx_weight_men_lbs && movement.rx_weight_women_lbs) {
        parts.push(`@ ${movement.rx_weight_men_lbs}/${movement.rx_weight_women_lbs} lbs`);
      } else if (movement.rx_weight_men_lbs) {
        parts.push(`@ ${movement.rx_weight_men_lbs} lbs (M)`);
      } else if (movement.rx_weight_women_lbs) {
        parts.push(`@ ${movement.rx_weight_women_lbs} lbs (W)`);
      }

      mainText = parts.join(' ');
      variationText = movement.rx_movement_variation || '';
    } else if (level === 'L2') {
      // Build main text
      const parts: string[] = [];
      if (movement.l2_reps) {
        // Check if it's a rep scheme pattern (contains dashes) or a number
        const isRepScheme = typeof movement.l2_reps === 'string' && movement.l2_reps.includes('-');
        parts.push(isRepScheme ? movement.l2_reps : `${movement.l2_reps} reps`);
      } else if (repScheme) {
        parts.push(repScheme);
      }

      // Show weight if configured
      if (movement.l2_weight_men_lbs && movement.l2_weight_women_lbs) {
        parts.push(`@ ${movement.l2_weight_men_lbs}/${movement.l2_weight_women_lbs} lbs`);
      } else if (movement.l2_weight_men_lbs) {
        parts.push(`@ ${movement.l2_weight_men_lbs} lbs (M)`);
      } else if (movement.l2_weight_women_lbs) {
        parts.push(`@ ${movement.l2_weight_women_lbs} lbs (W)`);
      }

      mainText = parts.join(' ');
      variationText = movement.l2_movement_variation || '';
    } else {
      // L1
      const parts: string[] = [];
      if (movement.l1_reps) {
        // Check if it's a rep scheme pattern (contains dashes) or a number
        const isRepScheme = typeof movement.l1_reps === 'string' && movement.l1_reps.includes('-');
        parts.push(isRepScheme ? movement.l1_reps : `${movement.l1_reps} reps`);
      } else if (repScheme) {
        parts.push(repScheme);
      }

      // Show weight if configured
      if (movement.l1_weight_men_lbs && movement.l1_weight_women_lbs) {
        parts.push(`@ ${movement.l1_weight_men_lbs}/${movement.l1_weight_women_lbs} lbs`);
      } else if (movement.l1_weight_men_lbs) {
        parts.push(`@ ${movement.l1_weight_men_lbs} lbs (M)`);
      } else if (movement.l1_weight_women_lbs) {
        parts.push(`@ ${movement.l1_weight_women_lbs} lbs (W)`);
      }

      mainText = parts.join(' ');
      variationText = movement.l1_movement_variation || '';
    }

    return { mainText, variationText };
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
            <Text style={styles.infoLabel}>Category:</Text>
            <Text style={styles.infoValue}>{categoryName || 'N/A'}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Format:</Text>
            <Text style={styles.infoValue}>{formatName || 'N/A'}</Text>
          </View>

          {/* For Time Rep Scheme */}
          {formData.rep_scheme_type && formData.rep_scheme && (
            <>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Rep Scheme:</Text>
                <Text style={styles.infoValue}>
                  {formData.rep_scheme}
                  {formData.rep_scheme_type === 'fixed_rounds' && ' RFT'}
                  {formData.rep_scheme_type === 'descending' && ' (Descending)'}
                  {formData.rep_scheme_type === 'ascending' && ' (Ascending)'}
                  {formData.rep_scheme_type === 'chipper' && ' (Chipper)'}
                  {formData.rep_scheme_type === 'distance' && ' (Distance)'}
                </Text>
              </View>
            </>
          )}

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
          {formData.movements.map((movement, index) => {
            const rxSummary = getMovementSummary(movement, 'Rx');
            const l2Summary = getMovementSummary(movement, 'L2');
            const l1Summary = getMovementSummary(movement, 'L1');

            return (
              <View key={index} style={styles.movementCard}>
                <View style={styles.movementHeader}>
                  <Text style={styles.movementNumber}>#{index + 1}</Text>
                  <Text style={styles.movementName}>{movement.exercise_name}</Text>
                </View>

                {/* Rx Scaling */}
                <View style={styles.levelSection}>
                  <View style={styles.scalingRow}>
                    <Text style={styles.scalingLabel}>Rx:</Text>
                    <Text style={styles.scalingValue}>{rxSummary.mainText}</Text>
                  </View>
                  {rxSummary.variationText && (
                    <View style={styles.variationRow}>
                      <Text style={styles.variationText}>{rxSummary.variationText}</Text>
                    </View>
                  )}
                </View>

                {/* L2 Scaling - always show */}
                <View style={styles.levelSection}>
                  <View style={styles.scalingRow}>
                    <Text style={styles.scalingLabel}>L2:</Text>
                    <Text style={styles.scalingValue}>{l2Summary.mainText}</Text>
                  </View>
                  {l2Summary.variationText && (
                    <View style={styles.variationRow}>
                      <Text style={styles.variationText}>{l2Summary.variationText}</Text>
                    </View>
                  )}
                </View>

                {/* L1 Scaling - always show */}
                <View style={styles.levelSection}>
                  <View style={styles.scalingRow}>
                    <Text style={styles.scalingLabel}>L1:</Text>
                    <Text style={styles.scalingValue}>{l1Summary.mainText}</Text>
                  </View>
                  {l1Summary.variationText && (
                    <View style={styles.variationRow}>
                      <Text style={styles.variationText}>{l1Summary.variationText}</Text>
                    </View>
                  )}
                </View>

                {/* Movement Notes */}
                {movement.notes && (
                  <View style={styles.notesSection}>
                    <Text style={styles.notesLabel}>Notes:</Text>
                    <Text style={styles.notesText}>{movement.notes}</Text>
                  </View>
                )}
              </View>
            );
          })}
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
  levelSection: {
    gap: 4,
    marginBottom: 8,
  },
  scalingRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  scalingLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.primary,
    minWidth: 28,
  },
  scalingValue: {
    fontSize: 13,
    color: colors.foreground,
    flex: 1,
    lineHeight: 18,
  },
  variationRow: {
    flexDirection: 'row',
    paddingLeft: 36,
  },
  variationText: {
    fontSize: 13,
    color: colors.mutedForeground,
    fontStyle: 'italic',
    flex: 1,
    lineHeight: 18,
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
