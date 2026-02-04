import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Alert,
  StatusBar,
  ActivityIndicator,
  Image,
  Platform,
  ActionSheetIOS,
  KeyboardAvoidingView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeft, Camera, X, ChevronDown } from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import { colors } from '@/src/lib/colors';
import { supabase } from '@/src/lib/supabase';
import { updateProgramTemplate, uploadProgramCoverImage } from '@/src/lib/supabase/training';
import type { ProgramTemplateWithRelations, DifficultyLevel, PrimaryGoal } from '@/src/types/training';

const DIFFICULTY_LEVELS: DifficultyLevel[] = ['Beginner', 'Intermediate', 'Advanced'];
const PRIMARY_GOALS: PrimaryGoal[] = ['Strength', 'Hypertrophy', 'Power', 'Endurance', 'Hybrid'];

interface EditProgramModalProps {
  program: ProgramTemplateWithRelations;
  onClose: () => void;
  onSave: () => void;
}

interface FormData {
  title: string;
  subtitle: string;
  description: string;
  coverImageUri: string | null;
  existingCoverUrl: string | null;
  durationWeeks: string;
  daysPerWeek: string;
  minutesPerSession: string;
  difficultyLevel: DifficultyLevel;
  primaryGoal: PrimaryGoal;
  author: string;
}

