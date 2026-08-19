// The day's inputs, one sheet: gym, energy, session length, soreness.
// Saving recomposes the day (the tab bumps); locked blocks ride through.
// Replaces the old gym-pill + check-in split as the Today tab's entry point —
// approved mockup C is the decision record. GymSheet remains the gym CRUD.
import React, { useEffect, useState } from "react";
import {
  Modal, View, Text, TouchableOpacity, StyleSheet, ScrollView,
} from "react-native";
import { ChevronRight, MapPin, X } from "lucide-react-native";
import { colors, radii, spacing, typography } from "@/src/theme/tokens";
import { supabase } from "@/src/lib/supabase";
import { getLocalDateString } from "@/src/lib/dates";
import { saveCheckin, setActiveGym } from "@/src/lib/supabase/daily";
import { fetchMuscleRegions } from "@/src/lib/supabase/crossfit";
import { formatMinutesLabel } from "@/src/lib/timeFormat";
import type { DailyCheckin, GymProfile } from "@/src/types/daily";

// Up to three hours — a session length is however long the athlete actually
// has, and 90 was the old ceiling talking, not them.
const MINUTES_OPTIONS = [30, 45, 60, 90, 120, 150, 180];
// Cycle 0 → 1 → 2 → 3 → 0 on tap: not sore, tender, sore, very sore.
const SEVERITY_LABEL = ["", "tender", "sore", "very sore"];

interface SetupSheetProps {
  visible: boolean;
  existing: DailyCheckin | null;
  gyms: GymProfile[];
  onClose: () => void;
  onSaved: () => void;
  /** Open the gym CRUD sheet (add a gym, edit equipment). */
  onManageGyms: () => void;
  /** Jump to the body page's soreness mode. */
  onOpenBody: () => void;
}

