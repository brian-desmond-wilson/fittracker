import React from "react";
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TextInput,
  ScrollView,
} from "react-native";
import { colors } from "@/src/lib/colors";
import {
  BEVERAGE_TYPES,
  BeverageType,
  beverageLabel,
  beverageColor,
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
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>Customize Quick-Add</Text>
          <Text style={styles.subtitle}>
            Optional name, amount in ounces, and beverage type per button.
          </Text>
          <ScrollView style={{ maxHeight: 420 }}>
            {amountDrafts.map((draft, i) => (
              <View key={i} style={styles.block}>
                <Text style={styles.blockLabel}>Button {i + 1}</Text>
                <TextInput
                  style={styles.input}
                  value={nameDrafts[i] ?? ""}
                  onChangeText={(t) => onChangeName(i, t)}
                  placeholder="Name (optional)"
                  placeholderTextColor={colors.mutedForeground}
                  editable={!saving}
                />
                <TextInput
                  style={styles.input}
                  value={draft}
                  onChangeText={(t) => onChangeAmount(i, t)}
                  placeholder="Amount (oz)"
                  keyboardType="decimal-pad"
                  placeholderTextColor={colors.mutedForeground}
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
                        style={[
                          styles.chip,
                          active && {
                            backgroundColor: beverageColor(t),
                            borderColor: beverageColor(t),
                          },
                        ]}
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
            <TouchableOpacity
              style={[styles.button, styles.buttonSecondary]}
              onPress={onClose}
              disabled={saving}
            >
              <Text style={styles.buttonSecondaryText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.button, styles.buttonPrimary]}
              onPress={onSave}
              disabled={saving}
            >
              <Text style={styles.buttonPrimaryText}>
                {saving ? "Saving…" : "Save"}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  card: {
    width: "100%",
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 24,
    borderWidth: 1,
    borderColor: colors.border,
  },
  title: {
    fontSize: 18,
    fontWeight: "600",
    color: colors.foreground,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 13,
    color: colors.mutedForeground,
    marginBottom: 12,
  },
  block: {
    marginBottom: 16,
    gap: 6,
  },
  blockLabel: {
    width: 80,
    fontSize: 14,
    color: colors.mutedForeground,
  },
  input: {
    flex: 1,
    backgroundColor: "#1F2937",
    borderWidth: 1,
    borderColor: "#374151",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: "#FFFFFF",
  },
  chipsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 4,
  },
  chip: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#374151",
    backgroundColor: "#1F2937",
  },
  chipText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#D1D5DB",
  },
  chipTextActive: {
    color: "#FFFFFF",
  },
  actions: {
    flexDirection: "row",
    gap: 12,
    marginTop: 8,
  },
  button: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: "center",
  },
  buttonPrimary: {
    backgroundColor: "#3B82F6",
  },
  buttonSecondary: {
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: colors.border,
  },
  buttonPrimaryText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
  },
  buttonSecondaryText: {
    color: colors.foreground,
    fontSize: 16,
    fontWeight: "600",
  },
});
