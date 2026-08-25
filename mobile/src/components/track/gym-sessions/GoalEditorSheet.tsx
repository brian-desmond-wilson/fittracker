// Editing the weekly goal. A sheet from the bottom, never an inline picker.
import React, { useState } from "react";
import {
  Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors } from "@/src/lib/colors";
import { MAJOR_REGIONS } from "@/src/lib/goalProgress";
import type { WeeklyGoal, WeeklyGoalDraft } from "@/src/types/goals";

const SESSION_OPTIONS = [2, 3, 4, 5, 6, 7];
const VOLUME_OPTIONS = [null, 20000, 40000, 60000, 80000, 100000];

export function GoalEditorSheet({
  visible, goal, onClose, onSave,
}: {
  visible: boolean;
  goal: WeeklyGoal;
  onClose: () => void;
  onSave: (draft: WeeklyGoalDraft) => void;
}) {
  const insets = useSafeAreaInsets();
  const [sessions, setSessions] = useState(goal.sessionsTarget);
  const [volume, setVolume] = useState<number | null>(goal.volumeTargetLbs);
  const [regions, setRegions] = useState<number | null>(goal.regionTarget);

  // Re-seed when a different goal arrives (sheet is mounted once).
  React.useEffect(() => {
    if (visible) {
      setSessions(goal.sessionsTarget);
      setVolume(goal.volumeTargetLbs);
      setRegions(goal.regionTarget);
    }
  }, [visible, goal]);

  const Row = ({
    label, hint, children,
  }: { label: string; hint: string; children: React.ReactNode }) => (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowHint}>{hint}</Text>
      <View style={styles.chips}>{children}</View>
    </View>
  );

  const Chip = ({
    on, label, onPress,
  }: { on: boolean; label: string; onPress: () => void }) => (
    <TouchableOpacity
      style={[styles.chip, on && styles.chipOn]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
    >
      <Text style={[styles.chipText, on && styles.chipTextOn]}>{label}</Text>
    </TouchableOpacity>
  );

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
          <View style={styles.grabber} />
          <Text style={styles.title}>Weekly goal</Text>
          <ScrollView>
            <Row label="Sessions" hint="Workouts per week">
              {SESSION_OPTIONS.map((n) => (
                <Chip key={n} on={sessions === n} label={String(n)} onPress={() => setSessions(n)} />
              ))}
            </Row>
            <Row label="Volume" hint="Total weight moved — optional">
              {VOLUME_OPTIONS.map((v) => (
                <Chip
                  key={String(v)}
                  on={volume === v}
                  label={v === null ? "Off" : `${v / 1000}k`}
                  onPress={() => setVolume(v)}
                />
              ))}
            </Row>
            <Row label="Muscle coverage" hint={`Of ${MAJOR_REGIONS.length} major regions — optional`}>
              <Chip on={regions === null} label="Off" onPress={() => setRegions(null)} />
              {MAJOR_REGIONS.map((_, i) => (
                <Chip
                  key={i}
                  on={regions === i + 1}
                  label={String(i + 1)}
                  onPress={() => setRegions(i + 1)}
                />
              ))}
            </Row>
            {/* Primary action at the end of the scroll, never pinned. */}
            <TouchableOpacity
              style={styles.save}
              onPress={() => onSave({ sessionsTarget: sessions, volumeTargetLbs: volume, regionTarget: regions })}
              accessibilityRole="button"
            >
              <Text style={styles.saveText}>Save goal</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.cancel} onPress={onClose} accessibilityRole="button">
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: colors.background, borderTopLeftRadius: 20,
    borderTopRightRadius: 20, paddingHorizontal: 20, paddingTop: 10, maxHeight: "80%",
  },
  grabber: {
    width: 36, height: 4, borderRadius: 2, backgroundColor: colors.border,
    alignSelf: "center", marginBottom: 12,
  },
  title: { fontSize: 20, fontWeight: "700", color: colors.foreground, marginBottom: 14 },
  row: { marginBottom: 18 },
  rowLabel: { fontSize: 14, fontWeight: "600", color: colors.foreground },
  rowHint: { fontSize: 11, color: colors.mutedForeground, marginTop: 2, marginBottom: 8 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    backgroundColor: colors.muted, borderRadius: 99,
    paddingHorizontal: 14, paddingVertical: 7, minWidth: 44, alignItems: "center",
  },
  chipOn: { backgroundColor: colors.primary },
  chipText: { fontSize: 13, color: colors.mutedForeground, fontWeight: "600" },
  chipTextOn: { color: "#052E16" },
  save: {
    backgroundColor: colors.primary, borderRadius: 12,
    paddingVertical: 14, alignItems: "center", marginTop: 6,
  },
  saveText: { fontSize: 15, fontWeight: "700", color: "#052E16" },
  cancel: { paddingVertical: 14, alignItems: "center" },
  cancelText: { fontSize: 14, color: colors.mutedForeground },
});
