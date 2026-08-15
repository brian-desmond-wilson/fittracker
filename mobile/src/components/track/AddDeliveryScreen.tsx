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
import { Calendar, Camera, ChevronLeft, Plus, Truck } from "lucide-react-native";
import { Button, Card } from "@/src/components/ui";
import { VendorTiles } from "@/src/components/track/edit/VendorTiles";
import { MealEditorSheet, IDLE_SEARCH, type DishSearchState } from "@/src/components/track/delivery/MealEditorSheet";
import { MealRowCompact } from "@/src/components/track/delivery/MealRowCompact";
import { RecentDishes } from "@/src/components/track/delivery/RecentDishes";
import { supabase } from "@/src/lib/supabase";
import { formatArrival, formatDayLabel, getLocalDateString, parseLocalDate } from "@/src/lib/dates";
import {
  savePreparedMealDelivery, updatePendingDelivery,
  type PendingDeliveryDraft,
} from "@/src/lib/supabase/preparedMeals";
import { fetchDeliveryHistory } from "@/src/lib/supabase/deliveryHistory";
import { searchDishImages } from "@/src/lib/supabase/dishImageSearch";
import {
  addLocalDays, addRecent, deliverySummary, dishesNeedingImages,
  draftsFromPayload, emptyDraft, namedDrafts, orderVendorsByUse, recentCounts,
  removeRecent, toDeliveryPayload, validateDelivery, withDraftPhotos,
  TYPICAL_PREPARED_MEAL_DAYS,
  type PreparedMealDraft, type RecentDish, type VendorUse,
} from "@/src/lib/preparedMealDelivery";
import { colors, icons, radii, spacing, typography } from "@/src/theme/tokens";
import type { NutritionVendor } from "@/src/types/nutrition-preferences";
import type { MealType } from "@/src/types/track";

/**
 * What became of the box when Save was pressed.
 *
 * `delivered` and `scheduled` are the DATABASE's verdict on a new delivery —
 * the client's clock does not get a vote, because a phone running a few minutes
 * fast would otherwise schedule a box its owner is holding.
 *
 * `due` only happens on an edit. Changing a pending row is one `UPDATE`, not
 * the scheduling RPC, so moving its arrival into the past does not write
 * anything: the box simply becomes due, and the next inventory read is what
 * turns it into food. Worth its own word, because it is the one outcome where
 * a card vanishes from the Deliveries page without the user cancelling it.
 */
export type DeliverySaveStatus = "delivered" | "scheduled" | "due";

/** Matches the Deliveries card's use-by line, so the date a box is saved with
 *  reads the same as the date it is listed with. */
const USE_BY_LABEL = { weekday: "short", month: "short", day: "numeric" } as const;

interface AddDeliveryScreenProps {
  onClose: () => void;
  /** Called after a successful write, so the list behind can refresh.
   *  `arrivesAt` is what a waiting box is waiting for. */
  onSaved: (count: number, status: DeliverySaveStatus, arrivesAt: string) => void;
  /**
   * A box already scheduled, reopened. Absent for a new delivery.
   *
   * The same form either way, deliberately: a delivery is a delivery, the
   * validation that made it valid is the validation that keeps it valid, and a
   * second screen for changing one would drift from the screen that writes one.
   * All that changes is the wording and where Save sends the payload.
   */
  editing?: PendingDeliveryDraft;
}

