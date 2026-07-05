import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TextInput,
  ScrollView,
  ActivityIndicator,
  Alert,
} from "react-native";
import { ChevronLeft, Plus, Trash2 } from "lucide-react-native";
import { colors } from "@/src/lib/colors";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MealTemplateWithItems, MealType, SavedFood } from "@/src/types/track";
import {
  listMealTemplates,
  createMealTemplate,
  deleteMealTemplate,
  logMealTemplate,
} from "@/src/services/mealTemplatesService";

const MEAL_TYPES: { value: MealType; label: string; color: string }[] = [
  { value: "breakfast", label: "Breakfast", color: "#F59E0B" },
  { value: "lunch", label: "Lunch", color: "#10B981" },
  { value: "dinner", label: "Dinner", color: "#3B82F6" },
  { value: "snack", label: "Snack", color: "#8B5CF6" },
  { value: "dessert", label: "Dessert", color: "#EC4899" },
];

interface MealTemplatesModalProps {
  visible: boolean;
  savedFoods: SavedFood[]; // for the picker when creating
  todayDate: string; // YYYY-MM-DD
  onClose: () => void;
  onLogged: () => void; // called after a successful log so caller can refresh
}

type Mode = "list" | "create";

interface DraftItem {
  saved_food_id: string;
  servings: number;
}

