// The rest-day sheet: full rest, or a short active-recovery session.
// Choosing either decides the day and unlocks tomorrow's preview draft.
// Spec: docs/superpowers/specs/2026-08-24-rest-day-design.md.
import React, { useState } from "react";
import {
  Modal, View, Text, TouchableOpacity, StyleSheet, ActivityIndicator,
} from "react-native";
import { BedDouble, StretchHorizontal, X } from "lucide-react-native";
import { colors, radii, spacing } from "@/src/theme/tokens";

interface RestSheetProps {
  visible: boolean;
  onClose: () => void;
  /** The tab performs the writes; the sheet only reports the choice. */
  onChoose: (kind: "full" | "active") => Promise<void>;
}

export function RestSheet({ visible, onClose, onChoose }: RestSheetProps) {
  const [busy, setBusy] = useState<"full" | "active" | null>(null);

  const choose = async (kind: "full" | "active") => {
    if (busy) return;
    setBusy(kind);
    try {
      await onChoose(kind);
    } finally {
      setBusy(null);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>Make today a rest day</Text>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <X size={24} color={colors.textMuted} />
          </TouchableOpacity>
        </View>
        <Text style={styles.subtitle}>
          Either way the day is decided, and tomorrow's plan gets built tonight.
        </Text>

        <TouchableOpacity
          style={styles.option}
          onPress={() => choose("full")}
          disabled={busy !== null}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel="Full rest — no training today"
          accessibilityState={{ disabled: busy !== null, busy: busy === "full" }}
        >
          {busy === "full"
            ? <ActivityIndicator size="small" color={colors.brand} />
            : <BedDouble size={20} color={colors.brand} />}
          <View style={styles.optionBody}>
            <Text style={styles.optionTitle}>Full rest</Text>
            <Text style={styles.optionText}>No training. The day is recorded as deliberate rest.</Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.option}
          onPress={() => choose("active")}
          disabled={busy !== null}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel="Active recovery — a short mobility session"
          accessibilityState={{ disabled: busy !== null, busy: busy === "active" }}
        >
          {busy === "active"
            ? <ActivityIndicator size="small" color={colors.brand} />
            : <StretchHorizontal size={20} color={colors.brand} />}
          <View style={styles.optionBody}>
            <Text style={styles.optionTitle}>Active recovery</Text>
            <Text style={styles.optionText}>
              ~15 minutes of mobility and stretching, built like any other day.
            </Text>
          </View>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, padding: spacing.xl },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  title: { fontSize: 20, fontWeight: "700", color: colors.text },
  subtitle: { fontSize: 13, color: colors.textMuted, marginTop: 4, marginBottom: spacing.lg },
  option: {
    flexDirection: "row", alignItems: "center", gap: 12,
    backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border,
    borderRadius: radii.panel, padding: spacing.lg, marginBottom: spacing.md,
  },
  optionBody: { flex: 1 },
  optionTitle: { fontSize: 15, fontWeight: "700", color: colors.text },
  optionText: { fontSize: 13, color: colors.textMuted, marginTop: 2, lineHeight: 18 },
});
