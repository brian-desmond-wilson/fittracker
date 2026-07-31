// The first shopping surface (Nutrition OS Phase 5, spec §9.2). Renders what
// fetchShoppingData computes: Suggested (confirm-to-add), the list grouped
// by vendor with deep links, and the purchased lifecycle with restock-back.
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator, Alert, Linking, SectionList, StatusBar, StyleSheet,
  Text, TouchableOpacity, View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ChevronLeft, ShoppingCart } from "lucide-react-native";
import { supabase } from "@/src/lib/supabase";
import type { ShoppingListItem } from "@/src/types/track";
import type { ShoppingSuggestion } from "@/src/lib/shoppingDemand";
import {
  addSuggestions, clearPurchased, deleteListItem, fetchShoppingData,
  markPurchased, unmarkPurchased, updateListItem, type ShoppingData,
} from "@/src/lib/supabase/shopping";
import { transferInventoryUnits } from "@/src/lib/supabase/inventory";
import { getLocalDateString } from "./meals/mealsHelpers";

const ANYWHERE = "__anywhere__";

type Row =
  | { kind: "suggestion"; suggestion: ShoppingSuggestion }
  | { kind: "item"; item: ShoppingListItem }
  | { kind: "purchased"; item: ShoppingListItem };

interface ShoppingListScreenProps {
  onClose: () => void;
}

