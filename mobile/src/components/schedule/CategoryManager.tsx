import React, { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  ScrollView,
  TextInput,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { EventCategory } from "../../types/schedule";
import { Plus, Trash2, Check, X } from "lucide-react-native";
import * as LucideIcons from "lucide-react-native";
import { supabase } from "../../lib/supabase";

interface CategoryManagerProps {
  visible: boolean;
  onClose: () => void;
  categories: EventCategory[];
  onUpdate: () => void;
}

const AVAILABLE_COLORS = [
  { name: "Green", value: "#22C55E" },
  { name: "Orange", value: "#F97316" },
  { name: "Blue", value: "#3B82F6" },
  { name: "Purple", value: "#8B5CF6" },
  { name: "Pink", value: "#EC4899" },
  { name: "Red", value: "#EF4444" },
  { name: "Yellow", value: "#EAB308" },
  { name: "Cyan", value: "#06B6D4" },
  { name: "Gray", value: "#6B7280" },
];

const AVAILABLE_ICONS = [
  "Utensils",
  "Dumbbell",
  "Dog",
  "Briefcase",
  "Heart",
  "Circle",
  "Book",
  "Coffee",
  "Music",
  "Gamepad2",
  "ShoppingBag",
  "Car",
];

export function CategoryManager({
  visible,
  onClose,
  categories,
  onUpdate,
}: CategoryManagerProps) {
  const [isCreating, setIsCreating] = useState(false);
  const [newCategory, setNewCategory] = useState({
    name: "",
    color: AVAILABLE_COLORS[0].value,
    icon: AVAILABLE_ICONS[0],
  });
  const [loading, setLoading] = useState(false);

  const defaultCategories = categories.filter((c) => c.is_default);
  const userCategories = categories.filter((c) => !c.is_default);

  const handleCreate = async () => {
    if (!newCategory.name.trim()) return;

    setLoading(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        Alert.alert("Error", "You must be logged in to create a category");
        return;
      }

      const { error } = await supabase.from("event_categories").insert({
        user_id: user.id,
        name: newCategory.name.trim(),
        color: newCategory.color,
        icon: newCategory.icon,
        is_default: false,
      });

      if (error) {
        console.error("Failed to create category:", error);
        Alert.alert("Error", "Failed to create category");
        return;
      }

      setNewCategory({
        name: "",
        color: AVAILABLE_COLORS[0].value,
        icon: AVAILABLE_ICONS[0],
      });
      setIsCreating(false);
      onUpdate();
    } catch (error) {
      console.error("Failed to create category:", error);
      Alert.alert("Error", "Failed to create category");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (categoryId: string) => {
    Alert.alert(
      "Delete Category",
      "Are you sure you want to delete this category?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            setLoading(true);
            try {
              const { error } = await supabase
                .from("event_categories")
                .delete()
                .eq("id", categoryId);

              if (error) {
                console.error("Failed to delete category:", error);
                Alert.alert("Error", "Failed to delete category");
                return;
              }

              onUpdate();
            } catch (error) {
              console.error("Failed to delete category:", error);
              Alert.alert("Error", "Failed to delete category");
            } finally {
              setLoading(false);
            }
          },
        },
      ]
    );
  };

  const handleClose = () => {
    setIsCreating(false);
    setNewCategory({
      name: "",
      color: AVAILABLE_COLORS[0].value,
      icon: AVAILABLE_ICONS[0],
    });
    onClose();
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleClose}
    >
      <SafeAreaView style={styles.safeArea} edges={["top", "bottom"]}>
        <View style={styles.modal}>
              {/* Header */}
              <View style={styles.header}>
                <Text style={styles.title}>Manage Categories</Text>
                <TouchableOpacity onPress={handleClose} style={styles.closeButton}>
                  <X size={24} color="#9CA3AF" />
                </TouchableOpacity>
              </View>

              {/* Content */}
              <KeyboardAvoidingView
                behavior={Platform.OS === "ios" ? "padding" : "height"}
                style={styles.keyboardView}
              >
              <ScrollView
                style={styles.content}
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
              >
                {/* Default Categories */}
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>Default Categories</Text>
                  <View style={styles.categoriesList}>
                    {defaultCategories.map((category) => {
                      const IconComponent = category.icon
                        ? (LucideIcons as any)[category.icon]
                        : null;

                      return (
                        <View
                          key={category.id}
                          style={[
                            styles.categoryItem,
                            { borderLeftColor: category.color },
                          ]}
                        >
                          {IconComponent && (
                            <IconComponent size={16} color={category.color} />
                          )}
                          <Text style={styles.categoryName}>{category.name}</Text>
                        </View>
                      );
                    })}
                  </View>
                </View>

                {/* Custom Categories */}
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>Custom Categories</Text>
                  {userCategories.length === 0 ? (
                    <Text style={styles.emptyText}>No custom categories yet</Text>
                  ) : (
                    <View style={styles.categoriesList}>
                      {userCategories.map((category) => {
                        const IconComponent = category.icon
                          ? (LucideIcons as any)[category.icon]
                          : null;

                        return (
                          <View
                            key={category.id}
                            style={[
                              styles.categoryItem,
                              { borderLeftColor: category.color },
                            ]}
                          >
                            {IconComponent && (
                              <IconComponent size={16} color={category.color} />
                            )}
                            <Text style={styles.categoryName}>{category.name}</Text>
                            <TouchableOpacity
                              onPress={() => handleDelete(category.id)}
                              disabled={loading}
                              style={styles.deleteButton}
                            >
                              <Trash2 size={16} color="#EF4444" />
                            </TouchableOpacity>
                          </View>
                        );
                      })}
                    </View>
                  )}
                </View>

                {/* Create New Category */}
                {isCreating ? (
                  <View style={styles.createForm}>
                    <View style={styles.formField}>
                      <Text style={styles.label}>Category Name</Text>
                      <TextInput
                        style={styles.input}
                        value={newCategory.name}
                        onChangeText={(text) =>
                          setNewCategory((prev) => ({ ...prev, name: text }))
                        }
                        placeholder="e.g., Study"
                        placeholderTextColor="#6B7280"
                        autoFocus
                      />
                    </View>

                    <View style={styles.formField}>
                      <Text style={styles.label}>Color</Text>
                      <View style={styles.colorGrid}>
                        {AVAILABLE_COLORS.map((color) => (
                          <TouchableOpacity
                            key={color.value}
                            onPress={() =>
                              setNewCategory((prev) => ({ ...prev, color: color.value }))
                            }
                            style={[
                              styles.colorButton,
                              { backgroundColor: color.value },
                            ]}
                          >
                            {newCategory.color === color.value && (
                              <Check size={16} color="#0A0F1E" />
                            )}
                          </TouchableOpacity>
                        ))}
                      </View>
                    </View>

                    <View style={styles.formField}>
                      <Text style={styles.label}>Icon</Text>
                      <View style={styles.iconGrid}>
                        {AVAILABLE_ICONS.map((iconName) => {
                          const IconComponent = (LucideIcons as any)[iconName];
                          const isSelected = newCategory.icon === iconName;

                          return (
                            <TouchableOpacity
                              key={iconName}
                              onPress={() =>
                                setNewCategory((prev) => ({ ...prev, icon: iconName }))
                              }
                              style={[
                                styles.iconButton,
                                isSelected && styles.iconButtonSelected,
                              ]}
                            >
                              {IconComponent && (
                                <IconComponent
                                  size={20}
                                  color={isSelected ? "#0A0F1E" : "#9CA3AF"}
                                />
                              )}
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    </View>

                    <View style={styles.formActions}>
                      <TouchableOpacity
                        onPress={() => setIsCreating(false)}
                        style={[styles.button, styles.cancelButton]}
                      >
                        <Text style={styles.cancelButtonText}>Cancel</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={handleCreate}
                        disabled={loading || !newCategory.name.trim()}
                        style={[
                          styles.button,
                          styles.createButton,
                          (loading || !newCategory.name.trim()) && styles.buttonDisabled,
                        ]}
                      >
                        <Text style={styles.createButtonText}>
                          {loading ? "Creating..." : "Create"}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ) : (
                  <TouchableOpacity
                    onPress={() => setIsCreating(true)}
                    style={styles.addButton}
                  >
                    <Plus size={20} color="#9CA3AF" />
                    <Text style={styles.addButtonText}>Add Custom Category</Text>
                  </TouchableOpacity>
                )}
              </ScrollView>

              {/* Footer */}
              <View style={styles.footer}>
                <TouchableOpacity onPress={handleClose} style={styles.doneButton}>
                  <Text style={styles.doneButtonText}>Done</Text>
                </TouchableOpacity>
              </View>
              </KeyboardAvoidingView>
            </View>
          </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#111827",
  },
  modal: {
    flex: 1,
    backgroundColor: "#111827",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#1F2937",
    backgroundColor: "#111827",
  },
  title: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#FFFFFF",
  },
  closeButton: {
    padding: 4,
  },
  keyboardView: {
    flex: 1,
  },
  content: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 20,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "500",
    color: "#6B7280",
    marginBottom: 12,
  },
  categoriesList: {
    gap: 8,
  },
  categoryItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    backgroundColor: "rgba(31, 41, 55, 0.5)",
    borderRadius: 8,
    borderLeftWidth: 3,
    marginBottom: 8,
  },
  categoryName: {
    flex: 1,
    fontSize: 14,
    color: "#FFFFFF",
  },
  deleteButton: {
    padding: 6,
  },
  emptyText: {
    fontSize: 14,
    color: "#6B7280",
    textAlign: "center",
    paddingVertical: 16,
  },
  createForm: {
    backgroundColor: "rgba(31, 41, 55, 0.3)",
    borderRadius: 12,
    padding: 16,
    gap: 16,
  },
  formField: {
    gap: 8,
  },
  label: {
    fontSize: 14,
    fontWeight: "500",
    color: "#D1D5DB",
  },
  input: {
    backgroundColor: "#1F2937",
    borderWidth: 1,
    borderColor: "#374151",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: "#FFFFFF",
  },
  colorGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  colorButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
  },
  iconGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  iconButton: {
    width: 48,
    height: 48,
    backgroundColor: "#1F2937",
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
  },
  iconButtonSelected: {
    backgroundColor: "#22C55E",
  },
  formActions: {
    flexDirection: "row",
    gap: 12,
    marginTop: 8,
  },
  button: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: "center",
  },
  cancelButton: {
    backgroundColor: "#1F2937",
  },
  cancelButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
  },
  createButton: {
    backgroundColor: "#22C55E",
  },
  createButtonText: {
    color: "#0A0F1E",
    fontSize: 16,
    fontWeight: "600",
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  addButton: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
    padding: 16,
    backgroundColor: "transparent",
    borderWidth: 2,
    borderColor: "#3B82F6",
    borderRadius: 12,
  },
  addButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  footer: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 20,
    borderTopWidth: 1,
    borderTopColor: "#1F2937",
    backgroundColor: "#111827",
  },
  doneButton: {
    backgroundColor: "#1F2937",
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: "center",
  },
  doneButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
  },
});
