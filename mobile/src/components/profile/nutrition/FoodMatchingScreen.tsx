// mobile/src/components/profile/nutrition/FoodMatchingScreen.tsx
// Concept↔product linking UI (Nutrition OS Phase 2, spec §9.2). Two groups:
// "Needs review" (unlinked saved foods + inventory, with head-noun
// suggestions to confirm) and "Linked" (existing links with unlink).
// No rejection memory — unmatched products simply stay in Needs review.
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  SectionList,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Check, ChevronLeft } from "lucide-react-native";
import type { FoodConcept } from "@/src/types/nutrition-preferences";
import { suggestConcepts } from "@/src/lib/conceptMatch";
import {
  createUserLink,
  deleteLink,
  fetchFoodMatching,
  type FoodMatchingData,
} from "@/src/lib/supabase/mealLibrary";
import { colors, radii, spacing, typography } from "@/src/theme/tokens";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  LoadingState,
  SectionHeader,
} from "@/src/components/ui";

interface ProductRef {
  key: string;
  kind: "saved" | "inventory";
  id: string;
  name: string;
  brand: string | null;
}

interface LinkedRow {
  key: string;
  linkId: string;
  productName: string;
  conceptName: string;
  matchedBy: string;
}

type Row =
  | { type: "product"; product: ProductRef }
  | { type: "linked"; linked: LinkedRow };

interface FoodMatchingScreenProps {
  userId: string;
  onBack: () => void;
}

