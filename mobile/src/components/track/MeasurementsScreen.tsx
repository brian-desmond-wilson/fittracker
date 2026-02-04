import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  StatusBar,
  Alert,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ChevronLeft, Plus, Ruler, Trash2, Calendar } from "lucide-react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { colors } from "@/src/lib/colors";
import { BodyMeasurement } from "@/src/types/track";
import { supabase } from "@/src/lib/supabase";

interface MeasurementsScreenProps {
  onClose: () => void;
}

export function MeasurementsScreen({ onClose }: MeasurementsScreenProps) {
  const insets = useSafeAreaInsets();
  const [measurements, setMeasurements] = useState<BodyMeasurement[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);

  // Form fields
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [biceps, setBiceps] = useState("");
  const [chest, setChest] = useState("");
  const [waist, setWaist] = useState("");
  const [hips, setHips] = useState("");
  const [thighs, setThighs] = useState("");
  const [calves, setCalves] = useState("");

  useEffect(() => {
    fetchMeasurements();
  }, []);

  const fetchMeasurements = async () => {
    try {
      setLoading(true);
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        Alert.alert("Error", "You must be logged in to track measurements");
        return;
      }

      // Fetch measurements from last 90 days
      const ninetyDaysAgo = new Date();
      ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
      const startDate = ninetyDaysAgo.toISOString().split("T")[0];

      const { data, error } = await supabase
        .from("body_measurements")
        .select("*")
        .eq("user_id", user.id)
        .gte("date", startDate)
        .order("date", { ascending: false })
        .order("logged_at", { ascending: false });

      if (error) throw error;

      setMeasurements(data || []);
    } catch (error: any) {
      console.error("Error fetching measurements:", error);
      Alert.alert("Error", "Failed to load measurements");
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setSelectedDate(new Date());
    setBiceps("");
    setChest("");
    setWaist("");
    setHips("");
    setThighs("");
    setCalves("");
  };

  const handleAddMeasurement = async () => {
    // Validate at least one measurement is provided
    if (!biceps && !chest && !waist && !hips && !thighs && !calves) {
      Alert.alert("Validation Error", "Please enter at least one measurement");
      return;
    }

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        Alert.alert("Error", "You must be logged in to log measurements");
        return;
      }

      const measurementData = {
        user_id: user.id,
        date: selectedDate.toISOString().split("T")[0],
        biceps_inches: biceps ? parseFloat(biceps) : null,
        chest_inches: chest ? parseFloat(chest) : null,
        waist_inches: waist ? parseFloat(waist) : null,
        hips_inches: hips ? parseFloat(hips) : null,
        thighs_inches: thighs ? parseFloat(thighs) : null,
        calves_inches: calves ? parseFloat(calves) : null,
        logged_at: new Date().toISOString(),
      };

      const { error } = await supabase.from("body_measurements").insert([measurementData]);

      if (error) throw error;

      resetForm();
      setShowAddForm(false);
      await fetchMeasurements();
      Alert.alert("Success", "Measurements added successfully");
    } catch (error: any) {
      console.error("Error adding measurement:", error);
      Alert.alert("Error", "Failed to add measurement");
    }
  };

  const handleDeleteMeasurement = async (measurementId: string) => {
    Alert.alert("Delete Measurement", "Are you sure you want to delete this measurement?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            const { error } = await supabase.from("body_measurements").delete().eq("id", measurementId);

            if (error) throw error;

            await fetchMeasurements();
          } catch (error: any) {
            console.error("Error deleting measurement:", error);
            Alert.alert("Error", "Failed to delete measurement");
          }
        },
      },
    ]);
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const dateOnly = dateStr.split("T")[0];
    const todayOnly = today.toISOString().split("T")[0];
    const yesterdayOnly = yesterday.toISOString().split("T")[0];

    if (dateOnly === todayOnly) {
      return "Today";
    } else if (dateOnly === yesterdayOnly) {
      return "Yesterday";
    } else {
      return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    }
  };

  const getLatestMeasurement = () => {
    return measurements.length > 0 ? measurements[0] : null;
  };

  const latest = getLatestMeasurement();

  return (
    <>
      <StatusBar barStyle="light-content" />
      <View style={[styles.container, { paddingTop: insets.top }]}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.backButton}>
            <ChevronLeft size={24} color="#FFFFFF" />
            <Text style={styles.backText}>Track</Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          {/* Title */}
          <View style={styles.titleContainer}>
            <Ruler size={32} color="#EC4899" strokeWidth={2} />
            <Text style={styles.pageTitle}>Body Measurements</Text>
          </View>

          {/* Latest Measurements Card */}
          {latest && (
            <View style={styles.latestCard}>
              <Text style={styles.latestLabel}>Latest Measurements</Text>
              <Text style={styles.latestDate}>{formatDate(latest.date)}</Text>
              <View style={styles.measurementGrid}>
                {latest.biceps_inches && (
                  <View style={styles.measurementItem}>
                    <Text style={styles.measurementLabel}>Biceps</Text>
                    <Text style={styles.measurementValue}>{latest.biceps_inches}"</Text>
                  </View>
                )}
                {latest.chest_inches && (
                  <View style={styles.measurementItem}>
                    <Text style={styles.measurementLabel}>Chest</Text>
                    <Text style={styles.measurementValue}>{latest.chest_inches}"</Text>
                  </View>
                )}
                {latest.waist_inches && (
                  <View style={styles.measurementItem}>
                    <Text style={styles.measurementLabel}>Waist</Text>
                    <Text style={styles.measurementValue}>{latest.waist_inches}"</Text>
                  </View>
                )}
                {latest.hips_inches && (
                  <View style={styles.measurementItem}>
                    <Text style={styles.measurementLabel}>Hips</Text>
                    <Text style={styles.measurementValue}>{latest.hips_inches}"</Text>
                  </View>
                )}
                {latest.thighs_inches && (
                  <View style={styles.measurementItem}>
                    <Text style={styles.measurementLabel}>Thighs</Text>
                    <Text style={styles.measurementValue}>{latest.thighs_inches}"</Text>
                  </View>
                )}
                {latest.calves_inches && (
                  <View style={styles.measurementItem}>
                    <Text style={styles.measurementLabel}>Calves</Text>
                    <Text style={styles.measurementValue}>{latest.calves_inches}"</Text>
                  </View>
                )}
              </View>
            </View>
          )}

          {/* Add Button */}
          {!showAddForm && (
            <View style={styles.addButtonContainer}>
              <TouchableOpacity
                style={styles.addButton}
                onPress={() => setShowAddForm(true)}
                activeOpacity={0.7}
              >
                <Plus size={20} color="#FFFFFF" />
                <Text style={styles.addButtonText}>Add Measurements</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Add Form */}
          {showAddForm && (
            <View style={styles.addSection}>
              <Text style={styles.sectionTitle}>Add Measurements</Text>

              {/* Date Selector */}
              <View style={styles.field}>
                <Text style={styles.label}>Date</Text>
                <TouchableOpacity
                  style={styles.dateButton}
                  onPress={() => setShowDatePicker(true)}
                >
                  <Calendar size={16} color={colors.foreground} />
                  <Text style={styles.dateButtonText}>
                    {selectedDate.toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </Text>
                </TouchableOpacity>
              </View>

              {showDatePicker && (
                <DateTimePicker
                  value={selectedDate}
                  mode="date"
                  display={Platform.OS === "ios" ? "spinner" : "default"}
                  onChange={(event, date) => {
                    setShowDatePicker(Platform.OS === "ios");
                    if (date) {
                      setSelectedDate(date);
                    }
                  }}
                  maximumDate={new Date()}
                />
              )}

              {/* Measurement Inputs */}
              <View style={styles.inputsGrid}>
                <View style={styles.inputField}>
                  <Text style={styles.inputLabel}>Biceps (inches)</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="0.0"
                    placeholderTextColor={colors.mutedForeground}
                    keyboardType="decimal-pad"
                    value={biceps}
                    onChangeText={setBiceps}
                  />
                </View>

                <View style={styles.inputField}>
                  <Text style={styles.inputLabel}>Chest (inches)</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="0.0"
                    placeholderTextColor={colors.mutedForeground}
                    keyboardType="decimal-pad"
                    value={chest}
                    onChangeText={setChest}
                  />
                </View>

                <View style={styles.inputField}>
                  <Text style={styles.inputLabel}>Waist (inches)</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="0.0"
                    placeholderTextColor={colors.mutedForeground}
                    keyboardType="decimal-pad"
                    value={waist}
                    onChangeText={setWaist}
                  />
                </View>

                <View style={styles.inputField}>
                  <Text style={styles.inputLabel}>Hips (inches)</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="0.0"
                    placeholderTextColor={colors.mutedForeground}
                    keyboardType="decimal-pad"
                    value={hips}
                    onChangeText={setHips}
                  />
                </View>

                <View style={styles.inputField}>
                  <Text style={styles.inputLabel}>Thighs (inches)</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="0.0"
                    placeholderTextColor={colors.mutedForeground}
                    keyboardType="decimal-pad"
                    value={thighs}
                    onChangeText={setThighs}
                  />
                </View>

                <View style={styles.inputField}>
                  <Text style={styles.inputLabel}>Calves (inches)</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="0.0"
                    placeholderTextColor={colors.mutedForeground}
                    keyboardType="decimal-pad"
                    value={calves}
                    onChangeText={setCalves}
                  />
                </View>
              </View>

              {/* Form Buttons */}
              <View style={styles.formButtons}>
                <TouchableOpacity
                  style={[styles.button, styles.cancelButton]}
                  onPress={() => {
                    resetForm();
                    setShowAddForm(false);
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={styles.cancelButtonText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.button, styles.saveButton]}
                  onPress={handleAddMeasurement}
                  activeOpacity={0.7}
                >
                  <Text style={styles.saveButtonText}>Save</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* History */}
          <View style={styles.historySection}>
            <Text style={styles.sectionTitle}>History</Text>
            {loading ? (
              <Text style={styles.loadingText}>Loading...</Text>
            ) : measurements.length === 0 ? (
              <Text style={styles.emptyText}>
                No measurements yet. Add your first measurement!
              </Text>
            ) : (
              measurements.map((measurement) => (
                <View key={measurement.id} style={styles.historyCard}>
                  <View style={styles.historyHeader}>
                    <View style={styles.historyTitleRow}>
                      <Ruler size={16} color="#EC4899" />
                      <Text style={styles.historyDate}>{formatDate(measurement.date)}</Text>
                    </View>
                    <TouchableOpacity
                      onPress={() => handleDeleteMeasurement(measurement.id)}
                      style={styles.deleteButton}
                      activeOpacity={0.7}
                    >
                      <Trash2 size={18} color={colors.mutedForeground} />
                    </TouchableOpacity>
                  </View>
                  <View style={styles.historyMeasurements}>
                    {measurement.biceps_inches && (
                      <View style={styles.historyItem}>
                        <Text style={styles.historyLabel}>Biceps:</Text>
                        <Text style={styles.historyValue}>{measurement.biceps_inches}"</Text>
                      </View>
                    )}
                    {measurement.chest_inches && (
                      <View style={styles.historyItem}>
                        <Text style={styles.historyLabel}>Chest:</Text>
                        <Text style={styles.historyValue}>{measurement.chest_inches}"</Text>
                      </View>
                    )}
                    {measurement.waist_inches && (
                      <View style={styles.historyItem}>
                        <Text style={styles.historyLabel}>Waist:</Text>
                        <Text style={styles.historyValue}>{measurement.waist_inches}"</Text>
                      </View>
                    )}
                    {measurement.hips_inches && (
                      <View style={styles.historyItem}>
                        <Text style={styles.historyLabel}>Hips:</Text>
                        <Text style={styles.historyValue}>{measurement.hips_inches}"</Text>
                      </View>
                    )}
                    {measurement.thighs_inches && (
                      <View style={styles.historyItem}>
                        <Text style={styles.historyLabel}>Thighs:</Text>
                        <Text style={styles.historyValue}>{measurement.thighs_inches}"</Text>
                      </View>
                    )}
                    {measurement.calves_inches && (
                      <View style={styles.historyItem}>
                        <Text style={styles.historyLabel}>Calves:</Text>
                        <Text style={styles.historyValue}>{measurement.calves_inches}"</Text>
                      </View>
                    )}
                  </View>
                </View>
              ))
            )}
          </View>

          {/* Bottom Spacing */}
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
  header: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  backText: {
    fontSize: 17,
    color: colors.foreground,
  },
  content: {
    flex: 1,
  },
  titleContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 16,
  },
  pageTitle: {
    fontSize: 28,
    fontWeight: "bold",
    color: colors.foreground,
  },
  latestCard: {
    marginHorizontal: 20,
    marginBottom: 24,
    padding: 20,
    backgroundColor: "rgba(236, 72, 153, 0.1)",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(236, 72, 153, 0.3)",
  },
  latestLabel: {
    fontSize: 14,
    color: colors.mutedForeground,
    marginBottom: 4,
  },
  latestDate: {
    fontSize: 16,
    fontWeight: "600",
    color: "#EC4899",
    marginBottom: 16,
  },
  measurementGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 16,
  },
  measurementItem: {
    width: "45%",
  },
  measurementLabel: {
    fontSize: 12,
    color: colors.mutedForeground,
    marginBottom: 4,
  },
  measurementValue: {
    fontSize: 20,
    fontWeight: "bold",
    color: colors.foreground,
  },
  addButtonContainer: {
    paddingHorizontal: 20,
    marginBottom: 24,
  },
  addButton: {
    backgroundColor: "#EC4899",
    paddingVertical: 14,
    borderRadius: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  addButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
  },
  addSection: {
    paddingHorizontal: 20,
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: colors.foreground,
    marginBottom: 16,
  },
  field: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.foreground,
    marginBottom: 8,
  },
  dateButton: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  dateButtonText: {
    fontSize: 16,
    color: colors.foreground,
  },
  inputsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  inputField: {
    width: "47%",
    marginBottom: 12,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.foreground,
    marginBottom: 8,
  },
  input: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: colors.foreground,
  },
  formButtons: {
    flexDirection: "row",
    gap: 12,
    marginTop: 8,
  },
  button: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: "center",
  },
  cancelButton: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.foreground,
  },
  saveButton: {
    backgroundColor: "#EC4899",
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  historySection: {
    paddingHorizontal: 20,
  },
  loadingText: {
    fontSize: 16,
    color: colors.mutedForeground,
    textAlign: "center",
    paddingVertical: 24,
  },
  emptyText: {
    fontSize: 16,
    color: colors.mutedForeground,
    textAlign: "center",
    paddingVertical: 24,
  },
  historyCard: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  historyHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  historyTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  historyDate: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.foreground,
  },
  deleteButton: {
    padding: 4,
  },
  historyMeasurements: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 16,
  },
  historyItem: {
    width: "45%",
  },
  historyLabel: {
    fontSize: 12,
    color: colors.mutedForeground,
    marginBottom: 2,
  },
  historyValue: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.foreground,
  },
});
