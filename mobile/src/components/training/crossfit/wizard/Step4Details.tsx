import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity } from 'react-native';
import { X } from 'lucide-react-native';
import { colors } from '@/src/lib/colors';
import type { MovementFormData } from '../AddMovementWizard';

interface Step4DetailsProps {
  formData: MovementFormData;
  updateFormData: (updates: Partial<MovementFormData>) => void;
}

export function Step4Details({ formData, updateFormData }: Step4DetailsProps) {
  const [aliasInput, setAliasInput] = useState('');

  const addAlias = () => {
    const trimmed = aliasInput.trim();
    if (trimmed && !formData.aliases.includes(trimmed)) {
      updateFormData({ aliases: [...formData.aliases, trimmed] });
      setAliasInput('');
    }
  };

  const removeAlias = (alias: string) => {
    updateFormData({ aliases: formData.aliases.filter(a => a !== alias) });
  };

  return (
    <View style={styles.container}>
      {/* Info */}
      <View style={styles.infoBox}>
        <Text style={styles.infoText}>
          Add additional details to help users find and understand this movement.
          All fields are optional.
        </Text>
      </View>

      {/* Short Name */}
      <View style={styles.field}>
        <Text style={styles.label}>Short Name</Text>
        <Text style={styles.helperText}>
          Abbreviated name for UI display (auto-populated from Movement Name)
        </Text>
        <TextInput
          style={styles.input}
          placeholder="e.g., C2B, T2B, HSPU"
          placeholderTextColor={colors.mutedForeground}
          value={formData.short_name}
          onChangeText={text => updateFormData({ short_name: text })}
          autoCapitalize="words"
        />
      </View>

      <View style={styles.separator} />

      {/* Aliases */}
      <View style={styles.field}>
        <Text style={styles.label}>Aliases</Text>
        <Text style={styles.helperText}>
          Alternative names for search (e.g., "C2B" for "Chest-to-Bar Pull-up")
        </Text>
        <View style={styles.aliasInputContainer}>
          <TextInput
            style={styles.aliasInput}
            placeholder="Type an alias and press Add"
            placeholderTextColor={colors.mutedForeground}
            value={aliasInput}
            onChangeText={setAliasInput}
            onSubmitEditing={addAlias}
            autoCapitalize="none"
          />
          <TouchableOpacity onPress={addAlias} style={styles.addButton}>
            <Text style={styles.addButtonText}>Add</Text>
          </TouchableOpacity>
        </View>
        {formData.aliases.length > 0 && (
          <View style={styles.tagsContainer}>
            {formData.aliases.map(alias => (
              <View key={alias} style={styles.tag}>
                <Text style={styles.tagText}>{alias}</Text>
                <TouchableOpacity onPress={() => removeAlias(alias)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <X size={14} color={colors.foreground} />
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}
      </View>

      <View style={styles.separator} />

      {/* Description */}
      <View style={styles.field}>
        <Text style={styles.label}>Description</Text>
        <Text style={styles.helperText}>
          Movement description, coaching cues, or standards
        </Text>
        <TextInput
          style={[styles.input, styles.textArea]}
          placeholder="Add notes, coaching cues, or movement standards..."
          placeholderTextColor={colors.mutedForeground}
          value={formData.description}
          onChangeText={text => updateFormData({ description: text })}
          multiline
          numberOfLines={4}
          textAlignVertical="top"
        />
      </View>

      <View style={styles.separator} />

      {/* Video URL */}
      <View style={styles.field}>
        <Text style={styles.label}>Video URL</Text>
        <Text style={styles.helperText}>
          Link to demonstration video (YouTube, Vimeo, etc.)
        </Text>
        <TextInput
          style={styles.input}
          placeholder="https://youtube.com/..."
          placeholderTextColor={colors.mutedForeground}
          value={formData.video_url}
          onChangeText={text => updateFormData({ video_url: text })}
          autoCapitalize="none"
          keyboardType="url"
        />
      </View>

      <View style={styles.separator} />

      {/* Image URL */}
      <View style={styles.field}>
        <Text style={styles.label}>Image URL</Text>
        <Text style={styles.helperText}>
          Link to thumbnail or demonstration image
        </Text>
        <TextInput
          style={styles.input}
          placeholder="https://..."
          placeholderTextColor={colors.mutedForeground}
          value={formData.image_url}
          onChangeText={text => updateFormData({ image_url: text })}
          autoCapitalize="none"
          keyboardType="url"
        />
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
  field: {
    gap: 8,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.foreground,
  },
  helperText: {
    fontSize: 14,
    color: colors.mutedForeground,
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
    minHeight: 100,
  },
  aliasInputContainer: {
    flexDirection: 'row',
    gap: 8,
  },
  aliasInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
    color: colors.foreground,
    backgroundColor: colors.input,
  },
  addButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
    justifyContent: 'center',
  },
  addButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  tagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.muted,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    gap: 6,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tagText: {
    fontSize: 14,
    color: colors.foreground,
  },
});
