// What you have bought and do not have yet.
//
// The middle stage of the pipeline, which until now had nowhere to live: a box
// scheduled for Sunday appeared as one line above the inventory grid saying how
// many meals were coming, and that line was the whole of it. You could cancel
// the box or wait for it; you could not see what was in it, and you could not
// change it.
//
// So this page is the pending table given a face. One card per box on the way,
// its dishes ordered through the day like the menu it is, with the two verbs a
// box that has not arrived can take: change it, or call it off. Below that, the
// vendors that send them — a slim footer, count and last date, because
// box-by-box history is a question nobody has asked yet.
//
// It is deliberately NOT a second inventory. Nothing here is stock, nothing
// here feeds the loop, and the only thing that turns one into the other is
// `materializeDueDeliveries` — which this page calls first, on every read, for
// the same reason the inventory fetch does: the app has no scheduler, so every
// read is also the tick that lets food arrive.
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert, RefreshControl, ScrollView, StatusBar, StyleSheet, Text,
  TouchableOpacity, View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";
import { ChevronLeft, Pencil, Plus, Truck } from "lucide-react-native";
import { Badge, Card, EmptyState, IconButton, LoadingState } from "@/src/components/ui";
import { RefreshIndicator } from "@/src/components/ui/RefreshIndicator";
import { supabase } from "@/src/lib/supabase";
import {
  cancelPendingDelivery, fetchPendingDeliveries, materializeDueDeliveries,
  type PendingDelivery,
} from "@/src/lib/supabase/preparedMeals";
import { fetchDeliveryHistory } from "@/src/lib/supabase/deliveryHistory";
import {
  orderVendorsByUse, sortDishesForMenu, type VendorUse,
} from "@/src/lib/preparedMealDelivery";
import { formatArrival, formatDayLabel } from "@/src/lib/dates";
import { monogram } from "@/src/lib/vendorMonogram";
import { colors, icons, radii, spacing, typography } from "@/src/theme/tokens";
import type { MealType } from "@/src/types/track";

interface DeliveriesScreenProps {
  onClose: () => void;
  /** The New Delivery form — the same one the inventory add sheet opens. */
  onNewDelivery: () => void;
  /** The same form again, reopened on a box that is already scheduled. */
  onEditDelivery: (id: string) => void;
}

/** A vendor that has delivered at least once, with how much it is used. */
interface VendorRow {
  id: string;
  name: string;
  use: VendorUse;
}

/** Slot names as a menu prints them. `MealType` is lowercase everywhere else in
 *  the app, and a dish list is the one place it is read as a label. */
const SLOT_LABELS: Record<MealType, string> = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
  snack: "Snack",
  dessert: "Dessert",
};

/** "Thu, Aug 20" — a use-by is days away, so the weekday earns its place and
 *  the year does not. */
const USE_BY_LABEL = { weekday: "short", month: "short", day: "numeric" } as const;
/** "Aug 13" — a last-delivered date, where the weekday means nothing. */
const LAST_DELIVERED_LABEL = { month: "short", day: "numeric" } as const;

