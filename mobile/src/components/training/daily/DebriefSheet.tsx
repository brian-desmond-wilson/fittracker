// How the session landed — the closing half of the feedback loop the adjust
// sheet opens. One tap plus an optional note; tomorrow's compose hears it.
// Skippable, and dismissing saves nothing. Approved mockup F.
import React, { useEffect, useState } from "react";
import {
  Modal, View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform,
} from "react-native";
import { X } from "lucide-react-native";
import { colors, radii, spacing, tint, typography } from "@/src/theme/tokens";
import { supabase } from "@/src/lib/supabase";
import { saveDebrief } from "@/src/lib/supabase/daily";
import type { DebriefVerdict } from "@/src/types/daily";

const VERDICTS: { key: DebriefVerdict; label: string }[] = [
  { key: "too_easy", label: "😴 Too easy" },
  { key: "just_right", label: "👍 Just right" },
  { key: "too_much", label: "🥵 Too much" },
];

interface DebriefSheetProps {
  visible: boolean;
  sessionId: string | null;
  onClose: () => void;
  onSaved: () => void;
}

export function DebriefSheet({ visible, sessionId, onClose, onSaved }: DebriefSheetProps) {
  const [verdict, setVerdict] = useState<DebriefVerdict | null>(null);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setVerdict(null);
    setNote("");
  }, [visible]);

  const submit = async () => {
    if (!verdict || !sessionId || saving) return;
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setSaving(false); return; }
    const ok = await saveDebrief({
      userId: user.id, sessionId, verdict, note: note.trim() || null,
    });
    setSaving(false);
    if (ok) onSaved();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.scrim}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <TouchableOpacity style={styles.scrimTap} onPress={onClose} accessibilityLabel="Close" />
        <View style={styles.sheet}>
          <View style={styles.grab} />
          <View style={styles.header}>
            <Text style={styles.title}>Session done — how did it land?</Text>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <X size={22} color={colors.textMuted} />
            </TouchableOpacity>
          </View>
          <Text style={styles.hint}>Shapes tomorrow's recommendation.</Text>
          <View style={styles.pillRow}>
            {VERDICTS.map((v) => (
              <TouchableOpacity
                key={v.key}
                style={[styles.pill, verdict === v.key && styles.pillActive]}
                onPress={() => setVerdict(v.key)}
                accessibilityRole="button"
                accessibilityState={{ selected: verdict === v.key }}
              >
                <Text style={[styles.pillText, verdict === v.key && styles.pillTextActive]}>
                  {v.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <TextInput
            style={styles.input}
            value={note}
            onChangeText={setNote}
            placeholder={'Anything to note? e.g. "shoulder felt off on OHP"'}
            placeholderTextColor={colors.textFaint}
            multiline
            maxLength={500}
          />
          <TouchableOpacity
            style={[styles.button, (saving || !verdict) && { opacity: 0.5 }]}
            onPress={submit}
            disabled={saving || !verdict}
            accessibilityRole="button"
            accessibilityLabel="Save the debrief"
            accessibilityState={{ disabled: saving || !verdict, busy: saving }}
          >
            <Text style={styles.buttonText}>Save</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: colors.scrim, justifyContent: "flex-end" },
  scrimTap: { flex: 1 },
  sheet: {
    backgroundColor: colors.surface, borderTopLeftRadius: 22, borderTopRightRadius: 22,
    borderTopWidth: 1, borderColor: colors.border,
    padding: spacing.xl, paddingBottom: spacing.xxxl,
  },
  grab: {
    width: 38, height: 4, borderRadius: 2, backgroundColor: colors.textFaint,
    alignSelf: "center", marginBottom: spacing.md,
  },
  header: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    gap: spacing.sm,
  },
  title: { fontSize: 17, fontWeight: "700", color: colors.text, flexShrink: 1 },
  hint: { fontSize: 12.5, color: colors.textMuted, marginTop: 4, marginBottom: spacing.md },
  pillRow: { flexDirection: "row", gap: 8, marginBottom: spacing.md },
  pill: {
    flex: 1, alignItems: "center", paddingVertical: 11,
    backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border,
    borderRadius: radii.pill,
  },
  pillActive: { borderColor: colors.brand, backgroundColor: tint(colors.brand) },
  pillText: { fontSize: 13.5, color: colors.textMuted },
  pillTextActive: { color: colors.brand, fontWeight: "600" },
  input: {
    backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.border,
    borderRadius: radii.row, padding: spacing.md, minHeight: 48, maxHeight: 100,
    fontSize: 14, color: colors.text, textAlignVertical: "top",
  },
  button: {
    backgroundColor: colors.brand, borderRadius: radii.control, paddingVertical: 14,
    alignItems: "center", marginTop: spacing.lg,
  },
  buttonText: { color: colors.onBrand, ...typography.button },
});