export function EditProgramModal({ program, onClose, onSave }: EditProgramModalProps) {
  const insets = useSafeAreaInsets();
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState<FormData>({
    title: program.title,
    subtitle: program.subtitle || '',
    description: program.description || '',
    coverImageUri: null,
    existingCoverUrl: program.cover_image_url,
    durationWeeks: program.duration_weeks.toString(),
    daysPerWeek: program.days_per_week.toString(),
    minutesPerSession: program.minutes_per_session.toString(),
    difficultyLevel: program.difficulty_level as DifficultyLevel,
    primaryGoal: program.primary_goal as PrimaryGoal,
    author: program.creator_name,
  });

  const updateField = (field: keyof FormData, value: string | null) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const showLevelPicker = () => {
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: ['Cancel', ...DIFFICULTY_LEVELS],
          cancelButtonIndex: 0,
          title: 'Select Difficulty Level',
        },
        (buttonIndex) => {
          if (buttonIndex > 0) {
            updateField('difficultyLevel', DIFFICULTY_LEVELS[buttonIndex - 1]);
          }
        }
      );
    } else {
      Alert.alert('Select Difficulty Level', '',
        DIFFICULTY_LEVELS.map(level => ({
          text: level,
          onPress: () => updateField('difficultyLevel', level),
        }))
      );
    }
  };

  const showGoalPicker = () => {
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: ['Cancel', ...PRIMARY_GOALS],
          cancelButtonIndex: 0,
          title: 'Select Primary Goal',
        },
        (buttonIndex) => {
          if (buttonIndex > 0) {
            updateField('primaryGoal', PRIMARY_GOALS[buttonIndex - 1]);
          }
        }
      );
    } else {
      Alert.alert('Select Primary Goal', '',
        PRIMARY_GOALS.map(goal => ({
          text: goal,
          onPress: () => updateField('primaryGoal', goal),
        }))
      );
    }
  };

  const requestPermissions = async () => {
    const cameraPermission = await ImagePicker.requestCameraPermissionsAsync();
    const mediaLibraryPermission = await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!cameraPermission.granted || !mediaLibraryPermission.granted) {
      Alert.alert(
        'Permissions Required',
        'Camera and photo library access are required to upload images.'
      );
      return false;
    }
    return true;
  };

  const pickImage = async () => {
    const hasPermission = await requestPermissions();
    if (!hasPermission) return;

    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: ['Cancel', 'Take Photo', 'Choose from Library'],
          cancelButtonIndex: 0,
        },
        async (buttonIndex) => {
          if (buttonIndex === 1) {
            const result = await ImagePicker.launchCameraAsync({
              allowsEditing: true,
              aspect: [16, 9],
              quality: 0.8,
            });
            if (!result.canceled && result.assets[0]) {
              updateField('coverImageUri', result.assets[0].uri);
            }
          } else if (buttonIndex === 2) {
            const result = await ImagePicker.launchImageLibraryAsync({
              mediaTypes: ImagePicker.MediaTypeOptions.Images,
              allowsEditing: true,
              aspect: [16, 9],
              quality: 0.8,
            });
            if (!result.canceled && result.assets[0]) {
              updateField('coverImageUri', result.assets[0].uri);
            }
          }
        }
      );
    } else {
      Alert.alert('Select Image', 'Choose an option', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Take Photo',
          onPress: async () => {
            const result = await ImagePicker.launchCameraAsync({
              allowsEditing: true,
              aspect: [16, 9],
              quality: 0.8,
            });
            if (!result.canceled && result.assets[0]) {
              updateField('coverImageUri', result.assets[0].uri);
            }
          },
        },
        {
          text: 'Choose from Library',
          onPress: async () => {
            const result = await ImagePicker.launchImageLibraryAsync({
              mediaTypes: ImagePicker.MediaTypeOptions.Images,
              allowsEditing: true,
              aspect: [16, 9],
              quality: 0.8,
            });
            if (!result.canceled && result.assets[0]) {
              updateField('coverImageUri', result.assets[0].uri);
            }
          },
        },
      ]);
    }
  };

  const validateForm = (): boolean => {
    if (!formData.title.trim()) {
      Alert.alert('Validation Error', 'Program title is required');
      return false;
    }

    if (!formData.author.trim()) {
      Alert.alert('Validation Error', 'Author name is required');
      return false;
    }

    const weeks = parseInt(formData.durationWeeks, 10);
    if (isNaN(weeks) || weeks < 1 || weeks > 52) {
      Alert.alert('Validation Error', 'Duration must be between 1 and 52 weeks');
      return false;
    }

    const days = parseInt(formData.daysPerWeek, 10);
    if (isNaN(days) || days < 1 || days > 7) {
      Alert.alert('Validation Error', 'Days per week must be between 1 and 7');
      return false;
    }

    const minutes = parseInt(formData.minutesPerSession, 10);
    if (isNaN(minutes) || minutes < 10 || minutes > 180) {
      Alert.alert('Validation Error', 'Minutes per session must be between 10 and 180');
      return false;
    }

    return true;
  };

  const handleSave = async () => {
    if (!validateForm()) return;

    try {
      setSaving(true);

      // Get current user
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) {
        Alert.alert('Error', 'You must be logged in to edit a program');
        return;
      }

      // Upload new cover image if provided
      let coverImageUrl: string | undefined = undefined;
      if (formData.coverImageUri) {
        const uploadedUrl = await uploadProgramCoverImage(formData.coverImageUri, user.id);
        if (uploadedUrl) {
          coverImageUrl = uploadedUrl;
        } else {
          Alert.alert('Warning', 'Failed to upload new cover image. Keeping existing image.');
        }
      }

      // Build updates object
      const updates: Record<string, any> = {
        title: formData.title.trim(),
        subtitle: formData.subtitle.trim() || null,
        description: formData.description.trim() || null,
        duration_weeks: parseInt(formData.durationWeeks, 10),
        days_per_week: parseInt(formData.daysPerWeek, 10),
        minutes_per_session: parseInt(formData.minutesPerSession, 10),
        difficulty_level: formData.difficultyLevel,
        primary_goal: formData.primaryGoal,
        creator_name: formData.author.trim(),
      };

      // Only include cover_image_url if we uploaded a new one
      if (coverImageUrl) {
        updates.cover_image_url = coverImageUrl;
      }

      const updatedProgram = await updateProgramTemplate(program.id, updates, user.id);

      if (updatedProgram) {
        onSave();
      } else {
        Alert.alert('Error', 'Failed to update program. Please try again.');
      }
    } catch (error) {
      console.error('Error updating program:', error);
      Alert.alert('Error', 'An unexpected error occurred. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const hasChanges = () => {
    return (
      formData.title !== program.title ||
      formData.subtitle !== (program.subtitle || '') ||
      formData.description !== (program.description || '') ||
      formData.coverImageUri !== null ||
      formData.durationWeeks !== program.duration_weeks.toString() ||
      formData.daysPerWeek !== program.days_per_week.toString() ||
      formData.minutesPerSession !== program.minutes_per_session.toString() ||
      formData.difficultyLevel !== program.difficulty_level ||
      formData.primaryGoal !== program.primary_goal ||
      formData.author !== program.creator_name
    );
  };

  const handleClose = () => {
    if (hasChanges()) {
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

  // Get the image to display (new image takes priority over existing)
  const displayImageUri = formData.coverImageUri || formData.existingCoverUrl;

  return (
    <>
      <StatusBar barStyle="light-content" />
      <KeyboardAvoidingView
        style={[styles.container, { paddingTop: insets.top }]}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={handleClose} style={styles.backButton}>
            <ChevronLeft size={24} color="#FFFFFF" />
            <Text style={styles.backText}>Cancel</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Edit Program</Text>
          <View style={styles.headerRight} />
        </View>

        {/* Form Content */}
        <ScrollView
          style={styles.content}
          contentContainerStyle={styles.contentContainer}
          keyboardShouldPersistTaps="handled"
        >
          {/* Cover Image */}
          <View style={styles.field}>
            <Text style={styles.label}>Cover Image</Text>
            <TouchableOpacity
              style={styles.imagePicker}
              onPress={pickImage}
              activeOpacity={0.7}
            >
              {displayImageUri ? (
                <View style={styles.selectedImageContainer}>
                  <Image
                    source={{ uri: displayImageUri }}
                    style={styles.selectedImage}
                  />
                  <TouchableOpacity
                    style={styles.removeImageButton}
                    onPress={() => {
                      updateField('coverImageUri', null);
                      updateField('existingCoverUrl', null);
                    }}
                  >
                    <X size={16} color="#FFFFFF" />
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={styles.imagePlaceholder}>
                  <Camera size={40} color={colors.mutedForeground} />
                  <Text style={styles.imagePlaceholderText}>
                    Tap to add cover image
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          </View>

          {/* Title (Required) */}
          <View style={styles.field}>
            <Text style={styles.label}>Title *</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g., 12-Week Strength Builder"
              placeholderTextColor={colors.mutedForeground}
              value={formData.title}
              onChangeText={(v) => updateField('title', v)}
              autoCapitalize="words"
              maxLength={100}
            />
          </View>

          {/* Subtitle */}
          <View style={styles.field}>
            <Text style={styles.label}>Subtitle</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g., Build strength with progressive overload"
              placeholderTextColor={colors.mutedForeground}
              value={formData.subtitle}
              onChangeText={(v) => updateField('subtitle', v)}
              autoCapitalize="sentences"
              maxLength={150}
            />
          </View>

          {/* Description */}
          <View style={styles.field}>
            <Text style={styles.label}>Description</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              placeholder="Describe your program..."
              placeholderTextColor={colors.mutedForeground}
              value={formData.description}
              onChangeText={(v) => updateField('description', v)}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
              maxLength={1000}
            />
          </View>

          {/* Author */}
          <View style={styles.field}>
            <Text style={styles.label}>Author *</Text>
            <TextInput
              style={styles.input}
              placeholder="Your name"
              placeholderTextColor={colors.mutedForeground}
              value={formData.author}
              onChangeText={(v) => updateField('author', v)}
              autoCapitalize="words"
              maxLength={100}
            />
          </View>

          {/* Level & Goal Row */}
          <View style={styles.rowFields}>
            <View style={[styles.field, styles.fieldHalf]}>
              <Text style={styles.label}>Level</Text>
              <TouchableOpacity
                style={styles.dropdownButton}
                onPress={showLevelPicker}
                activeOpacity={0.7}
              >
                <Text style={styles.dropdownText}>{formData.difficultyLevel}</Text>
                <ChevronDown size={20} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>
            <View style={[styles.field, styles.fieldHalf]}>
              <Text style={styles.label}>Goal</Text>
              <TouchableOpacity
                style={styles.dropdownButton}
                onPress={showGoalPicker}
                activeOpacity={0.7}
              >
                <Text style={styles.dropdownText}>{formData.primaryGoal}</Text>
                <ChevronDown size={20} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>
          </View>

          {/* Duration & Schedule Row */}
          <View style={styles.rowFields}>
            <View style={[styles.field, styles.fieldThird]}>
              <Text style={styles.label}>Weeks</Text>
              <TextInput
                style={styles.input}
                placeholder="8"
                placeholderTextColor={colors.mutedForeground}
                value={formData.durationWeeks}
                onChangeText={(v) => updateField('durationWeeks', v.replace(/[^0-9]/g, ''))}
                keyboardType="number-pad"
                maxLength={2}
              />
            </View>
            <View style={[styles.field, styles.fieldThird]}>
              <Text style={styles.label}>Days/Week</Text>
              <TextInput
                style={styles.input}
                placeholder="4"
                placeholderTextColor={colors.mutedForeground}
                value={formData.daysPerWeek}
                onChangeText={(v) => updateField('daysPerWeek', v.replace(/[^0-9]/g, ''))}
                keyboardType="number-pad"
                maxLength={1}
              />
            </View>
            <View style={[styles.field, styles.fieldThird]}>
              <Text style={styles.label}>Min/Session</Text>
              <TextInput
                style={styles.input}
                placeholder="60"
                placeholderTextColor={colors.mutedForeground}
                value={formData.minutesPerSession}
                onChangeText={(v) => updateField('minutesPerSession', v.replace(/[^0-9]/g, ''))}
                keyboardType="number-pad"
                maxLength={3}
              />
            </View>
          </View>
        </ScrollView>

        {/* Footer with Save Button */}
        <View style={[styles.footer, { paddingBottom: insets.bottom + 20 }]}>
          <TouchableOpacity
            style={[styles.saveButton, saving && styles.saveButtonDisabled]}
            onPress={handleSave}
            activeOpacity={0.8}
            disabled={saving}
          >
            {saving ? (
              <View style={styles.savingContainer}>
                <ActivityIndicator color="#FFFFFF" size="small" />
                <Text style={styles.savingText}>Saving Changes...</Text>
              </View>
            ) : (
              <Text style={styles.saveButtonText}>Save Changes</Text>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
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
    minWidth: 80,
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
  headerRight: {
    minWidth: 80,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 20,
  },
  field: {
    marginBottom: 20,
  },
  fieldThird: {
    flex: 1,
  },
  fieldHalf: {
    flex: 1,
  },
  rowFields: {
    flexDirection: 'row',
    gap: 12,
  },
  dropdownButton: {
    backgroundColor: colors.secondary,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dropdownText: {
    fontSize: 16,
    color: colors.foreground,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.foreground,
    marginBottom: 8,
  },
  input: {
    backgroundColor: colors.secondary,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: colors.foreground,
  },
  textArea: {
    height: 100,
    paddingTop: 12,
  },
  imagePicker: {
    backgroundColor: colors.secondary,
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: 12,
    borderStyle: 'dashed',
    overflow: 'hidden',
    aspectRatio: 16 / 9,
  },
  selectedImageContainer: {
    flex: 1,
    position: 'relative',
  },
  selectedImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  removeImageButton: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    borderRadius: 16,
    padding: 6,
  },
  imagePlaceholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  imagePlaceholderText: {
    marginTop: 12,
    fontSize: 14,
    color: colors.mutedForeground,
  },
  footer: {
    padding: 20,
    paddingTop: 16,
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
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    fontSize: 17,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  savingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  savingText: {
    fontSize: 15,
    fontWeight: '500',
    color: '#FFFFFF',
  },
});
