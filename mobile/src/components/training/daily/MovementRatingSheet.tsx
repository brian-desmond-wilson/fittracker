// Per-movement too-easy/right/too-hard — the second half of closing a day.
// The DebriefSheet asks about the session; this asks about each movement, and
// its answers feed exercise_skill_state through the dailySkill state machine
// (spec §5.5). Skippable; dismissing saves nothing. Promotions are celebrated
// inline before the sheet closes.
import React, { useEffect, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from "react-native";
import { BottomSheet } from "@/src/components/ui/BottomSheet";
import { X, TrendingUp } from "lucide-react-native";
import { colors, radii, spacing, tint, typography } from "@/src/theme/tokens";
import { supabase } from "@/src/lib/supabase";
import { saveMovementRatings } from "@/src/lib/supabase/daily";
import type { PromotionResult } from "@/src/lib/supabase/daily";
import type { MovementRating } from "@/src/lib/dailySkill";

const CHOICES: { key: MovementRating; label: string }[] = [
  { key: "too_easy", label: "Too easy" },
  { key: "right", label: "Right" },
  { key: "too_hard", label: "Too hard" },
];

export interface RatableMovement {
  exerciseId: string;
  name: string;
}

interface MovementRatingSheetProps {
  visible: boolean;
  sessionId: string | null;
  movements: RatableMovement[];
  onClose: () => void;
  onSaved: () => void;
  /** Pre-selected pills, keyed by exercise id — the exercise page's Re-rate
   *  opens on the rating that stands. Callers must pass a referentially
   *  stable object (memoised): the reset effect keys on it, and a fresh
   *  object per render would wipe in-progress taps. */
  initialRatings?: Record<string, MovementRating>;
  /** Replaces the session-end save. The caller owns success and failure
   *  (the page keeps its old note and toasts); the sheet just closes after. */
  onSave?: (ratings: { exerciseId: string; rating: MovementRating }[]) => Promise<void>;
}

export function MovementRatingSheet({
  visible, sessionId, movements, onClose, onSaved, initialRatings, onSave,
}: MovementRatingSheetProps) {
  const [ratings, setRatings] = useState<Record<string, MovementRating>>({});
  const [promotions, setPromotions] = useState<PromotionResult[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setRatings(initialRatings ?? {});
    setPromotions(null);
    setErrorText(null);
  }, [visible, initialRatings]);

  const count = Object.keys(ratings).length;

  const submit = async () => {
    if (!sessionId || saving || count === 0) return;
    setSaving(true);
    setErrorText(null);
    if (onSave) {
      try {
        await onSave(Object.entries(ratings).map(([exerciseId, rating]) => ({ exerciseId, rating })));
      } finally {
        setSaving(false); // a throwing onSave must not leave the sheet stuck
      }
      onSaved();
      return;
    }
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setSaving(false); return; }
    const result = await saveMovementRatings({
      userId: user.id,
      sessionId,
      ratings: Object.entries(ratings).map(([exerciseId, rating]) => ({ exerciseId, rating })),
    });
    setSaving(false);
    if (!result) {
      setErrorText("Save failed. Nothing was recorded — try again.");
      return; // the sheet stays, taps intact
    }
    if (result.promotions.length > 0) {
      setPromotions(result.promotions); // show the level-ups; Done closes
    } else {
      onSaved();
    }
  };

  const nameOf = (id: string) =>
    movements.find((m) => m.exerciseId === id)?.name ?? "This movement";

  return (
    <BottomSheet visible={visible} onClose={onClose} maxHeight="82%">
      <View style={styles.header}>
        <Text style={styles.title}>
          {promotions ? "Leveled up" : "How did each movement feel?"}
        </Text>
        <TouchableOpacity
          onPress={onClose}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <X size={22} color={colors.textMuted} />
        </TouchableOpacity>
      </View>

      {promotions === null ? (
        <>
          <Text style={styles.hint}>Too easy twice in a row levels a movement up.</Text>
          <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
            {movements.map((m) => (
              <View key={m.exerciseId} style={styles.row}>
                <Text style={styles.movement} numberOfLines={2}>{m.name}</Text>
                <View style={styles.pillRow}>
                  {CHOICES.map((c) => {
                    const active = ratings[m.exerciseId] === c.key;
                    return (
                      <TouchableOpacity
                        key={c.key}
                        style={[styles.pill, active && styles.pillActive]}
                        onPress={() =>
                          setRatings((r) => {
                            const next = { ...r };
                            if (active) delete next[m.exerciseId];
                            else next[m.exerciseId] = c.key;
                            return next;
                          })
                        }
                        accessibilityRole="button"
                        accessibilityLabel={`${m.name}: ${c.label}`}
                        accessibilityState={{ selected: active }}
                      >
                        <Text style={[styles.pillText, active && styles.pillTextActive]}>
                          {c.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            ))}
            {errorText && <Text style={styles.error}>{errorText}</Text>}
            {/* Primary action at the end of the scroll — house rule. */}
            <TouchableOpacity
              style={[styles.button, (saving || count === 0) && { opacity: 0.5 }]}
              onPress={submit}
              disabled={saving || count === 0}
              accessibilityRole="button"
              accessibilityLabel="Save the ratings"
              accessibilityState={{ disabled: saving || count === 0, busy: saving }}
            >
              <Text style={styles.buttonText}>
                {saving ? "Saving…" : count === 0 ? "Save" : `Save ${count} rating${count === 1 ? "" : "s"}`}
              </Text>
            </TouchableOpacity>
          </ScrollView>
        </>
      ) : (
        <View>
          {promotions.map((p) => (
            <View key={p.exerciseId} style={styles.promoRow}>
              <TrendingUp size={18} color={colors.success} />
              <Text style={styles.promoText}>
                {nameOf(p.exerciseId)} leveled up
                {p.toName ? ` — try ${p.toName} next time` : ""}
              </Text>
            </View>
          ))}
          <TouchableOpacity
            style={styles.button}
            onPress={onSaved}
            accessibilityRole="button"
            accessibilityLabel="Done"
          >
            <Text style={styles.buttonText}>Done</Text>
          </TouchableOpacity>
        </View>
      )}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    gap: spacing.sm,
  },
  title: { fontSize: 17, fontWeight: "700", color: colors.text, flexShrink: 1 },
  hint: { fontSize: 12.5, color: colors.textMuted, marginTop: 4, marginBottom: spacing.md },
  list: { flexGrow: 0 },
  row: { marginBottom: spacing.md },
  movement: { fontSize: 14.5, fontWeight: "600", color: colors.text, marginBottom: 6 },
  pillRow: { flexDirection: "row", gap: 8 },
  pill: {
    flex: 1, alignItems: "center", paddingVertical: 9,
    backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border,
    borderRadius: radii.pill,
  },
  pillActive: { borderColor: colors.brand, backgroundColor: tint(colors.brand) },
  pillText: { fontSize: 13, color: colors.textMuted },
  pillTextActive: { color: colors.brand, fontWeight: "600" },
  error: { fontSize: 12.5, color: colors.danger, marginBottom: spacing.sm },
  button: {
    backgroundColor: colors.brand, borderRadius: radii.control, paddingVertical: 14,
    alignItems: "center", marginTop: spacing.sm, marginBottom: spacing.md,
  },
  buttonText: { color: colors.onBrand, ...typography.button },
  promoRow: {
    flexDirection: "row", alignItems: "center", gap: spacing.sm,
    backgroundColor: colors.surface2, borderRadius: radii.row, padding: spacing.md,
    marginTop: spacing.sm,
  },
  promoText: { flex: 1, fontSize: 14, color: colors.text },
});
