import { useState } from 'react';
import {
  View,
  Text,
  Modal,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
} from 'react-native';
import { Star, X } from 'lucide-react-native';
import { supabase } from '@/src/lib/supabase';

interface SleepQualityModalProps {
  visible: boolean;
  sleepSessionId: string | null;
  onClose: () => void;
  onComplete?: () => void;
}

const QUALITY_LABELS = [
  'Poor',
  'Below Average',
  'Average',
  'Good',
  'Excellent',
];

export default function SleepQualityModal({
  visible,
  sleepSessionId,
  onClose,
  onComplete,
}: SleepQualityModalProps) {
  const [qualityRating, setQualityRating] = useState<number | null>(null);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!qualityRating) {
      Alert.alert('Rating Required', 'Please select a sleep quality rating');
      return;
    }

    if (!sleepSessionId) {
      Alert.alert('Error', 'No sleep session found');
      return;
    }

    try {
      setSaving(true);

      const { error } = await supabase
        .from('sleep_sessions')
        .update({
          quality_rating: qualityRating,
          notes: notes.trim() || null,
        })
        .eq('id', sleepSessionId);

      if (error) {
        console.error('Error updating sleep quality:', error);
        Alert.alert('Error', 'Failed to save sleep quality. Please try again.');
        return;
      }

      // Reset form
      setQualityRating(null);
      setNotes('');

      // Close modal
      onClose();

      // Notify completion
      if (onComplete) {
        onComplete();
      }
    } catch (error) {
      console.error('Error saving sleep quality:', error);
      Alert.alert('Error', 'Failed to save sleep quality. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleSkip = () => {
    // Reset form
    setQualityRating(null);
    setNotes('');

    // Close modal without saving quality
    onClose();

    // Notify completion
    if (onComplete) {
      onComplete();
    }
  };

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="slide"
      onRequestClose={handleSkip}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.overlay}
      >
        <View style={styles.modalContainer}>
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {/* Header */}
            <View style={styles.header}>
              <Text style={styles.title}>How did you sleep?</Text>
              <TouchableOpacity onPress={handleSkip} style={styles.closeButton}>
                <X size={24} color="#9CA3AF" />
              </TouchableOpacity>
            </View>

            {/* Quality Rating */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Sleep Quality</Text>
              <Text style={styles.sectionSubtitle}>
                Rate how well you slept (1 = Poor, 5 = Excellent)
              </Text>

              <View style={styles.starsContainer}>
                {[1, 2, 3, 4, 5].map((rating) => (
                  <TouchableOpacity
                    key={rating}
                    onPress={() => setQualityRating(rating)}
                    style={styles.starButton}
                    activeOpacity={0.7}
                  >
                    <Star
                      size={40}
                      color={qualityRating && qualityRating >= rating ? '#FBBF24' : '#374151'}
                      fill={qualityRating && qualityRating >= rating ? '#FBBF24' : 'transparent'}
                      strokeWidth={2}
                    />
                  </TouchableOpacity>
                ))}
              </View>

              {qualityRating && (
                <Text style={styles.qualityLabel}>
                  {QUALITY_LABELS[qualityRating - 1]}
                </Text>
              )}
            </View>

            {/* Notes */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Notes (Optional)</Text>
              <TextInput
                style={styles.textArea}
                placeholder="Any notes about your sleep? (e.g., woke up several times, had dreams, etc.)"
                placeholderTextColor="#6B7280"
                value={notes}
                onChangeText={setNotes}
                multiline
                numberOfLines={4}
                textAlignVertical="top"
              />
            </View>

            {/* Buttons */}
            <View style={styles.buttonContainer}>
              <TouchableOpacity
                style={[styles.button, styles.skipButton]}
                onPress={handleSkip}
                disabled={saving}
              >
                <Text style={styles.skipButtonText}>Skip for Now</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.button,
                  styles.saveButton,
                  (!qualityRating || saving) && styles.saveButtonDisabled,
                ]}
                onPress={handleSave}
                disabled={!qualityRating || saving}
              >
                <Text style={styles.saveButtonText}>
                  {saving ? 'Saving...' : 'Save & Continue'}
                </Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'flex-end',
  },
  modalContainer: {
    backgroundColor: '#111827',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '85%',
  },
  scrollContent: {
    padding: 24,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFFFFF',
    flex: 1,
  },
  closeButton: {
    padding: 4,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  sectionSubtitle: {
    fontSize: 14,
    color: '#9CA3AF',
    marginBottom: 16,
  },
  starsContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 12,
    marginVertical: 16,
  },
  starButton: {
    padding: 8,
  },
  qualityLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FBBF24',
    textAlign: 'center',
    marginTop: 8,
  },
  textArea: {
    backgroundColor: '#1F2937',
    borderRadius: 12,
    padding: 16,
    color: '#FFFFFF',
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#374151',
    minHeight: 100,
  },
  buttonContainer: {
    gap: 12,
    marginTop: 8,
  },
  button: {
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  skipButton: {
    backgroundColor: '#1F2937',
    borderWidth: 1,
    borderColor: '#374151',
  },
  skipButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#9CA3AF',
  },
  saveButton: {
    backgroundColor: '#22C55E',
  },
  saveButtonDisabled: {
    backgroundColor: '#374151',
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});
