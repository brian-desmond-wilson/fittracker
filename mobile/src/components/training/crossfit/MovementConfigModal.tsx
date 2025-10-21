import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Alert,
} from 'react-native';
import { X } from 'lucide-react-native';
import { colors } from '@/src/lib/colors';
import type { ExerciseWithVariations } from '@/src/types/crossfit';
import type { WODMovementConfig } from './AddWODWizard';

interface MovementConfigModalProps {
  visible: boolean;
  movement: ExerciseWithVariations | null;
  existingConfig?: WODMovementConfig;
  onClose: () => void;
  onSave: (config: Omit<WODMovementConfig, 'movement_order'>) => void;
}

type ScalingLevel = 'Rx' | 'L2' | 'L1';

export function MovementConfigModal({
  visible,
  movement,
  existingConfig,
  onClose,
  onSave
}: MovementConfigModalProps) {
  const [activeLevel, setActiveLevel] = useState<ScalingLevel>('Rx');

  // Rx scaling (required)
  const [rxReps, setRxReps] = useState(existingConfig?.rx_reps?.toString() || '');
  const [rxWeight, setRxWeight] = useState(existingConfig?.rx_weight_lbs?.toString() || '');
  const [rxDistance, setRxDistance] = useState(existingConfig?.rx_distance?.toString() || '');
  const [rxTime, setRxTime] = useState(existingConfig?.rx_time?.toString() || '');
  const [rxVariation, setRxVariation] = useState(existingConfig?.rx_movement_variation || '');

  // L2 scaling (optional)
  const [l2Reps, setL2Reps] = useState(existingConfig?.l2_reps?.toString() || '');
  const [l2Weight, setL2Weight] = useState(existingConfig?.l2_weight_lbs?.toString() || '');
  const [l2Distance, setL2Distance] = useState(existingConfig?.l2_distance?.toString() || '');
  const [l2Time, setL2Time] = useState(existingConfig?.l2_time?.toString() || '');
  const [l2Variation, setL2Variation] = useState(existingConfig?.l2_movement_variation || '');

  // L1 scaling (optional)
  const [l1Reps, setL1Reps] = useState(existingConfig?.l1_reps?.toString() || '');
  const [l1Weight, setL1Weight] = useState(existingConfig?.l1_weight_lbs?.toString() || '');
  const [l1Distance, setL1Distance] = useState(existingConfig?.l1_distance?.toString() || '');
  const [l1Time, setL1Time] = useState(existingConfig?.l1_time?.toString() || '');
  const [l1Variation, setL1Variation] = useState(existingConfig?.l1_movement_variation || '');

  const [notes, setNotes] = useState(existingConfig?.notes || '');

  if (!movement) return null;

  const handleSave = () => {
    // Validate at least Rx has some configuration
    if (!rxReps && !rxWeight && !rxDistance && !rxTime) {
      Alert.alert('Validation Error', 'Please configure at least one field for Rx scaling');
      return;
    }

    const config: Omit<WODMovementConfig, 'movement_order'> = {
      exercise_id: movement.id,
      exercise_name: movement.full_name || movement.name,

      // Rx
      rx_reps: rxReps ? parseInt(rxReps) : undefined,
      rx_weight_lbs: rxWeight ? parseFloat(rxWeight) : undefined,
      rx_distance: rxDistance ? parseFloat(rxDistance) : undefined,
      rx_time: rxTime ? parseInt(rxTime) : undefined,
      rx_movement_variation: rxVariation || undefined,

      // L2
      l2_reps: l2Reps ? parseInt(l2Reps) : undefined,
      l2_weight_lbs: l2Weight ? parseFloat(l2Weight) : undefined,
      l2_distance: l2Distance ? parseFloat(l2Distance) : undefined,
      l2_time: l2Time ? parseInt(l2Time) : undefined,
      l2_movement_variation: l2Variation || undefined,

      // L1
      l1_reps: l1Reps ? parseInt(l1Reps) : undefined,
      l1_weight_lbs: l1Weight ? parseFloat(l1Weight) : undefined,
      l1_distance: l1Distance ? parseFloat(l1Distance) : undefined,
      l1_time: l1Time ? parseInt(l1Time) : undefined,
      l1_movement_variation: l1Variation || undefined,

      notes: notes || undefined,
    };

    onSave(config);
    onClose();
  };

  const renderScalingForm = (level: ScalingLevel) => {
    const isRx = level === 'Rx';
    const isL2 = level === 'L2';
    const isL1 = level === 'L1';

    const reps = isRx ? rxReps : isL2 ? l2Reps : l1Reps;
    const setReps = isRx ? setRxReps : isL2 ? setL2Reps : setL1Reps;

    const weight = isRx ? rxWeight : isL2 ? l2Weight : l1Weight;
    const setWeight = isRx ? setRxWeight : isL2 ? setL2Weight : setL1Weight;

    const distance = isRx ? rxDistance : isL2 ? l2Distance : l1Distance;
    const setDistance = isRx ? setRxDistance : isL2 ? setL2Distance : setL1Distance;

    const time = isRx ? rxTime : isL2 ? l2Time : l1Time;
    const setTime = isRx ? setRxTime : isL2 ? setL2Time : setL1Time;

    const variation = isRx ? rxVariation : isL2 ? l2Variation : l1Variation;
    const setVariation = isRx ? setRxVariation : isL2 ? setL2Variation : setL1Variation;

    return (
      <View style={styles.scalingForm}>
        {/* Reps */}
        <View style={styles.field}>
          <Text style={styles.label}>Reps</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g., 21"
            placeholderTextColor={colors.mutedForeground}
            value={reps}
            onChangeText={setReps}
            keyboardType="number-pad"
          />
        </View>

        {/* Weight */}
        <View style={styles.field}>
          <Text style={styles.label}>Weight (lbs)</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g., 95"
            placeholderTextColor={colors.mutedForeground}
            value={weight}
            onChangeText={setWeight}
            keyboardType="decimal-pad"
          />
        </View>

        {/* Distance */}
        <View style={styles.field}>
          <Text style={styles.label}>Distance (meters)</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g., 400"
            placeholderTextColor={colors.mutedForeground}
            value={distance}
            onChangeText={setDistance}
            keyboardType="decimal-pad"
          />
        </View>

        {/* Time */}
        <View style={styles.field}>
          <Text style={styles.label}>Time (seconds)</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g., 60"
            placeholderTextColor={colors.mutedForeground}
            value={time}
            onChangeText={setTime}
            keyboardType="number-pad"
          />
        </View>

        {/* Movement Variation */}
        <View style={styles.field}>
          <Text style={styles.label}>Movement Variation (Optional)</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g., Kipping, Strict, Banded"
            placeholderTextColor={colors.mutedForeground}
            value={variation}
            onChangeText={setVariation}
            autoCapitalize="words"
          />
        </View>
      </View>
    );
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.modalContent}>
          {/* Header */}
          <View style={styles.header}>
            <View>
              <Text style={styles.title}>Configure Movement</Text>
              <Text style={styles.movementName}>{movement.full_name || movement.name}</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <X size={24} color={colors.foreground} />
            </TouchableOpacity>
          </View>

          {/* Scaling Level Tabs */}
          <View style={styles.tabs}>
            {(['Rx', 'L2', 'L1'] as ScalingLevel[]).map((level) => (
              <TouchableOpacity
                key={level}
                style={[styles.tab, activeLevel === level && styles.tabActive]}
                onPress={() => setActiveLevel(level)}
              >
                <Text style={[styles.tabText, activeLevel === level && styles.tabTextActive]}>
                  {level}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Scaling Form */}
          <ScrollView style={styles.formScroll} showsVerticalScrollIndicator={false}>
            <View style={styles.formContent}>
              {renderScalingForm(activeLevel)}

              {/* Notes (shared across all levels) */}
              {activeLevel === 'Rx' && (
                <View style={styles.field}>
                  <Text style={styles.label}>Notes (Optional)</Text>
                  <TextInput
                    style={[styles.input, styles.textArea]}
                    placeholder="Movement standards, coaching notes..."
                    placeholderTextColor={colors.mutedForeground}
                    value={notes}
                    onChangeText={setNotes}
                    multiline
                    numberOfLines={3}
                    textAlignVertical="top"
                  />
                </View>
              )}
            </View>
          </ScrollView>

          {/* Footer */}
          <View style={styles.footer}>
            <TouchableOpacity
              style={[styles.button, styles.cancelButton]}
              onPress={onClose}
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.button, styles.saveButton]}
              onPress={handleSave}
            >
              <Text style={styles.saveButtonText}>Add to WOD</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: colors.background,
    borderRadius: 16,
    width: '100%',
    height: 600,
    borderWidth: 1,
    borderColor: colors.border,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.foreground,
    marginBottom: 4,
  },
  movementName: {
    fontSize: 14,
    color: colors.mutedForeground,
  },
  closeButton: {
    padding: 4,
  },
  tabs: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: {
    borderBottomColor: colors.primary,
  },
  tabText: {
    fontSize: 16,
    fontWeight: '500',
    color: colors.mutedForeground,
  },
  tabTextActive: {
    color: colors.primary,
    fontWeight: '600',
  },
  formScroll: {
    flex: 1,
  },
  formContent: {
    padding: 20,
  },
  scalingForm: {
    gap: 16,
  },
  field: {
    marginBottom: 8,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.foreground,
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: colors.foreground,
    backgroundColor: colors.input,
  },
  textArea: {
    minHeight: 80,
  },
  footer: {
    flexDirection: 'row',
    gap: 12,
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  button: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  cancelButton: {
    backgroundColor: colors.muted,
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.foreground,
  },
  saveButton: {
    backgroundColor: colors.primary,
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});
