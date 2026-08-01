import React from "react";
import {
  View,
  Text,
  StyleSheet,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  TouchableOpacity,
  TextInput,
} from "react-native";
import { colors, radii, spacing, typography } from "@/src/theme/tokens";
import { Button, Card } from "@/src/components/ui";
import { WaterUnit, OZ_PER_LITER } from "@/src/lib/waterUnits";

interface WaterGoalEditorModalProps {
  visible: boolean;
  draft: string;
  unit: WaterUnit;
  saving: boolean;
  onChangeDraft: (s: string) => void;
  onChangeUnit: (u: WaterUnit) => void;
  onClose: () => void;
  onSave: () => void;
}

export function WaterGoalEditorModal({
  visible,
  draft,
  unit,
  saving,
  onChangeDraft,
  onChangeUnit,
  onClose,
  onSave,
}: WaterGoalEditorModalProps) {
  // The unit toggle should convert the in-flight draft, so users see
  // their value re-expressed in the new unit instead of losing it.
  const handleUnitChange = (next: WaterUnit) => {
    if (next === unit) return;
    const parsed = parseFloat(draft);
    if (!isNaN(parsed)) {
      if (next === "L") {
        onChangeDraft((parsed / OZ_PER_LITER).toFixed(2));
      } else {
        onChangeDraft(Math.round(parsed * OZ_PER_LITER).toString());
      }
    }
    onChangeUnit(next);
  };

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.backdrop}
      >
        <Card variant="panel" style={styles.card}>
          <Text style={styles.title}>Daily Water Goal</Text>

          <ScrollView style={styles.sheetScroll}>
            <View style={styles.unitToggle}>
              {(["oz", "L"] as WaterUnit[]).map((u) => (
                <TouchableOpacity
                  key={u}
                  style={[
                    styles.unitButton,
                    unit === u && styles.unitButtonActive,
                  ]}
                  onPress={() => handleUnitChange(u)}
                  disabled={saving}
                >
                  <Text
                    style={[
                      styles.unitButtonText,
                      unit === u && styles.unitButtonTextActive,
                    ]}
                  >
                    {u}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <TextInput
              style={styles.input}
              value={draft}
              onChangeText={onChangeDraft}
              keyboardType="decimal-pad"
              placeholder={unit === "oz" ? "64" : "2"}
              placeholderTextColor={colors.textMuted}
              autoFocus
              editable={!saving}
            />
          </ScrollView>

          <View style={styles.actions}>
            <View style={styles.actionButton}>
              <Button
                variant="secondary"
                label="Cancel"
                onPress={onClose}
                disabled={saving}
                fluid
              />
            </View>
            <View style={styles.actionButton}>
              <Button label="Save" onPress={onSave} loading={saving} fluid />
            </View>
          </View>
        </Card>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: colors.scrim,
    justifyContent: "center",
    alignItems: "center",
    padding: spacing.xl,
  },
  /**
   * `maxHeight: "100%"` resolves against the backdrop's content box (screen
   * minus its padding), so the sheet can never exceed the screen on any
   * device. Never a fixed pixel cap — it cannot adapt.
   */
  card: {
    width: "100%",
    maxHeight: "100%",
  },
  /** Shrinks first, so the title and the footer buttons always render. */
  sheetScroll: {
    flexShrink: 1,
  },
  title: {
    ...typography.titleBar,
    color: colors.text,
    marginBottom: spacing.md,
  },
  // Segmented control: `surface2` track, solid brand active segment.
  unitToggle: {
    flexDirection: "row",
    backgroundColor: colors.surface2,
    borderRadius: radii.control,
    padding: spacing.xs,
    gap: spacing.xs,
    marginBottom: spacing.md,
    alignSelf: "flex-start",
  },
  unitButton: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radii.control,
  },
  unitButtonActive: {
    backgroundColor: colors.brand,
  },
  unitButtonText: {
    ...typography.buttonSm,
    color: colors.textMuted,
  },
  unitButtonTextActive: {
    color: colors.onBrand,
  },
  input: {
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.control,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: 16, // §4.5 defines no input token
    color: colors.text,
  },
  actions: {
    flexDirection: "row",
    gap: spacing.md,
    marginTop: spacing.lg,
  },
  /** `Button` can stretch (`fluid`) but cannot flex; the wrapper supplies it. */
  actionButton: { flex: 1 },
});
