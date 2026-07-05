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
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>Daily Water Goal</Text>
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
  unitToggle: {
    flexDirection: "row",
    backgroundColor: "#1F2937",
    borderRadius: 8,
    padding: 3,
    gap: 3,
    marginBottom: 12,
    alignSelf: "flex-start",
  },
  unitButton: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 6,
  },
  unitButtonActive: {
    backgroundColor: "#3B82F6",
  },
  unitButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#9CA3AF",
  },
  unitButtonTextActive: {
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
