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
import {
  WaterUnit,
  BEVERAGE_TYPES,
  BeverageType,
  beverageLabel,
} from "@/src/lib/waterUnits";

interface WaterLogEditorModalProps {
  visible: boolean;
  draftAmount: string;
  draftType: BeverageType;
  displayUnit: WaterUnit;
  saving: boolean;
  onChangeAmount: (s: string) => void;
  onChangeType: (t: BeverageType) => void;
  onClose: () => void;
  onSave: () => void;
}

export function WaterLogEditorModal({
  visible,
  draftAmount,
  draftType,
  displayUnit,
  saving,
  onChangeAmount,
  onChangeType,
  onClose,
  onSave,
}: WaterLogEditorModalProps) {
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
          <Text style={styles.title}>Edit Log</Text>

          <ScrollView style={styles.sheetScroll}>
            <View style={styles.chipsRow}>
              {BEVERAGE_TYPES.map((t) => {
                const active = draftType === t;
                return (
                  <TouchableOpacity
                    key={t}
                    onPress={() => onChangeType(t)}
                    disabled={saving}
                    style={[styles.chip, active && styles.chipActive]}
                  >
                    <Text
                      style={[styles.chipText, active && styles.chipTextActive]}
                    >
                      {beverageLabel(t)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <TextInput
              style={styles.input}
              value={draftAmount}
              onChangeText={onChangeAmount}
              keyboardType="decimal-pad"
              placeholder={`Amount (${displayUnit})`}
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
  chipsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface2,
  },
  // Grouped, mutually-exclusive selector → solid brand fill + `onBrand` label.
  chipActive: {
    backgroundColor: colors.brand,
    borderColor: colors.brand,
  },
  chipText: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.textMuted,
  },
  chipTextActive: {
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
