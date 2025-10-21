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
import {
  ChevronLeft,
  Calendar,
  Clock,
  Plus,
  Trash2,
  Save,
  X,
  GripVertical,
} from "lucide-react-native";
import { colors } from "@/src/lib/colors";
import { ClassWithDetails, ClassPart } from "@/src/types/crossfit";
import {
  fetchClassById,
  updateClass,
  deleteClass,
  addClassPart,
  deleteClassPart,
  reorderClassParts,
} from "@/src/lib/supabase/crossfit";

interface ClassDetailScreenProps {
  classId: string;
  onClose: () => void;
  onSave?: () => void;
}

export function ClassDetailScreen({ classId, onClose, onSave }: ClassDetailScreenProps) {
  const insets = useSafeAreaInsets();
  const [classData, setClassData] = useState<ClassWithDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Editable fields
  const [name, setName] = useState("");
  const [date, setDate] = useState("");
  const [durationMinutes, setDurationMinutes] = useState("60");

  useEffect(() => {
    loadClass();
  }, [classId]);

  const loadClass = async () => {
    try {
      setLoading(true);
      const data = await fetchClassById(classId);
      setClassData(data);

      if (data) {
        setName(data.name || "");
        setDate(data.date);
        setDurationMinutes(data.duration_minutes?.toString() || "60");
      }
    } catch (error) {
      console.error("Error loading class:", error);
      Alert.alert("Error", "Failed to load class details");
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert("Validation Error", "Please enter a class name");
      return;
    }

    if (!date) {
      Alert.alert("Validation Error", "Please select a date");
      return;
    }

    try {
      setSaving(true);

      const success = await updateClass(classId, {
        name: name.trim(),
        date,
        duration_minutes: parseInt(durationMinutes) || 60,
      });

      if (success) {
        Alert.alert("Success", "Class updated successfully");
        onSave?.();
        onClose();
      } else {
        Alert.alert("Error", "Failed to update class");
      }
    } catch (error) {
      console.error("Error saving class:", error);
      Alert.alert("Error", "Failed to save class");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = () => {
    Alert.alert(
      "Delete Class",
      "Are you sure you want to delete this class? This action cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              const success = await deleteClass(classId);
              if (success) {
                Alert.alert("Success", "Class deleted successfully");
                onClose();
              } else {
                Alert.alert("Error", "Failed to delete class");
              }
            } catch (error) {
              console.error("Error deleting class:", error);
              Alert.alert("Error", "Failed to delete class");
            }
          },
        },
      ]
    );
  };

  const handleAddPart = async () => {
    Alert.alert("Add Class Part", "This feature is coming soon!");
    // TODO: Implement add class part modal
  };

  const handleDeletePart = async (partId: string) => {
    Alert.alert(
      "Delete Part",
      "Are you sure you want to delete this part?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              const success = await deleteClassPart(partId);
              if (success) {
                // Reload class data
                await loadClass();
              } else {
                Alert.alert("Error", "Failed to delete part");
              }
            } catch (error) {
              console.error("Error deleting part:", error);
              Alert.alert("Error", "Failed to delete part");
            }
          },
        },
      ]
    );
  };

  // Format date for display
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr + "T00:00:00");
    return date.toLocaleDateString("en-US", {
      weekday: "long",
      month: "short",
      day: "numeric",
    });
  };

  if (loading) {
    return (
      <>
        <StatusBar barStyle="light-content" />
        <View style={[styles.container, styles.centerContent, { paddingTop: insets.top }]}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Loading class...</Text>
        </View>
      </>
    );
  }

  if (!classData) {
    return (
      <>
        <StatusBar barStyle="light-content" />
        <View style={[styles.container, styles.centerContent, { paddingTop: insets.top }]}>
          <Text style={styles.errorText}>Class not found</Text>
          <TouchableOpacity onPress={onClose} style={styles.backButton}>
            <Text style={styles.backButtonText}>Go Back</Text>
          </TouchableOpacity>
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
            <Text style={styles.headerButtonText}>Back</Text>
          </TouchableOpacity>
          <View style={styles.headerActions}>
            <TouchableOpacity onPress={handleDelete} style={styles.deleteButton}>
              <Trash2 size={20} color="#EF4444" />
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
                  <Text style={styles.saveButtonText}>Save</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>

        {/* Content */}
        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          {/* Class Name */}
          <View style={styles.formSection}>
            <Text style={styles.formLabel}>Class Name</Text>
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder="Enter class name"
              placeholderTextColor={colors.mutedForeground}
            />
          </View>

          {/* Date */}
          <View style={styles.formSection}>
            <Text style={styles.formLabel}>Date</Text>
            <View style={styles.dateContainer}>
              <Calendar size={20} color={colors.primary} />
              <Text style={styles.dateText}>{formatDate(date)}</Text>
            </View>
            <Text style={styles.helperText}>
              Date editing is coming soon
            </Text>
          </View>

          {/* Duration */}
          <View style={styles.formSection}>
            <Text style={styles.formLabel}>Duration (minutes)</Text>
            <TextInput
              style={styles.input}
              value={durationMinutes}
              onChangeText={setDurationMinutes}
              placeholder="60"
              placeholderTextColor={colors.mutedForeground}
              keyboardType="number-pad"
            />
          </View>

          {/* Class Parts */}
          <View style={styles.partsSection}>
            <View style={styles.partsSectionHeader}>
              <Text style={styles.sectionTitle}>Class Parts</Text>
              <TouchableOpacity onPress={handleAddPart} style={styles.addPartButton}>
                <Plus size={20} color="#FFFFFF" />
                <Text style={styles.addPartButtonText}>Add Part</Text>
              </TouchableOpacity>
            </View>

            {classData.parts && classData.parts.length > 0 ? (
              classData.parts
                .sort((a, b) => a.part_order - b.part_order)
                .map((part, index) => (
                  <View key={part.id} style={styles.partCard}>
                    <View style={styles.partHeader}>
                      <View style={styles.partHeaderLeft}>
                        <GripVertical size={20} color={colors.mutedForeground} />
                        <View style={styles.partTypeBadge}>
                          <Text style={styles.partTypeText}>{part.part_type}</Text>
                        </View>
                      </View>
                      <TouchableOpacity
                        onPress={() => handleDeletePart(part.id)}
                        style={styles.deletePartButton}
                      >
                        <Trash2 size={18} color="#EF4444" />
                      </TouchableOpacity>
                    </View>

                    {/* WOD Preview */}
                    {part.wod ? (
                      <View style={styles.wodPreview}>
                        <Text style={styles.wodPreviewName}>{part.wod.name}</Text>
                        <View style={styles.wodPreviewMeta}>
                          <Text style={styles.wodPreviewText}>
                            {part.wod.format?.name}
                          </Text>
                          {part.wod.time_cap_minutes && (
                            <>
                              <Text style={styles.wodPreviewDivider}>•</Text>
                              <Text style={styles.wodPreviewText}>
                                {part.wod.time_cap_minutes} min cap
                              </Text>
                            </>
                          )}
                        </View>
                      </View>
                    ) : part.custom_content ? (
                      <Text style={styles.customContent}>{part.custom_content}</Text>
                    ) : (
                      <Text style={styles.emptyPartText}>No content</Text>
                    )}
                  </View>
                ))
            ) : (
              <View style={styles.emptyState}>
                <Text style={styles.emptyStateText}>
                  No parts added yet. Tap "Add Part" to get started.
                </Text>
              </View>
            )}
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
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  deleteButton: {
    padding: 8,
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
  backButton: {
    marginTop: 16,
  },
  backButtonText: {
    fontSize: 16,
    color: colors.primary,
    fontWeight: "600",
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
  errorText: {
    fontSize: 18,
    color: "#EF4444",
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
  dateContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#1F2937",
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: "#374151",
  },
  dateText: {
    fontSize: 16,
    color: "#FFFFFF",
    fontWeight: "500",
  },
  helperText: {
    fontSize: 14,
    color: colors.mutedForeground,
    marginTop: 6,
    fontStyle: "italic",
  },
  partsSection: {
    marginBottom: 24,
  },
  partsSectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#FFFFFF",
  },
  addPartButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.primary,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  addPartButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  partCard: {
    backgroundColor: "#1F2937",
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  partHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  partHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  partTypeBadge: {
    backgroundColor: "#374151",
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 6,
  },
  partTypeText: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.primary,
  },
  deletePartButton: {
    padding: 4,
  },
  wodPreview: {
    marginTop: 8,
  },
  wodPreviewName: {
    fontSize: 18,
    fontWeight: "600",
    color: "#FFFFFF",
    marginBottom: 6,
  },
  wodPreviewMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  wodPreviewText: {
    fontSize: 14,
    color: colors.mutedForeground,
  },
  wodPreviewDivider: {
    fontSize: 14,
    color: colors.mutedForeground,
  },
  customContent: {
    fontSize: 14,
    color: colors.mutedForeground,
    lineHeight: 20,
  },
  emptyPartText: {
    fontSize: 14,
    color: colors.mutedForeground,
    fontStyle: "italic",
  },
  emptyState: {
    padding: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyStateText: {
    fontSize: 16,
    color: colors.mutedForeground,
    textAlign: "center",
    lineHeight: 24,
  },
});
