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
  Modal,
  Switch,
} from 'react-native';
import { ChevronLeft } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import DateTimePicker from '@react-native-community/datetimepicker';
import { supabase } from '@/src/lib/supabase';

interface GoalsScreenProps {
  userId: string;
  initialData: {
    height_cm: string;
    target_weight_kg: string;
    target_calories: string;
    target_water_oz: string;
    water_window_start: string;  // "HH:MM"
    water_window_end: string;    // "HH:MM"
    water_workout_bonus_oz: string;
    water_display_unit: 'oz' | 'L';
    water_only_counts: boolean;
  };
  onClose: () => void;
  onSave: () => void;
}

function formatTimeLabel(hhmm: string): string {
  const [h, m] = hhmm.split(':').map((s) => parseInt(s, 10));
  const ampm = h >= 12 ? 'PM' : 'AM';
  const display = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${display}:${String(m).padStart(2, '0')} ${ampm}`;
}

function hhmmFromDate(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function dateFromHhmm(hhmm: string): Date {
  const [h, m] = hhmm.split(':').map((s) => parseInt(s, 10));
  const d = new Date();
  d.setHours(h, m || 0, 0, 0);
  return d;
}

type WaterUnit = 'oz' | 'L';

const OZ_PER_LITER = 33.814;

export function GoalsScreen({ userId, initialData, onClose, onSave }: GoalsScreenProps) {
  const insets = useSafeAreaInsets();
  const [formData, setFormData] = useState(initialData);
  const [waterUnit, setWaterUnit] = useState<WaterUnit>('oz');
  const [waterInput, setWaterInput] = useState(initialData.target_water_oz);
  const [saving, setSaving] = useState(false);
  const [pickerTarget, setPickerTarget] = useState<null | 'start' | 'end'>(null);

  const handleWaterUnitChange = (next: WaterUnit) => {
    if (next === waterUnit) return;
    const parsed = parseFloat(waterInput);
    if (!isNaN(parsed)) {
      if (next === 'L') {
        setWaterInput((parsed / OZ_PER_LITER).toFixed(2));
      } else {
        setWaterInput(Math.round(parsed * OZ_PER_LITER).toString());
      }
    }
    setWaterUnit(next);
  };

  const handleSave = async () => {
    try {
      setSaving(true);

      let waterOz: number | null = null;
      if (waterInput.trim() !== '') {
        const parsed = parseFloat(waterInput);
        if (isNaN(parsed) || parsed <= 0) {
          console.error('Invalid water goal');
          setSaving(false);
          return;
        }
        waterOz =
          waterUnit === 'oz'
            ? Math.round(parsed)
            : Math.round(parsed * OZ_PER_LITER);
      }

      // Validate window: end > start
      if (formData.water_window_end <= formData.water_window_start) {
        console.error('Water pace end must be after start');
        setSaving(false);
        return;
      }

      const bonusOz = formData.water_workout_bonus_oz.trim() === ''
        ? 0
        : Math.max(0, Math.round(parseFloat(formData.water_workout_bonus_oz) || 0));

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
          ...(waterOz !== null && { target_water_oz: waterOz }),
          water_window_start: formData.water_window_start,
          water_window_end: formData.water_window_end,
          water_workout_bonus_oz: bonusOz,
          water_display_unit: formData.water_display_unit,
          water_only_counts: formData.water_only_counts,
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

            <View style={styles.formField}>
              <View style={styles.labelRow}>
                <Text style={styles.label}>Daily Water Goal</Text>
                <View style={styles.unitToggle}>
                  {(['oz', 'L'] as WaterUnit[]).map((unit) => (
                    <TouchableOpacity
                      key={unit}
                      style={[
                        styles.unitButton,
                        waterUnit === unit && styles.unitButtonActive,
                      ]}
                      onPress={() => handleWaterUnitChange(unit)}
                      disabled={saving}
                    >
                      <Text
                        style={[
                          styles.unitButtonText,
                          waterUnit === unit && styles.unitButtonTextActive,
                        ]}
                      >
                        {unit}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
              <TextInput
                style={styles.input}
                placeholder={waterUnit === 'oz' ? '64' : '2'}
                placeholderTextColor="#6B7280"
                value={waterInput}
                onChangeText={setWaterInput}
                keyboardType="decimal-pad"
                editable={!saving}
              />
            </View>

            <View style={styles.formField}>
              <Text style={styles.label}>Water Pace Window</Text>
              <Text style={styles.fieldHelp}>
                Hours we use to compute your hydration pace each day.
              </Text>
              <View style={styles.row}>
                <View style={styles.halfField}>
                  <Text style={styles.subLabel}>Start</Text>
                  <TouchableOpacity
                    style={styles.input}
                    onPress={() => setPickerTarget('start')}
                    disabled={saving}
                  >
                    <Text style={styles.timeButtonText}>
                      {formatTimeLabel(formData.water_window_start)}
                    </Text>
                  </TouchableOpacity>
                </View>
                <View style={styles.halfField}>
                  <Text style={styles.subLabel}>End</Text>
                  <TouchableOpacity
                    style={styles.input}
                    onPress={() => setPickerTarget('end')}
                    disabled={saving}
                  >
                    <Text style={styles.timeButtonText}>
                      {formatTimeLabel(formData.water_window_end)}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>

            <View style={styles.formField}>
              <Text style={styles.label}>Workout Water Bonus (oz)</Text>
              <Text style={styles.fieldHelp}>
                Extra oz added to your goal automatically on days you work out.
                Set to 0 to disable.
              </Text>
              <TextInput
                style={styles.input}
                placeholder="0"
                placeholderTextColor="#6B7280"
                value={formData.water_workout_bonus_oz}
                onChangeText={(text) =>
                  setFormData({ ...formData, water_workout_bonus_oz: text })
                }
                keyboardType="number-pad"
                editable={!saving}
              />
            </View>

            <View style={styles.formField}>
              <View style={styles.labelRow}>
                <Text style={styles.label}>Display Water In</Text>
                <View style={styles.unitToggle}>
                  {(['oz', 'L'] as const).map((unit) => (
                    <TouchableOpacity
                      key={unit}
                      style={[
                        styles.unitButton,
                        formData.water_display_unit === unit && styles.unitButtonActive,
                      ]}
                      onPress={() =>
                        setFormData({ ...formData, water_display_unit: unit })
                      }
                      disabled={saving}
                    >
                      <Text
                        style={[
                          styles.unitButtonText,
                          formData.water_display_unit === unit && styles.unitButtonTextActive,
                        ]}
                      >
                        {unit}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
              <Text style={styles.fieldHelp}>
                Where you see water amounts on the Water Intake screen.
              </Text>
            </View>

            <View style={styles.formField}>
              <View style={styles.switchRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>Only Water Counts</Text>
                  <Text style={styles.fieldHelp}>
                    When on, coffee/tea/juice/other don't count toward your daily
                    goal or streaks. They still show up in History.
                  </Text>
                </View>
                <Switch
                  value={formData.water_only_counts}
                  onValueChange={(v) =>
                    setFormData({ ...formData, water_only_counts: v })
                  }
                  trackColor={{ false: '#374151', true: '#3B82F6' }}
                  thumbColor="#FFFFFF"
                  disabled={saving}
                />
              </View>
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

      {/* Time picker modal */}
      {Platform.OS === 'ios' ? (
        <Modal
          visible={pickerTarget !== null}
          transparent
          animationType="fade"
          onRequestClose={() => setPickerTarget(null)}
        >
          <View style={styles.modalBackdrop}>
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>
                {pickerTarget === 'start' ? 'Window Start' : 'Window End'}
              </Text>
              <DateTimePicker
                value={dateFromHhmm(
                  pickerTarget === 'start'
                    ? formData.water_window_start
                    : formData.water_window_end
                )}
                mode="time"
                display="spinner"
                onChange={(_e, picked) => {
                  if (picked) {
                    const hhmm = hhmmFromDate(picked);
                    setFormData((prev) =>
                      pickerTarget === 'start'
                        ? { ...prev, water_window_start: hhmm }
                        : { ...prev, water_window_end: hhmm }
                    );
                  }
                }}
                textColor="#FFFFFF"
              />
              <TouchableOpacity
                style={styles.modalDoneButton}
                onPress={() => setPickerTarget(null)}
              >
                <Text style={styles.modalDoneButtonText}>Done</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      ) : (
        pickerTarget !== null && (
          <DateTimePicker
            value={dateFromHhmm(
              pickerTarget === 'start'
                ? formData.water_window_start
                : formData.water_window_end
            )}
            mode="time"
            display="default"
            onChange={(_e, picked) => {
              const target = pickerTarget;
              setPickerTarget(null);
              if (picked && target) {
                const hhmm = hhmmFromDate(picked);
                setFormData((prev) =>
                  target === 'start'
                    ? { ...prev, water_window_start: hhmm }
                    : { ...prev, water_window_end: hhmm }
                );
              }
            }}
          />
        )
      )}
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
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  unitToggle: {
    flexDirection: 'row',
    backgroundColor: '#1F2937',
    borderRadius: 6,
    padding: 2,
    gap: 2,
  },
  unitButton: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 4,
  },
  unitButtonActive: {
    backgroundColor: '#3B82F6',
  },
  unitButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#9CA3AF',
  },
  unitButtonTextActive: {
    color: '#FFFFFF',
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
  subLabel: {
    fontSize: 12,
    color: '#9CA3AF',
    marginBottom: 6,
  },
  fieldHelp: {
    fontSize: 12,
    color: '#9CA3AF',
    marginBottom: 10,
    marginTop: -2,
  },
  timeButtonText: {
    fontSize: 16,
    color: '#FFFFFF',
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalCard: {
    width: '100%',
    backgroundColor: '#111827',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#1F2937',
    gap: 12,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
    textAlign: 'center',
  },
  modalDoneButton: {
    backgroundColor: '#22C55E',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  modalDoneButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
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
