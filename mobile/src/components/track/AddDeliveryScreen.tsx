// A delivery, entered as a delivery.
//
// Eight ready-to-eat meals arrive together twice a week. They share a vendor
// and a use-by date and differ in a name, a slot and three numbers printed on
// the lid. Sending that through the full item form eight times — storage
// type, thresholds, categories, locations, vendor, photos, each one — is
// what made keeping them in the app untenable.
//
// So this screen asks for the two things the whole box shares once, then
// gives each meal a single line. One save writes everything: the stock, where
// it is, what it counts as, the food a meal log reads, the concepts that let
// the loop recognise it, and a one-item meal so eating it is a single tap.
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator, Alert, KeyboardAvoidingView, Modal, Platform, ScrollView,
  StatusBar, StyleSheet, Text, TouchableOpacity, View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import DateTimePicker from "@react-native-community/datetimepicker";
import * as ImagePicker from "expo-image-picker";
import { Calendar, Camera, ChevronLeft, Plus } from "lucide-react-native";
import { Button, Card } from "@/src/components/ui";
import { VendorTiles } from "@/src/components/track/edit/VendorTiles";
import { DeliveryMealRow } from "@/src/components/track/delivery/DeliveryMealRow";
import { RecentDishes } from "@/src/components/track/delivery/RecentDishes";
import { supabase } from "@/src/lib/supabase";
import { getLocalDateString, parseLocalDate } from "@/src/lib/dates";
import { createPreparedMealDelivery } from "@/src/lib/supabase/preparedMeals";
import { fetchDeliveryHistory } from "@/src/lib/supabase/deliveryHistory";
import {
  addLocalDays, addRecent, deliverySummary, emptyDraft, namedDrafts,
  orderVendorsByUse, recentCounts, removeRecent, toDeliveryPayload,
  validateDelivery, TYPICAL_PREPARED_MEAL_DAYS,
  type PreparedMealDraft, type RecentDish, type VendorUse,
} from "@/src/lib/preparedMealDelivery";
import { colors, icons, radii, spacing, typography } from "@/src/theme/tokens";
import type { NutritionVendor } from "@/src/types/nutrition-preferences";
import type { MealType } from "@/src/types/track";

interface AddDeliveryScreenProps {
  onClose: () => void;
  /** Called after a successful write, so the list behind can refresh. */
  onSaved: (count: number) => void;
}

