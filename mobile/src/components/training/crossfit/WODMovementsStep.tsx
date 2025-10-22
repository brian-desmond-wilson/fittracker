import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { Plus, GripVertical, Edit2, Trash2 } from 'lucide-react-native';
import { colors } from '@/src/lib/colors';
import { WODFormData, WODMovementConfig } from './AddWODWizard';
import { MovementSearchModal } from './MovementSearchModal';
import { MovementConfigModal } from './MovementConfigModal';
import type { ExerciseWithVariations } from '@/src/types/crossfit';

interface WODMovementsStepProps {
  formData: WODFormData;
  onUpdate: (updates: Partial<WODFormData>) => void;
  onNext: () => void;
}

export function WODMovementsStep({ formData, onUpdate, onNext }: WODMovementsStepProps) {
  const [searchModalVisible, setSearchModalVisible] = useState(false);
  const [configModalVisible, setConfigModalVisible] = useState(false);
  const [selectedMovement, setSelectedMovement] = useState<ExerciseWithVariations | null>(null);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);

  const handleSelectMovement = (movement: ExerciseWithVariations) => {
    setSelectedMovement(movement);
    setConfigModalVisible(true);
  };

  const handleSaveMovementConfig = (config: Omit<WODMovementConfig, 'movement_order'>) => {
    const movements = [...formData.movements];

    if (editingIndex !== null) {
      // Editing existing movement
      movements[editingIndex] = {
        ...config,
        movement_order: editingIndex + 1,
      };
    } else {
      // Adding new movement
      movements.push({
        ...config,
        movement_order: movements.length + 1,
      });
    }

    onUpdate({ movements });
    setEditingIndex(null);
    setSelectedMovement(null);
  };

  const handleEditMovement = (index: number) => {
    const movement = formData.movements[index];
    // Create a mock ExerciseWithVariations for the modal
    const mockMovement: ExerciseWithVariations = {
      id: movement.exercise_id,
      name: movement.exercise_name,
      full_name: movement.exercise_name,
      slug: '',
      created_at: '',
      updated_at: '',
      description: null,
      is_movement: true,
      goal_type_id: null,
      movement_category_id: null,
      category: null,
      muscle_groups: null,
      equipment: null,
      demo_video_url: null,
      thumbnail_url: null,
      video_url: null,
      image_url: null,
      setup_instructions: null,
      execution_cues: null,
      common_mistakes: null,
      is_official: false,
      created_by: null,
      // Equipment metadata from saved config
      requires_weight: movement.requires_weight ?? false,
      requires_distance: movement.requires_distance ?? false,
      equipment_types: movement.equipment_types ?? null,
    };
    setSelectedMovement(mockMovement);
    setEditingIndex(index);
    setConfigModalVisible(true);
  };

  const handleDeleteMovement = (index: number) => {
    const movements = formData.movements.filter((_, i) => i !== index);
    // Renumber movement_order
    const renumbered = movements.map((m, i) => ({ ...m, movement_order: i + 1 }));
    onUpdate({ movements: renumbered });
  };

  const handleMoveUp = (index: number) => {
    if (index === 0) return;
    const movements = [...formData.movements];
    [movements[index - 1], movements[index]] = [movements[index], movements[index - 1]];
    const renumbered = movements.map((m, i) => ({ ...m, movement_order: i + 1 }));
    onUpdate({ movements: renumbered });
  };

  const handleMoveDown = (index: number) => {
    if (index === formData.movements.length - 1) return;
    const movements = [...formData.movements];
    [movements[index + 1], movements[index]] = [movements[index], movements[index + 1]];
    const renumbered = movements.map((m, i) => ({ ...m, movement_order: i + 1 }));
    onUpdate({ movements: renumbered });
  };

  const getRepScheme = (movement: WODMovementConfig) => {
    // Use custom rep scheme if specified, otherwise use WOD-level scheme
    if (!movement.follows_wod_scheme && movement.custom_rep_scheme) {
      return movement.custom_rep_scheme;
    }
    return formData.rep_scheme || '';
  };

  const getScalingSummary = (movement: WODMovementConfig, level: 'Rx' | 'L2' | 'L1') => {
    const repScheme = getRepScheme(movement);
    let mainText = '';
    let variationText = '';
    let movementDisplayName = '';

    if (level === 'Rx') {
      // Use alternative movement name if configured
      movementDisplayName = movement.rx_alternative_exercise_name || '';

      // Build main text (rep scheme + weight/distance on one line)
      const parts: string[] = [];

      // Distance takes precedence over reps for distance movements
      if (movement.rx_distance_value) {
        const unit = movement.rx_distance_unit === 'meters' ? 'm' :
                     movement.rx_distance_unit === 'feet' ? 'ft' :
                     movement.rx_distance_unit === 'miles' ? 'mi' : 'km';
        parts.push(`Distance: ${movement.rx_distance_value}${unit}`);
      } else if (repScheme) {
        parts.push(repScheme);
      }

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
      // Use alternative movement name if configured
      movementDisplayName = movement.l2_alternative_exercise_name || '';

      // Build main text
      const parts: string[] = [];

      // Distance takes precedence over reps for distance movements
      if (movement.l2_distance_value) {
        const unit = movement.l2_distance_unit === 'meters' ? 'm' :
                     movement.l2_distance_unit === 'feet' ? 'ft' :
                     movement.l2_distance_unit === 'miles' ? 'mi' : 'km';
        parts.push(`Distance: ${movement.l2_distance_value}${unit}`);
      } else if (movement.l2_reps) {
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
      // Use alternative movement name if configured
      movementDisplayName = movement.l1_alternative_exercise_name || '';

      const parts: string[] = [];

      // Distance takes precedence over reps for distance movements
      if (movement.l1_distance_value) {
        const unit = movement.l1_distance_unit === 'meters' ? 'm' :
                     movement.l1_distance_unit === 'feet' ? 'ft' :
                     movement.l1_distance_unit === 'miles' ? 'mi' : 'km';
        parts.push(`Distance: ${movement.l1_distance_value}${unit}`);
      } else if (movement.l1_reps) {
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

    return { mainText, variationText, movementDisplayName };
  };

  return (
    <View style={styles.container}>
      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
        {formData.movements.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateTitle}>No movements added</Text>
            <Text style={styles.emptyStateText}>
              Tap the button below to add your first movement
            </Text>
          </View>
        ) : (
          formData.movements.map((movement, index) => {
            const rxSummary = getScalingSummary(movement, 'Rx');
            const l2Summary = getScalingSummary(movement, 'L2');
            const l1Summary = getScalingSummary(movement, 'L1');

            return (
              <View key={index} style={styles.movementCard}>
                <View style={styles.movementHeader}>
                  <View style={styles.dragHandle}>
                    <TouchableOpacity onPress={() => handleMoveUp(index)} disabled={index === 0}>
                      <Text style={[styles.arrowButton, index === 0 && styles.arrowButtonDisabled]}>↑</Text>
                    </TouchableOpacity>
                    <GripVertical size={20} color={colors.mutedForeground} />
                    <TouchableOpacity
                      onPress={() => handleMoveDown(index)}
                      disabled={index === formData.movements.length - 1}
                    >
                      <Text style={[styles.arrowButton, index === formData.movements.length - 1 && styles.arrowButtonDisabled]}>↓</Text>
                    </TouchableOpacity>
                  </View>
                  <View style={styles.movementInfo}>
                    <View style={styles.movementTitleRow}>
                      <View style={styles.titleLeft}>
                        <Text style={styles.movementNumber}>#{index + 1}</Text>
                        <Text style={styles.movementName}>{movement.exercise_name}</Text>
                      </View>
                      <View style={styles.actions}>
                        <TouchableOpacity onPress={() => handleEditMovement(index)} style={styles.actionButton}>
                          <Edit2 size={18} color={colors.primary} />
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => handleDeleteMovement(index)} style={styles.actionButton}>
                          <Trash2 size={18} color="#EF4444" />
                        </TouchableOpacity>
                      </View>
                    </View>

                    {/* Rx Scaling */}
                    <View style={styles.scalingSection}>
                      <View style={styles.scalingRow}>
                        <Text style={styles.scalingLabel}>Rx:</Text>
                        <Text style={styles.scalingText}>
                          {rxSummary.movementDisplayName && `${rxSummary.movementDisplayName} - `}
                          {rxSummary.mainText}
                        </Text>
                      </View>
                      {rxSummary.variationText && (
                        <View style={styles.variationRow}>
                          <Text style={styles.variationText}>{rxSummary.variationText}</Text>
                        </View>
                      )}
                    </View>

                    {/* L2 Scaling - always show */}
                    <View style={styles.scalingSection}>
                      <View style={styles.scalingRow}>
                        <Text style={styles.scalingLabel}>L2:</Text>
                        <Text style={styles.scalingText}>
                          {l2Summary.movementDisplayName && `${l2Summary.movementDisplayName} - `}
                          {l2Summary.mainText}
                        </Text>
                      </View>
                      {l2Summary.variationText && (
                        <View style={styles.variationRow}>
                          <Text style={styles.variationText}>{l2Summary.variationText}</Text>
                        </View>
                      )}
                    </View>

                    {/* L1 Scaling - always show */}
                    <View style={styles.scalingSection}>
                      <View style={styles.scalingRow}>
                        <Text style={styles.scalingLabel}>L1:</Text>
                        <Text style={styles.scalingText}>
                          {l1Summary.movementDisplayName && `${l1Summary.movementDisplayName} - `}
                          {l1Summary.mainText}
                        </Text>
                      </View>
                      {l1Summary.variationText && (
                        <View style={styles.variationRow}>
                          <Text style={styles.variationText}>{l1Summary.variationText}</Text>
                        </View>
                      )}
                    </View>
                  </View>
                </View>
              </View>
            );
          })
        )}

        {/* Add Movement Button */}
        <TouchableOpacity
          style={styles.addButton}
          onPress={() => setSearchModalVisible(true)}
          activeOpacity={0.7}
        >
          <Plus size={20} color={colors.primary} />
          <Text style={styles.addButtonText}>Add Movement</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Next Button */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.nextButton, formData.movements.length === 0 && styles.nextButtonDisabled]}
          onPress={onNext}
          activeOpacity={0.8}
          disabled={formData.movements.length === 0}
        >
          <Text style={styles.nextButtonText}>Next: Review</Text>
        </TouchableOpacity>
      </View>

      {/* Movement Search Modal */}
      <MovementSearchModal
        visible={searchModalVisible}
        onClose={() => setSearchModalVisible(false)}
        onSelectMovement={handleSelectMovement}
      />

      {/* Movement Config Modal */}
      <MovementConfigModal
        visible={configModalVisible}
        movement={selectedMovement}
        wodRepScheme={formData.rep_scheme} // Pass WOD-level rep scheme
        existingConfig={editingIndex !== null ? formData.movements[editingIndex] : undefined}
        onClose={() => {
          setConfigModalVisible(false);
          setSelectedMovement(null);
          setEditingIndex(null);
        }}
        onSave={handleSaveMovementConfig}
      />
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
  emptyState: {
    padding: 40,
    alignItems: 'center',
  },
  emptyStateTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.foreground,
    marginBottom: 8,
  },
  emptyStateText: {
    fontSize: 14,
    color: colors.mutedForeground,
    textAlign: 'center',
    lineHeight: 20,
  },
  movementCard: {
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 12,
    padding: 12,
  },
  movementHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  dragHandle: {
    alignItems: 'center',
    gap: 4,
  },
  arrowButton: {
    fontSize: 20,
    color: colors.primary,
    fontWeight: 'bold',
  },
  arrowButtonDisabled: {
    color: colors.mutedForeground,
    opacity: 0.3,
  },
  movementInfo: {
    flex: 1,
    gap: 8,
  },
  movementTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  titleLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  movementNumber: {
    fontSize: 12,
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
    gap: 4,
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
  scalingText: {
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
  actions: {
    flexDirection: 'row',
    gap: 8,
    alignSelf: 'flex-start',
  },
  actionButton: {
    padding: 8,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: colors.primary,
    borderStyle: 'dashed',
    marginTop: 8,
  },
  addButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.primary,
  },
  footer: {
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.background,
  },
  nextButton: {
    backgroundColor: colors.primary,
    paddingVertical: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  nextButtonDisabled: {
    backgroundColor: colors.muted,
  },
  nextButtonText: {
    fontSize: 17,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});