export function DeliveriesScreen({
  onClose, onNewDelivery, onEditDelivery,
}: DeliveriesScreenProps) {
  const insets = useSafeAreaInsets();

  const [pending, setPending] = useState<PendingDelivery[]>([]);
  const [vendors, setVendors] = useState<VendorRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Same guard the inventory fetch keeps, for the same reason: this is called
  // from mount, from focus and from pull-to-refresh with no cancellation, and a
  // slow earlier call must not land on top of a newer one.
  const generationRef = useRef(0);

  const load = useCallback(async () => {
    const generation = ++generationRef.current;

    // Before the read, not after: a box whose moment has passed is inventory
    // now, and this page would otherwise show it as still on the way — the one
    // thing it exists to get right. Best-effort, as everywhere else — a failure
    // here costs a stale card, and the next read tries again.
    try {
      await materializeDueDeliveries();
    } catch (e) {
      console.error("materialize due deliveries:", e);
    }

    try {
      const [rows, history, vendorResult] = await Promise.all([
        fetchPendingDeliveries(),
        fetchDeliveryHistory(),
        // Every vendor, not just the active ones: a vendor you have stopped
        // using still delivered the six boxes it is credited with, and dropping
        // it would make the section disagree with its own history.
        supabase.from("nutrition_vendors").select("id, name").order("display_order"),
      ]);
      if (generation !== generationRef.current) return;

      setPending(rows);

      if (vendorResult.error) {
        console.error("deliveries vendor fetch failed:", vendorResult.error);
        setVendors([]);
      } else {
        const named = new Map(
          ((vendorResult.data ?? []) as { id: string; name: string }[]).map((v) => [v.id, v]),
        );
        // Only vendors that have actually delivered — that is what the section
        // says about itself in its own footnote.
        const delivered = history.vendorUse
          .filter((u) => named.has(u.vendorId))
          .map((u) => ({ id: u.vendorId, name: named.get(u.vendorId)!.name, use: u }));
        setVendors(orderVendorsByUse(delivered, history.vendorUse));
      }
    } catch (e) {
      if (generation !== generationRef.current) return;
      console.error("deliveries fetch failed:", e);
      Alert.alert("Couldn't load deliveries", "Pull down to try again.");
    } finally {
      if (generation === generationRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Coming back from the edit form has to re-read: the box on screen is the one
  // that was just changed, and a stale card is exactly the lie this page exists
  // to avoid. Skipped on the first focus, which the mount effect above owns.
  const mounted = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (!mounted.current) {
        mounted.current = true;
        return;
      }
      load();
    }, [load]),
  );

  const handleRefresh = () => {
    setRefreshing(true);
    load();
  };

  // Calling one off is not an undo — nothing was written to unwind — so it asks
  // plainly and then the box simply stops waiting. Same words as the inventory
  // line's confirm, because it is the same act.
  const cancel = (row: PendingDelivery) => {
    Alert.alert(
      "Cancel this delivery?",
      `${row.mealCount} ${row.mealCount === 1 ? "meal" : "meals"}${row.vendorName ? ` from ${row.vendorName}` : ""} will not be added when ${formatArrival(row.arrivesAt, new Date(), { midSentence: true })} comes around. Nothing in your inventory changes.`,
      [
        { text: "Keep it", style: "cancel" },
        {
          text: "Cancel delivery",
          style: "destructive",
          onPress: async () => {
            // Optimistic: the card is the only thing on screen this touches,
            // and a failure puts it straight back.
            setPending((prev) => prev.filter((p) => p.id !== row.id));
            try {
              await cancelPendingDelivery(row.id);
            } catch (e) {
              console.error("cancel pending delivery:", e);
              setPending((prev) =>
                [...prev, row].sort((a, b) => a.arrivesAt.localeCompare(b.arrivesAt)));
              Alert.alert("Couldn't cancel it", "The delivery is still scheduled. Try again.");
            }
          },
        },
      ],
    );
  };

  // One `now` for the whole render, so a list of boxes cannot disagree with
  // itself about where "today" is.
  const now = useMemo(() => new Date(), [pending]);

  const renderBox = (row: PendingDelivery) => {
    const dishes = sortDishesForMenu(row.dishes);
    const vendorName = row.vendorName ?? "Unknown vendor";
    return (
      <Card key={row.id} variant="panel" style={s.box}>
        <View style={s.boxHead}>
          <View style={s.disc}>
            <Text style={s.discText}>{monogram(vendorName)}</Text>
          </View>
          <Text style={s.vendorName} numberOfLines={1}>{vendorName}</Text>
          <Badge tone="deliveries" label="Scheduled" />
        </View>

        <View style={s.arrival}>
          <Truck size={17} color={colors.accents.deliveries} strokeWidth={icons.strokeWidth} />
          <Text style={s.arrivalText}>Arrives {formatArrival(row.arrivesAt, now)}</Text>
        </View>
        <Text style={s.boxMeta}>
          Use by {formatDayLabel(row.useBy, USE_BY_LABEL)} · {row.mealCount}{" "}
          {row.mealCount === 1 ? "meal" : "meals"}
        </Text>

        {/* The box as a menu for the week. Quantity first, because "×2" is
            what distinguishes two nights of the same dinner from one. */}
        {dishes.length > 0 && (
          <View style={s.dishes}>
            {dishes.map((dish, index) => (
              <View key={`${dish.name}-${index}`} style={s.dish}>
                <Text style={s.qty}>×{dish.quantity}</Text>
                <Text style={s.dishName}>{dish.name}</Text>
                <Text style={s.dishSlot}>{SLOT_LABELS[dish.slot]}</Text>
              </View>
            ))}
          </View>
        )}

        <View style={s.boxActions}>
          <TouchableOpacity
            style={s.editButton}
            onPress={() => onEditDelivery(row.id)}
            accessibilityRole="button"
            accessibilityLabel={`Edit the delivery from ${vendorName}`}
          >
            <Pencil size={15} color={colors.text} strokeWidth={icons.strokeWidth} />
            <Text style={s.editText}>Edit</Text>
          </TouchableOpacity>
          {/* Text, not a bordered button: nothing was written, so calling a box
              off unwinds nothing — it is a quiet act, and framing it in red
              beside Edit would read as the pair of them being equally likely. */}
          <TouchableOpacity
            onPress={() => cancel(row)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityRole="button"
            accessibilityLabel={`Cancel the delivery from ${vendorName}`}
          >
            <Text style={s.cancelText}>Cancel delivery</Text>
          </TouchableOpacity>
        </View>
      </Card>
    );
  };

  // Nothing coming AND nobody who has ever delivered is a first run, and the
  // page's whole job then is to be the door to the form.
  const wholePageEmpty = !loading && pending.length === 0 && vendors.length === 0;

  return (
    <>
      <StatusBar barStyle="light-content" />
      <View style={[s.container, { paddingTop: insets.top }]}>
        {/* Two rows, like every other Nutrition page: chrome above a rule, then
            the page's own glyph and name below it. The others carry a search
            field in the chrome row; this one does not, because a page holding
            one box and two vendors has nothing to search — the same reason its
            vendor rows carry no chevron. */}
        <View style={s.header}>
          <TouchableOpacity
            onPress={onClose}
            style={s.back}
            accessibilityRole="button"
            accessibilityLabel="Back"
          >
            <ChevronLeft size={icons.lg} color={colors.text} strokeWidth={icons.strokeWidth} />
          </TouchableOpacity>
          <View style={s.headerSpacer} />
          <IconButton icon={Plus} onPress={onNewDelivery} accessibilityLabel="Log a delivery" />
        </View>

        <View style={s.titleRow}>
          <Truck size={icons.xl} color={colors.accents.deliveries} strokeWidth={icons.strokeWidth} />
          <Text style={s.pageTitle}>Deliveries</Text>
        </View>

        {loading ? (
          <LoadingState label="Loading deliveries..." />
        ) : wholePageEmpty ? (
          <EmptyState
            icon={Truck}
            title="No boxes on the way"
            body="Log a delivery and it waits here until it arrives, then joins your inventory on its own."
            action={{ label: "Log a Delivery", onPress: onNewDelivery }}
          />
        ) : (
          <>
            <RefreshIndicator visible={refreshing} />
            <ScrollView
              style={s.scroll}
              contentContainerStyle={[
                s.scrollContent,
                { paddingBottom: insets.bottom + spacing.xxl },
              ]}
              refreshControl={
                <RefreshControl
                  refreshing={refreshing}
                  onRefresh={handleRefresh}
                  // The gesture is RefreshControl's; the spinner above is ours,
                  // because Apple's does not render in this app.
                  tintColor="transparent"
                  colors={["transparent"]}
                />
              }
            >
              <Text style={s.section}>ON THE WAY</Text>
              {pending.length > 0 ? (
                pending.map(renderBox)
              ) : (
                <Card variant="panel" style={s.emptyBox}>
                  <Text style={s.emptyTitle}>No boxes on the way</Text>
                  <TouchableOpacity
                    onPress={onNewDelivery}
                    accessibilityRole="button"
                    accessibilityLabel="Log a delivery"
                  >
                    <Text style={s.emptyAction}>Log a Delivery</Text>
                  </TouchableOpacity>
                </Card>
              )}

              {vendors.length > 0 && (
                <>
                  <Text style={[s.section, s.sectionSpaced]}>VENDORS</Text>
                  {vendors.map((v) => (
                    <Card key={v.id} variant="row" style={s.vendorRow}>
                      <View style={s.disc}>
                        <Text style={s.discText}>{monogram(v.name)}</Text>
                      </View>
                      <View style={s.vendorText}>
                        <Text style={s.vendorRowName} numberOfLines={1}>{v.name}</Text>
                        <Text style={s.vendorRowUse}>
                          {v.use.deliveryCount}{" "}
                          {v.use.deliveryCount === 1 ? "delivery" : "deliveries"}
                          {v.use.lastDeliveredOn
                            ? ` · last ${formatDayLabel(v.use.lastDeliveredOn, LAST_DELIVERED_LABEL)}`
                            : ""}
                        </Text>
                      </View>
                    </Card>
                  ))}
                  {/* Says what the section is, so an absent vendor reads as
                      "has not delivered yet" rather than as a missing row. */}
                  <Text style={s.vendorNote}>
                    Vendors appear here once they've delivered a box.
                  </Text>
                </>
              )}
            </ScrollView>
          </>
        )}
      </View>
    </>
  );
}

const DISC = 34;

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  // Byte-for-byte the header the inventory, library and fuel pages use, so the
  // four read as one set: same gutter, same 12pt band, same rule beneath.
  header: {
    flexDirection: "row", alignItems: "center", gap: spacing.md,
    paddingHorizontal: spacing.screenGutter, paddingVertical: spacing.md,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  back: { padding: spacing.xs },
  headerSpacer: { flex: 1 },
  // Likewise the title band. `icons.xl` glyph and `titleRoot` are what the
  // library and fuel pages set; the inventory page's 26pt glyph is the odd one
  // out, not the rule.
  titleRow: {
    flexDirection: "row", alignItems: "center", gap: spacing.md,
    paddingHorizontal: spacing.screenGutter,
    paddingTop: spacing.xxl, paddingBottom: spacing.lg,
  },
  pageTitle: { ...typography.titleRoot, color: colors.text },

  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: spacing.screenGutter },
  section: { ...typography.section, marginBottom: spacing.md },
  sectionSpaced: { marginTop: spacing.lg },

  // ── A box on the way ────────────────────────────────────────────────────
  box: { marginBottom: spacing.xl },
  boxHead: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  // The vendor picker's mark, same treatment: a white disc because logos are
  // drawn for light grounds, and the monogram is what a vendor without one
  // gets there too.
  disc: {
    width: DISC, height: DISC, borderRadius: radii.pill,
    alignItems: "center", justifyContent: "center",
    backgroundColor: colors.imageWell,
  },
  discText: { ...typography.rowTitle, fontSize: 14, color: colors.textFaint },
  vendorName: { ...typography.rowTitle, color: colors.text, flex: 1 },

  arrival: {
    flexDirection: "row", alignItems: "center", gap: spacing.sm,
    marginTop: spacing.lg,
  },
  arrivalText: { ...typography.rowTitle, color: colors.text, flexShrink: 1 },
  boxMeta: { ...typography.caption, marginTop: spacing.xs, marginBottom: spacing.md },

  dishes: { borderTopWidth: 1, borderTopColor: colors.border },
  dish: {
    flexDirection: "row", alignItems: "baseline", gap: spacing.md,
    paddingVertical: spacing.sm + 2,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  qty: {
    ...typography.caption, fontWeight: "700",
    color: colors.accents.deliveries, width: 26,
    // Tabular figures so the names start on one line whatever the counts are.
    fontVariant: ["tabular-nums"],
  },
  dishName: { ...typography.body, color: colors.text, flex: 1 },
  dishSlot: { ...typography.caption, fontSize: 11, color: colors.textFaint },

  boxActions: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingTop: spacing.lg,
  },
  editButton: {
    flexDirection: "row", alignItems: "center", gap: spacing.sm - 1,
    backgroundColor: colors.surface2,
    borderWidth: 1, borderColor: colors.border, borderRadius: radii.control,
    paddingVertical: spacing.sm + 1, paddingHorizontal: spacing.xxl - 2,
  },
  editText: { ...typography.buttonSm, color: colors.text },
  cancelText: { ...typography.buttonSm, color: colors.danger },

  // ── Nothing on the way, but there is history below ──────────────────────
  emptyBox: { alignItems: "center", gap: spacing.md, marginBottom: spacing.xl },
  emptyTitle: { ...typography.rowTitle, color: colors.text },
  emptyAction: { ...typography.buttonSm, color: colors.brand },

  // ── Who sends them ──────────────────────────────────────────────────────
  vendorRow: {
    flexDirection: "row", alignItems: "center", gap: spacing.md,
    marginBottom: spacing.md,
  },
  vendorText: { flex: 1 },
  vendorRowName: { ...typography.rowTitle, fontSize: 15, color: colors.text },
  vendorRowUse: { ...typography.caption, marginTop: 1 },
  vendorNote: { ...typography.caption, fontSize: 11, color: colors.textFaint },
});
