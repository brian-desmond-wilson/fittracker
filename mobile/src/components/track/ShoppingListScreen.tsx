// The first shopping surface (Nutrition OS Phase 5, spec §9.2). Renders what
// fetchShoppingData computes: Suggested (confirm-to-add), the list grouped
// by vendor with deep links, and the purchased lifecycle with restock-back.
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert, Linking, RefreshControl, SectionList, StyleSheet, Text, TouchableOpacity, View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  ArrowLeftRight, ArrowUpRight, Check, Plus, ShoppingCart, X,
} from "lucide-react-native";
import { supabase } from "@/src/lib/supabase";
import { colors, icons, radii, spacing, tint, typography } from "@/src/theme/tokens";
import {
  Badge, Button, Card, EmptyState, IconButton, LoadingState, Screen, SectionHeader,
} from "@/src/components/ui";
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
  const [refreshing, setRefreshing] = useState(false);
  const [showPurchased, setShowPurchased] = useState(false);
  const [vendorPickerFor, setVendorPickerFor] = useState<string | null>(null);
  // Gates every mutating control while a run() is in flight. fetchShoppingData
  // is 13 Supabase round trips plus two engine passes (~0.5-2s on device), and
  // nothing else marks a row as "in progress" — without this a second tap
  // before the reload lands double-fires the mutation (see amendment Fix 2).
  const [busy, setBusy] = useState(false);

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

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  // Returns whether fn() succeeded, so callers can gate follow-on work (e.g.
  // the restock offer) on an actual success rather than "we attempted it and
  // ate the error" (see amendment Fix 1).
  const run = useCallback(
    async (title: string, fn: () => Promise<void>): Promise<boolean> => {
      setBusy(true);
      try {
        await fn();
        await load();
        return true;
      } catch (e) {
        Alert.alert(title, e instanceof Error ? e.message : "Unknown error");
        await load({ silent: true });
        return false;
      } finally {
        setBusy(false);
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
      const purchasedOk = await run("Failed to mark purchased", () => markPurchased(item.id));
      if (!purchasedOk) return;
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
    // `count` feeds the section header's Badge; sections without one pass null.
    const out: Array<{
      key: string; title: string; count: number | null; url: string | null; data: Row[];
    }> = [];
    if (data.suggestions.length > 0) {
      out.push({
        key: "suggested",
        title: "Suggested",
        count: data.suggestions.length,
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
        out.push({ ...vs, count: null, data: rows.map((item) => ({ kind: "item" as const, item })) });
      }
    }
    const purchased = data.listRows.filter((r) => r.is_purchased);
    if (purchased.length > 0) {
      out.push({
        key: "purchased",
        title: "Purchased",
        count: purchased.length,
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
          <Card variant="row" style={styles.row}>
            <View style={styles.rowMain}>
              <Text style={styles.rowName} numberOfLines={1}>
                {s.name} <Text style={styles.rowQty}>×{s.quantity}</Text>
              </Text>
              <Text style={styles.rowReason} numberOfLines={2}>{s.reasons.join(" · ")}</Text>
            </View>
            <IconButton
              icon={Plus}
              variant="circle"
              onPress={() => handleAdd([s])}
              disabled={busy}
              accessibilityLabel={`Add ${s.name}`}
            />
          </Card>
        );
      }
      const item = row.item;
      const purchased = row.kind === "purchased";
      return (
        <View>
          <Card variant="row" style={styles.row}>
            <TouchableOpacity
              style={[styles.checkbox, purchased && styles.checkboxChecked, busy && styles.controlDisabled]}
              onPress={() =>
                purchased
                  ? run("Failed to restore", () => unmarkPurchased(item.id))
                  : handlePurchase(item)
              }
              disabled={busy}
            >
              {purchased && (
                <Check size={icons.sm} color={colors.onBrand} strokeWidth={icons.strokeWidth} />
              )}
            </TouchableOpacity>
            <View style={styles.rowMain}>
              <Text style={[styles.rowName, purchased && styles.rowNamePurchased]} numberOfLines={1}>
                {item.name} <Text style={styles.rowQty}>×{item.quantity} {item.unit}</Text>
              </Text>
              {item.notes ? <Text style={styles.rowReason} numberOfLines={1}>{item.notes}</Text> : null}
            </View>
            {!purchased && (
              <IconButton
                icon={ArrowLeftRight}
                variant="circle"
                onPress={() => setVendorPickerFor((p) => (p === item.id ? null : item.id))}
                accessibilityLabel={`Change vendor for ${item.name}`}
              />
            )}
            <IconButton
              icon={X}
              variant="circle"
              onPress={() =>
                Alert.alert("Remove", `Remove "${item.name}" from the list?`, [
                  { text: "Cancel", style: "cancel" },
                  { text: "Remove", style: "destructive",
                    onPress: () => run("Failed to remove", () => deleteListItem(item.id)) },
                ])
              }
              disabled={busy}
              accessibilityLabel={`Remove ${item.name}`}
            />
          </Card>
          {vendorPickerFor === item.id && data && (
            <View style={styles.vendorPicker}>
              {[...data.vendors.filter((v) => v.is_active), null].map((v) => {
                const selected = (v?.id ?? null) === item.vendor_id;
                return (
                  <TouchableOpacity
                    key={v?.id ?? ANYWHERE}
                    style={[styles.vendorChip, selected && styles.vendorChipSelected, busy && styles.controlDisabled]}
                    onPress={() => {
                      setVendorPickerFor(null);
                      run("Failed to set vendor", () =>
                        updateListItem(item.id, { vendor_id: v?.id ?? null }),
                      );
                    }}
                    disabled={busy}
                  >
                    <Text style={[styles.vendorChipText, selected && styles.vendorChipTextSelected]}>
                      {v?.name ?? "Anywhere"}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </View>
      );
    },
    [data, vendorPickerFor, handleAdd, handlePurchase, run, busy],
  );

  let body: React.ReactNode;
  if (!data && loadFailed) {
    body = (
      <EmptyState
        title="Couldn't load your shopping list."
        action={{ label: "Retry", onPress: () => load() }}
      />
    );
  } else if (!data) {
    body = <LoadingState />;
  } else {
    body = (
      <SectionList
        sections={sections}
        keyExtractor={(row) =>
          row.kind === "suggestion"
            ? `s:${row.suggestion.foodInventoryId ?? row.suggestion.name}`
            : row.item.id
        }
        // `Screen scroll={false}` applies neither the horizontal gutter nor the
        // bottom inset — the list owns both. `flexGrow: 1` lets the full-bleed
        // EmptyState below fill the viewport instead of collapsing.
        contentContainerStyle={{
          paddingHorizontal: spacing.screenGutter,
          paddingBottom: insets.bottom + spacing.xxl,
          flexGrow: 1,
        }}
        renderItem={renderRow}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={colors.brand}
            colors={[colors.brand]}
            title="Pull to refresh"
            titleColor={colors.textMuted}
          />
        }
        renderSectionHeader={({ section }) => {
          const heading = (
            <SectionHeader
              title={section.title}
              badge={
                section.count != null
                  ? <Badge label={String(section.count)} tone="shopping" />
                  : undefined
              }
            />
          );
          return (
            <View style={styles.sectionHeader}>
              {section.key === "purchased" ? (
                <TouchableOpacity onPress={() => setShowPurchased((p) => !p)}>
                  {heading}
                </TouchableOpacity>
              ) : (
                heading
              )}
              {section.key === "suggested" && (
                <Button
                  label="Add all"
                  variant="ghost"
                  size="sm"
                  onPress={() => handleAdd(data!.suggestions)}
                  disabled={busy}
                />
              )}
              {section.url && (
                <Button
                  label="Open"
                  variant="ghost"
                  size="sm"
                  icon={ArrowUpRight}
                  onPress={() =>
                    Linking.openURL(section.url!).catch((e) =>
                      Alert.alert("Failed to open link", e instanceof Error ? e.message : "Unknown error"),
                    )
                  }
                />
              )}
              {section.key === "purchased" && showPurchased && (
                <Button
                  label="Clear"
                  variant="destructive"
                  size="sm"
                  onPress={() =>
                    Alert.alert("Clear purchased", "Delete all purchased rows?", [
                      { text: "Cancel", style: "cancel" },
                      { text: "Clear", style: "destructive",
                        onPress: () => run("Failed to clear", () => clearPurchased()) },
                    ])
                  }
                  disabled={busy}
                />
              )}
            </View>
          );
        }}
        ListEmptyComponent={
          <EmptyState icon={ShoppingCart} title="Nothing to buy — stock looks good." />
        }
      />
    );
  }

  return (
    <Screen variant="detail" title="Shopping List" onBack={onClose} scroll={false}>
      {body}
    </Screen>
  );
}

const styles = StyleSheet.create({
  sectionHeader: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingTop: spacing.xl, paddingBottom: spacing.sm,
  },
  row: {
    flexDirection: "row", alignItems: "center", gap: spacing.md,
    marginBottom: spacing.sm,
  },
  rowMain: { flex: 1 },
  rowName: { ...typography.rowTitle, color: colors.text },
  rowNamePurchased: { color: colors.textFaint, textDecorationLine: "line-through" },
  rowQty: { ...typography.caption, fontWeight: "400" },
  rowReason: { ...typography.caption, marginTop: spacing.xs },
  // Unchecked outline uses `textFaint`, not `border`: `border` on a `surface`
  // card is a divider value and would make the empty box near-invisible.
  checkbox: {
    width: 22, height: 22, borderRadius: radii.control, borderWidth: 2,
    borderColor: colors.textFaint, alignItems: "center", justifyContent: "center",
  },
  checkboxChecked: { backgroundColor: colors.brand, borderColor: colors.brand },
  controlDisabled: { opacity: 0.5 },
  vendorPicker: {
    flexDirection: "row", flexWrap: "wrap", gap: spacing.sm,
    marginTop: -spacing.xs, marginBottom: spacing.sm,
  },
  vendorChip: {
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radii.pill,
    borderWidth: 1, borderColor: colors.border,
  },
  vendorChipSelected: { backgroundColor: tint(colors.brand), borderColor: colors.brand },
  vendorChipText: { ...typography.caption },
  vendorChipTextSelected: { color: colors.brand, fontWeight: "600" },
});
