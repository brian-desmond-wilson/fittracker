import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { colors } from '@/src/lib/colors';
import { WODFormData } from './AddWODWizard';
import { fetchWODFormats, fetchWODCategories } from '@/src/lib/supabase/crossfit';
import type { WODFormat, WODCategory } from '@/src/types/crossfit';

interface WODBasicsStepProps {
  formData: WODFormData;
  onUpdate: (updates: Partial<WODFormData>) => void;
  onNext: () => void;
}

export function WODBasicsStep({ formData, onUpdate, onNext }: WODBasicsStepProps) {
  const [formats, setFormats] = useState<WODFormat[]>([]);
  const [categories, setCategories] = useState<WODCategory[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadReferenceData();
  }, []);

  const loadReferenceData = async () => {
    try {
      setLoading(true);
      const [formatsData, categoriesData] = await Promise.all([
        fetchWODFormats(),
        fetchWODCategories(),
      ]);
      setFormats(formatsData);
      setCategories(categoriesData);
    } catch (error) {
      console.error('Error loading reference data:', error);
      Alert.alert('Error', 'Failed to load form data');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
      >
        {/* WOD Name */}
        <View style={styles.field}>
          <Text style={styles.label}>WOD Name *</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g., Fran, Murph, My Custom WOD"
            placeholderTextColor={colors.mutedForeground}
            value={formData.name}
            onChangeText={(text) => onUpdate({ name: text })}
            autoCapitalize="words"
          />
        </View>

        {/* Format */}
        <View style={styles.field}>
          <Text style={styles.label}>Format *</Text>
          <View style={styles.pillsContainer}>
            {formats.map((format) => {
              const isSelected = formData.format_id === format.id;
              return (
                <TouchableOpacity
                  key={format.id}
                  style={[styles.pill, isSelected && styles.pillSelected]}
                  onPress={() => onUpdate({ format_id: format.id })}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.pillText, isSelected && styles.pillTextSelected]}>
                    {format.name}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Category */}
        <View style={styles.field}>
          <Text style={styles.label}>Category *</Text>
          <View style={styles.pillsContainer}>
            {categories.filter(c => c.name !== 'All').map((category) => {
              const isSelected = formData.category_id === category.id;
              return (
                <TouchableOpacity
                  key={category.id}
                  style={[styles.pill, isSelected && styles.pillSelected]}
                  onPress={() => onUpdate({ category_id: category.id })}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.pillText, isSelected && styles.pillTextSelected]}>
                    {category.name}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Time Cap */}
        <View style={styles.field}>
          <Text style={styles.label}>Time Cap (Optional)</Text>
          <View style={styles.row}>
            <TextInput
              style={[styles.input, styles.numberInput]}
              placeholder="e.g., 20"
              placeholderTextColor={colors.mutedForeground}
              value={formData.time_cap_minutes?.toString() || ''}
              onChangeText={(text) => {
                const num = parseInt(text) || undefined;
                onUpdate({ time_cap_minutes: num });
              }}
              keyboardType="number-pad"
            />
            <Text style={styles.unitText}>minutes</Text>
          </View>
        </View>

        {/* Description */}
        <View style={styles.field}>
          <Text style={styles.label}>Description (Optional)</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            placeholder="Brief description of the WOD..."
            placeholderTextColor={colors.mutedForeground}
            value={formData.description}
            onChangeText={(text) => onUpdate({ description: text })}
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
            placeholder="Coaching notes, movement standards, etc..."
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
          <Text style={styles.nextButtonText}>Next: Add Movements</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: colors.mutedForeground,
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
