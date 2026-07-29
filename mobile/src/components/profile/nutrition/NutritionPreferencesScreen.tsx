import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  type ListRenderItemInfo,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type {
  CalorieRampLevel,
  ConceptRating,
  FoodConcept,
  NutritionVendor,
} from "@/src/types/nutrition-preferences";
import {
  changeRampLevel,
  createConcept,
  deleteConcept,
  fetchNutritionPreferences,
  fetchRecentWeighIns,
  updateConcept,
  updateConstraints,
  updateVendor,
  type ConceptPatch,
  type ConstraintsPatch,
  type NutritionPreferencesData,
} from "@/src/lib/supabase/nutritionPreferences";
import { assessRampProgress, type RampAssessment } from "@/src/lib/rampProgress";
import { getLocalDateString } from "@/src/components/track/meals/mealsHelpers";
import { colors } from "@/src/lib/colors";
import { RampCard } from "./RampCard";
import { ConstraintsSection } from "./ConstraintsSection";
import { VendorsSection } from "./VendorsSection";
import { ConceptRow } from "./ConceptRow";
import { nutritionStyles as s } from "./styles";

const TREND_WINDOW_DAYS = 42; // 6 weeks of weigh-ins for the ramp assessment

// Blockers first: never -> dislike -> neutral -> like -> love, then name.
const RATING_ORDER: Record<ConceptRating, number> = {
  never: 0,
  dislike: 1,
  neutral: 2,
  like: 3,
  love: 4,
};

interface NutritionPreferencesScreenProps {
  userId: string;
  onClose: () => void;
}