export function FoodMatchingScreen({ userId, onBack }: FoodMatchingScreenProps) {
  const insets = useSafeAreaInsets();
  const [data, setData] = useState<FoodMatchingData | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [pickingFor, setPickingFor] = useState<string | null>(null); // ProductRef.key
  const [search, setSearch] = useState("");

  const load = useCallback(async (options?: { silent?: boolean }) => {
    try {
      setData(await fetchFoodMatching());
      setLoadFailed(false);
    } catch (e) {
      setLoadFailed(true);
      if (!options?.silent) {
        Alert.alert(
          "Failed to load food matching",
          e instanceof Error ? e.message : "Unknown error"
        );
      }
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const run = useCallback(
    async (title: string, fn: () => Promise<void>) => {
      try {
        await fn();
        await load();
      } catch (e) {
        Alert.alert(title, e instanceof Error ? e.message : "Unknown error");
        await load({ silent: true });
      }
    },
    [load]
  );

  const sections = useMemo(() => {
    if (!data) return [];
    const linkedSaved = new Set(data.links.map((l) => l.saved_food_id).filter(Boolean));
    const linkedInv = new Set(
      data.links.map((l) => l.food_inventory_id).filter(Boolean)
    );
    const needsReview: Row[] = [
      ...data.savedFoods
        .filter((f) => !linkedSaved.has(f.id))
        .map((f): Row => ({
          type: "product",
          product: { key: `saved:${f.id}`, kind: "saved", id: f.id, name: f.name, brand: f.brand },
        })),
      ...data.inventory
        .filter((i) => !linkedInv.has(i.id))
        .map((i): Row => ({
          type: "product",
          product: { key: `inv:${i.id}`, kind: "inventory", id: i.id, name: i.name, brand: i.brand },
        })),
    ];
    const conceptName = (id: string) =>
      data.concepts.find((c) => c.id === id)?.name ?? "?";
    const linked: Row[] = data.links.map((l) => {
      const productName = l.saved_food_id
        ? data.savedFoods.find((f) => f.id === l.saved_food_id)?.name ?? "?"
        : data.inventory.find((i) => i.id === l.food_inventory_id)?.name ?? "?";
      return {
        type: "linked",
        linked: {
          key: `link:${l.id}`,
          linkId: l.id,
          productName,
          conceptName: conceptName(l.concept_id),
          matchedBy: l.matched_by,
        },
      };
    });
    // Counts come from the same arrays that are handed to the SectionList —
    // there is no second filter pass that could drift from the title. They
    // ride beside the title rather than inside it so the header can render
    // them as a `Badge` (the Task 6 shopping-sections precedent).
    return [
      { title: "Needs review", count: needsReview.length, data: needsReview },
      { title: "Linked", count: linked.length, data: linked },
    ].filter((sec) => sec.data.length > 0);
  }, [data]);

  const confirmLink = useCallback(
    (product: ProductRef, concept: FoodConcept) => {
      setPickingFor(null);
      setSearch("");
      run("Failed to link food", () =>
        createUserLink(
          userId,
          concept.id,
          product.kind === "saved"
            ? { savedFoodId: product.id }
            : { foodInventoryId: product.id }
        )
      );
    },
    [userId, run]
  );

  const renderProduct = (product: ProductRef) => {
    // `data` is non-null on every path that reaches here (rows only exist
    // inside the loaded branch below), but reading through `?? []` keeps that
    // an invariant the type system checks rather than one a `!` asserts.
    const concepts = data?.concepts ?? [];
    const suggestions = suggestConcepts(
      product.name,
      concepts.map((c) => ({ id: c.id, name: c.name }))
    ).slice(0, 3);
    // `pickingFor` holds at most one product key, so only the row the user
    // actually opened reads `search` — the other rows short-circuit here and
    // never render a picker, let alone a filtered one.
    const picking = pickingFor === product.key;
    const q = search.trim().toLowerCase();
    const pickerResults = picking
      ? concepts.filter((c) => !q || c.name.toLowerCase().includes(q)).slice(0, 6)
      : [];
    return (
      <Card variant="row" style={styles.cardSpacing}>
        <Text style={styles.itemTitle}>{product.name}</Text>
        {product.brand && <Text style={styles.mutedText}>{product.brand}</Text>}
        <View style={styles.chipRow}>
          {suggestions.map(({ conceptId }) => {
            const c = concepts.find((x) => x.id === conceptId);
            if (!c) return null;
            return (
              <Button
                key={conceptId}
                variant="secondary"
                size="sm"
                icon={Check}
                label={c.name}
                onPress={() => confirmLink(product, c)}
              />
            );
          })}
          <Button
            variant="secondary"
            size="sm"
            label={picking ? "Cancel" : "Choose…"}
            onPress={() => {
              setPickingFor(picking ? null : product.key);
              setSearch("");
            }}
          />
        </View>
        {picking && (
          <View style={styles.picker}>
            <TextInput
              style={styles.input}
              placeholder="Search concepts…"
              placeholderTextColor={colors.textMuted}
              value={search}
              onChangeText={setSearch}
              autoFocus
            />
            {pickerResults.map((c) => (
              <TouchableOpacity
                key={c.id}
                style={styles.pickerRow}
                onPress={() => confirmLink(product, c)}
              >
                <Text style={styles.mutedText}>
                  {c.name} · {c.rating}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </Card>
    );
  };

  const renderLinked = (row: LinkedRow) => (
    <Card variant="row" style={styles.linkedRow}>
      <View style={styles.flexShrinkColumn}>
        <Text style={styles.itemTitle} numberOfLines={1}>
          {row.productName}
        </Text>
        <Text style={styles.mutedText}>
          → {row.conceptName} ({row.matchedBy})
        </Text>
      </View>
      <Button
        variant="destructive"
        size="sm"
        label="Unlink"
        onPress={() =>
          Alert.alert("Unlink", `Unlink "${row.productName}" from ${row.conceptName}?`, [
            { text: "Cancel", style: "cancel" },
            {
              text: "Unlink",
              style: "destructive",
              onPress: () => run("Failed to unlink", () => deleteLink(row.linkId)),
            },
          ])
        }
      />
    </Card>
  );

  // The header always renders regardless of load state (same reasoning as
  // NutritionPreferencesScreen): a load failure must never strand the user
  // with no way back to preferences. Only the body varies.
  let body: React.ReactNode;
  if (!data && loadFailed) {
    body = (
      <EmptyState
        title="Couldn't load food matching."
        action={{ label: "Retry", onPress: () => load() }}
      />
    );
  } else if (!data) {
    body = <LoadingState />;
  } else {
    body = (
      <SectionList
        sections={sections}
        keyExtractor={(row) => (row.type === "product" ? row.product.key : row.linked.key)}
        keyboardShouldPersistTaps="handled"
        // This screen owns its own chrome, so the list owns the gutter too —
        // one gutter owner, and the cards carry none.
        contentContainerStyle={[
          styles.listContent,
          { paddingBottom: insets.bottom + spacing.xxl },
        ]}
        renderItem={({ item }) =>
          item.type === "product" ? renderProduct(item.product) : renderLinked(item.linked)
        }
        renderSectionHeader={({ section }) => (
          <View style={styles.sectionHeaderWrap}>
            <SectionHeader
              title={section.title}
              badge={<Badge label={String(section.count)} tone="neutral" />}
            />
          </View>
        )}
      />
    );
  }

  return (
    <>
      {/* Bespoke bar rather than `Screen variant="detail"`: the left
          affordance is a LABELLED back ("Back"), which `Screen` — chevron
          only, no `headerLeft` slot — cannot express without changing the
          navigation affordance. Same call Tasks 8/9 made for
          `MealsWeeklySummaryModal` and `WaterScreen`. Equal flanks keep the
          title optically centered, mirroring `Screen`'s own detail bar. */}
      <View style={styles.header}>
        <View style={styles.flank}>
          <Button
            variant="ghost"
            size="sm"
            icon={ChevronLeft}
            label="Back"
            onPress={onBack}
          />
        </View>
        <Text style={styles.headerTitle} numberOfLines={1}>
          Food Matching
        </Text>
        <View style={[styles.flank, styles.flankRight]} />
      </View>
      {body}
    </>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.screenGutter,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  flank: { flex: 1, minWidth: 32, alignItems: "flex-start" },
  flankRight: { alignItems: "flex-end" },
  headerTitle: {
    ...typography.titleBar,
    color: colors.text,
    flexShrink: 1,
    textAlign: "center",
  },
  listContent: {
    paddingHorizontal: spacing.screenGutter,
    paddingTop: spacing.lg,
  },
  sectionHeaderWrap: { marginBottom: spacing.md },
  cardSpacing: { marginBottom: spacing.md },
  linkedRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  flexShrinkColumn: { flexShrink: 1 },
  itemTitle: { ...typography.rowTitle, color: colors.text },
  mutedText: { ...typography.body, color: colors.textMuted },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  picker: { paddingVertical: spacing.md },
  pickerRow: { paddingVertical: spacing.sm },
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
});
