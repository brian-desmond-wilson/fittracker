import React from "react";
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TextInput,
} from "react-native";
import { colors } from "@/src/lib/colors";
import {
  WaterUnit,
  BEVERAGE_TYPES,
  BeverageType,
  beverageLabel,
  beverageColor,
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
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>Edit Log</Text>
          <View style={styles.chipsRow}>
            {BEVERAGE_TYPES.map((t) => {
              const active = draftType === t;
              return (
                <TouchableOpacity
                  key={t}
                  onPress={() => onChangeType(t)}
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
            placeholderTextColor={colors.mutedForeground}
            autoFocus
            editable={!saving}
          />
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
    marginBottom: 16,
  },
  chipsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginBottom: 12,
  },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#374151",
    backgroundColor: "#1F2937",
  },
  chipText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#D1D5DB",
  },
  chipTextActive: {
    color: "#FFFFFF",
  },
  input: {
    backgroundColor: "#1F2937",
    borderWidth: 1,
    borderColor: "#374151",
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 18,
    color: "#FFFFFF",
    marginBottom: 20,
  },
  actions: {
    flexDirection: "row",
    gap: 12,
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
