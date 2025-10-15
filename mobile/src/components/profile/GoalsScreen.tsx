import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  StatusBar,
} from 'react-native';
import { ChevronLeft } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '@/src/lib/supabase';

interface GoalsScreenProps {
  userId: string;
  initialData: {
    height_cm: string;
    target_weight_kg: string;
    target_calories: string;
  };
  onClose: () => void;
  onSave: () => void;
}

export function GoalsScreen({ userId, initialData, onClose, onSave }: GoalsScreenProps) {
  const insets = useSafeAreaInsets();
  const [formData, setFormData] = useState(initialData);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    try {
      setSaving(true);

      const { error } = await supabase
        .from('profiles')
        .update({
          height_cm: formData.height_cm ? parseFloat(formData.height_cm) : null,
          target_weight_kg: formData.target_weight_kg
            ? parseFloat(formData.target_weight_kg)
            : null,
          target_calories: formData.target_calories
            ? parseInt(formData.target_calories)
            : null,
        })
        .eq('id', userId);

      if (error) throw error;

      onSave();
      onClose();
    } catch (error) {
      console.error('Error saving goals:', error);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <StatusBar barStyle="light-content" />
      <View style={[styles.container, { paddingTop: insets.top }]}>
        {/* Header */}
        <View style={styles.header}>
        <TouchableOpacity onPress={onClose} style={styles.backButton}>
          <ChevronLeft size={24} color="#FFFFFF" />
          <Text style={styles.backText}>Profile</Text>
        </TouchableOpacity>
      </View>

      {/* Content */}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.pageTitle}>Fitness Goals</Text>
          <Text style={styles.pageSubtitle}>
            Set your personal fitness goals and targets
          </Text>

          <View style={styles.card}>
            <View style={styles.row}>
              <View style={styles.halfField}>
                <Text style={styles.label}>Height (cm)</Text>
                <TextInput
                  style={styles.input}
                  placeholder="175"
                  placeholderTextColor="#6B7280"
                  value={formData.height_cm}
                  onChangeText={(text) =>
                    setFormData({ ...formData, height_cm: text })
                  }
                  keyboardType="decimal-pad"
                  editable={!saving}
                />
              </View>

              <View style={styles.halfField}>
                <Text style={styles.label}>Target Weight (kg)</Text>
                <TextInput
                  style={styles.input}
                  placeholder="70"
                  placeholderTextColor="#6B7280"
                  value={formData.target_weight_kg}
                  onChangeText={(text) =>
                    setFormData({ ...formData, target_weight_kg: text })
                  }
                  keyboardType="decimal-pad"
                  editable={!saving}
                />
              </View>
            </View>

            <View style={styles.formField}>
              <Text style={styles.label}>Daily Calorie Goal</Text>
              <TextInput
                style={styles.input}
                placeholder="2000"
                placeholderTextColor="#6B7280"
                value={formData.target_calories}
                onChangeText={(text) =>
                  setFormData({ ...formData, target_calories: text })
                }
                keyboardType="number-pad"
                editable={!saving}
              />
            </View>
          </View>

          <TouchableOpacity
            style={[styles.saveButton, saving && styles.saveButtonDisabled]}
            onPress={handleSave}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.saveButtonText}>Save Changes</Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0F1E',
  },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1F2937',
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
  keyboardView: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 100,
  },
  pageTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 8,
  },
  pageSubtitle: {
    fontSize: 14,
    color: '#9CA3AF',
    marginBottom: 24,
  },
  card: {
    backgroundColor: '#111827',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#1F2937',
    marginBottom: 16,
  },
  formField: {
    marginBottom: 16,
  },
  row: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 16,
  },
  halfField: {
    flex: 1,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    color: '#D1D5DB',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#1F2937',
    borderWidth: 1,
    borderColor: '#374151',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: '#FFFFFF',
  },
  saveButton: {
    backgroundColor: '#22C55E',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  saveButtonDisabled: {
    opacity: 0.5,
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
});
