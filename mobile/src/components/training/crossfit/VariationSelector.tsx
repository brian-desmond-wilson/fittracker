import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Modal,
  Alert,
} from 'react-native';
import { X, Plus } from 'lucide-react-native';
import { colors } from '@/src/lib/colors';
import type { VariationOptionWithCategory, VariationCategory } from '@/src/types/crossfit';
import { fetchVariationOptions, createVariationOption } from '@/src/lib/supabase/crossfit';

interface VariationSelectorProps {
  selectedVariationIds: string[];
  onSelectionChange: (ids: string[]) => void;
}

export function VariationSelector({ selectedVariationIds, onSelectionChange }: VariationSelectorProps) {
  const [variations, setVariations] = useState<VariationOptionWithCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [addModalVisible, setAddModalVisible] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<VariationCategory | null>(null);
  const [newVariationName, setNewVariationName] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadVariations();
  }, []);

  const loadVariations = async () => {
    try {
      setLoading(true);
      const data = await fetchVariationOptions();
      setVariations(data);
    } catch (error) {
      console.error('Error loading variations:', error);
      Alert.alert('Error', 'Failed to load variation options');
    } finally {
      setLoading(false);
    }
  };

  const toggleVariation = (variationId: string) => {
    const isSelected = selectedVariationIds.includes(variationId);
    const newSelection = isSelected
      ? selectedVariationIds.filter(id => id !== variationId)
      : [...selectedVariationIds, variationId];

    onSelectionChange(newSelection);
  };

  const handleAddNewVariation = (category: VariationCategory) => {
    setSelectedCategory(category);
    setNewVariationName('');
    setAddModalVisible(true);
  };

  const handleSaveNewVariation = async () => {
    if (!newVariationName.trim() || !selectedCategory) {
      Alert.alert('Error', 'Please enter a variation name');
      return;
    }

    try {
      setSaving(true);
      const newId = await createVariationOption(
        selectedCategory.id,
        newVariationName.trim()
      );

      // Reload variations to include the new one
      await loadVariations();

      // Auto-select the new variation
      onSelectionChange([...selectedVariationIds, newId]);

      setAddModalVisible(false);
      setNewVariationName('');
    } catch (error) {
      console.error('Error creating variation:', error);
      Alert.alert('Error', 'Failed to create variation option');
    } finally {
      setSaving(false);
    }
  };

  // Group variations by category
  const groupedVariations: Record<string, { category: VariationCategory; options: VariationOptionWithCategory[] }> = {};

  variations.forEach(variation => {
    const categoryName = variation.category.name;
    if (!groupedVariations[categoryName]) {
      groupedVariations[categoryName] = {
        category: variation.category,
        options: [],
      };
    }
    groupedVariations[categoryName].options.push(variation);
  });

  // Sort by category display_order
  const sortedCategories = Object.values(groupedVariations).sort(
    (a, b) => a.category.display_order - b.category.display_order
  );

  if (loading) {
    return (
      <View style={styles.container}>
        <Text style={styles.loadingText}>Loading variations...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.sectionTitle}>Variations (Optional)</Text>
      <Text style={styles.helperText}>
        Select variations that apply to this movement
      </Text>

      <ScrollView style={styles.categoryList} showsVerticalScrollIndicator={false}>
        {sortedCategories.map(({ category, options }) => (
          <View key={category.id} style={styles.categorySection}>
            <View style={styles.categoryHeader}>
              <Text style={styles.categoryName}>{category.name}</Text>
              <TouchableOpacity
                style={styles.addButton}
                onPress={() => handleAddNewVariation(category)}
              >
                <Plus size={16} color={colors.primary} />
                <Text style={styles.addButtonText}>Add</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.optionChipsContainer}>
              {options.map(option => {
                const isSelected = selectedVariationIds.includes(option.id);
                return (
                  <TouchableOpacity
                    key={option.id}
                    style={[
                      styles.optionChip,
                      isSelected && styles.optionChipSelected,
                    ]}
                    onPress={() => toggleVariation(option.id)}
                    activeOpacity={0.7}
                  >
                    <Text
                      style={[
                        styles.optionChipText,
                        isSelected && styles.optionChipTextSelected,
                      ]}
                    >
                      {option.name}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        ))}
      </ScrollView>

      {/* Add New Variation Modal */}
      <Modal
        visible={addModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setAddModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                Add {selectedCategory?.name} Variation
              </Text>
              <TouchableOpacity
                onPress={() => setAddModalVisible(false)}
                style={styles.closeButton}
              >
                <X size={24} color={colors.foreground} />
              </TouchableOpacity>
            </View>

            <TextInput
              style={styles.input}
              placeholder={`e.g., ${selectedCategory?.name === 'Position' ? 'Sumo' : 'Custom'}`}
              placeholderTextColor={colors.mutedForeground}
              value={newVariationName}
              onChangeText={setNewVariationName}
              autoFocus
            />

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.button, styles.cancelButton]}
                onPress={() => setAddModalVisible(false)}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.button, styles.saveButton]}
                onPress={handleSaveNewVariation}
                disabled={saving || !newVariationName.trim()}
              >
                <Text style={styles.saveButtonText}>
                  {saving ? 'Saving...' : 'Add'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.foreground,
    marginBottom: 4,
  },
  helperText: {
    fontSize: 14,
    color: colors.mutedForeground,
    marginBottom: 12,
  },
  loadingText: {
    fontSize: 14,
    color: colors.mutedForeground,
    textAlign: 'center',
    paddingVertical: 20,
  },
  categoryList: {
    maxHeight: 300,
  },
  categorySection: {
    marginBottom: 20,
  },
  categoryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  categoryName: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.mutedForeground,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  addButtonText: {
    fontSize: 14,
    color: colors.primary,
    fontWeight: '500',
  },
  optionChipsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  optionChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    backgroundColor: colors.muted,
    borderWidth: 1,
    borderColor: colors.border,
  },
  optionChipSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  optionChipText: {
    fontSize: 14,
    color: colors.foreground,
    fontWeight: '500',
  },
  optionChipTextSelected: {
    color: '#FFFFFF',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: colors.background,
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 400,
    borderWidth: 1,
    borderColor: colors.border,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.foreground,
  },
  closeButton: {
    padding: 4,
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
    marginBottom: 20,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
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
});
