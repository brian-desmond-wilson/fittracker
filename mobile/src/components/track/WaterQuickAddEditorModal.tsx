import React from "react";
import {
  View,
  Text,
  StyleSheet,
  KeyboardAvoidingView,
  Modal,
  Platform,
  TouchableOpacity,
  TextInput,
  ScrollView,
} from "react-native";
import { colors, radii, spacing, typography } from "@/src/theme/tokens";
import { Button, Card } from "@/src/components/ui";
import {
  BEVERAGE_TYPES,
  BeverageType,
  beverageLabel,
} from "@/src/lib/waterUnits";

interface WaterQuickAddEditorModalProps {
  visible: boolean;
  amountDrafts: string[];
  nameDrafts: string[];
  typeDrafts: BeverageType[];
  saving: boolean;
  onChangeAmount: (i: number, v: string) => void;
  onChangeName: (i: number, v: string) => void;
  onChangeType: (i: number, t: BeverageType) => void;
  onClose: () => void;
  onSave: () => void;
}

export function WaterQuickAddEditorModal({
  visible,
  amountDrafts,
  nameDrafts,
  typeDrafts,
  saving,
  onChangeAmount,
  onChangeName,
  onChangeType,
  onClose,
  onSave,
}: WaterQuickAddEditorModalProps) {
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
          <Text style={styles.title}>Customize Quick-Add</Text>
          <Text style={styles.subtitle}>
            Optional name, amount in ounces, and beverage type per button.
          </Text>

          <ScrollView style={styles.sheetScroll}>
            {amountDrafts.map((draft, i) => (
              <View key={i} style={styles.block}>
                <Text style={styles.label}>Button {i + 1}</Text>
                <TextInput
                  style={styles.input}
                  value={nameDrafts[i] ?? ""}
                  onChangeText={(t) => onChangeName(i, t)}
                  placeholder="Name (optional)"
                  placeholderTextColor={colors.textMuted}
                  editable={!saving}
                />
                <TextInput
                  style={styles.input}
                  value={draft}
                  onChangeText={(t) => onChangeAmount(i, t)}
                  placeholder="Amount (oz)"
                  keyboardType="decimal-pad"
                  placeholderTextColor={colors.textMuted}
                  editable={!saving}
                />
                <View style={styles.chipsRow}>
                  {BEVERAGE_TYPES.map((t) => {
                    const active = typeDrafts[i] === t;
                    return (
                      <TouchableOpacity
                        key={t}
                        onPress={() => onChangeType(i, t)}
                        disabled={saving}
                        style={[styles.chip, active && styles.chipActive]}
                      >
                        <Text
                          style={[
                            styles.chipText,
                            active && styles.chipTextActive,
                          ]}
                        >
                          {beverageLabel(t)}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            ))}
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
   * device. This replaces the scroller's hand-picked `maxHeight: 420`, which
   * could not adapt: the chrome alone eats ~146pt.
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
    marginBottom: spacing.xs,
  },
  subtitle: {
    ...typography.caption,
    marginBottom: spacing.lg,
  },
  /**
   * A per-button GROUP of three fields, not a per-field wrapper: the label
   * still owns the field rhythm inside it via the group's `gap`.
   */
  block: {
    marginBottom: spacing.lg,
    gap: spacing.sm,
  },
  // The one form-label token.
  label: {
    ...typography.section,
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
  chipsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
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
  actions: {
    flexDirection: "row",
    gap: spacing.md,
    marginTop: spacing.lg,
  },
  /** `Button` can stretch (`fluid`) but cannot flex; the wrapper supplies it. */
  actionButton: { flex: 1 },
});
