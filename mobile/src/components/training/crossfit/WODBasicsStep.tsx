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
import { WODFormData, RepSchemeType } from './AddWODWizard';
import { fetchWODFormats, fetchWODCategories } from '@/src/lib/supabase/crossfit';
import type { WODFormat, WODCategory } from '@/src/types/crossfit';

interface WODBasicsStepProps {
  formData: WODFormData;
  onUpdate: (updates: Partial<WODFormData>) => void;
  onNext: () => void;
}

// Common rep schemes for quick selection
const COMMON_REP_SCHEMES: Record<string, string> = {
  '21-15-9': 'Descending (21-15-9)',
  '21-18-15-12-9-6-3': 'Descending (21-18-15-12-9-6-3)',
  '5': '5 Rounds',
  '3': '3 Rounds',
  '1-2-3-4-5': 'Ascending Ladder',
};

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

  const selectedFormat = formats.find(f => f.id === formData.format_id);
  const isForTime = selectedFormat?.name === 'For Time';

  const handleFormatChange = (format_id: string) => {
    const format = formats.find(f => f.id === format_id);
    const updates: Partial<WODFormData> = { format_id };

    // Clear For Time fields if switching away from For Time
    if (format?.name !== 'For Time') {
      updates.rep_scheme_type = undefined;
      updates.rep_scheme = undefined;
    }

    onUpdate(updates);
  };

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

        {/* Category - MOVED BEFORE FORMAT */}
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
                  onPress={() => handleFormatChange(format.id)}
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

        {/* FOR TIME SPECIFIC FIELDS */}
        {isForTime && (
          <>
            {/* Rep Scheme Type */}
            <View style={styles.field}>
              <Text style={styles.label}>Rep Scheme Type *</Text>
              <View style={styles.pillsContainer}>
                {[
                  { value: 'descending' as RepSchemeType, label: 'Descending' },
                  { value: 'fixed_rounds' as RepSchemeType, label: 'Fixed Rounds' },
                  { value: 'chipper' as RepSchemeType, label: 'Chipper' },
                  { value: 'ascending' as RepSchemeType, label: 'Ascending' },
                  { value: 'distance' as RepSchemeType, label: 'Distance' },
                  { value: 'custom' as RepSchemeType, label: 'Custom' },
                ].map((type) => {
                  const isSelected = formData.rep_scheme_type === type.value;
                  return (
                    <TouchableOpacity
                      key={type.value}
                      style={[styles.pill, isSelected && styles.pillSelected]}
                      onPress={() => onUpdate({ rep_scheme_type: type.value })}
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

            {/* Rep Scheme Input - Conditional based on type */}
            {formData.rep_scheme_type && (
              <View style={styles.field}>
                <Text style={styles.label}>
                  {formData.rep_scheme_type === 'descending' && 'Rep Scheme (e.g., 21-15-9) *'}
                  {formData.rep_scheme_type === 'fixed_rounds' && 'Number of Rounds (e.g., 3) *'}
                  {formData.rep_scheme_type === 'ascending' && 'Rep Scheme (e.g., 1-2-3-4-5) *'}
                  {formData.rep_scheme_type === 'distance' && 'Distance (e.g., 2000m Row) *'}
                  {formData.rep_scheme_type === 'chipper' && 'Rep Scheme *'}
                  {formData.rep_scheme_type === 'custom' && 'Custom Rep Scheme *'}
                </Text>

                {/* Show quick select buttons for common schemes */}
                {(formData.rep_scheme_type === 'descending' || formData.rep_scheme_type === 'fixed_rounds' || formData.rep_scheme_type === 'ascending') && (
                  <View style={styles.quickSelectContainer}>
                    <Text style={styles.quickSelectLabel}>Quick select:</Text>
                    <View style={styles.pillsContainer}>
                      {Object.entries(COMMON_REP_SCHEMES).map(([value, label]) => {
                        const isSelected = formData.rep_scheme === value;
                        return (
                          <TouchableOpacity
                            key={value}
                            style={[styles.quickPill, isSelected && styles.quickPillSelected]}
                            onPress={() => onUpdate({ rep_scheme: value })}
                            activeOpacity={0.7}
                          >
                            <Text style={[styles.quickPillText, isSelected && styles.quickPillTextSelected]}>
                              {label}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>
                )}

                <TextInput
                  style={styles.input}
                  placeholder={
                    formData.rep_scheme_type === 'descending' ? '21-15-9' :
                    formData.rep_scheme_type === 'fixed_rounds' ? '3' :
                    formData.rep_scheme_type === 'ascending' ? '1-2-3-4-5' :
                    formData.rep_scheme_type === 'distance' ? '2000' :
                    formData.rep_scheme_type === 'chipper' ? 'Single pass through movements' :
                    'Custom scheme'
                  }
                  placeholderTextColor={colors.mutedForeground}
                  value={formData.rep_scheme || ''}
                  onChangeText={(text) => onUpdate({ rep_scheme: text })}
                  keyboardType={formData.rep_scheme_type === 'fixed_rounds' || formData.rep_scheme_type === 'distance' ? 'number-pad' : 'default'}
                />

                {formData.rep_scheme_type === 'chipper' && (
                  <Text style={styles.helperText}>
                    For chippers, describe the scheme (e.g., "Single pass" or "50-40-30-20-10")
                  </Text>
                )}
              </View>
            )}
          </>
        )}

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
  quickSelectContainer: {
    marginBottom: 12,
  },
  quickSelectLabel: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.mutedForeground,
    marginBottom: 6,
  },
  quickPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    backgroundColor: colors.muted,
    borderWidth: 1,
    borderColor: colors.border,
  },
  quickPillSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  quickPillText: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.foreground,
  },
  quickPillTextSelected: {
    color: '#FFFFFF',
  },
  helperText: {
    fontSize: 12,
    color: colors.mutedForeground,
    marginTop: 6,
    fontStyle: 'italic',
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