export function AddDeliveryScreen({ onClose, onSaved }: AddDeliveryScreenProps) {
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);

  const [vendors, setVendors] = useState<NutritionVendor[]>([]);
  const [vendorUse, setVendorUse] = useState<VendorUse[]>([]);
  const [recents, setRecents] = useState<RecentDish[]>([]);
  const [vendorId, setVendorId] = useState<string | null>(null);
  const [useBy, setUseBy] = useState<string>(
    addLocalDays(getLocalDateString(), TYPICAL_PREPARED_MEAL_DAYS),
  );
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [drafts, setDrafts] = useState<PreparedMealDraft[]>([emptyDraft()]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      // The history is an accelerator, not a precondition: it is fetched
      // beside the vendors and a failure to load it leaves the screen exactly
      // as it was before recents existed.
      const [vendorResult, history] = await Promise.all([
        supabase
          .from("nutrition_vendors")
          .select("*")
          .eq("is_active", true)
          .order("display_order"),
        fetchDeliveryHistory(),
      ]);

      setVendorUse(history.vendorUse);
      setRecents(history.dishes);

      if (vendorResult.error) {
        console.error("delivery vendor fetch failed:", vendorResult.error);
        return;
      }
      const rows = (vendorResult.data ?? []) as NutritionVendor[];
      setVendors(rows);
      // One active vendor means there is nothing to choose. Preselecting it
      // saves the only tap that screen would ever collect.
      if (rows.length === 1) setVendorId(rows[0].id);
    })();
  }, []);

  // Most-delivered first, so the shop you actually use is the first tile
  // rather than whichever one preferences happened to list first.
  const orderedVendors = useMemo(
    () => orderVendorsByUse(vendors, vendorUse),
    [vendors, vendorUse],
  );

  // Already fetched, so picking a vendor filters rather than loads.
  const vendorRecents = useMemo(
    () => (vendorId ? recents.filter((d) => d.vendorId === vendorId) : []),
    [recents, vendorId],
  );

  // The steppers read their numbers off the rows below, which is what keeps
  // them honest when a row's Qty is edited by hand.
  const counts = useMemo(() => recentCounts(drafts), [drafts]);

  const filled = namedDrafts(drafts).length;
  const summary = useMemo(() => deliverySummary(drafts), [drafts]);

  const patch = (key: string, changes: Partial<PreparedMealDraft>) => {
    setDrafts((prev) => prev.map((d) => (d.key === key ? { ...d, ...changes } : d)));
  };

  const addRow = () => {
    // The new row inherits the slot of the one above it: a box tends to
    // arrive in runs — three breakfasts, then the lunches — so the commonest
    // next answer is the last answer.
    const last = drafts[drafts.length - 1];
    setDrafts((prev) => [...prev, emptyDraft(last?.slot ?? "lunch")]);
    // Let the row mount before scrolling to it.
    requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));
  };

  const removeRow = (key: string) => {
    setDrafts((prev) => {
      const next = prev.filter((d) => d.key !== key);
      // Never leave the list empty — an empty list has no affordance to type
      // into, and "add a meal" is the whole purpose of the screen.
      return next.length > 0 ? next : [emptyDraft()];
    });
  };

  // A stepper is a fast way to make an ordinary row. What it produces is
  // editable, validated and saved exactly like a row typed by hand.
  const addDish = (dish: RecentDish) => setDrafts((prev) => addRecent(prev, dish));
  const removeDish = (dish: RecentDish) => setDrafts((prev) => removeRecent(prev, dish));

  // Same shape as the Nutrition Facts reader: request permission, fall back to
  // the library when the camera is unavailable (the simulator has none), and
  // never let a rejected picker escape as an unhandled promise.
  const pickPhoto = useCallback(async (): Promise<string | null> => {
    const opts: ImagePicker.ImagePickerOptions = {
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7,
      base64: true,
    };
    try {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      const shot = perm.granted
        ? await ImagePicker.launchCameraAsync(opts).catch(() => null)
        : null;
      const picked = shot && !shot.canceled
        ? shot
        : await ImagePicker.launchImageLibraryAsync(opts);
      if (picked.canceled) return null;
      return picked.assets?.[0]?.base64 ?? null;
    } catch (e) {
      console.error("delivery picker failed:", e);
      Alert.alert("Couldn't open the camera", "Pick the photo from your library instead.");
      return null;
    }
  }, []);

  interface ReadMeal {
    name: string; slot: MealType | null; quantity: number | null;
    calories: number | null; protein: number | null; fiber: number | null;
    saturatedFat: number | null; sodium: number | null;
  }

  /** One lid, filling one row. No confirmation and no effect on any other
   *  row: the owner is looking at the row they are about to overwrite. */
  const [scanningKey, setScanningKey] = useState<string | null>(null);
  const scanRow = async (key: string) => {
    const base64 = await pickPhoto();
    if (!base64) return;

    setScanningKey(key);
    try {
      const { data, error } = await supabase.functions.invoke("delivery-menu", {
        body: { imageBase64: base64, single: true },
      });
      if (error) throw error;
      const meal = ((data?.meals ?? []) as ReadMeal[])[0];
      if (!meal) {
        Alert.alert("Couldn't read the label", data?.note ?? "Try again with the label filling the frame.");
        return;
      }
      // Only what was read is written. A number the label does not print
      // leaves whatever the owner already typed alone rather than blanking it.
      patch(key, {
        name: meal.name,
        ...(meal.slot ? { slot: meal.slot } : {}),
        ...(meal.quantity != null
          ? { quantity: String(Math.max(1, Math.round(meal.quantity))) }
          : {}),
        ...(meal.calories != null ? { calories: String(Math.round(meal.calories)) } : {}),
        ...(meal.protein != null ? { protein: String(meal.protein) } : {}),
        ...(meal.fiber != null ? { fiber: String(meal.fiber) } : {}),
        ...(meal.saturatedFat != null ? { saturatedFat: String(meal.saturatedFat) } : {}),
        ...(meal.sodium != null ? { sodium: String(Math.round(meal.sodium)) } : {}),
      });
      if (data?.note) Alert.alert("Read the label", data.note);
    } catch (e) {
      console.error("delivery label scan failed:", e);
      Alert.alert("Couldn't read it", "Try again with more light and the label filling the frame.");
    } finally {
      setScanningKey(null);
    }
  };

  const [scanningMenu, setScanningMenu] = useState(false);
  const scanMenu = async () => {
    const base64 = await pickPhoto();
    if (!base64) return;

    setScanningMenu(true);
    try {
      const { data, error } = await supabase.functions.invoke("delivery-menu", {
        body: { imageBase64: base64 },
      });
      if (error) throw error;
      const read = (data?.meals ?? []) as ReadMeal[];
      if (read.length === 0) {
        Alert.alert("No menu found", data?.note ?? "That doesn't look like a delivery menu.");
        return;
      }
      // REPLACES the drafts rather than appending: this is the box being read,
      // and merging a re-scan with a half-typed first attempt would silently
      // duplicate meals. Anything typed already is lost, so it asks first if
      // there is anything to lose.
      const apply = () => {
        setDrafts(read.map((m) => ({
          ...emptyDraft(m.slot ?? "lunch"),
          name: m.name,
          quantity: m.quantity != null ? String(Math.max(1, Math.round(m.quantity))) : "1",
          calories: m.calories != null ? String(Math.round(m.calories)) : "",
          protein: m.protein != null ? String(m.protein) : "",
          fiber: m.fiber != null ? String(m.fiber) : "",
          saturatedFat: m.saturatedFat != null ? String(m.saturatedFat) : "",
          sodium: m.sodium != null ? String(Math.round(m.sodium)) : "",
        })));
        if (data?.note) Alert.alert("Read the menu", data.note);
      };
      if (filled > 0) {
        Alert.alert(
          `Replace ${filled} meal${filled === 1 ? "" : "s"}?`,
          `The menu has ${read.length}. What you have typed will be replaced.`,
          [
            { text: "Keep mine", style: "cancel" },
            { text: "Replace", style: "destructive", onPress: apply },
          ],
        );
      } else {
        apply();
      }
    } catch (e) {
      console.error("delivery menu scan failed:", e);
      Alert.alert("Couldn't read it", "Try again with more light and the menu filling the frame.");
    } finally {
      setScanningMenu(false);
    }
  };

  const handleClose = () => {
    if (filled === 0) {
      onClose();
      return;
    }
    Alert.alert(
      "Discard this delivery?",
      `${summary} typed in and not saved.`,
      [
        { text: "Keep editing", style: "cancel" },
        { text: "Discard", style: "destructive", onPress: onClose },
      ],
    );
  };

  const handleSave = async () => {
    const problem = validateDelivery({ vendorId, useBy, drafts });
    if (problem) {
      Alert.alert("Not ready yet", problem);
      return;
    }
    setSaving(true);
    try {
      const count = await createPreparedMealDelivery({
        vendorId: vendorId as string,
        useBy,
        meals: toDeliveryPayload(drafts),
      });
      onSaved(count);
    } catch (e) {
      console.error("delivery save failed:", e);
      Alert.alert(
        "Couldn't save the delivery",
        "Nothing was written — the whole box saves or none of it does. Try again.",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <StatusBar barStyle="light-content" />
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={handleClose} style={styles.back} accessibilityRole="button">
            <ChevronLeft size={icons.md} color={colors.text} strokeWidth={icons.strokeWidth} />
            <Text style={styles.backText}>Back</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>New Delivery</Text>
          {/* Balances the back control so the title sits centred. */}
          <View style={styles.back} />
        </View>

        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          keyboardVerticalOffset={insets.top + 44}
        >
          <ScrollView
            ref={scrollRef}
            style={styles.flex}
            contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 120 }]}
            keyboardShouldPersistTaps="handled"
          >
            {/* What the whole box shares, asked once. */}
            <Card variant="panel" style={styles.card}>
              <Text style={styles.label}>Delivered by</Text>
              <VendorTiles
                vendors={orderedVendors}
                selectedId={vendorId}
                onSelect={setVendorId}
                allowNone={false}
              />
              {vendors.length === 0 && (
                <Text style={styles.help}>
                  No vendors set up yet. Add one under nutrition preferences first.
                </Text>
              )}

              <Text style={[styles.label, styles.labelSpaced]}>Use by</Text>
              <TouchableOpacity
                style={styles.dateButton}
                onPress={() => setShowDatePicker(true)}
                accessibilityRole="button"
                accessibilityLabel="Choose the use-by date"
              >
                <Calendar size={icons.sm} color={colors.textMuted} strokeWidth={icons.strokeWidth} />
                <Text style={styles.dateText}>{useBy}</Text>
              </TouchableOpacity>
              <Text style={styles.help}>
                Prepared food keeps about {TYPICAL_PREPARED_MEAL_DAYS} days. The date on the
                box wins — every meal in this delivery gets it.
              </Text>
            </Card>

            {/* A subscription sends the same dishes round again, so the fast
                path is recognising one rather than typing it. Only appears
                once a vendor is chosen — the list is that vendor's menu. */}
            {vendorRecents.length > 0 && (
              <Card variant="panel" style={styles.card}>
                <RecentDishes
                  dishes={vendorRecents}
                  counts={counts}
                  onAdd={addDish}
                  onRemove={removeDish}
                />
              </Card>
            )}

            {/* E4. The whole box is printed on the packing slip. Typing it
                out by hand — eight meals, four fields each, twice a week — is
                the actual cost of keeping these in the app. This reads it and
                fills the form; nothing is written until Save, and anything it
                could not read stays empty rather than being guessed. */}
            <TouchableOpacity
              style={styles.scanMenu}
              onPress={scanMenu}
              disabled={scanningMenu}
              accessibilityRole="button"
              accessibilityLabel="Photograph the delivery menu"
            >
              <Camera size={icons.sm} color={colors.textMuted} strokeWidth={icons.strokeWidth} />
              <Text style={styles.scanMenuText}>
                {scanningMenu
                  ? "Reading the menu…"
                  : "Photograph the menu and I'll fill these in"}
              </Text>
            </TouchableOpacity>

            {/* One card per meal. Name, slot, the three numbers on the lid,
                and a camera that fills just that card. */}
            {drafts.map((d, index) => (
              <DeliveryMealRow
                key={d.key}
                draft={d}
                index={index + 1}
                onPatch={(changes) => patch(d.key, changes)}
                onRemove={() => removeRow(d.key)}
                onScan={() => scanRow(d.key)}
                scanning={scanningKey === d.key}
              />
            ))}

            <Button label="Add another meal" onPress={addRow} variant="secondary" icon={Plus} fluid />
          </ScrollView>

          {/* Pinned: the box is long enough to scroll, and the count is the
              thing you check before committing. */}
          <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
            <Text style={styles.summary}>{summary}</Text>
            <Button
              label={saving ? "Saving…" : "Save delivery"}
              onPress={handleSave}
              disabled={saving || filled === 0}
              fluid
            />
          </View>
        </KeyboardAvoidingView>

        {saving && (
          <View style={styles.savingVeil}>
            <ActivityIndicator size="large" color={colors.brand} />
          </View>
        )}

        {showDatePicker && Platform.OS === "ios" && (
          <Modal transparent visible animationType="fade">
            <TouchableOpacity
              style={styles.pickerBackdrop}
              activeOpacity={1}
              onPress={() => setShowDatePicker(false)}
            >
              <View style={styles.pickerSheet}>
                <View style={styles.pickerHead}>
                  <Text style={styles.pickerTitle}>Use by</Text>
                  <TouchableOpacity onPress={() => setShowDatePicker(false)}>
                    <Text style={styles.pickerDone}>Done</Text>
                  </TouchableOpacity>
                </View>
                <DateTimePicker
                  value={parseLocalDate(useBy)}
                  mode="date"
                  display="spinner"
                  textColor={colors.text}
                  onChange={(_e, picked) => {
                    if (picked) setUseBy(getLocalDateString(picked));
                  }}
                />
              </View>
            </TouchableOpacity>
          </Modal>
        )}

        {showDatePicker && Platform.OS === "android" && (
          <DateTimePicker
            value={parseLocalDate(useBy)}
            mode="date"
            display="default"
            onChange={(_e, picked) => {
              setShowDatePicker(false);
              if (picked) setUseBy(getLocalDateString(picked));
            }}
          />
        )}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: spacing.screenGutter, paddingVertical: spacing.md,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  back: { flexDirection: "row", alignItems: "center", gap: spacing.xs, minWidth: 72 },
  backText: { ...typography.body, color: colors.text },
  headerTitle: { ...typography.rowTitle, color: colors.text },
  content: { padding: spacing.screenGutter, gap: spacing.md },
  card: { gap: spacing.sm },
  label: { ...typography.section, color: colors.textMuted },
  labelSpaced: { marginTop: spacing.md },
  help: { ...typography.caption, color: colors.textFaint },
  scanMenu: {
    flexDirection: "row", alignItems: "center", gap: spacing.sm,
    paddingHorizontal: spacing.md, paddingVertical: spacing.md,
    backgroundColor: colors.surface,
    borderWidth: 1, borderColor: colors.border, borderRadius: radii.control,
  },
  scanMenuText: { ...typography.caption, color: colors.textMuted, flexShrink: 1 },
  dateButton: {
    flexDirection: "row", alignItems: "center", gap: spacing.sm,
    backgroundColor: colors.surface2,
    borderWidth: 1, borderColor: colors.border, borderRadius: radii.control,
    paddingHorizontal: spacing.md, paddingVertical: spacing.md,
  },
  dateText: { ...typography.body, color: colors.text },
  footer: {
    paddingHorizontal: spacing.screenGutter, paddingTop: spacing.md, gap: spacing.sm,
    borderTopWidth: 1, borderTopColor: colors.border,
    backgroundColor: colors.bg,
  },
  summary: { ...typography.caption, color: colors.textMuted, textAlign: "center" },
  savingVeil: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center", justifyContent: "center",
    backgroundColor: colors.scrim,
  },
  pickerBackdrop: {
    flex: 1, justifyContent: "flex-end", backgroundColor: colors.scrim,
  },
  pickerSheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radii.panel, borderTopRightRadius: radii.panel,
    paddingBottom: spacing.xl,
  },
  pickerHead: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  pickerTitle: { ...typography.rowTitle, color: colors.text },
  pickerDone: { ...typography.body, color: colors.brand, fontWeight: "600" },
});