export function SetupSheet({
  visible, existing, gyms, onClose, onSaved, onManageGyms, onOpenBody,
}: SetupSheetProps) {
  const [energy, setEnergy] = useState(existing?.energy ?? 7);
  const [minutes, setMinutes] = useState(existing?.minutesAvailable ?? 60);
  const [soreness, setSoreness] = useState<Record<string, number>>(existing?.soreness ?? {});
  const [gymId, setGymId] = useState<string | null>(null);
  const [regions, setRegions] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setEnergy(existing?.energy ?? 7);
    setMinutes(existing?.minutesAvailable ?? 60);
    setSoreness(existing?.soreness ?? {});
    setGymId(gyms.find((g) => g.isActive)?.id ?? null);
    fetchMuscleRegions().then((rows) =>
      // "Full Body" is a classification, not a body part you can be sore in.
      setRegions(rows.map((r: any) => r.name).filter((n: string) => n !== "Full Body")),
    );
  }, [visible, existing, gyms]);

  const cycleSoreness = (region: string) => {
    setSoreness((prev) => {
      const next = { ...prev };
      const bumped = ((next[region] ?? 0) + 1) % 4;
      if (bumped === 0) delete next[region]; else next[region] = bumped;
      return next;
    });
  };

  const handleSave = async () => {
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setSaving(false); return; }
    const activeId = gyms.find((g) => g.isActive)?.id ?? null;
    if (gymId && gymId !== activeId) await setActiveGym(user.id, gymId);
    await saveCheckin({
      userId: user.id,
      date: getLocalDateString(),
      energy,
      minutesAvailable: minutes,
      soreness,
      // An edit to energy must not silently undo a "train anyway".
      overrideRecovery: existing?.overrideRecovery ?? false,
    });
    setSaving(false);
    onSaved();
  };

  const soreCount = Object.keys(soreness).length;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>Today's setup</Text>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <X size={24} color={colors.textMuted} />
          </TouchableOpacity>
        </View>
        <Text style={styles.subtitle}>Changes rebuild your day. Locked blocks stay.</Text>
        <ScrollView>
          <Text style={styles.label}>
            <MapPin size={12} color={colors.textMuted} /> Gym
          </Text>
          <View style={styles.pillRow}>
            {gyms.map((g) => (
              <TouchableOpacity key={g.id}
                style={[styles.pill, gymId === g.id && styles.pillActive]}
                onPress={() => setGymId(g.id)}>
                <Text style={[styles.pillText, gymId === g.id && styles.pillTextActive]}>
                  {g.name}
                </Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={styles.pill} onPress={onManageGyms}>
              <Text style={styles.pillText}>
                {gyms.length === 0 ? "Add a gym…" : "Manage…"}
              </Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.label}>Energy: {energy}/10</Text>
          <View style={styles.pillRow}>
            {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
              <TouchableOpacity key={n}
                style={[styles.dot, energy === n && styles.pillActive]}
                onPress={() => setEnergy(n)}>
                <Text style={[styles.pillText, energy === n && styles.pillTextActive]}>{n}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.label}>Session length</Text>
          <View style={styles.pillRow}>
            {MINUTES_OPTIONS.map((m) => (
              <TouchableOpacity key={m}
                style={[styles.pill, minutes === m && styles.pillActive]}
                onPress={() => setMinutes(m)}>
                <Text style={[styles.pillText, minutes === m && styles.pillTextActive]}>
                  {formatMinutesLabel(m)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.soreHeader}>
            <Text style={styles.label}>
              Sore anywhere?{soreCount > 0 ? ` (${soreCount})` : ""} Tap to cycle severity.
            </Text>
            <TouchableOpacity style={styles.bodyLink} onPress={onOpenBody}
              accessibilityRole="button"
              accessibilityLabel="Mark soreness on the body figure">
              <Text style={styles.bodyLinkText}>Mark on body</Text>
              <ChevronRight size={14} color={colors.brand} />
            </TouchableOpacity>
          </View>
          <View style={styles.pillRow}>
            {regions.map((r) => {
              const level = soreness[r] ?? 0;
              return (
                <TouchableOpacity key={r}
                  style={[styles.pill, level > 0 && styles.pillActive, level > 1 && styles.pillHot]}
                  onPress={() => cycleSoreness(r)}>
                  <Text style={[styles.pillText, level > 0 && styles.pillTextActive]}>
                    {r}{level > 0 ? ` · ${SEVERITY_LABEL[level]}` : ""}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </ScrollView>

        <TouchableOpacity style={[styles.button, saving && { opacity: 0.6 }]}
          onPress={handleSave} disabled={saving}
          accessibilityRole="button"
          accessibilityLabel="Save today's setup and rebuild the session"
          accessibilityState={{ disabled: saving, busy: saving }}>
          <Text style={styles.buttonText}>
            {existing ? "Save & rebuild my day" : "Build my session"}
          </Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, padding: spacing.xl },
  header: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
  },
  title: { fontSize: 20, fontWeight: "700", color: colors.text },
  subtitle: { fontSize: 13, color: colors.textMuted, marginTop: 4, marginBottom: spacing.xs },
  label: { fontSize: 13, color: colors.textMuted, marginTop: 18, marginBottom: 8 },
  pillRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  pill: {
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: radii.pill,
    backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border,
  },
  dot: {
    width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center",
    backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border,
  },
  pillActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  pillHot: { backgroundColor: colors.danger, borderColor: colors.danger },
  pillText: { fontSize: 13, color: colors.textMuted },
  pillTextActive: { color: colors.onBrand, fontWeight: "600" },
  soreHeader: {
    flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between",
    gap: spacing.sm,
  },
  bodyLink: { flexDirection: "row", alignItems: "center", gap: 2, paddingBottom: 8 },
  bodyLinkText: { fontSize: 13, color: colors.brand, fontWeight: "600" },
  button: {
    backgroundColor: colors.brand, borderRadius: radii.control, paddingVertical: 14,
    alignItems: "center", marginTop: spacing.md,
  },
  buttonText: { color: colors.onBrand, ...typography.button },
});
