import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  StatusBar,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeft } from 'lucide-react-native';
import { colors } from '@/src/lib/colors';
import type { GoalType, MovementCategory, ScoringType } from '@/src/types/crossfit';
import {
  fetchGoalTypes,
  fetchMovementCategories,
  fetchScoringTypes,
  createMovement,
} from '@/src/lib/supabase/crossfit';
import { supabase } from '@/src/lib/supabase';
import { VariationSelector } from './VariationSelector';

interface AddMovementScreenProps {
  onClose: () => void;
  onSave: () => void;
}

export function AddMovementScreen({ onClose, onSave }: AddMovementScreenProps) {
  const insets = useSafeAreaInsets();

  // Form state
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [videoUrl, setVideoUrl] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [selectedGoalTypeId, setSelectedGoalTypeId] = useState<string | null>(null);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [selectedScoringTypeIds, setSelectedScoringTypeIds] = useState<string[]>([]);
  const [selectedVariationIds, setSelectedVariationIds] = useState<string[]>([]);

  // Reference data
  const [goalTypes, setGoalTypes] = useState<GoalType[]>([]);
  const [categories, setCategories] = useState<MovementCategory[]>([]);
  const [scoringTypes, setScoringTypes] = useState<ScoringType[]>([]);

  // UI state
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadReferenceData();
  }, []);

  const loadReferenceData = async () => {
    try {
      setLoading(true);
      const [goalTypesData, categoriesData, scoringTypesData] = await Promise.all([
        fetchGoalTypes(),
        fetchMovementCategories(),
        fetchScoringTypes(),
      ]);

      setGoalTypes(goalTypesData);
      setCategories(categoriesData);
      setScoringTypes(scoringTypesData);
    } catch (error) {
      console.error('Error loading reference data:', error);
      Alert.alert('Error', 'Failed to load form data');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    // Validation
    if (!name.trim()) {
      Alert.alert('Validation Error', 'Movement name is required');
      return;
    }

    if (!selectedGoalTypeId) {
      Alert.alert('Validation Error', 'Please select a goal type');
      return;
    }

    if (!selectedCategoryId) {
      Alert.alert('Validation Error', 'Please select a modality');
      return;
    }

    try {
      setSaving(true);

      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        Alert.alert('Error', 'You must be logged in to create a movement');
        return;
      }

      // Create movement
      await createMovement({
        name: name.trim(),
        description: description.trim() || undefined,
        goal_type_id: selectedGoalTypeId,
        movement_category_id: selectedCategoryId,
        video_url: videoUrl.trim() || undefined,
        image_url: imageUrl.trim() || undefined,
        is_movement: true,
        is_official: false,
        created_by: user.id,
        variation_option_ids: selectedVariationIds.length > 0 ? selectedVariationIds : undefined,
        scoring_type_ids: selectedScoringTypeIds.length > 0 ? selectedScoringTypeIds : undefined,
      });

      Alert.alert('Success', 'Movement created successfully!', [
        {
          text: 'OK',
          onPress: () => {
            onSave();
            onClose();
          },
        },
      ]);
    } catch (error) {
      console.error('Error creating movement:', error);
      Alert.alert('Error', 'Failed to create movement. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    const hasChanges = name.trim() || description.trim() || selectedGoalTypeId || selectedCategoryId;

    if (hasChanges) {
      Alert.alert(
        'Discard Changes?',
        'You have unsaved changes. Are you sure you want to discard them?',
        [
          { text: 'Keep Editing', style: 'cancel' },
          { text: 'Discard', style: 'destructive', onPress: onClose },
        ]
      );
    } else {
      onClose();
    }
  };

  const toggleScoringType = (id: string) => {
    setSelectedScoringTypeIds(prev =>
      prev.includes(id) ? prev.filter(typeId => typeId !== id) : [...prev, id]
    );
  };

  if (loading) {
    return (
      <>
        <StatusBar barStyle="light-content" />
        <View style={[styles.container, styles.centerContent, { paddingTop: insets.top }]}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Loading...</Text>
        </View>
      </>
    );
  }

  return (
    <>
      <StatusBar barStyle="light-content" />
      <View style={[styles.container, { paddingTop: insets.top }]}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={handleCancel} style={styles.backButton}>
            <ChevronLeft size={24} color="#FFFFFF" />
            <Text style={styles.backText}>Cancel</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Add Movement</Text>
          <TouchableOpacity
            onPress={handleSave}
            style={styles.saveButton}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <Text style={styles.saveText}>Save</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Form Content */}
        <ScrollView
          style={styles.content}
          contentContainerStyle={styles.contentContainer}
          showsVerticalScrollIndicator={false}
        >
          {/* Movement Name */}
          <View style={styles.field}>
            <Text style={styles.label}>Movement Name *</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g., Wall Ball, Kettlebell Swing, etc."
              placeholderTextColor={colors.mutedForeground}
              value={name}
              onChangeText={setName}
              autoCapitalize="words"
            />
          </View>

          {/* Modality */}
          <View style={styles.field}>
            <Text style={styles.label}>Modality *</Text>
            <View style={styles.pillsContainer}>
              {categories.map(category => {
                const isSelected = selectedCategoryId === category.id;
                return (
                  <TouchableOpacity
                    key={category.id}
                    style={[styles.pill, isSelected && styles.pillSelected]}
                    onPress={() => setSelectedCategoryId(category.id)}
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

          {/* Goal Type */}
          <View style={styles.field}>
            <Text style={styles.label}>Goal Type *</Text>
            <View style={styles.pillsContainer}>
              {goalTypes.map(goalType => {
                const isSelected = selectedGoalTypeId === goalType.id;
                return (
                  <TouchableOpacity
                    key={goalType.id}
                    style={[styles.pill, isSelected && styles.pillSelected]}
                    onPress={() => setSelectedGoalTypeId(goalType.id)}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.pillText, isSelected && styles.pillTextSelected]}>
                      {goalType.name}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* Scoring Types */}
          <View style={styles.field}>
            <Text style={styles.label}>Scoring Types (Optional)</Text>
            <Text style={styles.helperText}>Select all that apply</Text>
            <View style={styles.pillsContainer}>
              {scoringTypes.map(scoringType => {
                const isSelected = selectedScoringTypeIds.includes(scoringType.id);
                return (
                  <TouchableOpacity
                    key={scoringType.id}
                    style={[styles.pill, isSelected && styles.pillSelected]}
                    onPress={() => toggleScoringType(scoringType.id)}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.pillText, isSelected && styles.pillTextSelected]}>
                      {scoringType.name}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* Variation Selector */}
          <VariationSelector
            selectedVariationIds={selectedVariationIds}
            onSelectionChange={setSelectedVariationIds}
          />

          {/* Description */}
          <View style={styles.field}>
            <Text style={styles.label}>Description (Optional)</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              placeholder="Add notes, coaching cues, or movement standards..."
              placeholderTextColor={colors.mutedForeground}
              value={description}
              onChangeText={setDescription}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
            />
          </View>

          {/* Video URL */}
          <View style={styles.field}>
            <Text style={styles.label}>Video URL (Optional)</Text>
            <TextInput
              style={styles.input}
              placeholder="https://youtube.com/..."
              placeholderTextColor={colors.mutedForeground}
              value={videoUrl}
              onChangeText={setVideoUrl}
              autoCapitalize="none"
              keyboardType="url"
            />
          </View>

          {/* Image URL */}
          <View style={styles.field}>
            <Text style={styles.label}>Image URL (Optional)</Text>
            <TextInput
              style={styles.input}
              placeholder="https://..."
              placeholderTextColor={colors.mutedForeground}
              value={imageUrl}
              onChangeText={setImageUrl}
              autoCapitalize="none"
              keyboardType="url"
            />
          </View>

          <View style={{ height: 40 }} />
        </ScrollView>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  centerContent: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: colors.mutedForeground,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  backText: {
    fontSize: 17,
    color: '#FFFFFF',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  saveButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    minWidth: 60,
    alignItems: 'center',
  },
  saveText: {
    fontSize: 17,
    fontWeight: '600',
    color: colors.primary,
  },
  content: {
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
  helperText: {
    fontSize: 14,
    color: colors.mutedForeground,
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
    minHeight: 100,
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
});