export function AddDeliveryScreen({ onClose, onSaved, editing }: AddDeliveryScreenProps) {
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);

  const [vendors, setVendors] = useState<NutritionVendor[]>([]);
  const [vendorUse, setVendorUse] = useState<VendorUse[]>([]);
  const [recents, setRecents] = useState<RecentDish[]>([]);
  const [vendorId, setVendorId] = useState<string | null>(editing?.vendorId ?? null);
  const [useBy, setUseBy] = useState<string>(
    editing?.useBy ?? addLocalDays(getLocalDateString(), TYPICAL_PREPARED_MEAL_DAYS),
  );
  const [showDatePicker, setShowDatePicker] = useState(false);
  // When the box turns up. Now by default, because most deliveries are logged
  // as they are unpacked; moved forward, it holds the whole box until then.
  const [arrivesAt, setArrivesAt] = useState<Date>(
    editing ? new Date(editing.arrivesAt) : new Date(),
  );
  const [showArrivalPicker, setShowArrivalPicker] = useState(false);
  // Android has no combined picker, so it asks in two steps; this is which
  // step is open, and it is null on iOS throughout.
  const [androidArrivalStep, setAndroidArrivalStep] = useState<"date" | "time" | null>(null);
  const [drafts, setDrafts] = useState<PreparedMealDraft[]>(
    editing ? draftsFromPayload(editing.meals) : [emptyDraft()],
  );
  const [saving, setSaving] = useState(false);
  // Which meal's editor sheet is open. A key, not an index: rows can be
  // removed from under a stale index, but a key just stops matching.
  const [editingKey, setEditingKey] = useState<string | null>(null);
  // Web image candidates per row key. Kept here rather than in the sheet so
  // the auto-search after a menu scan has somewhere to land before any sheet
  // has been opened, and so closing a sheet does not throw results away.
  const [searches, setSearches] = useState<Record<string, DishSearchState>>({});

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
      // saves the only tap that screen would ever collect. Never over a choice
      // already made: a box being edited names its own vendor, which may not be
      // the only active one.
      if (rows.length === 1) setVendorId((prev) => prev ?? rows[0].id);
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

  const vendorName = useMemo(
    () => vendors.find((v) => v.id === vendorId)?.name ?? null,
    [vendors, vendorId],
  );

  /** Ask the web for pictures of one row's dish. Fire-and-forget: results land
   *  in `searches` whenever they land, and the sheet renders whatever is there.
   *  `force` re-runs a search whose results are already in (the Search button);
   *  without it a run that is loading or done is left alone, so the post-scan
   *  sweep cannot stampede a row the user is already looking at. */
  const runSearch = useCallback(
    (key: string, name: string, force = false) => {
      setSearches((prev) => {
        const current = prev[key] ?? IDLE_SEARCH;
        if (!force && current.status !== "idle") return prev;
        // The fetch is kicked off inside the updater on purpose: the updater
        // is where "should this run?" is decided race-free.
        searchDishImages(name, vendorName).then(({ candidates, configured }) => {
          setSearches((later) => ({
            ...later,
            [key]: { status: "done", candidates, configured },
          }));
        });
        return { ...prev, [key]: { status: "loading", candidates: [], configured: true } };
      });
    },
    [vendorName],
  );

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
    const fresh = emptyDraft(last?.slot ?? "lunch");
    setDrafts((prev) => [...prev, fresh]);
    // Straight into the editor: a compact row has no inline name field, so an
    // added meal with no open sheet would be a dead end.
    setEditingKey(fresh.key);
  };

  const removeRow = (key: string) => {
    setDrafts((prev) => {
      const next = prev.filter((d) => d.key !== key);
      // Never leave the list empty — an empty list has no affordance to type
      // into, and "add a meal" is the whole purpose of the screen.
      return next.length > 0 ? next : [emptyDraft()];
    });
    setEditingKey((open) => (open === key ? null : open));
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
      // A scan is the capture flow, so the picture hunt starts by itself —
      // typing a name never searches, but reading a label just did the typing.
      runSearch(key, meal.name, true);
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
        const fresh = read.map((m) => ({
          ...emptyDraft(m.slot ?? "lunch"),
          name: m.name,
          quantity: m.quantity != null ? String(Math.max(1, Math.round(m.quantity))) : "1",
          calories: m.calories != null ? String(Math.round(m.calories)) : "",
          protein: m.protein != null ? String(m.protein) : "",
          fiber: m.fiber != null ? String(m.fiber) : "",
          saturatedFat: m.saturatedFat != null ? String(m.saturatedFat) : "",
          sodium: m.sodium != null ? String(Math.round(m.sodium)) : "",
        }));
        // Repeat dishes take their picture from history for free; only the
        // genuinely new ones go to the web, and those searches run now, in the
        // background, so candidates are already waiting when a row is opened.
        const withPhotos = vendorId ? withDraftPhotos(fresh, vendorId, recents) : fresh;
        setDrafts(withPhotos);
        for (const dish of dishesNeedingImages(withPhotos)) {
          runSearch(dish.key, dish.name);
        }
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
    // An edit always has rows in it, so `filled` cannot say whether anything
    // was actually changed. It asks anyway rather than pretending to know:
    // leaving without saving is the same loss either way.
    Alert.alert(
      editing ? "Discard your changes?" : "Discard this delivery?",
      editing
        ? "The delivery stays as it was scheduled."
        : `${summary} typed in and not saved.`,
      [
        { text: "Keep editing", style: "cancel" },
        { text: "Discard", style: "destructive", onPress: onClose },
      ],
    );
  };

  // Recomputed on every render rather than watched with a timer: the only
  // thing that acts on it is a Save the user is about to press, and a minute
  // hand that flips this line while nobody is touching the screen would be
  // motion for its own sake.
  const arrivalIsFuture = arrivesAt.getTime() > Date.now();

  const handleSave = async () => {
    const problem = validateDelivery({
      vendorId,
      useBy,
      arrivesOn: getLocalDateString(arrivesAt),
      drafts,
    });
    if (problem) {
      Alert.alert("Not ready yet", problem);
      return;
    }
    setSaving(true);
    const meals = toDeliveryPayload(drafts);
    const iso = arrivesAt.toISOString();
    try {
      if (editing) {
        // One UPDATE on the row that is already waiting. No RPC and no
        // transaction to hold, because nothing has been written from this
        // payload yet — it is still one column, and changing a column is not
        // the eight-table write that scheduling one eventually becomes.
        const applied = await updatePendingDelivery({
          id: editing.id,
          vendorId: vendorId as string,
          useBy,
          arrivesAt: iso,
          meals,
        });
        if (!applied) {
          // It arrived while it was open. Saying so is the whole point: the
          // meals are in the fridge now, and the edit has nothing to apply.
          Alert.alert(
            "This delivery already arrived",
            "It landed while you were editing, so its meals are in your inventory now. Your changes weren't saved — edit the items there instead.",
            [{ text: "OK", onPress: onClose }],
          );
          return;
        }
        onSaved(
          meals.reduce((sum, m) => sum + Math.max(1, m.quantity), 0),
          // The client's clock decides here, and it is allowed to: unlike a new
          // delivery, nothing is being written on the strength of this answer —
          // it only picks which sentence the confirmation uses.
          arrivesAt.getTime() > Date.now() ? "scheduled" : "due",
          iso,
        );
        return;
      }

      const result = await savePreparedMealDelivery({
        vendorId: vendorId as string,
        useBy,
        arrivesAt: iso,
        meals,
      });
      onSaved(result.count, result.status, iso);
    } catch (e) {
      console.error("delivery save failed:", e);
      Alert.alert(
        editing ? "Couldn't save your changes" : "Couldn't save the delivery",
        editing
          ? "The delivery is still scheduled as it was. Try again."
          : "Nothing was written — the whole box saves or none of it does. Try again.",
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
          <Text style={styles.headerTitle}>{editing ? "Edit Delivery" : "New Delivery"}</Text>
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

              {/* One line for both dates: they are one decision about time,
                  and stacked full-width they pushed the meals below the fold. */}
              <View style={styles.dateRow}>
                <View style={styles.dateHalf}>
                  <Text style={[styles.label, styles.labelSpaced]}>Arrives</Text>
                  <TouchableOpacity
                    style={styles.dateButton}
                    onPress={() => {
                      if (Platform.OS === "android") setAndroidArrivalStep("date");
                      else setShowArrivalPicker(true);
                    }}
                    accessibilityRole="button"
                    accessibilityLabel="Choose when this delivery arrives"
                  >
                    <Truck size={icons.sm} color={colors.textMuted} strokeWidth={icons.strokeWidth} />
                    <Text style={styles.dateText} numberOfLines={1}>{formatArrival(arrivesAt)}</Text>
                  </TouchableOpacity>
                </View>
                <View style={styles.dateHalf}>
                  <Text style={[styles.label, styles.labelSpaced]}>Use by</Text>
                  <TouchableOpacity
                    style={styles.dateButton}
                    onPress={() => setShowDatePicker(true)}
                    accessibilityRole="button"
                    accessibilityLabel="Choose the use-by date"
                  >
                    <Calendar size={icons.sm} color={colors.textMuted} strokeWidth={icons.strokeWidth} />
                    {/* The same words the Deliveries card uses for this date.
                        A stored `YYYY-MM-DD` is for the database to read; the
                        day of the week is what tells you whether the box will
                        still be good by then. */}
                    <Text style={styles.dateText} numberOfLines={1}>
                      {formatDayLabel(useBy, USE_BY_LABEL)}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
              {/* The consequence, not the mechanism — and it differs between
                  the two forms. A new delivery with a past arrival is written
                  on the spot by the scheduling function; an edit is one UPDATE
                  on a row that is still waiting, so the same date only makes it
                  due, and the food appears on the next inventory read. */}
              <Text style={styles.help}>
                {arrivalIsFuture
                  ? "Nothing lands in your inventory until then — these meals appear the first time you open the app after it arrives."
                  : editing
                    ? "That's in the past, which is allowed — the box becomes due, and these meals join your inventory the next time you open it."
                    : "These meals go into your inventory as soon as you save."}
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
                  vendorName={vendorName}
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

            {/* One line per meal; the editor sheet holds the rest. Eight
                meals fit on a screen this way, which is what reviewing a
                box actually needs. */}
            <Text style={styles.mealsLabel}>Meals in this box</Text>
            {drafts.map((d, index) => (
              <MealRowCompact
                key={d.key}
                draft={d}
                index={index + 1}
                onOpen={() => setEditingKey(d.key)}
              />
            ))}

            <Button label="Add another meal" onPress={addRow} variant="secondary" icon={Plus} fluid />
          </ScrollView>

          {/* Pinned: the box is long enough to scroll, and the count is the
              thing you check before committing. */}
          <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
            <Text style={styles.summary}>{summary}</Text>
            <Button
              label={saving ? "Saving…" : editing ? "Save changes" : "Save delivery"}
              onPress={handleSave}
              disabled={saving || filled === 0}
              fluid
            />
          </View>
        </KeyboardAvoidingView>

        {(() => {
          const openIndex = drafts.findIndex((d) => d.key === editingKey);
          if (openIndex === -1) return null;
          const open = drafts[openIndex];
          return (
            <MealEditorSheet
              draft={open}
              index={openIndex + 1}
              vendorName={vendorName}
              search={searches[open.key] ?? IDLE_SEARCH}
              onPatch={(changes) => patch(open.key, changes)}
              onRemove={() => removeRow(open.key)}
              onClose={() => setEditingKey(null)}
              onScanLabel={() => scanRow(open.key)}
              scanningLabel={scanningKey === open.key}
              onSearch={() => runSearch(open.key, open.name.trim(), true)}
            />
          );
        })()}

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

        {/* iOS asks for both halves at once; Android has no such picker, so it
            asks for the day and then the time, in that order. Either way the
            answer is one instant. */}
        {showArrivalPicker && Platform.OS === "ios" && (
          <Modal transparent animationType="fade" onRequestClose={() => setShowArrivalPicker(false)}>
            <TouchableOpacity
              style={styles.pickerBackdrop}
              activeOpacity={1}
              onPress={() => setShowArrivalPicker(false)}
            >
              <View style={styles.pickerSheet}>
                <View style={styles.pickerHead}>
                  <Text style={styles.pickerTitle}>Arrives</Text>
                  <TouchableOpacity onPress={() => setShowArrivalPicker(false)}>
                    <Text style={styles.pickerDone}>Done</Text>
                  </TouchableOpacity>
                </View>
                <DateTimePicker
                  value={arrivesAt}
                  mode="datetime"
                  display="spinner"
                  textColor={colors.text}
                  onChange={(_e, picked) => {
                    if (picked) setArrivesAt(picked);
                  }}
                />
              </View>
            </TouchableOpacity>
          </Modal>
        )}

        {androidArrivalStep === "date" && Platform.OS === "android" && (
          <DateTimePicker
            value={arrivesAt}
            mode="date"
            display="default"
            onChange={(_e, picked) => {
              // Cancelling the day cancels the whole question rather than
              // dropping the user into a time picker for a day they declined
              // to choose.
              if (!picked) {
                setAndroidArrivalStep(null);
                return;
              }
              // The day from the picker, the time from what was already there:
              // half an answer must not silently reset the other half.
              const next = new Date(arrivesAt);
              next.setFullYear(picked.getFullYear(), picked.getMonth(), picked.getDate());
              setArrivesAt(next);
              setAndroidArrivalStep("time");
            }}
          />
        )}

        {androidArrivalStep === "time" && Platform.OS === "android" && (
          <DateTimePicker
            value={arrivesAt}
            mode="time"
            display="default"
            onChange={(_e, picked) => {
              setAndroidArrivalStep(null);
              if (!picked) return;
              const next = new Date(arrivesAt);
              next.setHours(picked.getHours(), picked.getMinutes(), 0, 0);
              setArrivesAt(next);
            }}
          />
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
  dateRow: { flexDirection: "row", gap: spacing.sm },
  dateHalf: { flex: 1, gap: spacing.sm },
  dateButton: {
    flexDirection: "row", alignItems: "center", gap: spacing.sm,
    backgroundColor: colors.surface2,
    borderWidth: 1, borderColor: colors.border, borderRadius: radii.control,
    paddingHorizontal: spacing.md, paddingVertical: spacing.md,
  },
  dateText: { ...typography.body, color: colors.text, flexShrink: 1 },
  mealsLabel: { ...typography.section, color: colors.textMuted, paddingLeft: 2 },
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
