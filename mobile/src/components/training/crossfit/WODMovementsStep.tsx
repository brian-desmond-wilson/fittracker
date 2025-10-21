import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { colors } from '@/src/lib/colors';
import { WODFormData } from './AddWODWizard';

interface WODMovementsStepProps {
  formData: WODFormData;
  onUpdate: (updates: Partial<WODFormData>) => void;
  onNext: () => void;
}

export function WODMovementsStep({ formData, onUpdate, onNext }: WODMovementsStepProps) {
  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.placeholder}>Step 2: Add Movements (Coming soon...)</Text>
      </View>

      {/* Next Button */}
      <View style={styles.footer}>
        <TouchableOpacity style={styles.nextButton} onPress={onNext} activeOpacity={0.8}>
          <Text style={styles.nextButtonText}>Next: Review</Text>
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
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  placeholder: {
    fontSize: 16,
    color: colors.mutedForeground,
    textAlign: 'center',
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
