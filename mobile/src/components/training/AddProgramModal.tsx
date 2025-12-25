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
import { ChevronLeft, Camera, X } from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import { colors } from '@/src/lib/colors';
import { supabase } from '@/src/lib/supabase';
import { createProgramTemplate, uploadProgramCoverImage } from '@/src/lib/supabase/training';
import type { CreateProgramTemplateInput } from '@/src/types/training';

interface AddProgramModalProps {
  onClose: () => void;
  onSave: (programId: string) => void;
}

interface FormData {
  title: string;
  subtitle: string;
  description: string;
  coverImageUri: string | null;
  durationWeeks: string;
  daysPerWeek: string;
  minutesPerSession: string;
}

export function AddProgramModal({ onClose, onSave }: AddProgramModalProps) {
  const insets = useSafeAreaInsets();
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState<FormData>({
    title: '',
    subtitle: '',
    description: '',
    coverImageUri: null,
    durationWeeks: '8',
    daysPerWeek: '4',
    minutesPerSession: '60',
  });

  const updateField = (field: keyof FormData, value: string | null) => {
    setFormData(prev => ({ ...prev, [field]: value }));
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
      // Android fallback
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
        Alert.alert('Error', 'You must be logged in to create a program');
        return;
      }

      // Get user's display name (from user_metadata or email)
      const creatorName = user.user_metadata?.full_name ||
                          user.user_metadata?.name ||
                          user.email?.split('@')[0] ||
                          'Unknown';

      // Upload cover image if provided
      let coverImageUrl: string | null = null;
      if (formData.coverImageUri) {
        coverImageUrl = await uploadProgramCoverImage(formData.coverImageUri, user.id);
        if (!coverImageUrl) {
          Alert.alert('Warning', 'Failed to upload cover image. Program will be created without it.');
        }
      }

      // Create program
      const input: CreateProgramTemplateInput = {
        title: formData.title.trim(),
        subtitle: formData.subtitle.trim() || undefined,
        description: formData.description.trim() || undefined,
        duration_weeks: parseInt(formData.durationWeeks, 10),
        days_per_week: parseInt(formData.daysPerWeek, 10),
        minutes_per_session: parseInt(formData.minutesPerSession, 10),
        cover_image_url: coverImageUrl || undefined,
      };

      const program = await createProgramTemplate(input, user.id, creatorName);

      if (program) {
        Alert.alert(
          'Success',
          'Program created successfully! You can now add workouts and exercises.',
          [
            {
              text: 'OK',
              onPress: () => onSave(program.id),
            },
          ]
        );
      } else {
        Alert.alert('Error', 'Failed to create program. Please try again.');
      }
    } catch (error) {
      console.error('Error creating program:', error);
      Alert.alert('Error', 'An unexpected error occurred. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleClose = () => {
    const hasChanges = formData.title.trim() ||
                       formData.subtitle.trim() ||
                       formData.description.trim() ||
                       formData.coverImageUri;

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
          <Text style={styles.headerTitle}>New Program</Text>
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
              {formData.coverImageUri ? (
                <View style={styles.selectedImageContainer}>
                  <Image
                    source={{ uri: formData.coverImageUri }}
                    style={styles.selectedImage}
                  />
                  <TouchableOpacity
                    style={styles.removeImageButton}
                    onPress={() => updateField('coverImageUri', null)}
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

          {/* Info Note */}
          <View style={styles.infoNote}>
            <Text style={styles.infoNoteText}>
              You can add workouts, exercises, goals, and tags after creating the program.
            </Text>
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
                <Text style={styles.savingText}>Creating Program...</Text>
              </View>
            ) : (
              <Text style={styles.saveButtonText}>Create Program</Text>
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
  rowFields: {
    flexDirection: 'row',
    gap: 12,
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
  infoNote: {
    backgroundColor: colors.secondary,
    borderRadius: 8,
    padding: 12,
    marginTop: 8,
  },
  infoNoteText: {
    fontSize: 13,
    color: colors.mutedForeground,
    lineHeight: 18,
    textAlign: 'center',
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
