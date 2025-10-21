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

  const getMovementSummary = (movement: WODMovementConfig) => {
    const parts: string[] = [];
    if (movement.rx_reps) parts.push(`${movement.rx_reps} reps`);
    if (movement.rx_weight_lbs) parts.push(`@ ${movement.rx_weight_lbs}lbs`);
    if (movement.rx_distance) parts.push(`${movement.rx_distance}m`);
    if (movement.rx_time) parts.push(`${movement.rx_time}s`);
    return parts.join(' ');
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
          formData.movements.map((movement, index) => (
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
                  <Text style={styles.movementNumber}>#{index + 1}</Text>
                  <Text style={styles.movementName}>{movement.exercise_name}</Text>
                  <Text style={styles.movementSummary}>{getMovementSummary(movement)}</Text>
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
            </View>
          ))
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
    alignItems: 'center',
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
  },
  movementNumber: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.mutedForeground,
    marginBottom: 2,
  },
  movementName: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.foreground,
    marginBottom: 4,
  },
  movementSummary: {
    fontSize: 14,
    color: colors.mutedForeground,
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
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