export function MealTemplatesModal({
  visible,
  savedFoods,
  todayDate,
  onClose,
  onLogged,
}: MealTemplatesModalProps) {
  const insets = useSafeAreaInsets();
  const [mode, setMode] = useState<Mode>("list");
  const [loading, setLoading] = useState(false);
  const [templates, setTemplates] = useState<MealTemplateWithItems[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);

  // Picker for "log to which meal type" sheet
  const [pendingLog, setPendingLog] = useState<MealTemplateWithItems | null>(null);

  // Create-form drafts
  const [draftName, setDraftName] = useState("");
  const [draftType, setDraftType] = useState<MealType>("breakfast");
  const [draftItems, setDraftItems] = useState<DraftItem[]>([]);
  const [foodPickerVisible, setFoodPickerVisible] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [foodSearch, setFoodSearch] = useState("");

  useEffect(() => {
    if (visible) {
      void load();
      setMode("list");
    }
  }, [visible]);

  const load = async () => {
    try {
      setLoading(true);
      const list = await listMealTemplates();
      setTemplates(list);
    } catch (error) {
      console.error("Failed to load templates:", error);
      Alert.alert("Error", "Failed to load templates");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = (t: MealTemplateWithItems) => {
    Alert.alert("Delete template?", `"${t.name}" will be removed.`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            setBusyId(t.id);
            await deleteMealTemplate(t.id);
            setTemplates((prev) => prev.filter((x) => x.id !== t.id));
          } catch (error) {
            console.error(error);
            Alert.alert("Error", "Failed to delete template");
          } finally {
            setBusyId(null);
          }
        },
      },
    ]);
  };

  const handleLogTemplate = async (mealType: MealType) => {
    if (!pendingLog) return;
    try {
      setBusyId(pendingLog.id);
      await logMealTemplate(pendingLog, { date: todayDate, mealType });
      setPendingLog(null);
      onLogged();
      onClose();
    } catch (error) {
      console.error(error);
      Alert.alert("Error", "Failed to log template");
    } finally {
      setBusyId(null);
    }
  };

  const openCreate = () => {
    setDraftName("");
    setDraftType("breakfast");
    setDraftItems([]);
    setMode("create");
  };

  const handleSaveDraft = async () => {
    if (draftName.trim() === "") {
      Alert.alert("Name required", "Give your template a name first.");
      return;
    }
    if (draftItems.length === 0) {
      Alert.alert("Add at least one food", "Templates need at least one food item.");
      return;
    }
    try {
      setSavingDraft(true);
      await createMealTemplate({
        name: draftName,
        default_meal_type: draftType,
        notes: null,
        items: draftItems,
      });
      await load();
      setMode("list");
    } catch (error) {
      console.error(error);
      Alert.alert("Error", "Failed to save template");
    } finally {
      setSavingDraft(false);
    }
  };

  const addFoodToDraft = (food: SavedFood) => {
    setDraftItems((prev) => [
      ...prev,
      { saved_food_id: food.id, servings: 1 },
    ]);
    setFoodPickerVisible(false);
    setFoodSearch("");
  };

  const updateDraftServings = (idx: number, servings: number) => {
    setDraftItems((prev) =>
      prev.map((it, i) => (i === idx ? { ...it, servings } : it))
    );
  };

  const removeDraftItem = (idx: number) => {
    setDraftItems((prev) => prev.filter((_, i) => i !== idx));
  };

  const filteredFoodsForPicker = savedFoods.filter((f) =>
    foodSearch.trim() === ""
      ? true
      : f.name.toLowerCase().includes(foodSearch.toLowerCase()) ||
        (f.brand ?? "").toLowerCase().includes(foodSearch.toLowerCase())
  );

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <TouchableOpacity
            onPress={mode === "create" ? () => setMode("list") : onClose}
            style={styles.headerBack}
            activeOpacity={0.7}
          >
            <ChevronLeft size={24} color="#FFFFFF" />
            <Text style={styles.headerBackText}>
              {mode === "create" ? "Templates" : "Meals"}
            </Text>
          </TouchableOpacity>
          {mode === "list" && (
            <TouchableOpacity onPress={openCreate} activeOpacity={0.7}>
              <View style={styles.newButton}>
                <Plus size={16} color="#FFFFFF" />
                <Text style={styles.newButtonText}>New</Text>
              </View>
            </TouchableOpacity>
          )}
        </View>

        {mode === "list" ? (
          <ScrollView style={styles.content} contentContainerStyle={styles.contentInner}>
            <Text style={styles.title}>My Meals</Text>
            <Text style={styles.subtitle}>
              Save recurring meals and log all their foods with one tap.
            </Text>

            {loading ? (
              <ActivityIndicator color={colors.primary} style={{ marginTop: 24 }} />
            ) : templates.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyText}>
                  No templates yet. Tap "New" to create your first.
                </Text>
              </View>
            ) : (
              templates.map((t) => (
                <View key={t.id} style={styles.templateCard}>
                  <View style={styles.templateHeader}>
                    <Text style={styles.templateName}>{t.name}</Text>
                    <TouchableOpacity
                      onPress={() => handleDelete(t)}
                      disabled={busyId === t.id}
                      style={styles.iconButton}
                    >
                      <Trash2 size={18} color={colors.mutedForeground} />
                    </TouchableOpacity>
                  </View>
                  {t.default_meal_type && (
                    <Text style={styles.templateMeta}>
                      Default: {t.default_meal_type}
                    </Text>
                  )}
                  <Text style={styles.templateItems}>
                    {t.items.length} {t.items.length === 1 ? "item" : "items"} ·{" "}
                    {Math.round(t.totals.calories)} cal ·{" "}
                    {Math.round(t.totals.protein)}g protein
                  </Text>
                  {t.items.slice(0, 3).map((it) => (
                    <Text key={it.id} style={styles.templateItemLine}>
                      • {it.servings}× {it.savedFood?.name ?? "(deleted food)"}
                    </Text>
                  ))}
                  {t.items.length > 3 && (
                    <Text style={styles.templateItemMore}>
                      + {t.items.length - 3} more
                    </Text>
                  )}
                  <TouchableOpacity
                    onPress={() => setPendingLog(t)}
                    disabled={busyId === t.id || t.items.length === 0}
                    style={[
                      styles.logButton,
                      (busyId === t.id || t.items.length === 0) &&
                        styles.logButtonDisabled,
                    ]}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.logButtonText}>
                      {busyId === t.id ? "Logging…" : "Log this meal"}
                    </Text>
                  </TouchableOpacity>
                </View>
              ))
            )}
          </ScrollView>
        ) : (
          // CREATE mode
          <ScrollView style={styles.content} contentContainerStyle={styles.contentInner}>
            <Text style={styles.title}>New Template</Text>

            <Text style={styles.fieldLabel}>Name</Text>
            <TextInput
              style={styles.input}
              value={draftName}
              onChangeText={setDraftName}
              placeholder="e.g. Greek breakfast"
              placeholderTextColor={colors.mutedForeground}
              editable={!savingDraft}
            />

            <Text style={styles.fieldLabel}>Default Meal Type</Text>
            <View style={styles.chipsRow}>
              {MEAL_TYPES.map((t) => {
                const active = draftType === t.value;
                return (
                  <TouchableOpacity
                    key={t.value}
                    onPress={() => setDraftType(t.value)}
                    disabled={savingDraft}
                    style={[
                      styles.chip,
                      active && { backgroundColor: t.color, borderColor: t.color },
                    ]}
                  >
                    <Text
                      style={[
                        styles.chipText,
                        active && styles.chipTextActive,
                      ]}
                    >
                      {t.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={styles.fieldLabel}>Foods</Text>
            {draftItems.length === 0 && (
              <Text style={styles.emptyItems}>
                No foods added yet. Tap "Add Food" below.
              </Text>
            )}
            {draftItems.map((it, idx) => {
              const food = savedFoods.find((f) => f.id === it.saved_food_id);
              return (
                <View key={`${it.saved_food_id}-${idx}`} style={styles.itemRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.itemName}>
                      {food?.name ?? "(food not found)"}
                    </Text>
                    {food?.calories != null && (
                      <Text style={styles.itemMeta}>
                        {Math.round(food.calories * it.servings)} cal ·{" "}
                        {Math.round((food.protein ?? 0) * it.servings * 10) / 10}g P
                      </Text>
                    )}
                  </View>
                  <TextInput
                    style={styles.servingsInput}
                    value={it.servings.toString()}
                    onChangeText={(t) => {
                      const n = parseFloat(t);
                      if (!isNaN(n) && n > 0) updateDraftServings(idx, n);
                      else if (t === "") updateDraftServings(idx, 0);
                    }}
                    keyboardType="decimal-pad"
                    editable={!savingDraft}
                  />
                  <Text style={styles.servingsLabel}>servings</Text>
                  <TouchableOpacity
                    onPress={() => removeDraftItem(idx)}
                    style={styles.iconButton}
                    disabled={savingDraft}
                  >
                    <Trash2 size={16} color={colors.mutedForeground} />
                  </TouchableOpacity>
                </View>
              );
            })}

            <TouchableOpacity
              onPress={() => setFoodPickerVisible(true)}
              style={styles.addFoodButton}
              activeOpacity={0.7}
              disabled={savingDraft}
            >
              <Plus size={16} color="#3B82F6" />
              <Text style={styles.addFoodText}>Add Food from Library</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={handleSaveDraft}
              disabled={savingDraft}
              style={styles.saveButton}
              activeOpacity={0.7}
            >
              <Text style={styles.saveButtonText}>
                {savingDraft ? "Saving…" : "Save Template"}
              </Text>
            </TouchableOpacity>
          </ScrollView>
        )}

        {/* Food picker modal */}
        <Modal
          visible={foodPickerVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setFoodPickerVisible(false)}
        >
          <View style={styles.backdrop}>
            <View style={styles.pickerCard}>
              <Text style={styles.title}>Add a Food</Text>
              <TextInput
                style={styles.input}
                value={foodSearch}
                onChangeText={setFoodSearch}
                placeholder="Search your library..."
                placeholderTextColor={colors.mutedForeground}
                autoFocus
              />
              <ScrollView style={{ maxHeight: 360 }}>
                {filteredFoodsForPicker.length === 0 ? (
                  <Text style={styles.emptyItems}>
                    No saved foods match. Log foods from the Meals screen first.
                  </Text>
                ) : (
                  filteredFoodsForPicker.map((f) => (
                    <TouchableOpacity
                      key={f.id}
                      onPress={() => addFoodToDraft(f)}
                      style={styles.pickerRow}
                      activeOpacity={0.7}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={styles.pickerName}>{f.name}</Text>
                        {f.brand && <Text style={styles.pickerMeta}>{f.brand}</Text>}
                      </View>
                      {f.calories != null && (
                        <Text style={styles.pickerCals}>{f.calories} cal</Text>
                      )}
                    </TouchableOpacity>
                  ))
                )}
              </ScrollView>
              <TouchableOpacity
                onPress={() => setFoodPickerVisible(false)}
                style={[styles.cancelButton]}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        {/* "Log to which meal type?" picker */}
        <Modal
          visible={pendingLog !== null}
          transparent
          animationType="fade"
          onRequestClose={() => setPendingLog(null)}
        >
          <View style={styles.backdrop}>
            <View style={styles.pickerCard}>
              <Text style={styles.title}>Log as which meal?</Text>
              {pendingLog && (
                <Text style={styles.subtitle}>{pendingLog.name}</Text>
              )}
              <View style={styles.chipsRow}>
                {MEAL_TYPES.map((t) => {
                  const isDefault =
                    pendingLog?.default_meal_type === t.value;
                  return (
                    <TouchableOpacity
                      key={t.value}
                      onPress={() => handleLogTemplate(t.value)}
                      style={[
                        styles.chip,
                        isDefault && { borderColor: t.color },
                      ]}
                    >
                      <Text style={styles.chipText}>{t.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              <TouchableOpacity
                onPress={() => setPendingLog(null)}
                style={styles.cancelButton}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerBack: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  headerBackText: {
    fontSize: 17,
    color: colors.foreground,
  },
  newButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: "#3B82F6",
    borderRadius: 8,
  },
  newButtonText: {
    color: "#FFFFFF",
    fontWeight: "600",
    fontSize: 14,
  },
  content: { flex: 1 },
  contentInner: { padding: 20, paddingBottom: 60 },
  title: {
    fontSize: 22,
    fontWeight: "bold",
    color: colors.foreground,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 13,
    color: colors.mutedForeground,
    marginBottom: 20,
  },
  emptyState: {
    padding: 32,
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: "dashed",
    borderRadius: 12,
    alignItems: "center",
  },
  emptyText: {
    color: colors.mutedForeground,
    textAlign: "center",
  },
  templateCard: {
    backgroundColor: colors.card,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 12,
  },
  templateHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  templateName: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.foreground,
    flex: 1,
  },
  templateMeta: {
    fontSize: 11,
    color: colors.mutedForeground,
    textTransform: "capitalize",
    marginTop: 2,
  },
  templateItems: {
    fontSize: 12,
    color: colors.mutedForeground,
    marginTop: 6,
    marginBottom: 8,
  },
  templateItemLine: {
    fontSize: 13,
    color: colors.foreground,
    marginVertical: 1,
  },
  templateItemMore: {
    fontSize: 12,
    color: colors.mutedForeground,
    marginTop: 2,
  },
  iconButton: {
    padding: 6,
  },
  logButton: {
    marginTop: 12,
    backgroundColor: "#3B82F6",
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: "center",
  },
  logButtonDisabled: { opacity: 0.5 },
  logButtonText: {
    color: "#FFFFFF",
    fontWeight: "700",
    fontSize: 14,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.mutedForeground,
    textTransform: "uppercase",
    letterSpacing: 0.4,
    marginBottom: 6,
    marginTop: 16,
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
  chipsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#374151",
    backgroundColor: "#1F2937",
  },
  chipText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#D1D5DB",
  },
  chipTextActive: { color: "#FFFFFF" },
  emptyItems: {
    color: colors.mutedForeground,
    fontSize: 13,
    textAlign: "center",
    paddingVertical: 12,
  },
  itemRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  itemName: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.foreground,
  },
  itemMeta: {
    fontSize: 11,
    color: colors.mutedForeground,
    marginTop: 2,
  },
  servingsInput: {
    width: 50,
    backgroundColor: "#1F2937",
    borderWidth: 1,
    borderColor: "#374151",
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 6,
    fontSize: 13,
    color: "#FFFFFF",
    textAlign: "center",
  },
  servingsLabel: {
    fontSize: 11,
    color: colors.mutedForeground,
  },
  addFoodButton: {
    marginTop: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: "#374151",
    borderStyle: "dashed",
    borderRadius: 8,
  },
  addFoodText: {
    color: "#3B82F6",
    fontWeight: "600",
    fontSize: 14,
  },
  saveButton: {
    marginTop: 24,
    backgroundColor: "#22C55E",
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: "center",
  },
  saveButtonText: {
    color: "#FFFFFF",
    fontWeight: "700",
    fontSize: 16,
  },
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  pickerCard: {
    width: "100%",
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pickerRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  pickerName: {
    fontSize: 14,
    color: colors.foreground,
    fontWeight: "600",
  },
  pickerMeta: {
    fontSize: 11,
    color: colors.mutedForeground,
  },
  pickerCals: {
    fontSize: 13,
    color: colors.mutedForeground,
  },
  cancelButton: {
    marginTop: 12,
    paddingVertical: 12,
    alignItems: "center",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cancelButtonText: {
    color: colors.foreground,
    fontWeight: "600",
  },
});
