import React, { useState, useEffect } from 'react';
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
  wodRepScheme?: string; // WOD-level rep scheme (e.g., "21-15-9")
  existingConfig?: WODMovementConfig;
  onClose: () => void;
  onSave: (config: Omit<WODMovementConfig, 'movement_order'>) => void;
}

type ScalingLevel = 'Rx' | 'L2' | 'L1';

export function MovementConfigModal({
  visible,
  movement,
  wodRepScheme,
  existingConfig,
  onClose,
  onSave
}: MovementConfigModalProps) {
  const [activeLevel, setActiveLevel] = useState<ScalingLevel>('Rx');

  // Rep scheme override state
  const [followsWodScheme, setFollowsWodScheme] = useState(existingConfig?.follows_wod_scheme ?? true);
  const [customRepScheme, setCustomRepScheme] = useState(existingConfig?.custom_rep_scheme || '');

  // Rx scaling - Gender split for weights
  const [rxReps, setRxReps] = useState(existingConfig?.rx_reps?.toString() || '');
  const [rxWeightMen, setRxWeightMen] = useState(existingConfig?.rx_weight_men_lbs?.toString() || '');
  const [rxWeightWomen, setRxWeightWomen] = useState(existingConfig?.rx_weight_women_lbs?.toString() || '');
  const [rxDistanceValue, setRxDistanceValue] = useState(existingConfig?.rx_distance_value?.toString() || '');
  const [rxDistanceUnit, setRxDistanceUnit] = useState(existingConfig?.rx_distance_unit || 'meters');
  const [rxTime, setRxTime] = useState(existingConfig?.rx_time?.toString() || '');
  const [rxVariation, setRxVariation] = useState(existingConfig?.rx_movement_variation || '');

  // L2 scaling - Gender split for weights
  const [l2Reps, setL2Reps] = useState(existingConfig?.l2_reps?.toString() || '');
  const [l2WeightMen, setL2WeightMen] = useState(existingConfig?.l2_weight_men_lbs?.toString() || '');
  const [l2WeightWomen, setL2WeightWomen] = useState(existingConfig?.l2_weight_women_lbs?.toString() || '');
  const [l2DistanceValue, setL2DistanceValue] = useState(existingConfig?.l2_distance_value?.toString() || '');
  const [l2DistanceUnit, setL2DistanceUnit] = useState(existingConfig?.l2_distance_unit || 'meters');
  const [l2Time, setL2Time] = useState(existingConfig?.l2_time?.toString() || '');
  const [l2Variation, setL2Variation] = useState(existingConfig?.l2_movement_variation || '');

  // L1 scaling - Gender split for weights
  const [l1Reps, setL1Reps] = useState(existingConfig?.l1_reps?.toString() || '');
  const [l1WeightMen, setL1WeightMen] = useState(existingConfig?.l1_weight_men_lbs?.toString() || '');
  const [l1WeightWomen, setL1WeightWomen] = useState(existingConfig?.l1_weight_women_lbs?.toString() || '');
  const [l1DistanceValue, setL1DistanceValue] = useState(existingConfig?.l1_distance_value?.toString() || '');
  const [l1DistanceUnit, setL1DistanceUnit] = useState(existingConfig?.l1_distance_unit || 'meters');
  const [l1Time, setL1Time] = useState(existingConfig?.l1_time?.toString() || '');
  const [l1Variation, setL1Variation] = useState(existingConfig?.l1_movement_variation || '');

  const [notes, setNotes] = useState(existingConfig?.notes || '');

  // Reset state when modal opens or when existingConfig changes
  useEffect(() => {
    if (visible) {
      setActiveLevel('Rx');
      setFollowsWodScheme(existingConfig?.follows_wod_scheme ?? true);
      setCustomRepScheme(existingConfig?.custom_rep_scheme || '');

      // Rx
      setRxReps(existingConfig?.rx_reps?.toString() || '');
      setRxWeightMen(existingConfig?.rx_weight_men_lbs?.toString() || '');
      setRxWeightWomen(existingConfig?.rx_weight_women_lbs?.toString() || '');
      setRxDistanceValue(existingConfig?.rx_distance_value?.toString() || '');
      setRxDistanceUnit(existingConfig?.rx_distance_unit || 'meters');
      setRxTime(existingConfig?.rx_time?.toString() || '');
      setRxVariation(existingConfig?.rx_movement_variation || '');

      // L2
      setL2Reps(existingConfig?.l2_reps?.toString() || '');
      setL2WeightMen(existingConfig?.l2_weight_men_lbs?.toString() || '');
      setL2WeightWomen(existingConfig?.l2_weight_women_lbs?.toString() || '');
      setL2DistanceValue(existingConfig?.l2_distance_value?.toString() || '');
      setL2DistanceUnit(existingConfig?.l2_distance_unit || 'meters');
      setL2Time(existingConfig?.l2_time?.toString() || '');
      setL2Variation(existingConfig?.l2_movement_variation || '');

      // L1
      setL1Reps(existingConfig?.l1_reps?.toString() || '');
      setL1WeightMen(existingConfig?.l1_weight_men_lbs?.toString() || '');
      setL1WeightWomen(existingConfig?.l1_weight_women_lbs?.toString() || '');
      setL1DistanceValue(existingConfig?.l1_distance_value?.toString() || '');
      setL1DistanceUnit(existingConfig?.l1_distance_unit || 'meters');
      setL1Time(existingConfig?.l1_time?.toString() || '');
      setL1Variation(existingConfig?.l1_movement_variation || '');

      setNotes(existingConfig?.notes || '');
    }
  }, [visible, existingConfig]);

  if (!movement) return null;

  const handleSave = () => {
    const isBodyweight = !movement?.requires_weight;
    const isDistance = movement?.requires_distance;

    // Validate based on movement type
    if (isDistance) {
      // For distance movements, require at least distance value for Rx
      if (!rxDistanceValue) {
        Alert.alert('Validation Error', 'Please enter a distance for Rx scaling');
        return;
      }
    } else if (isBodyweight) {
      // For bodyweight movements, allow empty Rx if following WOD scheme
      if (!followsWodScheme && !customRepScheme?.trim()) {
        Alert.alert('Validation Error', 'Please enter a custom rep scheme or use WOD scheme');
        return;
      }
    } else {
      // For weighted movements, require at least one Rx field
      if (!rxReps && !rxWeightMen && !rxWeightWomen && !rxTime) {
        Alert.alert('Validation Error', 'Please configure at least one field for Rx scaling');
        return;
      }
    }

    const config: Omit<WODMovementConfig, 'movement_order'> = {
      exercise_id: movement.id,
      exercise_name: movement.full_name || movement.name,

      // Equipment metadata (for edit modal)
      requires_weight: movement.requires_weight,
      requires_distance: movement.requires_distance,
      equipment_types: movement.equipment_types,

      // Rep scheme override
      follows_wod_scheme: followsWodScheme,
      custom_rep_scheme: !followsWodScheme && customRepScheme ? customRepScheme : undefined,

      // Rx - Gender split for weights
      rx_reps: rxReps ? parseInt(rxReps) : undefined,
      rx_weight_men_lbs: rxWeightMen ? parseFloat(rxWeightMen) : undefined,
      rx_weight_women_lbs: rxWeightWomen ? parseFloat(rxWeightWomen) : undefined,
      rx_distance_value: rxDistanceValue ? parseFloat(rxDistanceValue) : undefined,
      rx_distance_unit: rxDistanceValue ? rxDistanceUnit : undefined,
      rx_time: rxTime ? parseInt(rxTime) : undefined,
      rx_movement_variation: rxVariation || undefined,

      // L2 - Gender split for weights
      l2_reps: l2Reps ? (l2Reps.includes('-') ? l2Reps : parseInt(l2Reps)) : undefined,
      l2_weight_men_lbs: l2WeightMen ? parseFloat(l2WeightMen) : undefined,
      l2_weight_women_lbs: l2WeightWomen ? parseFloat(l2WeightWomen) : undefined,
      l2_distance_value: l2DistanceValue ? parseFloat(l2DistanceValue) : undefined,
      l2_distance_unit: l2DistanceValue ? l2DistanceUnit : undefined,
      l2_time: l2Time ? parseInt(l2Time) : undefined,
      l2_movement_variation: l2Variation || undefined,

      // L1 - Gender split for weights
      l1_reps: l1Reps ? (l1Reps.includes('-') ? l1Reps : parseInt(l1Reps)) : undefined,
      l1_weight_men_lbs: l1WeightMen ? parseFloat(l1WeightMen) : undefined,
      l1_weight_women_lbs: l1WeightWomen ? parseFloat(l1WeightWomen) : undefined,
      l1_distance_value: l1DistanceValue ? parseFloat(l1DistanceValue) : undefined,
      l1_distance_unit: l1DistanceValue ? l1DistanceUnit : undefined,
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
    const isBodyweight = !movement?.requires_weight;
    const isDistance = movement?.requires_distance;

    // For distance movements, show distance-specific UI
    if (isDistance) {
      const distanceValue = isRx ? rxDistanceValue : isL2 ? l2DistanceValue : l1DistanceValue;
      const setDistanceValue = isRx ? setRxDistanceValue : isL2 ? setL2DistanceValue : setL1DistanceValue;
      const distanceUnit = isRx ? rxDistanceUnit : isL2 ? l2DistanceUnit : l1DistanceUnit;
      const setDistanceUnit = isRx ? setRxDistanceUnit : isL2 ? setL2DistanceUnit : setL1DistanceUnit;
      const variation = isRx ? rxVariation : isL2 ? l2Variation : l1Variation;
      const setVariation = isRx ? setRxVariation : isL2 ? setL2Variation : setL1Variation;

      return (
        <View style={styles.scalingForm}>
          {/* Distance */}
          <View style={styles.field}>
            <Text style={styles.label}>Distance *</Text>
            <View style={styles.distanceRow}>
              <TextInput
                style={[styles.input, styles.distanceInput]}
                placeholder="e.g., 400"
                placeholderTextColor={colors.mutedForeground}
                value={distanceValue}
                onChangeText={setDistanceValue}
                keyboardType="decimal-pad"
              />
              <View style={styles.unitPickerContainer}>
                <TouchableOpacity
                  style={styles.unitButton}
                  onPress={() => {
                    // Cycle through units: meters -> feet -> miles -> kilometers -> meters
                    const units = ['meters', 'feet', 'miles', 'kilometers'];
                    const currentIndex = units.indexOf(distanceUnit);
                    const nextIndex = (currentIndex + 1) % units.length;
                    setDistanceUnit(units[nextIndex]);
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={styles.unitButtonText}>
                    {distanceUnit === 'meters' ? 'm' :
                     distanceUnit === 'feet' ? 'ft' :
                     distanceUnit === 'miles' ? 'mi' : 'km'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>

          {/* Movement Variation (for alternative movements) */}
          <View style={styles.field}>
            <Text style={styles.label}>Movement Variation (For Scaling)</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g., Reduced Pace, Walking, Modified"
              placeholderTextColor={colors.mutedForeground}
              value={variation}
              onChangeText={setVariation}
              autoCapitalize="words"
            />
            <Text style={styles.helperText}>
              Specify alternative movement pattern or scaling options
            </Text>
          </View>
        </View>
      );
    }

    // For bodyweight movements on Rx/L2 tabs, show simplified UI
    if (isBodyweight && (isRx || isL2)) {
      return (
        <View style={styles.bodyweightMessage}>
          <View style={styles.infoBox}>
            <Text style={styles.infoIcon}>ℹ️</Text>
            <View style={styles.infoTextContainer}>
              <Text style={styles.infoTitle}>No configuration needed</Text>
              <Text style={styles.infoText}>
                This is a bodyweight movement.
              </Text>
            </View>
          </View>

          {wodRepScheme && (
            <View style={styles.schemeInfo}>
              <Text style={styles.schemeLabel}>WOD Rep Scheme:</Text>
              <Text style={styles.schemeValue}>{wodRepScheme}</Text>
            </View>
          )}

          <View style={styles.checkboxContainer}>
            <TouchableOpacity
              style={styles.checkbox}
              onPress={() => setFollowsWodScheme(!followsWodScheme)}
              activeOpacity={0.7}
            >
              <View style={[styles.checkboxBox, !followsWodScheme && styles.checkboxBoxChecked]}>
                {!followsWodScheme && <Text style={styles.checkboxCheck}>✓</Text>}
              </View>
              <Text style={styles.checkboxLabel}>Override rep scheme</Text>
            </TouchableOpacity>
          </View>

          {!followsWodScheme && (
            <View style={styles.field}>
              <Text style={styles.label}>Custom Rep Scheme *</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g., 10-10-10 or 15"
                placeholderTextColor={colors.mutedForeground}
                value={customRepScheme}
                onChangeText={setCustomRepScheme}
              />
            </View>
          )}
        </View>
      );
    }

    // For L1 bodyweight, show only relevant fields
    if (isBodyweight && isL1) {
      return (
        <View style={styles.scalingForm}>
          {/* Reps (optional for L1 scaling) */}
          <View style={styles.field}>
            <Text style={styles.label}>Reps (Optional - if different from WOD)</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g., 15 (reduced from 21)"
              placeholderTextColor={colors.mutedForeground}
              value={l1Reps}
              onChangeText={setL1Reps}
              keyboardType="number-pad"
            />
          </View>

          {/* Movement Variation (for alternative movements) */}
          <View style={styles.field}>
            <Text style={styles.label}>Movement Variation (For Scaling)</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g., Hanging Knee Raises, Banded, Knees-to-Elbows"
              placeholderTextColor={colors.mutedForeground}
              value={l1Variation}
              onChangeText={setL1Variation}
              autoCapitalize="words"
            />
            <Text style={styles.helperText}>
              Specify alternative movement, assistance equipment, or modified ROM
            </Text>
          </View>
        </View>
      );
    }

    // For weighted movements, show full form
    const reps = isRx ? rxReps : isL2 ? l2Reps : l1Reps;
    const setReps = isRx ? setRxReps : isL2 ? setL2Reps : setL1Reps;

    const weightMen = isRx ? rxWeightMen : isL2 ? l2WeightMen : l1WeightMen;
    const setWeightMen = isRx ? setRxWeightMen : isL2 ? setL2WeightMen : setL1WeightMen;

    const weightWomen = isRx ? rxWeightWomen : isL2 ? l2WeightWomen : l1WeightWomen;
    const setWeightWomen = isRx ? setRxWeightWomen : isL2 ? setL2WeightWomen : setL1WeightWomen;

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

        {/* Weight - Men/Women Split */}
        <View style={styles.field}>
          <Text style={styles.label}>Weight (lbs)</Text>
          <View style={styles.weightRow}>
            <View style={styles.weightField}>
              <Text style={styles.weightLabel}>Men</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g., 95"
                placeholderTextColor={colors.mutedForeground}
                value={weightMen}
                onChangeText={setWeightMen}
                keyboardType="decimal-pad"
              />
            </View>
            <View style={styles.weightField}>
              <Text style={styles.weightLabel}>Women</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g., 65"
                placeholderTextColor={colors.mutedForeground}
                value={weightWomen}
                onChangeText={setWeightWomen}
                keyboardType="decimal-pad"
              />
            </View>
          </View>
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
  weightRow: {
    flexDirection: 'row',
    gap: 12,
  },
  weightField: {
    flex: 1,
  },
  weightLabel: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.mutedForeground,
    marginBottom: 6,
  },
  bodyweightMessage: {
    padding: 20,
    gap: 20,
  },
  infoBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    padding: 16,
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(59, 130, 246, 0.3)',
  },
  infoIcon: {
    fontSize: 20,
  },
  infoTextContainer: {
    flex: 1,
  },
  infoTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.foreground,
    marginBottom: 4,
  },
  infoText: {
    fontSize: 14,
    color: colors.mutedForeground,
    lineHeight: 20,
  },
  schemeInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  schemeLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.foreground,
  },
  schemeValue: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.primary,
  },
  checkboxContainer: {
    marginTop: 8,
  },
  checkbox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  checkboxBox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxBoxChecked: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  checkboxCheck: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: 'bold',
  },
  checkboxLabel: {
    fontSize: 14,
    color: colors.foreground,
    flex: 1,
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
  helperText: {
    fontSize: 12,
    color: colors.mutedForeground,
    marginTop: 4,
    lineHeight: 16,
  },
  distanceRow: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
  },
  distanceInput: {
    flex: 1,
  },
  unitPickerContainer: {
    width: 70,
  },
  unitButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  unitButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});
