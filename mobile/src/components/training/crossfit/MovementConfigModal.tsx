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
import { MovementSearchModal } from './MovementSearchModal';

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

  // Alternative movement state
  const [rxUseAlternative, setRxUseAlternative] = useState(!!existingConfig?.rx_alternative_exercise_id);
  const [rxAlternativeExercise, setRxAlternativeExercise] = useState<ExerciseWithVariations | null>(null);
  const [rxAlternativeExerciseId, setRxAlternativeExerciseId] = useState(existingConfig?.rx_alternative_exercise_id || '');
  const [rxAlternativeExerciseName, setRxAlternativeExerciseName] = useState(existingConfig?.rx_alternative_exercise_name || '');

  const [l2UseAlternative, setL2UseAlternative] = useState(!!existingConfig?.l2_alternative_exercise_id);
  const [l2AlternativeExercise, setL2AlternativeExercise] = useState<ExerciseWithVariations | null>(null);
  const [l2AlternativeExerciseId, setL2AlternativeExerciseId] = useState(existingConfig?.l2_alternative_exercise_id || '');
  const [l2AlternativeExerciseName, setL2AlternativeExerciseName] = useState(existingConfig?.l2_alternative_exercise_name || '');

  const [l1UseAlternative, setL1UseAlternative] = useState(!!existingConfig?.l1_alternative_exercise_id);
  const [l1AlternativeExercise, setL1AlternativeExercise] = useState<ExerciseWithVariations | null>(null);
  const [l1AlternativeExerciseId, setL1AlternativeExerciseId] = useState(existingConfig?.l1_alternative_exercise_id || '');
  const [l1AlternativeExerciseName, setL1AlternativeExerciseName] = useState(existingConfig?.l1_alternative_exercise_name || '');

  // Movement search modal state
  const [showMovementSearch, setShowMovementSearch] = useState(false);
  const [searchTargetLevel, setSearchTargetLevel] = useState<ScalingLevel>('Rx');

  // Reps/Time measurement mode ('reps' or 'time') for each scaling level
  const [rxMeasurementMode, setRxMeasurementMode] = useState<'reps' | 'time'>('reps');
  const [l2MeasurementMode, setL2MeasurementMode] = useState<'reps' | 'time'>('reps');
  const [l1MeasurementMode, setL1MeasurementMode] = useState<'reps' | 'time'>('reps');

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

      // Alternative movements
      setRxUseAlternative(!!existingConfig?.rx_alternative_exercise_id);
      setRxAlternativeExerciseId(existingConfig?.rx_alternative_exercise_id || '');
      setRxAlternativeExerciseName(existingConfig?.rx_alternative_exercise_name || '');

      setL2UseAlternative(!!existingConfig?.l2_alternative_exercise_id);
      setL2AlternativeExerciseId(existingConfig?.l2_alternative_exercise_id || '');
      setL2AlternativeExerciseName(existingConfig?.l2_alternative_exercise_name || '');

      setL1UseAlternative(!!existingConfig?.l1_alternative_exercise_id);
      setL1AlternativeExerciseId(existingConfig?.l1_alternative_exercise_id || '');
      setL1AlternativeExerciseName(existingConfig?.l1_alternative_exercise_name || '');
    }
  }, [visible, existingConfig]);

  if (!movement) return null;

  // Handle alternative movement selection
  const handleSelectAlternativeMovement = (alternativeMovement: ExerciseWithVariations) => {
    if (searchTargetLevel === 'Rx') {
      setRxAlternativeExercise(alternativeMovement);
      setRxAlternativeExerciseId(alternativeMovement.id);
      setRxAlternativeExerciseName(alternativeMovement.name);
      // Clear all Rx fields for fresh configuration
      setRxReps('');
      setRxWeightMen('');
      setRxWeightWomen('');
      setRxDistanceValue('');
      setRxDistanceUnit('meters');
      setRxTime('');
      setRxVariation('');
    } else if (searchTargetLevel === 'L2') {
      setL2AlternativeExercise(alternativeMovement);
      setL2AlternativeExerciseId(alternativeMovement.id);
      setL2AlternativeExerciseName(alternativeMovement.name);
      // Clear all L2 fields for fresh configuration
      setL2Reps('');
      setL2WeightMen('');
      setL2WeightWomen('');
      setL2DistanceValue('');
      setL2DistanceUnit('meters');
      setL2Time('');
      setL2Variation('');
    } else {
      setL1AlternativeExercise(alternativeMovement);
      setL1AlternativeExerciseId(alternativeMovement.id);
      setL1AlternativeExerciseName(alternativeMovement.name);
      // Clear all L1 fields for fresh configuration
      setL1Reps('');
      setL1WeightMen('');
      setL1WeightWomen('');
      setL1DistanceValue('');
      setL1DistanceUnit('meters');
      setL1Time('');
      setL1Variation('');
    }
  };

  // Handle toggling alternative movement
  const handleToggleAlternative = (level: ScalingLevel, enabled: boolean) => {
    if (level === 'Rx') {
      setRxUseAlternative(enabled);
      if (!enabled) {
        // Clear alternative movement data
        setRxAlternativeExercise(null);
        setRxAlternativeExerciseId('');
        setRxAlternativeExerciseName('');
      } else {
        // Open search modal
        setSearchTargetLevel('Rx');
        setShowMovementSearch(true);
      }
    } else if (level === 'L2') {
      setL2UseAlternative(enabled);
      if (!enabled) {
        setL2AlternativeExercise(null);
        setL2AlternativeExerciseId('');
        setL2AlternativeExerciseName('');
      } else {
        setSearchTargetLevel('L2');
        setShowMovementSearch(true);
      }
    } else {
      setL1UseAlternative(enabled);
      if (!enabled) {
        setL1AlternativeExercise(null);
        setL1AlternativeExerciseId('');
        setL1AlternativeExerciseName('');
      } else {
        setSearchTargetLevel('L1');
        setShowMovementSearch(true);
      }
    }
  };

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
      exercise_name: movement.name,

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
      rx_alternative_exercise_id: rxUseAlternative ? rxAlternativeExerciseId : undefined,
      rx_alternative_exercise_name: rxUseAlternative ? rxAlternativeExerciseName : undefined,

      // L2 - Gender split for weights
      l2_reps: l2Reps ? (l2Reps.includes('-') ? l2Reps : parseInt(l2Reps)) : undefined,
      l2_weight_men_lbs: l2WeightMen ? parseFloat(l2WeightMen) : undefined,
      l2_weight_women_lbs: l2WeightWomen ? parseFloat(l2WeightWomen) : undefined,
      l2_distance_value: l2DistanceValue ? parseFloat(l2DistanceValue) : undefined,
      l2_distance_unit: l2DistanceValue ? l2DistanceUnit : undefined,
      l2_time: l2Time ? parseInt(l2Time) : undefined,
      l2_movement_variation: l2Variation || undefined,
      l2_alternative_exercise_id: l2UseAlternative ? l2AlternativeExerciseId : undefined,
      l2_alternative_exercise_name: l2UseAlternative ? l2AlternativeExerciseName : undefined,

      // L1 - Gender split for weights
      l1_reps: l1Reps ? (l1Reps.includes('-') ? l1Reps : parseInt(l1Reps)) : undefined,
      l1_weight_men_lbs: l1WeightMen ? parseFloat(l1WeightMen) : undefined,
      l1_weight_women_lbs: l1WeightWomen ? parseFloat(l1WeightWomen) : undefined,
      l1_distance_value: l1DistanceValue ? parseFloat(l1DistanceValue) : undefined,
      l1_distance_unit: l1DistanceValue ? l1DistanceUnit : undefined,
      l1_time: l1Time ? parseInt(l1Time) : undefined,
      l1_movement_variation: l1Variation || undefined,
      l1_alternative_exercise_id: l1UseAlternative ? l1AlternativeExerciseId : undefined,
      l1_alternative_exercise_name: l1UseAlternative ? l1AlternativeExerciseName : undefined,

      notes: notes || undefined,
    };

    onSave(config);
    onClose();
  };

  const renderScalingForm = (level: ScalingLevel) => {
    const isRx = level === 'Rx';
    const isL2 = level === 'L2';
    const isL1 = level === 'L1';

    // Determine if alternative is active for this level
    const useAlternative = isRx ? rxUseAlternative : isL2 ? l2UseAlternative : l1UseAlternative;
    const alternativeName = isRx ? rxAlternativeExerciseName : isL2 ? l2AlternativeExerciseName : l1AlternativeExerciseName;
    const alternativeExercise = isRx ? rxAlternativeExercise : isL2 ? l2AlternativeExercise : l1AlternativeExercise;

    // Use alternative movement's properties if active, otherwise use original movement
    const activeMovement = useAlternative && alternativeExercise ? alternativeExercise : movement;
    const isBodyweight = !activeMovement?.requires_weight;
    const isDistance = activeMovement?.requires_distance;

    // Render alternative movement toggle (shared across all types)
    const alternativeToggle = (
      <View style={styles.alternativeSection}>
        <View style={styles.checkboxContainer}>
          <TouchableOpacity
            style={styles.checkbox}
            onPress={() => handleToggleAlternative(level, !useAlternative)}
            activeOpacity={0.7}
          >
            <View style={[styles.checkboxBox, useAlternative && styles.checkboxBoxChecked]}>
              {useAlternative && <Text style={styles.checkboxCheck}>✓</Text>}
            </View>
            <Text style={styles.checkboxLabel}>Use alternative movement</Text>
          </TouchableOpacity>
        </View>
        {useAlternative && alternativeName && (
          <View style={styles.alternativeInfo}>
            <Text style={styles.alternativeLabel}>Alternative:</Text>
            <Text style={styles.alternativeName}>{alternativeName}</Text>
            <TouchableOpacity
              style={styles.changeButton}
              onPress={() => {
                setSearchTargetLevel(level);
                setShowMovementSearch(true);
              }}
              activeOpacity={0.7}
            >
              <Text style={styles.changeButtonText}>Change</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    );

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
          {alternativeToggle}
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
        </View>
      );
    }

    // For bodyweight movements (ALL LEVELS - Rx, L2, L1), check scoring types
    if (isBodyweight) {
      const scoringTypes = activeMovement?.scoring_types || [];
      const hasReps = scoringTypes.some(st => st.name === 'Reps');
      const hasTime = scoringTypes.some(st => st.name === 'Time');
      const canMeasure = hasReps || hasTime;

      const measurementMode = isRx ? rxMeasurementMode : isL2 ? l2MeasurementMode : l1MeasurementMode;
      const setMeasurementMode = isRx ? setRxMeasurementMode : isL2 ? setL2MeasurementMode : setL1MeasurementMode;
      const reps = isRx ? rxReps : isL2 ? l2Reps : l1Reps;
      const setReps = isRx ? setRxReps : isL2 ? setL2Reps : setL1Reps;
      const time = isRx ? rxTime : isL2 ? l2Time : l1Time;
      const setTime = isRx ? setRxTime : isL2 ? setL2Time : setL1Time;

      return (
        <View style={styles.bodyweightMessage}>
          {alternativeToggle}

          {!canMeasure && (
            <View style={styles.infoBox}>
              <Text style={styles.infoIcon}>ℹ️</Text>
              <View style={styles.infoTextContainer}>
                <Text style={styles.infoTitle}>No configuration needed</Text>
                <Text style={styles.infoText}>
                  This is a bodyweight movement.
                </Text>
              </View>
            </View>
          )}

          {canMeasure && (
            <>
              {/* Reps/Time Toggle (if both are available) */}
              {hasReps && hasTime && (
                <View style={styles.field}>
                  <Text style={styles.label}>Measurement Type</Text>
                  <View style={styles.toggleContainer}>
                    <TouchableOpacity
                      style={[styles.toggleButton, measurementMode === 'reps' && styles.toggleButtonActive]}
                      onPress={() => setMeasurementMode('reps')}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.toggleButtonText, measurementMode === 'reps' && styles.toggleButtonTextActive]}>
                        Reps
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.toggleButton, measurementMode === 'time' && styles.toggleButtonActive]}
                      onPress={() => setMeasurementMode('time')}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.toggleButtonText, measurementMode === 'time' && styles.toggleButtonTextActive]}>
                        Time
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}

              {/* Reps Input */}
              {((hasReps && !hasTime) || (hasReps && hasTime && measurementMode === 'reps')) && (
                <View style={styles.field}>
                  <Text style={styles.label}>Reps</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="e.g., 10"
                    placeholderTextColor={colors.mutedForeground}
                    value={reps}
                    onChangeText={setReps}
                    keyboardType="number-pad"
                  />
                </View>
              )}

              {/* Time Input (seconds) */}
              {((hasTime && !hasReps) || (hasReps && hasTime && measurementMode === 'time')) && (
                <View style={styles.field}>
                  <Text style={styles.label}>Time (seconds)</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="e.g., 30"
                    placeholderTextColor={colors.mutedForeground}
                    value={time}
                    onChangeText={setTime}
                    keyboardType="number-pad"
                  />
                </View>
              )}
            </>
          )}

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

    // For weighted movements, show full form
    const reps = isRx ? rxReps : isL2 ? l2Reps : l1Reps;
    const setReps = isRx ? setRxReps : isL2 ? setL2Reps : setL1Reps;

    const weightMen = isRx ? rxWeightMen : isL2 ? l2WeightMen : l1WeightMen;
    const setWeightMen = isRx ? setRxWeightMen : isL2 ? setL2WeightMen : setL1WeightMen;

    const weightWomen = isRx ? rxWeightWomen : isL2 ? l2WeightWomen : l1WeightWomen;
    const setWeightWomen = isRx ? setRxWeightWomen : isL2 ? setL2WeightWomen : setL1WeightWomen;

    const distanceValue = isRx ? rxDistanceValue : isL2 ? l2DistanceValue : l1DistanceValue;
    const setDistanceValue = isRx ? setRxDistanceValue : isL2 ? setL2DistanceValue : setL1DistanceValue;

    const time = isRx ? rxTime : isL2 ? l2Time : l1Time;
    const setTime = isRx ? setRxTime : isL2 ? setL2Time : setL1Time;

    const variation = isRx ? rxVariation : isL2 ? l2Variation : l1Variation;
    const setVariation = isRx ? setRxVariation : isL2 ? setL2Variation : setL1Variation;

    return (
      <View style={styles.scalingForm}>
        {alternativeToggle}
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
          <Text style={styles.label}>Distance (meters - DEPRECATED)</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g., 400"
            placeholderTextColor={colors.mutedForeground}
            value={distanceValue}
            onChangeText={setDistanceValue}
            keyboardType="decimal-pad"
            editable={false}
          />
          <Text style={styles.helperText}>
            Note: This field is deprecated. Use distance configuration for distance movements.
          </Text>
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
              <Text style={styles.movementName}>{movement.name}</Text>
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

      {/* Movement Search Modal for Alternative Movements */}
      <MovementSearchModal
        visible={showMovementSearch}
        onClose={() => setShowMovementSearch(false)}
        onSelectMovement={handleSelectAlternativeMovement}
      />
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
  alternativeSection: {
    marginBottom: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  alternativeInfo: {
    marginTop: 12,
    padding: 12,
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(59, 130, 246, 0.3)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  alternativeLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.mutedForeground,
  },
  alternativeName: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.primary,
    flex: 1,
  },
  changeButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: colors.primary,
    borderRadius: 6,
  },
  changeButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  toggleContainer: {
    flexDirection: 'row',
    gap: 8,
  },
  toggleButton: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: colors.muted,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  toggleButtonActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  toggleButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.foreground,
  },
  toggleButtonTextActive: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
});