export function ShoppingListScreen({ onClose }: ShoppingListScreenProps) {
  const insets = useSafeAreaInsets();
  const [data, setData] = useState<ShoppingData | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [showPurchased, setShowPurchased] = useState(false);
  const [vendorPickerFor, setVendorPickerFor] = useState<string | null>(null);

  const load = useCallback(async (options?: { silent?: boolean }) => {
    try {
      setData(await fetchShoppingData(getLocalDateString()));
      setLoadFailed(false);
    } catch (e) {
      setLoadFailed(true);
      if (!options?.silent) {
        Alert.alert("Failed to load shopping list", e instanceof Error ? e.message : "Unknown error");
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
    [load],
  );

  const getUserId = async (): Promise<string> => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Not signed in");
    return user.id;
  };

  const handleAdd = useCallback(
    (suggestions: ShoppingSuggestion[]) =>
      run("Failed to add", async () => addSuggestions(await getUserId(), suggestions)),
    [run],
  );

  const handlePurchase = useCallback(
    async (item: ShoppingListItem) => {
      await run("Failed to mark purchased", () => markPurchased(item.id));
      const targetLocationId = item.food_inventory_id
        ? data?.restockTargetByItemId.get(item.food_inventory_id)
        : undefined;
      if (item.food_inventory_id && targetLocationId) {
        Alert.alert("Purchased", `Add ${item.quantity} ${item.unit} to stock?`, [
          { text: "Not now", style: "cancel" },
          {
            text: "Add to stock",
            onPress: () =>
              run("Failed to restock", () =>
                transferInventoryUnits(item.food_inventory_id!, null, targetLocationId, item.quantity),
              ),
          },
        ]);
      }
    },
    [run, data],
  );

  const sections = useMemo(() => {
    if (!data) return [];
    const out: Array<{ key: string; title: string; url: string | null; data: Row[] }> = [];
    if (data.suggestions.length > 0) {
      out.push({
        key: "suggested",
        title: `Suggested (${data.suggestions.length})`,
        url: null,
        data: data.suggestions.map((s) => ({ kind: "suggestion" as const, suggestion: s })),
      });
    }
    const active = data.listRows.filter((r) => !r.is_purchased);
    const vendorSections = [
      ...data.vendors
        .filter((v) => v.is_active)
        .map((v) => ({ key: v.id, title: v.name, url: v.app_url })),
      { key: ANYWHERE, title: "Anywhere", url: null as string | null },
    ];
    for (const vs of vendorSections) {
      const rows = active.filter((r) =>
        vs.key === ANYWHERE
          ? r.vendor_id === null || !data.vendors.some((v) => v.id === r.vendor_id && v.is_active)
          : r.vendor_id === vs.key,
      );
      if (rows.length > 0) {
        out.push({ ...vs, data: rows.map((item) => ({ kind: "item" as const, item })) });
      }
    }
    const purchased = data.listRows.filter((r) => r.is_purchased);
    if (purchased.length > 0) {
      out.push({
        key: "purchased",
        title: `Purchased (${purchased.length})`,
        url: null,
        data: showPurchased ? purchased.map((item) => ({ kind: "purchased" as const, item })) : [],
      });
    }
    return out;
  }, [data, showPurchased]);

  const renderRow = useCallback(
    ({ item: row }: { item: Row }) => {
      if (row.kind === "suggestion") {
        const s = row.suggestion;
        return (
          <View style={styles.row}>
            <View style={styles.rowMain}>
              <Text style={styles.rowName} numberOfLines={1}>
                {s.name} <Text style={styles.rowQty}>×{s.quantity}</Text>
              </Text>
              <Text style={styles.rowReason} numberOfLines={2}>{s.reasons.join(" · ")}</Text>
            </View>
            <TouchableOpacity style={styles.addButton} onPress={() => handleAdd([s])}>
              <Text style={styles.addButtonText}>＋</Text>
            </TouchableOpacity>
          </View>
        );
      }
      const item = row.item;
      const purchased = row.kind === "purchased";
      return (
        <View style={styles.row}>
          <TouchableOpacity
            style={[styles.checkbox, purchased && styles.checkboxChecked]}
            onPress={() =>
              purchased
                ? run("Failed to restore", () => unmarkPurchased(item.id))
                : handlePurchase(item)
            }
          >
            {purchased && <Text style={styles.checkmark}>✓</Text>}
          </TouchableOpacity>
          <View style={styles.rowMain}>
            <Text style={[styles.rowName, purchased && styles.rowNamePurchased]} numberOfLines={1}>
              {item.name} <Text style={styles.rowQty}>×{item.quantity} {item.unit}</Text>
            </Text>
            {item.notes ? <Text style={styles.rowReason} numberOfLines={1}>{item.notes}</Text> : null}
            {vendorPickerFor === item.id && data && (
              <View style={styles.vendorPicker}>
                {[...data.vendors.filter((v) => v.is_active), null].map((v) => (
                  <TouchableOpacity
                    key={v?.id ?? ANYWHERE}
                    style={styles.vendorChip}
                    onPress={() => {
                      setVendorPickerFor(null);
                      run("Failed to set vendor", () =>
                        updateListItem(item.id, { vendor_id: v?.id ?? null }),
                      );
                    }}
                  >
                    <Text style={styles.vendorChipText}>{v?.name ?? "Anywhere"}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>
          {!purchased && (
            <TouchableOpacity
              onPress={() => setVendorPickerFor((p) => (p === item.id ? null : item.id))}
            >
              <Text style={styles.vendorAction}>⇄</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            onPress={() =>
              Alert.alert("Remove", `Remove "${item.name}" from the list?`, [
                { text: "Cancel", style: "cancel" },
                { text: "Remove", style: "destructive",
                  onPress: () => run("Failed to remove", () => deleteListItem(item.id)) },
              ])
            }
          >
            <Text style={styles.deleteAction}>✕</Text>
          </TouchableOpacity>
        </View>
      );
    },
    [data, vendorPickerFor, handleAdd, handlePurchase, run],
  );

  let body: React.ReactNode;
  if (!data && loadFailed) {
    body = (
      <View style={styles.centerFill}>
        <Text style={styles.mutedText}>Couldn&apos;t load your shopping list.</Text>
        <TouchableOpacity style={styles.retryButton} onPress={() => load()}>
          <Text style={styles.retryText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  } else if (!data) {
    body = (
      <View style={styles.centerFill}>
        <ActivityIndicator color="#14B8A6" />
      </View>
    );
  } else {
    body = (
      <SectionList
        sections={sections}
        keyExtractor={(row) =>
          row.kind === "suggestion"
            ? `s:${row.suggestion.foodInventoryId ?? row.suggestion.name}`
            : row.item.id
        }
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
        renderItem={renderRow}
        renderSectionHeader={({ section }) => (
          <View style={styles.sectionHeader}>
            <TouchableOpacity
              disabled={section.key !== "purchased"}
              onPress={() => setShowPurchased((p) => !p)}
            >
              <Text style={styles.sectionTitle}>{section.title}</Text>
            </TouchableOpacity>
            {section.key === "suggested" && (
              <TouchableOpacity onPress={() => handleAdd(data!.suggestions)}>
                <Text style={styles.headerAction}>Add all</Text>
              </TouchableOpacity>
            )}
            {section.url && (
              <TouchableOpacity onPress={() => Linking.openURL(section.url!)}>
                <Text style={styles.headerAction}>Open ↗</Text>
              </TouchableOpacity>
            )}
            {section.key === "purchased" && showPurchased && (
              <TouchableOpacity
                onPress={() =>
                  Alert.alert("Clear purchased", "Delete all purchased rows?", [
                    { text: "Cancel", style: "cancel" },
                    { text: "Clear", style: "destructive",
                      onPress: () => run("Failed to clear", () => clearPurchased()) },
                  ])
                }
              >
                <Text style={styles.deleteAction}>Clear</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
        ListEmptyComponent={
          <View style={styles.centerFill}>
            <ShoppingCart size={32} color="#374151" strokeWidth={2} />
            <Text style={[styles.mutedText, { marginTop: 12 }]}>
              Nothing to buy — stock looks good.
            </Text>
          </View>
        }
      />
    );
  }

  return (
    <>
      <StatusBar barStyle="light-content" />
      <View style={[styles.screen, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.backButton}>
            <ChevronLeft size={24} color="#FFFFFF" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Shopping List</Text>
          <View style={{ width: 32 }} />
        </View>
        {body}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#0A0F1E" },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: "#1F2937",
  },
  backButton: { width: 32 },
  headerTitle: { fontSize: 20, fontWeight: "700", color: "#FFFFFF" },
  sectionHeader: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 16, paddingTop: 20, paddingBottom: 8,
  },
  sectionTitle: {
    fontSize: 13, fontWeight: "700", color: "#9CA3AF",
    textTransform: "uppercase", letterSpacing: 0.5,
  },
  headerAction: { fontSize: 14, color: "#14B8A6", fontWeight: "600" },
  row: {
    flexDirection: "row", alignItems: "center", gap: 10,
    backgroundColor: "#111827", borderRadius: 12, borderWidth: 1, borderColor: "#1F2937",
    marginHorizontal: 16, marginBottom: 8, padding: 12,
  },
  rowMain: { flex: 1 },
  rowName: { fontSize: 15, fontWeight: "600", color: "#FFFFFF" },
  rowNamePurchased: { color: "#6B7280", textDecorationLine: "line-through" },
  rowQty: { fontSize: 13, fontWeight: "400", color: "#9CA3AF" },
  rowReason: { fontSize: 12, color: "#9CA3AF", marginTop: 2 },
  addButton: {
    width: 32, height: 32, borderRadius: 16, backgroundColor: "rgba(20,184,166,0.15)",
    alignItems: "center", justifyContent: "center",
  },
  addButtonText: { color: "#14B8A6", fontSize: 18, fontWeight: "700" },
  checkbox: {
    width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: "#374151",
    alignItems: "center", justifyContent: "center",
  },
  checkboxChecked: { backgroundColor: "#14B8A6", borderColor: "#14B8A6" },
  checkmark: { color: "#FFFFFF", fontSize: 13, fontWeight: "700" },
  vendorAction: { fontSize: 16, color: "#9CA3AF", paddingHorizontal: 4 },
  deleteAction: { fontSize: 14, color: "#F87171", paddingHorizontal: 4 },
  vendorPicker: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 8 },
  vendorChip: {
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 14,
    borderWidth: 1, borderColor: "#374151",
  },
  vendorChipText: { fontSize: 12, color: "#D1D5DB" },
  centerFill: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  mutedText: { fontSize: 14, color: "#9CA3AF", textAlign: "center" },
  retryButton: {
    marginTop: 16, backgroundColor: "#14B8A6", borderRadius: 10,
    paddingHorizontal: 24, paddingVertical: 12,
  },
  retryText: { color: "#FFFFFF", fontSize: 15, fontWeight: "600" },
});
