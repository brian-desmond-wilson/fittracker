// mobile/src/components/profile/nutrition/FoodMatchingScreen.tsx
// Concept↔product linking UI (Nutrition OS Phase 2, spec §9.2). Two groups:
// "Needs review" (unlinked saved foods + inventory, with head-noun
// suggestions to confirm) and "Linked" (existing links with unlink).
// No rejection memory — unmatched products simply stay in Needs review.
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  SectionList,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { FoodConcept } from "@/src/types/nutrition-preferences";
import { suggestConcepts } from "@/src/lib/conceptMatch";
import {
  createUserLink,
  deleteLink,
  fetchFoodMatching,
  type FoodMatchingData,
} from "@/src/lib/supabase/mealLibrary";
import { colors } from "@/src/lib/colors";
import { nutritionStyles as s } from "./styles";

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
    // there is no second filter pass that could drift from the title.
    return [
      { title: `Needs review (${needsReview.length})`, data: needsReview },
      { title: `Linked (${linked.length})`, data: linked },
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
      <View style={s.card}>
        <Text style={s.itemTitle}>{product.name}</Text>
        {product.brand && <Text style={s.mutedText}>{product.brand}</Text>}
        <View style={s.chipRow}>
          {suggestions.map(({ conceptId }) => {
            const c = concepts.find((x) => x.id === conceptId);
            if (!c) return null;
            return (
              <TouchableOpacity
                key={conceptId}
                style={s.chip}
                onPress={() => confirmLink(product, c)}
              >
                <Text style={s.chipText}>✓ {c.name}</Text>
              </TouchableOpacity>
            );
          })}
          <TouchableOpacity
            style={s.chip}
            onPress={() => {
              setPickingFor(picking ? null : product.key);
              setSearch("");
            }}
          >
            <Text style={s.chipText}>{picking ? "Cancel" : "Choose…"}</Text>
          </TouchableOpacity>
        </View>
        {picking && (
          <View style={s.chipPickerContainer}>
            <TextInput
              style={s.input}
              placeholder="Search concepts…"
              placeholderTextColor={colors.mutedForeground}
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
                <Text style={s.mutedText}>
                  {c.name} · {c.rating}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>
    );
  };

  const renderLinked = (row: LinkedRow) => (
    <View style={[s.card, s.row]}>
      <View style={s.flexShrinkColumn}>
        <Text style={s.itemTitle} numberOfLines={1}>
          {row.productName}
        </Text>
        <Text style={s.mutedText}>
          → {row.conceptName} ({row.matchedBy})
        </Text>
      </View>
      <TouchableOpacity
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
      >
        <Text style={styles.unlinkText}>Unlink</Text>
      </TouchableOpacity>
    </View>
  );

  // The header always renders regardless of load state (same reasoning as
  // NutritionPreferencesScreen): a load failure must never strand the user
  // with no way back to preferences. Only the body varies.
  let body: React.ReactNode;
  if (!data && loadFailed) {
    body = (
      <View style={[styles.centerFill, { paddingHorizontal: 24 }]}>
        <Text style={s.mutedText}>Couldn&apos;t load food matching.</Text>
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
      <SectionList
        sections={sections}
        keyExtractor={(row) => (row.type === "product" ? row.product.key : row.linked.key)}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
        renderItem={({ item }) =>
          item.type === "product" ? renderProduct(item.product) : renderLinked(item.linked)
        }
        renderSectionHeader={({ section }) => (
          <Text style={[s.sectionTitle, styles.sectionHeader]}>{section.title}</Text>
        )}
      />
    );
  }

  return (
    <>
      <View style={s.header}>
        <TouchableOpacity onPress={onBack}>
          <Text style={s.headerAction}>‹ Back</Text>
        </TouchableOpacity>
        <Text style={s.headerTitle}>Food Matching</Text>
        <View style={styles.headerSpacer} />
      </View>
      {body}
    </>
  );
}

const styles = StyleSheet.create({
  centerFill: { flex: 1, justifyContent: "center", alignItems: "center" },
  retryButton: { marginTop: 16, paddingHorizontal: 24 },
  pickerRow: { paddingVertical: 8 },
  unlinkText: { color: "#F87171", fontSize: 15 },
  // Cards carry marginHorizontal: 16; without this the section headings would
  // sit flush against the screen edge, out of line with everything below them.
  sectionHeader: { paddingHorizontal: 16 },
  // Balances the "‹ Back" action so the title stays optically centered.
  headerSpacer: { width: 44 },
});
