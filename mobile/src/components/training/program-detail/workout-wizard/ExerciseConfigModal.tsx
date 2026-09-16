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
import { colors } from '@/src/theme/tokens';
import type { Exercise, WorkoutExerciseConfig, WorkoutSection, LoadType } from '@/src/types/training';
import { WORKOUT_SECTIONS, SECTION_DISPLAY_NAMES } from '@/src/types/training';

interface ExerciseConfigModalProps {
  visible: boolean;
  exercise: Exercise | null;
  existingConfig?: WorkoutExerciseConfig;
  onClose: () => void;
  onSave: (config: Omit<WorkoutExerciseConfig, 'exercise_order'>) => void;
  /** If true, skip prescription fields (used when adding to existing OR group) */
  skipPrescription?: boolean;
}

const LOAD_TYPES: { value: LoadType; label: string }[] = [
  { value: 'rpe', label: 'RPE' },
  { value: 'percentage_1rm', label: '% 1RM' },
  { value: 'weight', label: 'Weight' },
  { value: 'notes', label: 'Notes' },
  { value: 'none', label: 'None' },
];

export function ExerciseConfigModal({
  visible,
  exercise,
  existingConfig,
  onClose,
  onSave,
  skipPrescription = false,
}: ExerciseConfigModalProps) {
  // Section
  const [section, setSection] = useState<WorkoutSection>(existingConfig?.section || 'Strength');

  // Measurement mode
  const [measurementMode, setMeasurementMode] = useState<'reps' | 'time'>('reps');

  // Sets/Reps
  const [targetSets, setTargetSets] = useState(existingConfig?.target_sets?.toString() || '');
  const [targetReps, setTargetReps] = useState(existingConfig?.target_reps?.toString() || '');
  const [targetTime, setTargetTime] = useState(existingConfig?.target_time_seconds?.toString() || '');
  const [isPerSide, setIsPerSide] = useState(existingConfig?.is_per_side || false);

  // Load
  const [loadType, setLoadType] = useState<LoadType>(existingConfig?.load_type || 'rpe');
  const [loadRpe, setLoadRpe] = useState(existingConfig?.load_rpe?.toString() || '');
  const [loadPercentage, setLoadPercentage] = useState(existingConfig?.load_percentage_1rm?.toString() || '');
  const [loadWeight, setLoadWeight] = useState(existingConfig?.load_weight_lbs?.toString() || '');
  const [loadNotes, setLoadNotes] = useState(existingConfig?.load_notes || '');

  // Metadata
  const [restSeconds, setRestSeconds] = useState(existingConfig?.rest_seconds?.toString() || '');
  const [estimatedDuration, setEstimatedDuration] = useState(existingConfig?.estimated_duration_minutes?.toString() || '');
  const [tempo, setTempo] = useState(existingConfig?.tempo || '');
  const [videoUrl, setVideoUrl] = useState(existingConfig?.video_url || '');
  const [exerciseNotes, setExerciseNotes] = useState(existingConfig?.exercise_notes || '');

  // Reset state when modal opens
  useEffect(() => {
    if (visible && exercise) {
      setSection(existingConfig?.section || 'Strength');
      setMeasurementMode(existingConfig?.target_time_seconds ? 'time' : 'reps');
      setTargetSets(existingConfig?.target_sets?.toString() || '');
      setTargetReps(existingConfig?.target_reps?.toString() || '');
      setTargetTime(existingConfig?.target_time_seconds?.toString() || '');
      setIsPerSide(existingConfig?.is_per_side || false);
      setLoadType(existingConfig?.load_type || 'rpe');
      setLoadRpe(existingConfig?.load_rpe?.toString() || '');
      setLoadPercentage(existingConfig?.load_percentage_1rm?.toString() || '');
      setLoadWeight(existingConfig?.load_weight_lbs?.toString() || '');
      setLoadNotes(existingConfig?.load_notes || '');
      setRestSeconds(existingConfig?.rest_seconds?.toString() || '');
      setEstimatedDuration(existingConfig?.estimated_duration_minutes?.toString() || '');
      setTempo(existingConfig?.tempo || '');
      setVideoUrl(existingConfig?.video_url || '');
      setExerciseNotes(existingConfig?.exercise_notes || '');
    }
  }, [visible, existingConfig, exercise]);

  if (!exercise) return null;

  const handleSave = () => {
    // When skipPrescription is true, just save with minimal config
    if (skipPrescription) {
      const config: Omit<WorkoutExerciseConfig, 'exercise_order'> = {
        exercise_id: exercise.id,
        exercise_name: exercise.name,
        section,
        is_per_side: false,
        load_type: 'none',
      };
      onSave(config);
      onClose();
      return;
    }

    // Validation - require at least sets or time
    if (measurementMode === 'reps') {
      if (!targetSets && !targetReps) {
        Alert.alert('Validation Error', 'Please enter sets and/or reps');
        return;
      }
    } else {
      if (!targetTime) {
        Alert.alert('Validation Error', 'Please enter time in seconds');
        return;
      }
    }

    const config: Omit<WorkoutExerciseConfig, 'exercise_order'> = {
      exercise_id: exercise.id,
      exercise_name: exercise.name,
      section,
      is_per_side: isPerSide,
      load_type: loadType,

      // Sets/Reps
      target_sets: targetSets ? parseInt(targetSets) : undefined,
      target_reps: measurementMode === 'reps' && targetReps ? parseInt(targetReps) : undefined,
      target_time_seconds: measurementMode === 'time' && targetTime ? parseInt(targetTime) : undefined,

      // Load (based on type)
      load_rpe: loadType === 'rpe' && loadRpe ? parseFloat(loadRpe) : undefined,
      load_percentage_1rm: loadType === 'percentage_1rm' && loadPercentage ? parseInt(loadPercentage) : undefined,
      load_weight_lbs: loadType === 'weight' && loadWeight ? parseInt(loadWeight) : undefined,
      load_notes: loadType === 'notes' ? loadNotes : undefined,

      // Metadata
      rest_seconds: restSeconds ? parseInt(restSeconds) : undefined,
      estimated_duration_minutes: estimatedDuration ? parseInt(estimatedDuration) : undefined,
      tempo: tempo || undefined,
      video_url: videoUrl || undefined,
      exercise_notes: exerciseNotes || undefined,
    };

    onSave(config);
    onClose();
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
              <Text style={styles.title}>
                {skipPrescription ? 'Add Alternative' : 'Configure Exercise'}
              </Text>
              <Text style={styles.exerciseName}>{exercise.name}</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <X size={24} color={colors.text} />
            </TouchableOpacity>
          </View>

          {/* Form */}
          <ScrollView style={styles.formScroll} showsVerticalScrollIndicator={false}>
            <View style={styles.formContent}>
              {/* Skip prescription info banner */}
              {skipPrescription && (
                <View style={styles.infoBanner}>
                  <Text style={styles.infoBannerText}>
                    This exercise will inherit the prescription (sets, reps, load) from the existing group.
                  </Text>
                </View>
              )}

              {/* Section - only show if not skipping (section is inherited) */}
              {!skipPrescription && (
                <View style={styles.field}>
                  <Text style={styles.label}>Section *</Text>
                  <View style={styles.pillsContainer}>
                    {WORKOUT_SECTIONS.map((s) => {
                      const isSelected = section === s;
                      return (
                        <TouchableOpacity
                          key={s}
                          style={[styles.pill, isSelected && styles.pillSelected]}
                          onPress={() => setSection(s)}
                          activeOpacity={0.7}
                        >
                          <Text style={[styles.pillText, isSelected && styles.pillTextSelected]}>
                            {SECTION_DISPLAY_NAMES[s]}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              )}

              {/* Prescription fields - hidden when skipping */}
              {!skipPrescription && (
                <>
                  {/* Measurement Type Toggle */}
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

                  {/* Sets/Reps or Time */}
                  {measurementMode === 'reps' ? (
                    <View style={styles.rowFields}>
                      <View style={styles.halfField}>
                        <Text style={styles.label}>Sets</Text>
                        <TextInput
                          style={styles.input}
                          placeholder="e.g., 3"
                          placeholderTextColor={colors.textMuted}
                          value={targetSets}
                          onChangeText={setTargetSets}
                          keyboardType="number-pad"
                        />
                      </View>
                      <View style={styles.halfField}>
                        <Text style={styles.label}>Reps</Text>
                        <TextInput
                          style={styles.input}
                          placeholder="e.g., 10"
                          placeholderTextColor={colors.textMuted}
                          value={targetReps}
                          onChangeText={setTargetReps}
                          keyboardType="number-pad"
                        />
                      </View>
                    </View>
                  ) : (
                    <View style={styles.rowFields}>
                      <View style={styles.halfField}>
                        <Text style={styles.label}>Sets</Text>
                        <TextInput
                          style={styles.input}
                          placeholder="e.g., 3"
                          placeholderTextColor={colors.textMuted}
                          value={targetSets}
                          onChangeText={setTargetSets}
                          keyboardType="number-pad"
                        />
                      </View>
                      <View style={styles.halfField}>
                        <Text style={styles.label}>Time (seconds)</Text>
                        <TextInput
                          style={styles.input}
                          placeholder="e.g., 30"
                          placeholderTextColor={colors.textMuted}
                          value={targetTime}
                          onChangeText={setTargetTime}
                          keyboardType="number-pad"
                        />
                      </View>
                    </View>
                  )}

                  {/* Per Side Checkbox */}
                  <TouchableOpacity
                    style={styles.checkboxRow}
                    onPress={() => setIsPerSide(!isPerSide)}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.checkbox, isPerSide && styles.checkboxChecked]}>
                      {isPerSide && <Text style={styles.checkmark}>✓</Text>}
                    </View>
                    <Text style={styles.checkboxLabel}>Per side (unilateral exercise)</Text>
                  </TouchableOpacity>

                  {/* Load Type */}
                  <View style={styles.field}>
                    <Text style={styles.label}>Load Type</Text>
                    <View style={styles.pillsContainer}>
                      {LOAD_TYPES.map((lt) => {
                        const isSelected = loadType === lt.value;
                        return (
                          <TouchableOpacity
                            key={lt.value}
                            style={[styles.pill, isSelected && styles.pillSelected]}
                            onPress={() => setLoadType(lt.value)}
                            activeOpacity={0.7}
                          >
                            <Text style={[styles.pillText, isSelected && styles.pillTextSelected]}>
                              {lt.label}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>

                  {/* Conditional Load Input */}
                  {loadType === 'rpe' && (
                    <View style={styles.field}>
                      <Text style={styles.label}>Target RPE (1-10)</Text>
                      <TextInput
                        style={styles.input}
                        placeholder="e.g., 7"
                        placeholderTextColor={colors.textMuted}
                        value={loadRpe}
                        onChangeText={setLoadRpe}
                        keyboardType="decimal-pad"
                      />
                    </View>
                  )}

                  {loadType === 'percentage_1rm' && (
                    <View style={styles.field}>
                      <Text style={styles.label}>% of 1RM</Text>
                      <View style={styles.row}>
                        <TextInput
                          style={[styles.input, styles.flex1]}
                          placeholder="e.g., 75"
                          placeholderTextColor={colors.textMuted}
                          value={loadPercentage}
                          onChangeText={setLoadPercentage}
                          keyboardType="number-pad"
                        />
                        <Text style={styles.unitText}>%</Text>
                      </View>
                    </View>
                  )}

                  {loadType === 'weight' && (
                    <View style={styles.field}>
                      <Text style={styles.label}>Weight (lbs)</Text>
                      <TextInput
                        style={styles.input}
                        placeholder="e.g., 135"
                        placeholderTextColor={colors.textMuted}
                        value={loadWeight}
                        onChangeText={setLoadWeight}
                        keyboardType="number-pad"
                      />
                    </View>
                  )}

                  {loadType === 'notes' && (
                    <View style={styles.field}>
                      <Text style={styles.label}>Load Notes</Text>
                      <TextInput
                        style={styles.input}
                        placeholder="e.g., Light band, bodyweight, moderate"
                        placeholderTextColor={colors.textMuted}
                        value={loadNotes}
                        onChangeText={setLoadNotes}
                      />
                    </View>
                  )}

                  {/* Rest Time */}
                  <View style={styles.field}>
                    <Text style={styles.label}>Rest Between Sets (Optional)</Text>
                    <View style={styles.row}>
                      <TextInput
                        style={[styles.input, styles.flex1]}
                        placeholder="e.g., 90"
                        placeholderTextColor={colors.textMuted}
                        value={restSeconds}
                        onChangeText={setRestSeconds}
                        keyboardType="number-pad"
                      />
                      <Text style={styles.unitText}>seconds</Text>
                    </View>
                  </View>

                  {/* Estimated Duration */}
                  <View style={styles.field}>
                    <Text style={styles.label}>Estimated Duration (Optional)</Text>
                    <View style={styles.row}>
                      <TextInput
                        style={[styles.input, styles.flex1]}
                        placeholder="e.g., 10"
                        placeholderTextColor={colors.textMuted}
                        value={estimatedDuration}
                        onChangeText={setEstimatedDuration}
                        keyboardType="number-pad"
                      />
                      <Text style={styles.unitText}>minutes</Text>
                    </View>
                  </View>

                  {/* Tempo */}
                  <View style={styles.field}>
                    <Text style={styles.label}>Tempo (Optional)</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="e.g., 3-1-2-0"
                      placeholderTextColor={colors.textMuted}
                      value={tempo}
                      onChangeText={setTempo}
                    />
                    <Text style={styles.helperText}>Format: eccentric-pause-concentric-pause</Text>
                  </View>

                  {/* Notes */}
                  <View style={styles.field}>
                    <Text style={styles.label}>Notes (Optional)</Text>
                    <TextInput
                      style={[styles.input, styles.textArea]}
                      placeholder="Coaching cues, form notes..."
                      placeholderTextColor={colors.textMuted}
                      value={exerciseNotes}
                      onChangeText={setExerciseNotes}
                      multiline
                      numberOfLines={3}
                      textAlignVertical="top"
                    />
                  </View>
                </>
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
              <Text style={styles.saveButtonText}>
                {skipPrescription ? 'Add Alternative' : existingConfig ? 'Update' : 'Add to Workout'}
              </Text>
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
    backgroundColor: colors.scrim,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: colors.bg,
    borderRadius: 16,
    width: '100%',
    maxHeight: '90%',
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
    color: colors.text,
    marginBottom: 4,
  },
  exerciseName: {
    fontSize: 14,
    color: colors.textMuted,
  },
  closeButton: {
    padding: 4,
  },
  formScroll: {
    maxHeight: 450,
  },
  formContent: {
    padding: 20,
  },
  infoBanner: {
    backgroundColor: `${colors.brand}15`,
    borderWidth: 1,
    borderColor: colors.brand,
    borderRadius: 8,
    padding: 12,
    marginBottom: 20,
  },
  infoBannerText: {
    fontSize: 13,
    color: colors.brand,
    lineHeight: 18,
  },
  field: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: colors.text,
    backgroundColor: colors.surface2,
  },
  textArea: {
    minHeight: 80,
  },
  pillsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  pill: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pillSelected: {
    backgroundColor: colors.brand,
    borderColor: colors.brand,
  },
  pillText: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.text,
  },
  pillTextSelected: {
    color: colors.onBrand,
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
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  toggleButtonActive: {
    backgroundColor: colors.brand,
    borderColor: colors.brand,
  },
  toggleButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text,
  },
  toggleButtonTextActive: {
    color: colors.onBrand,
    fontWeight: '600',
  },
  rowFields: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  halfField: {
    flex: 1,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  flex1: {
    flex: 1,
  },
  unitText: {
    fontSize: 16,
    color: colors.textMuted,
    minWidth: 60,
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 20,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: {
    backgroundColor: colors.brand,
    borderColor: colors.brand,
  },
  checkmark: {
    color: colors.onBrand,
    fontSize: 14,
    fontWeight: 'bold',
  },
  checkboxLabel: {
    fontSize: 14,
    color: colors.text,
  },
  helperText: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 4,
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
    backgroundColor: colors.surface2,
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  saveButton: {
    backgroundColor: colors.brand,
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.onBrand,
  },
});
