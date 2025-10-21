import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { colors } from '@/src/lib/colors';
import { WODFormData } from './AddWODWizard';

interface WODPreviewStepProps {
  formData: WODFormData;
  onSave: () => void;
  onClose: () => void;
}

export function WODPreviewStep({ formData, onSave, onClose }: WODPreviewStepProps) {
  const handleSave = () => {
    // TODO: Call createWOD API
    onSave();
    onClose();
  };

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.placeholder}>Step 3: Review & Save (Coming soon...)</Text>
      </View>

      {/* Save Button */}
      <View style={styles.footer}>
        <TouchableOpacity style={styles.saveButton} onPress={handleSave} activeOpacity={0.8}>
          <Text style={styles.saveButtonText}>Save WOD</Text>
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
  saveButton: {
    backgroundColor: colors.primary,
    paddingVertical: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  saveButtonText: {
    fontSize: 17,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});