export function NutritionPreferencesScreen({
  userId,
  onClose,
}: NutritionPreferencesScreenProps) {
  const insets = useSafeAreaInsets();
  const [data, setData] = useState<NutritionPreferencesData | null>(null);
  const [assessment, setAssessment] = useState<RampAssessment | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [newConceptName, setNewConceptName] = useState("");

  // `silent` suppresses the failure alert for the post-write resync path
  // (run() below already shows its own, more specific alert for that case;
  // firing a second "failed to load" alert back-to-back is confusing noise —
  // RN/iOS commonly drops or garbles the second of two stacked alerts).
  const load = useCallback(async (options?: { silent?: boolean }) => {
    try {
      const since = new Date();
      since.setDate(since.getDate() - TREND_WINDOW_DAYS);
      // No data dependency between these two — run them together instead of
      // paying for two sequential round trips on every load/refetch.
      const [prefs, weighIns] = await Promise.all([
        fetchNutritionPreferences(),
        fetchRecentWeighIns(getLocalDateString(since)),
      ]);
      setData(prefs);
      const active = prefs.rampLevels.find((l) => l.is_active) ?? null;
      const today = getLocalDateString();
      setAssessment(
        assessRampProgress({
          weighIns,
          levelStartedAt: active?.started_at ?? null,
          today,
        })
      );
      setLoadFailed(false);
    } catch (e) {
      setLoadFailed(true);
      if (!options?.silent) {
        Alert.alert(
          "Failed to load preferences",
          e instanceof Error ? e.message : "Unknown error"
        );
      }
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Shared write idiom: mutate, then always refetch from DB — on success to
  // pick up server-computed fields, on failure so local state never drifts
  // from what was actually persisted. Returns whether the write itself
  // succeeded, so callers can decide what to do with in-flight local state
  // (e.g. not clearing a text input on a failed add).
  const run = useCallback(
    async (title: string, fn: () => Promise<void>): Promise<boolean> => {
      try {
        await fn();
        await load();
        return true;
      } catch (e) {
        Alert.alert(title, e instanceof Error ? e.message : "Unknown error");
        await load({ silent: true });
        return false;
      }
    },
    [load]
  );

  const handleChangeLevel = useCallback(
    (target: CalorieRampLevel) => {
      run("Failed to change level", () =>
        changeRampLevel(target.id, getLocalDateString())
      );
    },
    [run]
  );

  const handleConstraintsPatch = useCallback(
    (patch: ConstraintsPatch) => {
      const constraintsId = data?.constraints?.id;
      if (!constraintsId) return;
      run("Failed to save constraints", () =>
        updateConstraints(constraintsId, patch)
      );
    },
    [data, run]
  );

  const handleVendorToggle = useCallback(
    (vendor: NutritionVendor, isActive: boolean) => {
      run("Failed to save vendor", () =>
        updateVendor(vendor.id, { is_active: isActive })
      );
    },
    [run]
  );

  const handleConceptPatch = useCallback(
    (concept: FoodConcept, patch: ConceptPatch) => {
      run("Failed to save food", () => updateConcept(concept.id, patch));
    },
    [run]
  );

  const handleConceptDelete = useCallback(
    (concept: FoodConcept) => {
      run("Failed to delete food", () => deleteConcept(concept.id));
    },
    [run]
  );

  const handleAddConcept = useCallback(async () => {
    const name = newConceptName.trim();
    if (!name) return;
    // Only clear the input on success — a failed insert (duplicate slug,
    // network) shouldn't lose what the user typed.
    const ok = await run("Failed to add food", () =>
      createConcept(userId, name, "neutral")
    );
    if (ok) setNewConceptName("");
  }, [newConceptName, userId, run]);

  const handleToggleExpand = useCallback((id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  }, []);

  // Stabilized so ConceptRow's React.memo actually bails on unrelated
  // re-renders (e.g. every keystroke in the search box above).
  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<FoodConcept>) => (
      <ConceptRow
        concept={item}
        expanded={expandedId === item.id}
        onToggleExpand={handleToggleExpand}
        onPatch={handleConceptPatch}
        onDelete={handleConceptDelete}
      />
    ),
    [expandedId, handleToggleExpand, handleConceptPatch, handleConceptDelete]
  );

  const filteredConcepts = useMemo(() => {
    if (!data) return [];
    const q = search.trim().toLowerCase();
    const list = q
      ? data.concepts.filter((c) => c.name.toLowerCase().includes(q))
      : data.concepts;
    return [...list].sort(
      (a, b) =>
        RATING_ORDER[a.rating] - RATING_ORDER[b.rating] ||
        a.name.localeCompare(b.name)
    );
  }, [data, search]);

  // The header (title + Done) always renders regardless of load state: this
  // modal is presentationStyle="fullScreen" with no iOS swipe-to-dismiss
  // (onRequestClose is Android-only), so a load failure must never strand
  // the user on a bare spinner with no way out. Only the body varies.
  let body: React.ReactNode;
  if (!data && loadFailed) {
    body = (
      <View style={[styles.centerFill, { paddingHorizontal: 24 }]}>
        <Text style={s.mutedText}>Couldn&apos;t load your nutrition preferences.</Text>
        <TouchableOpacity
          style={[s.primaryButton, styles.retryButton]}
          onPress={() => load()}
        >
          <Text style={s.primaryButtonText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  } else if (!data) {
    body = (
      <View style={styles.centerFill}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  } else {
    body = (
      <FlatList
        data={filteredConcepts}
        keyExtractor={(c) => c.id}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
        ListHeaderComponent={
          <View>
            <RampCard
              levels={data.rampLevels}
              assessment={assessment}
              onChangeLevel={handleChangeLevel}
            />
            {data.constraints && (
              <ConstraintsSection
                constraints={data.constraints}
                onPatch={handleConstraintsPatch}
              />
            )}
            <VendorsSection
              vendors={data.vendors}
              onToggleActive={handleVendorToggle}
            />
            <View style={s.card}>
              <Text style={s.sectionTitle}>Food Ratings</Text>
              <Text style={s.mutedText}>
                ✂︎ small pieces · ⏱ prep-intensive
              </Text>
              <TextInput
                style={s.input}
                placeholder="Search foods..."
                placeholderTextColor={colors.mutedForeground}
                value={search}
                onChangeText={setSearch}
              />
              <View style={[s.row, { gap: 8 }]}>
                <TextInput
                  style={[s.input, { flex: 1 }]}
                  placeholder="Add a food (e.g. Pickles)"
                  placeholderTextColor={colors.mutedForeground}
                  value={newConceptName}
                  onChangeText={setNewConceptName}
                  onSubmitEditing={handleAddConcept}
                />
                <TouchableOpacity
                  style={[s.primaryButton, { paddingHorizontal: 16 }]}
                  onPress={handleAddConcept}
                >
                  <Text style={s.primaryButtonText}>Add</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        }
        renderItem={renderItem}
      />
    );
  }

  return (
    <>
      <StatusBar barStyle="light-content" />
      <View style={[s.screen, { paddingTop: insets.top }]}>
        <View style={s.header}>
          <Text style={s.headerTitle}>Nutrition Preferences</Text>
          <TouchableOpacity onPress={onClose}>
            <Text style={s.headerAction}>Done</Text>
          </TouchableOpacity>
        </View>
        {body}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  centerFill: { flex: 1, justifyContent: "center", alignItems: "center" },
  retryButton: { marginTop: 16, paddingHorizontal: 24 },
});
