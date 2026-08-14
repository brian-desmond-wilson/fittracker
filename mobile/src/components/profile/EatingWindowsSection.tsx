// Eating windows editor (Fuel). Lives inside Tracking Settings, under the
// meal-times card those windows replace.
//
// Until a user saves any row here, Fuel derives three 90-minute windows from
// the meal times above — so this section's empty state is not "nothing
// configured", it is "using the derived defaults", and it says so.
import { useCallback, useEffect, useState } from "react";
import {
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { Trash2 } from "lucide-react-native";
import { supabase } from "@/src/lib/supabase";
import { dateFromHhmm, hhmmFromDate } from "@/src/lib/timeFields";
import { formatClockTime } from "@/src/lib/timeFormat";
import { colors, radii, spacing, typography } from "@/src/theme/tokens";
import { Badge, Button, Card, IconButton, SectionHeader } from "@/src/components/ui";
import type { MealType } from "@/src/types/track";

interface WindowRow {
  id: string;
  label: string;
  meal_type: MealType;
  start_time: string; // "HH:MM:SS" from postgres, "HH:MM" once edited
  end_time: string;
}

const MEAL_TYPES: MealType[] = ["breakfast", "lunch", "dinner", "snack", "dessert"];

const hhmm = (t: string) => t.slice(0, 5);

interface DraftWindow {
  id: string | null; // null = creating
  label: string;
  mealType: MealType;
  start: string; // "HH:MM"
  end: string;
}

const EMPTY_DRAFT: DraftWindow = {
  id: null,
  label: "",
  mealType: "snack",
  start: "15:00",
  end: "16:00",
};

export function EatingWindowsSection({ userId }: { userId: string }) {
  const [rows, setRows] = useState<WindowRow[]>([]);
  const [draft, setDraft] = useState<DraftWindow | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Which of the draft's two times the inline spinner edits; null = closed.
  const [timeTarget, setTimeTarget] = useState<"start" | "end" | null>(null);

  const load = useCallback(async () => {
    const { data, error: dbError } = await supabase
      .from("eating_windows")
      .select("id, label, meal_type, start_time, end_time")
      .order("start_time");
    if (dbError) {
      console.error("EatingWindowsSection load:", dbError);
      return;
    }
    setRows((data ?? []) as WindowRow[]);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const openDraft = (w: WindowRow | null) => {
    setError(null);
    setTimeTarget(null);
    setDraft(
      w
        ? { id: w.id, label: w.label, mealType: w.meal_type, start: hhmm(w.start_time), end: hhmm(w.end_time) }
        : { ...EMPTY_DRAFT },
    );
  };

  const handleSaveDraft = async () => {
    if (!draft) return;
    setError(null);
    const label = draft.label.trim();
    if (label.length === 0) {
      setError("Give the window a name.");
      return;
    }
    if (draft.end <= draft.start) {
      setError("The window has to end after it starts.");
      return;
    }
    try {
      setSaving(true);
      if (draft.id) {
        const { error: dbError } = await supabase
          .from("eating_windows")
          .update({ label, meal_type: draft.mealType, start_time: draft.start, end_time: draft.end })
          .eq("id", draft.id);
        if (dbError) throw dbError;
      } else {
        const { error: dbError } = await supabase.from("eating_windows").insert({
          user_id: userId,
          label,
          meal_type: draft.mealType,
          start_time: draft.start,
          end_time: draft.end,
        });
        if (dbError) throw dbError;
      }
      setDraft(null);
      await load();
    } catch (e) {
      console.error("EatingWindowsSection save:", e);
      const msg = e instanceof Error ? e.message : "";
      setError(
        msg.includes("eating_windows_label_unique")
          ? "You already have a window with that name."
          : "Couldn't save. Try again.",
      );
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const { error: dbError } = await supabase.from("eating_windows").delete().eq("id", id);
      if (dbError) throw dbError;
      await load();
    } catch (e) {
      console.error("EatingWindowsSection delete:", e);
    }
  };

  return (
    <>
      <SectionHeader title="Eating Windows" />
      <Card variant="panel" style={s.sectionCard}>
        <Text style={s.help}>
          Fuel plans your day around these. A window that closes with nothing
          logged counts as missed, and its calories move to the windows still
          open.
          {rows.length === 0
            ? " Right now you're using three 90-minute windows derived from the meal times above — add your own to customize."
            : ""}
        </Text>
        {rows.map((w) => (
          <TouchableOpacity
            key={w.id}
            style={s.windowRow}
            onPress={() => openDraft(w)}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={`Edit ${w.label} window`}
          >
            <View style={s.windowBody}>
              <Text style={s.windowLabel}>{w.label}</Text>
              <Text style={s.windowMeta}>
                {formatClockTime(hhmm(w.start_time))} – {formatClockTime(hhmm(w.end_time))}
              </Text>
            </View>
            <Badge tone="neutral" label={w.meal_type} />
            <IconButton
              icon={Trash2}
              weight="secondary"
              tone="danger"
              onPress={() => handleDelete(w.id)}
              accessibilityLabel={`Delete ${w.label} window`}
            />
          </TouchableOpacity>
        ))}
        <Button label="Add Window" variant="secondary" onPress={() => openDraft(null)} fluid />
      </Card>

      {/* Centred sheet (house recipe) for create/edit. */}
      <Modal
        visible={draft !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setDraft(null)}
      >
        <View style={s.backdrop}>
          <Card variant="panel" style={s.sheetCard}>
            <Text style={s.sheetTitle}>{draft?.id ? "Edit Window" : "New Window"}</Text>

            <Text style={s.label}>Name</Text>
            <TextInput
              style={s.input}
              value={draft?.label ?? ""}
              onChangeText={(t) => setDraft((d) => (d ? { ...d, label: t } : d))}
              placeholder="Mid-morning"
              placeholderTextColor={colors.textMuted}
              editable={!saving}
            />

            <Text style={s.label}>Logs here default to</Text>
            <View style={s.chipRow}>
              {MEAL_TYPES.map((mt) => {
                const active = draft?.mealType === mt;
                return (
                  <TouchableOpacity
                    key={mt}
                    style={[s.chip, active && s.chipActive]}
                    onPress={() => setDraft((d) => (d ? { ...d, mealType: mt } : d))}
                    disabled={saving}
                    accessibilityRole="button"
                    accessibilityLabel={`Meal type ${mt}`}
                  >
                    <Text style={[s.chipText, active && s.chipTextActive]}>{mt}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <View style={s.row}>
              {(["start", "end"] as const).map((which) => (
                <View key={which} style={s.halfField}>
                  <Text style={s.label}>{which === "start" ? "Opens" : "Closes"}</Text>
                  <TouchableOpacity
                    style={s.input}
                    onPress={() => setTimeTarget((t) => (t === which ? null : which))}
                    disabled={saving}
                    accessibilityRole="button"
                    accessibilityLabel={`${which === "start" ? "Opens" : "Closes"} at ${
                      draft ? formatClockTime(draft[which]) : ""
                    }`}
                  >
                    <Text style={s.inputText}>
                      {draft ? formatClockTime(draft[which]) : ""}
                    </Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
            {/* Inline spinner, not a nested modal — stacked modals on iOS
                fight over the presentation layer. */}
            {timeTarget !== null && draft !== null && (
              <DateTimePicker
                value={dateFromHhmm(draft[timeTarget])}
                mode="time"
                display="spinner"
                onChange={(_e, picked) => {
                  if (picked) {
                    setDraft((d) => (d ? { ...d, [timeTarget]: hhmmFromDate(picked) } : d));
                  }
                }}
                textColor={colors.text}
              />
            )}

            {error ? <Text style={s.errorText}>{error}</Text> : null}

            <View style={s.actions}>
              <View style={s.actionButton}>
                <Button
                  variant="secondary"
                  label="Cancel"
                  onPress={() => setDraft(null)}
                  disabled={saving}
                  fluid
                />
              </View>
              <View style={s.actionButton}>
                <Button label="Save" onPress={handleSaveDraft} loading={saving} fluid />
              </View>
            </View>
          </Card>
        </View>
      </Modal>
    </>
  );
}

const s = StyleSheet.create({
  sectionCard: { marginBottom: spacing.sm },
  help: { ...typography.caption, marginBottom: spacing.md },
  windowRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    marginBottom: spacing.sm,
  },
  windowBody: { flex: 1 },
  windowLabel: { ...typography.rowTitle, color: colors.text },
  windowMeta: { ...typography.caption, marginTop: 2 },

  backdrop: {
    flex: 1,
    backgroundColor: colors.scrim,
    justifyContent: "center",
    alignItems: "center",
    padding: spacing.xl,
  },
  sheetCard: { width: "100%", maxHeight: "100%" },
  sheetTitle: { ...typography.titleBar, color: colors.text, marginBottom: spacing.md },
  label: { ...typography.section, marginTop: spacing.sm, marginBottom: spacing.xs },
  input: {
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.control,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: 16, // §4.5 defines no input token — see STYLE_GUIDE §6
    color: colors.text,
  },
  inputText: { fontSize: 16, color: colors.text }, // matches input text size
  row: { flexDirection: "row", gap: spacing.md },
  halfField: { flex: 1 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  // Grouped, mutually-exclusive selector inside a sheet → solid brand active
  // (rule 21 / the sheet recipe's chip treatment).
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.control,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  chipText: { ...typography.buttonSm, color: colors.textMuted },
  chipTextActive: { color: colors.onBrand },
  errorText: { ...typography.body, color: colors.danger, textAlign: "center", marginTop: spacing.sm },
  actions: { flexDirection: "row", gap: spacing.md, marginTop: spacing.lg },
  actionButton: { flex: 1 },
});
