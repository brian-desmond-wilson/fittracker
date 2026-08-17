import React, { useEffect, useState } from "react";
import {
  Modal, View, Text, TouchableOpacity, StyleSheet, ScrollView,
} from "react-native";
import { X } from "lucide-react-native";
import { colors } from "@/src/lib/colors";
import { supabase } from "@/src/lib/supabase";
import { getLocalDateString } from "@/src/components/workout-session/helpers";
import { saveCheckin } from "@/src/lib/supabase/daily";
import { fetchMuscleRegions } from "@/src/lib/supabase/crossfit";
import { formatMinutesLabel } from "@/src/lib/timeFormat";
import type { DailyCheckin } from "@/src/types/daily";

const MINUTES_OPTIONS = [45, 60, 90, 120];
// Cycle 0 → 1 → 2 → 3 → 0 on tap: not sore, tender, sore, very sore.
const SEVERITY_LABEL = ["", "tender", "sore", "very sore"];

interface CheckinSheetProps {
  visible: boolean;
  existing: DailyCheckin | null;
  onClose: () => void;
  onSaved: () => void;
}

export function CheckinSheet({ visible, existing, onClose, onSaved }: CheckinSheetProps) {
  const [energy, setEnergy] = useState(existing?.energy ?? 7);
  const [minutes, setMinutes] = useState(existing?.minutesAvailable ?? 120);
  const [soreness, setSoreness] = useState<Record<string, number>>(existing?.soreness ?? {});
  const [regions, setRegions] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setEnergy(existing?.energy ?? 7);
    setMinutes(existing?.minutesAvailable ?? 120);
    setSoreness(existing?.soreness ?? {});
    fetchMuscleRegions().then((rows) =>
      // "Full Body" is a classification, not a body part you can be sore in.
      setRegions(rows.map((r: any) => r.name).filter((n: string) => n !== "Full Body")),
    );
  }, [visible, existing]);

  const cycleSoreness = (region: string) => {
    setSoreness((prev) => {
      const next = { ...prev };
      const current = next[region] ?? 0;
      const bumped = (current + 1) % 4;
      if (bumped === 0) delete next[region]; else next[region] = bumped;
      return next;
    });
  };

  const handleSave = async () => {
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setSaving(false); return; }
    await saveCheckin({
      userId: user.id,
      date: getLocalDateString(),
      energy,
      minutesAvailable: minutes,
      soreness,
    });
    setSaving(false);
    onSaved();
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>How's today looking?</Text>
          <TouchableOpacity onPress={onClose}><X size={24} color={colors.mutedForeground} /></TouchableOpacity>
        </View>
        <ScrollView>
          <Text style={styles.label}>Sore anywhere? Tap once for tender, twice for sore, three times for very sore.</Text>
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

          <Text style={styles.label}>Time available</Text>
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
        </ScrollView>

        <TouchableOpacity style={[styles.button, saving && { opacity: 0.6 }]}
          onPress={handleSave} disabled={saving}>
          <Text style={styles.buttonText}>Build my session</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, padding: 20 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  title: { fontSize: 20, fontWeight: "700", color: colors.foreground },
  label: { fontSize: 13, color: colors.mutedForeground, marginTop: 18, marginBottom: 8 },
  pillRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  pill: {
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 16,
    backgroundColor: colors.muted, borderWidth: 1, borderColor: colors.border,
  },
  dot: {
    width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center",
    backgroundColor: colors.muted, borderWidth: 1, borderColor: colors.border,
  },
  pillActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  pillHot: { backgroundColor: "#DC2626", borderColor: "#DC2626" },
  pillText: { fontSize: 13, color: colors.mutedForeground },
  pillTextActive: { color: "#FFFFFF", fontWeight: "600" },
  button: {
    backgroundColor: colors.primary, borderRadius: 8, paddingVertical: 14,
    alignItems: "center", marginTop: 12,
  },
  buttonText: { color: "#FFFFFF", fontSize: 16, fontWeight: "600" },
});
