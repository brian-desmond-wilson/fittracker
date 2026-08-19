// Bulk capture (critique E5): photograph a shelf or receipt; the
// inventory-capture edge function (vision model) extracts groceries and
// diffs them against current stock; the user confirms which proposals to
// apply. The model proposes, the human disposes — nothing writes without a
// checked row surviving the review step. This is the "audit in two minutes"
// mechanism the freshness-reset design called for.
import React, { useState } from "react";
import {
  Alert, Modal, ScrollView, StyleSheet, Text, TouchableOpacity,
  TouchableWithoutFeedback, View,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { Camera, Check, Images } from "lucide-react-native";
import { colors, icons, radii, spacing, tint, typography } from "@/src/theme/tokens";
import { Badge, Button, LoadingState } from "@/src/components/ui";
import { supabase } from "@/src/lib/supabase";
import { findOrCreateProduct } from "@/src/services/savedFoodsService";
import { replaceItemLocations } from "@/src/lib/supabase/inventory";
import type { FoodLocation } from "@/src/types/track";

interface CaptureProposal {
  kind: "new" | "update";
  matchId: string | null;
  matchName: string | null;
  name: string;
  brand: string | null;
  quantity: number;
  unit: string;
}

interface BulkCaptureModalProps {
  visible: boolean;
  onClose: () => void;
  /** Called after any writes were applied, so the screen refetches. */
  onApplied: () => void;
  /** E3: a barcode carried in from a failed scan lookup. Attached to the new
   *  item ONLY when the apply creates exactly one — a barcode positively
   *  identifies a single product, and guessing which of several rows it
   *  belongs to would corrupt future scan matches. */
  attachBarcode?: string | null;
}

type Phase = "pick" | "processing" | "review" | "applying";

export function BulkCaptureModal({ visible, onClose, onApplied, attachBarcode }: BulkCaptureModalProps) {
  const [phase, setPhase] = useState<Phase>("pick");
  const [proposals, setProposals] = useState<CaptureProposal[]>([]);
  const [included, setIncluded] = useState<Set<number>>(new Set());

  const reset = () => {
    setPhase("pick");
    setProposals([]);
    setIncluded(new Set());
  };
  const close = () => { reset(); onClose(); };

  const capture = async (source: "camera" | "library") => {
    const opts: ImagePicker.ImagePickerOptions = {
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7,
      base64: true,
    };
    // Both launchers REJECT when the camera is absent (simulator) or refused,
    // rather than returning a canceled result — uncaught, that surfaces as a
    // red console error with no explanation of what went wrong.
    const result = await (source === "camera"
      ? ImagePicker.launchCameraAsync(opts)
      : ImagePicker.launchImageLibraryAsync(opts)
    ).catch(() => null);
    if (!result) {
      Alert.alert(
        source === "camera" ? "No camera available" : "Couldn't open your photos",
        source === "camera"
          ? "Use “Choose photo” instead, or allow camera access in Settings."
          : "Allow photo access in Settings and try again.",
      );
      return;
    }
    if (result.canceled || !result.assets[0]?.base64) return;
    setPhase("processing");
    try {
      const { data, error } = await supabase.functions.invoke("inventory-capture", {
        body: { imageBase64: result.assets[0].base64 },
      });
      if (error) throw error;
      const got: CaptureProposal[] = data?.proposals ?? [];
      if (got.length === 0) {
        Alert.alert("Nothing found", "No groceries recognized in that photo.");
        reset();
        return;
      }
      setProposals(got);
      setIncluded(new Set(got.map((_, i) => i)));  // everything in by default
      setPhase("review");
    } catch (e) {
      console.error("capture failed:", e);
      Alert.alert("Error", "Couldn't read that photo. Try again with more light.");
      reset();
    }
  };

  const toggle = (i: number) => {
    setIncluded((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i); else next.add(i);
      return next;
    });
  };

  const apply = async () => {
    setPhase("applying");
    const chosen = proposals.filter((_, i) => included.has(i));
    const newChosen = chosen.filter((p) => p.kind === "new");
    let applied = 0;
    try {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData?.user?.id;
      if (!userId) throw new Error("not signed in");
      for (const p of chosen) {
        if (p.kind === "update" && p.matchId) {
          // Bump stock through the atomic replace RPC (it resyncs the legacy
          // cache). Add to the first ready-to-consume row, else the first row.
          const { data: locs, error } = await supabase
            .from("food_inventory_locations")
            .select("location, quantity, is_ready_to_consume, notes")
            .eq("food_inventory_id", p.matchId);
          if (error) throw error;
          const rows = (locs ?? []) as Array<{
            location: FoodLocation; quantity: number; is_ready_to_consume: boolean; notes: string | null;
          }>;
          if (rows.length === 0) {
            rows.push({ location: "pantry", quantity: 0, is_ready_to_consume: true, notes: null });
          }
          const target = rows.find((r) => r.is_ready_to_consume) ?? rows[0];
          target.quantity += p.quantity;
          await replaceItemLocations(p.matchId, rows);
          // Fresh stock invalidates a long-dead date: an item that "expired"
          // months ago and just got restocked is NEW product whose date we
          // don't know. Null beats false — a stale date would keep the item
          // in the Archive and lie about the food that's actually there.
          const { data: itemRow } = await supabase
            .from("food_inventory")
            .select("expiration_date")
            .eq("id", p.matchId)
            .single();
          if (itemRow?.expiration_date) {
            const exp = new Date(itemRow.expiration_date + "T12:00:00");
            const monthAgo = new Date(Date.now() - 30 * 24 * 3600 * 1000);
            if (exp < monthAgo) {
              await supabase
                .from("food_inventory")
                .update({ expiration_date: null })
                .eq("id", p.matchId);
            }
          }
          applied += 1;
        } else {
          // New item: minimal honest row; the intelligence function links a
          // concept and proposes categories right after (E1/E2 at birth).
          const { data: newItem, error } = await supabase
            .from("food_inventory")
            .insert({
              user_id: userId,
              name: p.name,
              brand: p.brand,
              barcode: attachBarcode && newChosen.length === 1 ? attachBarcode : null,
              unit: p.unit || "count",
              category: "other",       // legacy text column; junction tables are truth
              storage_type: "single-location",
              location: "pantry",
              restock_threshold: 0,
              quantity: 0,             // cache; replaceItemLocations resyncs it
            })
            .select("id")
            .single();
          if (error) throw error;
          await replaceItemLocations(newItem.id, [
            { location: "pantry", quantity: p.quantity, is_ready_to_consume: true, notes: null },
          ]);
          // Identity: the product this stock is a package of. A capture has no
          // nutrition to give a new product record; the intelligence pass and
          // a later label scan fill that in.
          const product = await findOrCreateProduct({
            name: p.name,
            brand: p.brand ?? null,
            barcode: attachBarcode && newChosen.length === 1 ? attachBarcode : null,
          });
          if (product) {
            const { error: fkErr } = await supabase
              .from("food_inventory")
              .update({ saved_food_id: product.id })
              .eq("id", newItem.id);
            if (fkErr) console.error("stamping product identity (capture):", fkErr);
          }
          supabase.functions
            .invoke("inventory-intelligence", {
              // Both halves in one call — same concepts for product and stock.
              body: {
                inventoryIds: [newItem.id],
                ...(product?.created ? { savedFoodIds: [product.id] } : {}),
              },
            })
            .then(({ error: e }) => {
              if (e) console.error("inventory-intelligence (capture):", e);
            });
          applied += 1;
        }
      }
      onApplied();
      close();
      Alert.alert("Inventory updated", `${applied} item${applied === 1 ? "" : "s"} applied.`);
    } catch (e) {
      console.error("apply failed:", e);
      Alert.alert(
        "Partly applied",
        `${applied} of ${chosen.length} changes landed before an error. Pull to refresh and retry the rest.`,
      );
      onApplied();
      close();
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
      <TouchableWithoutFeedback onPress={close} accessibilityRole="button" accessibilityLabel="Close">
        <View style={styles.scrim} />
      </TouchableWithoutFeedback>
      <View style={styles.sheet}>
        <View style={styles.grabber} />
        <Text style={[typography.rowTitle, styles.title]}>Capture inventory</Text>

        {phase === "pick" && (
          <>
            <Text style={typography.caption}>
              Photograph a shelf, your fridge, or a receipt — items are read
              automatically and you confirm before anything changes.
            </Text>
            <View style={styles.pickRow}>
              <View style={styles.pickHalf}>
                <Button label="Take photo" onPress={() => capture("camera")} icon={Camera} fluid />
              </View>
              <View style={styles.pickHalf}>
                <Button label="Choose photo" onPress={() => capture("library")} variant="secondary" icon={Images} fluid />
              </View>
            </View>
          </>
        )}

        {(phase === "processing" || phase === "applying") && (
          <View style={styles.loadingBox}>
            <LoadingState label={phase === "processing" ? "Reading the photo…" : "Applying…"} />
          </View>
        )}

        {phase === "review" && (
          <>
            <Text style={typography.caption}>
              Tap to include or exclude. Updates add to existing stock; new
              items are created and auto-linked into the loop.
            </Text>
            <ScrollView style={styles.list} keyboardShouldPersistTaps="handled">
              {proposals.map((p, i) => {
                const on = included.has(i);
                return (
                  <TouchableOpacity
                    key={`${p.name}:${i}`}
                    style={styles.row}
                    onPress={() => toggle(i)}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: on }}
                    accessibilityLabel={`${p.name}, ${p.kind === "update" ? "add to existing" : "new item"}, quantity ${p.quantity}`}
                  >
                    <View style={[styles.checkbox, on && styles.checkboxOn]}>
                      {on && <Check size={icons.sm} color={colors.onBrand} strokeWidth={icons.strokeWidth} />}
                    </View>
                    <View style={styles.rowText}>
                      <Text style={[typography.body, styles.rowName]} numberOfLines={1}>
                        {p.name}{p.brand ? ` · ${p.brand}` : ""}
                      </Text>
                      <Text style={typography.caption}>
                        {p.kind === "update" ? `+${p.quantity} to ${p.matchName}` : `new · ${p.quantity} ${p.unit}`}
                      </Text>
                    </View>
                    <Badge
                      label={p.kind === "update" ? "Update" : "New"}
                      tone={p.kind === "update" ? "inventory" : "success"}
                    />
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            <Button
              label={`Apply ${included.size} change${included.size === 1 ? "" : "s"}`}
              onPress={apply}
              disabled={included.size === 0}
              fluid
            />
          </>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: colors.scrim },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radii.panel, borderTopRightRadius: radii.panel,
    borderWidth: 1, borderBottomWidth: 0, borderColor: colors.border,
    padding: spacing.lg, paddingBottom: spacing.xxl,
    gap: spacing.md,
    maxHeight: "80%",
  },
  grabber: {
    width: 36, height: 4, borderRadius: radii.pill,
    backgroundColor: colors.surface2, alignSelf: "center",
  },
  title: { color: colors.text },
  pickRow: { flexDirection: "row", gap: spacing.md },
  pickHalf: { flex: 1 },
  loadingBox: { minHeight: 160, justifyContent: "center" },
  list: { maxHeight: 380 },
  row: {
    flexDirection: "row", alignItems: "center", gap: spacing.md,
    paddingVertical: spacing.sm,
    borderTopWidth: 1, borderTopColor: colors.border,
  },
  checkbox: {
    width: 22, height: 22, borderRadius: radii.control / 2,
    borderWidth: 1.5, borderColor: colors.border,
    backgroundColor: colors.surface2,
    alignItems: "center", justifyContent: "center",
  },
  checkboxOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  rowText: { flex: 1, minWidth: 0 },
  rowName: { color: colors.text },
});
