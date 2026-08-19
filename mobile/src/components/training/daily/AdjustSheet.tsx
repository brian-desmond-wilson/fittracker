// One-shot instruction to the recommender — the talk-back half of the daily
// loop. Scoped to one block (only that block moves; the rest hold for the
// recompose) or to the whole day. No thread to manage: type, recompose, done.
// Recent instructions resurface as tappable shortcuts. Approved mockup B.
import React, { useEffect, useState } from "react";
import {
  Modal, View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform,
} from "react-native";
import { CornerUpLeft, Sparkles, X } from "lucide-react-native";
import { colors, radii, spacing, typography } from "@/src/theme/tokens";
import { supabase } from "@/src/lib/supabase";
import { saveAdjustment, fetchRecentAdjustments } from "@/src/lib/supabase/daily";
import { BLOCK_TITLES } from "@/src/lib/dailyBlockCompose";
import type { BlockRole } from "@/src/types/dailyBlocks";

const PLACEHOLDER: Record<string, string> = {
  day: 'e.g. "I want an upper day — nothing heavy on the legs"',
  block: 'e.g. "no rowing today, my hands are torn up — bike or sled instead"',
};

interface AdjustSheetProps {
  visible: boolean;
  /** The block the instruction is aimed at, or null for the whole day. */
  scope: BlockRole | null;
  sessionId: string | null;
  onClose: () => void;
  /** The instruction is saved; the tab decides how to recompose. */
  onSubmitted: (scope: BlockRole | null) => void;
}

export function AdjustSheet({ visible, scope, sessionId, onClose, onSubmitted }: AdjustSheetProps) {
  const [text, setText] = useState("");
  const [recent, setRecent] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setText("");
    let alive = true;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || !alive) return;
      const rows = await fetchRecentAdjustments(user.id, 10);
      if (!alive) return;
      // Distinct wordings only — the same instruction sent three times is one
      // shortcut, not three.
      setRecent([...new Set(rows.map((r) => r.instruction))].slice(0, 4));
    })();
    return () => { alive = false; };
  }, [visible]);

  const submit = async () => {
    const instruction = text.trim();
    if (instruction === "" || saving) return;
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setSaving(false); return; }
    const saved = await saveAdjustment({
      userId: user.id, sessionId, block: scope, instruction,
    });
    setSaving(false);
    if (saved) onSubmitted(scope);
  };

  const title = scope === null
    ? "Adjust the day"
    : `Adjust the ${BLOCK_TITLES[scope].toLowerCase()}`;

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
            <View style={styles.titleRow}>
              <Sparkles size={16} color={colors.brand} />
              <Text style={styles.title}>{title}</Text>
            </View>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <X size={22} color={colors.textMuted} />
            </TouchableOpacity>
          </View>
          <Text style={styles.hint}>
            {scope === null
              ? "Tell the recommender what to change about today. Locked blocks stay put."
              : "Tell the recommender what to change here — only this block moves."}
          </Text>
          <TextInput
            style={styles.input}
            value={text}
            onChangeText={setText}
            placeholder={PLACEHOLDER[scope === null ? "day" : "block"]}
            placeholderTextColor={colors.textFaint}
            multiline
            maxLength={500}
            autoFocus
          />
          {recent.length > 0 && (
            <>
              <Text style={styles.recentLabel}>Recent</Text>
              {recent.map((r) => (
                <TouchableOpacity key={r} style={styles.recentChip} onPress={() => setText(r)}>
                  <CornerUpLeft size={13} color={colors.textMuted} />
                  <Text style={styles.recentText} numberOfLines={1}>{r}</Text>
                </TouchableOpacity>
              ))}
            </>
          )}
          <TouchableOpacity
            style={[styles.button, (saving || text.trim() === "") && { opacity: 0.5 }]}
            onPress={submit}
            disabled={saving || text.trim() === ""}
            accessibilityRole="button"
            accessibilityLabel={scope === null ? "Recompose the day" : "Recompose this block"}
            accessibilityState={{ disabled: saving || text.trim() === "", busy: saving }}
          >
            <Text style={styles.buttonText}>
              {scope === null ? "Recompose day" : "Recompose block"}
            </Text>
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
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  title: { fontSize: 17, fontWeight: "700", color: colors.text },
  hint: { fontSize: 12.5, color: colors.textMuted, marginTop: 4, marginBottom: spacing.md, lineHeight: 17 },
  input: {
    backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.border,
    borderRadius: radii.row, padding: spacing.md, minHeight: 64, maxHeight: 120,
    fontSize: 14, color: colors.text, textAlignVertical: "top",
  },
  recentLabel: { fontSize: 12, color: colors.textMuted, marginTop: spacing.md, marginBottom: 6 },
  recentChip: {
    flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start",
    maxWidth: "100%",
    backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border,
    borderRadius: radii.pill, paddingHorizontal: 10, paddingVertical: 6, marginBottom: 6,
  },
  recentText: { fontSize: 12.5, color: colors.text, flexShrink: 1 },
  button: {
    backgroundColor: colors.brand, borderRadius: radii.control, paddingVertical: 14,
    alignItems: "center", marginTop: spacing.lg,
  },
  buttonText: { color: colors.onBrand, ...typography.button },
});
