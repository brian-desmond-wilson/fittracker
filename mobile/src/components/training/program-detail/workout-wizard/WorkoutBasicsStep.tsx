import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
} from 'react-native';
import { colors } from '@/src/lib/colors';
import type { WorkoutFormData, WorkoutType } from '@/src/types/training';

interface WorkoutBasicsStepProps {
  formData: WorkoutFormData;
  daysPerWeek: number;
  onUpdate: (updates: Partial<WorkoutFormData>) => void;
  onNext: () => void;
}

const WORKOUT_TYPES: { value: WorkoutType; label: string }[] = [
  { value: 'Strength', label: 'Strength' },
  { value: 'Hypertrophy', label: 'Hypertrophy' },
  { value: 'Power', label: 'Power' },
  { value: 'Endurance', label: 'Endurance' },
  { value: 'Rest', label: 'Rest' },
  { value: 'Deload', label: 'Deload' },
];

export function WorkoutBasicsStep({ formData, daysPerWeek, onUpdate, onNext }: WorkoutBasicsStepProps) {
  const dayNumbers = Array.from({ length: daysPerWeek }, (_, i) => i + 1);

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
      >
        {/* Workout Name */}
        <View style={styles.field}>
          <Text style={styles.label}>Workout Name *</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g., Lower Strength + Knee Prehab"
            placeholderTextColor={colors.mutedForeground}
            value={formData.name}
            onChangeText={(text) => onUpdate({ name: text })}
            autoCapitalize="words"
          />
        </View>

        {/* Day Number */}
        <View style={styles.field}>
          <Text style={styles.label}>Day of Week *</Text>
          <View style={styles.pillsContainer}>
            {dayNumbers.map((day) => {
              const isSelected = formData.day_number === day;
              return (
                <TouchableOpacity
                  key={day}
                  style={[styles.dayPill, isSelected && styles.dayPillSelected]}
                  onPress={() => onUpdate({ day_number: day })}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.dayPillText, isSelected && styles.dayPillTextSelected]}>
                    Day {day}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Workout Type */}
        <View style={styles.field}>
          <Text style={styles.label}>Workout Type *</Text>
          <View style={styles.pillsContainer}>
            {WORKOUT_TYPES.map((type) => {
              const isSelected = formData.workout_type === type.value;
              return (
                <TouchableOpacity
                  key={type.value}
                  style={[styles.pill, isSelected && styles.pillSelected]}
                  onPress={() => onUpdate({ workout_type: type.value })}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.pillText, isSelected && styles.pillTextSelected]}>
                    {type.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Estimated Duration */}
        <View style={styles.field}>
          <Text style={styles.label}>Estimated Duration (Optional)</Text>
          <View style={styles.row}>
            <TextInput
              style={[styles.input, styles.numberInput]}
              placeholder="e.g., 60"
              placeholderTextColor={colors.mutedForeground}
              value={formData.estimated_duration_minutes?.toString() || ''}
              onChangeText={(text) => {
                const num = parseInt(text) || undefined;
                onUpdate({ estimated_duration_minutes: num });
              }}
              keyboardType="number-pad"
            />
            <Text style={styles.unitText}>minutes</Text>
          </View>
        </View>

        {/* Warmup Instructions */}
        <View style={styles.field}>
          <Text style={styles.label}>Warmup Instructions (Optional)</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            placeholder="Describe the warmup routine..."
            placeholderTextColor={colors.mutedForeground}
            value={formData.warmup_instructions}
            onChangeText={(text) => onUpdate({ warmup_instructions: text })}
            multiline
            numberOfLines={3}
            textAlignVertical="top"
          />
        </View>

        {/* Cooldown Instructions */}
        <View style={styles.field}>
          <Text style={styles.label}>Cooldown Instructions (Optional)</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            placeholder="Describe the cooldown routine..."
            placeholderTextColor={colors.mutedForeground}
            value={formData.cooldown_instructions}
            onChangeText={(text) => onUpdate({ cooldown_instructions: text })}
            multiline
            numberOfLines={3}
            textAlignVertical="top"
          />
        </View>

        {/* Notes */}
        <View style={styles.field}>
          <Text style={styles.label}>Notes (Optional)</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            placeholder="Any additional notes for this workout..."
            placeholderTextColor={colors.mutedForeground}
            value={formData.notes}
            onChangeText={(text) => onUpdate({ notes: text })}
            multiline
            numberOfLines={3}
            textAlignVertical="top"
          />
        </View>

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Next Button */}
      <View style={styles.footer}>
        <TouchableOpacity style={styles.nextButton} onPress={onNext} activeOpacity={0.8}>
          <Text style={styles.nextButtonText}>Next: Add Exercises</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  contentContainer: {
    padding: 20,
  },
  field: {
    marginBottom: 24,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.foreground,
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
    color: colors.foreground,
    backgroundColor: colors.input,
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
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: colors.muted,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pillSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  pillText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.foreground,
  },
  pillTextSelected: {
    color: '#FFFFFF',
  },
  dayPill: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: colors.muted,
    borderWidth: 1,
    borderColor: colors.border,
    minWidth: 60,
    alignItems: 'center',
  },
  dayPillSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  dayPillText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.foreground,
  },
  dayPillTextSelected: {
    color: '#FFFFFF',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  numberInput: {
    flex: 1,
  },
  unitText: {
    fontSize: 16,
    color: colors.mutedForeground,
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
  nextButtonText: {
    fontSize: 17,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});
