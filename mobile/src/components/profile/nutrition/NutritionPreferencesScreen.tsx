import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  FlatList,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
  type ListRenderItemInfo,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ChevronRight } from "lucide-react-native";
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
import { getLocalDateString } from "@/src/lib/dates";
import { colors, icons, radii, spacing, typography } from "@/src/theme/tokens";
import {
  Button,
  Card,
  EmptyState,
  LoadingState,
  Screen,
  SectionHeader,
} from "@/src/components/ui";
import { RampCard } from "./RampCard";
import { ConstraintsSection } from "./ConstraintsSection";
import { VendorsSection, type VendorPatch } from "./VendorsSection";
import { ConceptRow } from "./ConceptRow";
import { FoodMatchingScreen } from "./FoodMatchingScreen";

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
  const [showMatching, setShowMatching] = useState(false);

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

  const handleVendorPatch = useCallback(
    (vendor: NutritionVendor, patch: VendorPatch) => {
      run("Failed to save vendor", () => updateVendor(vendor.id, patch));
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

  // View switch, not a nested <Modal>: this screen is already inside a
  // presentationStyle="fullScreen" modal, and stacking a second one is where
  // iOS gets flaky. Keep the same outer container (StatusBar + inset-padded
  // screen) and swap only its contents — FoodMatchingScreen brings its own
  // header with a Back action. Placed after every hook and before the `body`
  // branches, so no hook is skipped and no unused body is built.
  if (showMatching) {
    return (
      <>
        <StatusBar barStyle="light-content" />
        <View style={[styles.screen, { paddingTop: insets.top }]}>
          <FoodMatchingScreen
            userId={userId}
            onBack={() => {
              setShowMatching(false);
              // Concept links may have changed; resync silently (the user is
              // back on a screen that already has data — a failure alert here
              // would be noise, and loadFailed still drives the Retry body).
              load({ silent: true });
            }}
          />
        </View>
      </>
    );
  }

  // The header (title + Done) always renders regardless of load state: this
  // modal is presentationStyle="fullScreen" with no iOS swipe-to-dismiss
  // (onRequestClose is Android-only), so a load failure must never strand
  // the user on a bare spinner with no way out. Only the body varies.
  let body: React.ReactNode;
  if (!data && loadFailed) {
    body = (
      <EmptyState
        title="Couldn't load your nutrition preferences."
        action={{ label: "Retry", onPress: () => load() }}
      />
    );
  } else if (!data) {
    body = <LoadingState />;
  } else {
    body = (
      <FlatList
        data={filteredConcepts}
        keyExtractor={(c) => c.id}
        keyboardShouldPersistTaps="handled"
        // `Screen scroll={false}` applies neither the horizontal gutter nor
        // the bottom inset — the list owns both.
        contentContainerStyle={[
          styles.listContent,
          { paddingBottom: insets.bottom + spacing.xxl },
        ]}
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
              onPatch={handleVendorPatch}
            />
            <Card
              variant="row"
              style={styles.navRow}
              onPress={() => setShowMatching(true)}
            >
              <View style={styles.flexShrinkColumn}>
                <Text style={styles.rowTitle}>Food Matching</Text>
                <Text style={styles.mutedText}>
                  Link products to rated concepts — powers meal scoring &amp;
                  stock tracking
                </Text>
              </View>
              <ChevronRight
                size={icons.md}
                color={colors.textMuted}
                strokeWidth={icons.strokeWidth}
              />
            </Card>
            <Card variant="panel" style={styles.cardSpacing}>
              <View style={styles.sectionHeaderWrap}>
                <SectionHeader title="Food Ratings" />
              </View>
              <Text style={styles.mutedText}>
                ✂︎ small pieces · ⏱ prep-intensive
              </Text>
              <TextInput
                style={[styles.input, styles.searchInput]}
                placeholder="Search foods..."
                placeholderTextColor={colors.textMuted}
                value={search}
                onChangeText={setSearch}
              />
              <View style={styles.addRow}>
                <TextInput
                  style={[styles.input, styles.addInput]}
                  placeholder="Add a food (e.g. Pickles)"
                  placeholderTextColor={colors.textMuted}
                  value={newConceptName}
                  onChangeText={setNewConceptName}
                  onSubmitEditing={handleAddConcept}
                />
                <Button label="Add" onPress={handleAddConcept} />
              </View>
            </Card>
          </View>
        }
        renderItem={renderItem}
      />
    );
  }

  return (
    <Screen
      variant="detail"
      title="Nutrition Preferences"
      scroll={false}
      headerRight={
        <Button variant="ghost" size="sm" label="Done" onPress={onClose} />
      }
    >
      {body}
    </Screen>
  );
}

const styles = StyleSheet.create({
  // Only the FoodMatching view switch needs this — the main branch is wrapped
  // by `Screen`, which owns the background, StatusBar and top inset.
  screen: { flex: 1, backgroundColor: colors.bg },
  listContent: {
    paddingHorizontal: spacing.screenGutter,
    paddingTop: spacing.lg,
  },
  cardSpacing: { marginBottom: spacing.lg },
  // `SectionHeader` takes no style prop, so the gap below it lives on a wrapper.
  sectionHeaderWrap: { marginBottom: spacing.md },
  navRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  flexShrinkColumn: { flexShrink: 1 },
  rowTitle: { ...typography.rowTitle, color: colors.text },
  mutedText: { ...typography.body, color: colors.textMuted },
  input: {
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.control,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: 16, // §4.5 defines no input token
    color: colors.text,
  },
  searchInput: { marginTop: spacing.md },
  addRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  addInput: { flex: 1 },
});
