import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors } from '@/src/lib/colors';
import type { MovementFormData } from '../AddMovementWizard';
import { VariationSelector } from '../VariationSelector';

interface Step5VariationsProps {
  formData: MovementFormData;
  updateFormData: (updates: Partial<MovementFormData>) => void;
}

export function Step5Variations({ formData, updateFormData }: Step5VariationsProps) {
  return (
    <View style={styles.container}>
      {/* Info */}
      <View style={styles.infoBox}>
        <Text style={styles.infoText}>
          Variations inherit the base movement's attributes but can override specific
          characteristics like load position, stance, or style.
        </Text>
        <Text style={[styles.infoText, { marginTop: 8 }]}>
          Examples: "Front Squat" can have a "Goblet Squat" variation that overrides
          the load position, or "Pull-up" can have "Strict" and "Kipping" style variations.
        </Text>
      </View>

      <View style={styles.separator} />

      {/* Variation Selector */}
      <VariationSelector
        selectedVariationIds={formData.variation_option_ids}
        onSelectionChange={ids => updateFormData({ variation_option_ids: ids })}
      />

      <View style={styles.separator} />

      {/* Usage Note */}
      <View style={styles.noteBox}>
        <Text style={styles.noteTitle}>💡 Tip</Text>
        <Text style={styles.noteText}>
          You can create variations later by editing this movement. Start with the base
          movement for now if you're unsure.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 24,
  },
  separator: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: 8,
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
    color: colors.mutedForeground,
    lineHeight: 20,
  },
  noteBox: {
    backgroundColor: colors.muted + '80',
    padding: 12,
    borderRadius: 8,
    gap: 6,
  },
  noteTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.foreground,
  },
  noteText: {
    fontSize: 13,
    color: colors.mutedForeground,
    lineHeight: 18,
  },
});
