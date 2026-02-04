import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  StatusBar,
  ActivityIndicator,
  Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ChevronLeft, Save, Plus } from "lucide-react-native";
import { colors } from "@/src/lib/colors";
import { WODFormat, WODCategory, CreateWODInput } from "@/src/types/crossfit";
import {
  fetchWODFormats,
  fetchWODCategories,
  createWOD,
} from "@/src/lib/supabase/crossfit";
import { supabase } from "@/src/lib/supabase";

interface CreateWODScreenProps {
  onClose: () => void;
  onSave?: () => void;
}

export function CreateWODScreen({ onClose, onSave }: CreateWODScreenProps) {
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Form state
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [selectedFormatId, setSelectedFormatId] = useState("");
  const [selectedCategoryId, setSelectedCategoryId] = useState("");
  const [timeCap, setTimeCap] = useState("");

  // Reference data
  const [formats, setFormats] = useState<WODFormat[]>([]);
  const [categories, setCategories] = useState<WODCategory[]>([]);

  // Score types
  const [scoreTime, setScoreTime] = useState(false);
  const [scoreRounds, setScoreRounds] = useState(false);
  const [scoreReps, setScoreReps] = useState(false);
  const [scoreLoad, setScoreLoad] = useState(false);
  const [scoreDistance, setScoreDistance] = useState(false);
  const [scoreCalories, setScoreCalories] = useState(false);

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

      // Set default selections
      if (formatsData.length > 0) {
        setSelectedFormatId(formatsData[0].id);
      }
      if (categoriesData.length > 0) {
        const dailyWod = categoriesData.find((c) => c.name === "Daily WOD");
        setSelectedCategoryId(dailyWod?.id || categoriesData[0].id);
      }
    } catch (error) {
      console.error("Error loading reference data:", error);
      Alert.alert("Error", "Failed to load WOD configuration");
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    // Validation
    if (!name.trim()) {
      Alert.alert("Validation Error", "Please enter a WOD name");
      return;
    }

    if (!selectedFormatId) {
      Alert.alert("Validation Error", "Please select a WOD format");
      return;
    }

    if (!selectedCategoryId) {
      Alert.alert("Validation Error", "Please select a WOD category");
      return;
    }

    if (!scoreTime && !scoreRounds && !scoreReps && !scoreLoad && !scoreDistance && !scoreCalories) {
      Alert.alert("Validation Error", "Please select at least one score type");
      return;
    }

    try {
      setSaving(true);

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        Alert.alert("Error", "You must be logged in to create a WOD");
        return;
      }

      const input: CreateWODInput = {
        name: name.trim(),
        description: description.trim() || undefined,
        format_id: selectedFormatId,
        category_id: selectedCategoryId,
        time_cap_minutes: timeCap ? parseInt(timeCap) : undefined,
        score_type_time: scoreTime,
        score_type_rounds: scoreRounds,
        score_type_reps: scoreReps,
        score_type_load: scoreLoad,
        score_type_distance: scoreDistance,
        score_type_calories: scoreCalories,
        // Movements and scaling will be added in a future version
        movements: [],
        scaling_levels: [],
      };

      const wod = await createWOD(user.id, input);

      if (wod) {
        Alert.alert("Success", "WOD created successfully!");
        onSave?.();
        onClose();
      } else {
        Alert.alert("Error", "Failed to create WOD");
      }
    } catch (error) {
      console.error("Error creating WOD:", error);
      Alert.alert("Error", "Failed to create WOD");
    } finally {
      setSaving(false);
    }
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
          <TouchableOpacity onPress={onClose} style={styles.headerButton}>
            <ChevronLeft size={24} color="#FFFFFF" />
            <Text style={styles.headerButtonText}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleSave}
            style={styles.saveButton}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <>
                <Save size={20} color="#FFFFFF" />
                <Text style={styles.saveButtonText}>Create</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        {/* Content */}
        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          <Text style={styles.pageTitle}>Create New WOD</Text>

          {/* WOD Name */}
          <View style={styles.formSection}>
            <Text style={styles.formLabel}>WOD Name *</Text>
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder="e.g., Fran, Murph, Daily Grinder"
              placeholderTextColor={colors.mutedForeground}
            />
          </View>

          {/* Description */}
          <View style={styles.formSection}>
            <Text style={styles.formLabel}>Description</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={description}
              onChangeText={setDescription}
              placeholder="Optional description"
              placeholderTextColor={colors.mutedForeground}
              multiline
              numberOfLines={3}
            />
          </View>

          {/* Format */}
          <View style={styles.formSection}>
            <Text style={styles.formLabel}>Format *</Text>
            <View style={styles.chipContainer}>
              {formats.map((format) => (
                <TouchableOpacity
                  key={format.id}
                  style={[
                    styles.chip,
                    selectedFormatId === format.id && styles.chipActive,
                  ]}
                  onPress={() => setSelectedFormatId(format.id)}
                >
                  <Text
                    style={[
                      styles.chipText,
                      selectedFormatId === format.id && styles.chipTextActive,
                    ]}
                  >
                    {format.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Category */}
          <View style={styles.formSection}>
            <Text style={styles.formLabel}>Category *</Text>
            <View style={styles.chipContainer}>
              {categories.map((category) => (
                <TouchableOpacity
                  key={category.id}
                  style={[
                    styles.chip,
                    selectedCategoryId === category.id && styles.chipActive,
                  ]}
                  onPress={() => setSelectedCategoryId(category.id)}
                >
                  <Text
                    style={[
                      styles.chipText,
                      selectedCategoryId === category.id && styles.chipTextActive,
                    ]}
                  >
                    {category.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Time Cap */}
          <View style={styles.formSection}>
            <Text style={styles.formLabel}>Time Cap (minutes)</Text>
            <TextInput
              style={styles.input}
              value={timeCap}
              onChangeText={setTimeCap}
              placeholder="Leave empty for no cap"
              placeholderTextColor={colors.mutedForeground}
              keyboardType="number-pad"
            />
          </View>

          {/* Score Types */}
          <View style={styles.formSection}>
            <Text style={styles.formLabel}>Score Types *</Text>
            <Text style={styles.helperText}>Select all that apply</Text>
            <View style={styles.checkboxContainer}>
              <TouchableOpacity
                style={styles.checkbox}
                onPress={() => setScoreTime(!scoreTime)}
              >
                <View style={[styles.checkboxBox, scoreTime && styles.checkboxBoxChecked]}>
                  {scoreTime && <Text style={styles.checkboxCheck}>✓</Text>}
                </View>
                <Text style={styles.checkboxLabel}>Time</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.checkbox}
                onPress={() => setScoreRounds(!scoreRounds)}
              >
                <View style={[styles.checkboxBox, scoreRounds && styles.checkboxBoxChecked]}>
                  {scoreRounds && <Text style={styles.checkboxCheck}>✓</Text>}
                </View>
                <Text style={styles.checkboxLabel}>Rounds + Reps</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.checkbox}
                onPress={() => setScoreReps(!scoreReps)}
              >
                <View style={[styles.checkboxBox, scoreReps && styles.checkboxBoxChecked]}>
                  {scoreReps && <Text style={styles.checkboxCheck}>✓</Text>}
                </View>
                <Text style={styles.checkboxLabel}>Total Reps</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.checkbox}
                onPress={() => setScoreLoad(!scoreLoad)}
              >
                <View style={[styles.checkboxBox, scoreLoad && styles.checkboxBoxChecked]}>
                  {scoreLoad && <Text style={styles.checkboxCheck}>✓</Text>}
                </View>
                <Text style={styles.checkboxLabel}>Load/Weight</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.checkbox}
                onPress={() => setScoreDistance(!scoreDistance)}
              >
                <View style={[styles.checkboxBox, scoreDistance && styles.checkboxBoxChecked]}>
                  {scoreDistance && <Text style={styles.checkboxCheck}>✓</Text>}
                </View>
                <Text style={styles.checkboxLabel}>Distance</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.checkbox}
                onPress={() => setScoreCalories(!scoreCalories)}
              >
                <View style={[styles.checkboxBox, scoreCalories && styles.checkboxBoxChecked]}>
                  {scoreCalories && <Text style={styles.checkboxCheck}>✓</Text>}
                </View>
                <Text style={styles.checkboxLabel}>Calories</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Placeholder for Movements */}
          <View style={styles.formSection}>
            <Text style={styles.formLabel}>Movements</Text>
            <View style={styles.placeholderCard}>
              <Text style={styles.placeholderText}>
                Movement and scaling configuration coming soon!
              </Text>
              <Text style={styles.placeholderSubtext}>
                For now, create the WOD and add movements in a future update.
              </Text>
            </View>
          </View>
        </ScrollView>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0A0F1E",
  },
  centerContent: {
    justifyContent: "center",
    alignItems: "center",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#1F2937",
  },
  headerButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  headerButtonText: {
    fontSize: 17,
    color: "#FFFFFF",
  },
  saveButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.primary,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  content: {
    flex: 1,
    padding: 16,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: colors.mutedForeground,
  },
  pageTitle: {
    fontSize: 28,
    fontWeight: "bold",
    color: "#FFFFFF",
    marginBottom: 24,
  },
  formSection: {
    marginBottom: 24,
  },
  formLabel: {
    fontSize: 16,
    fontWeight: "600",
    color: "#FFFFFF",
    marginBottom: 8,
  },
  helperText: {
    fontSize: 14,
    color: colors.mutedForeground,
    marginBottom: 12,
  },
  input: {
    backgroundColor: "#1F2937",
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#374151",
  },
  textArea: {
    minHeight: 80,
    textAlignVertical: "top",
  },
  chipContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: "#1F2937",
    borderRadius: 20,
    borderWidth: 2,
    borderColor: "#374151",
  },
  chipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  chipText: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.mutedForeground,
  },
  chipTextActive: {
    color: "#FFFFFF",
  },
  checkboxContainer: {
    gap: 12,
  },
  checkbox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  checkboxBox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: "#374151",
    backgroundColor: "#1F2937",
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxBoxChecked: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  checkboxCheck: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#FFFFFF",
  },
  checkboxLabel: {
    fontSize: 16,
    color: "#FFFFFF",
  },
  placeholderCard: {
    backgroundColor: "#1F2937",
    borderRadius: 12,
    padding: 20,
    alignItems: "center",
  },
  placeholderText: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.mutedForeground,
    textAlign: "center",
    marginBottom: 8,
  },
  placeholderSubtext: {
    fontSize: 14,
    color: colors.mutedForeground,
    textAlign: "center",
    lineHeight: 20,
  },
});
