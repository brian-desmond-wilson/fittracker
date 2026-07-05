import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { Undo2 } from "lucide-react-native";

interface MealUndoSnackbarProps {
  visible: boolean;
  label: string;
  onUndo: () => void;
}

export function MealUndoSnackbar({
  visible,
  label,
  onUndo,
}: MealUndoSnackbarProps) {
  if (!visible) return null;
  return (
    <View style={styles.snackbar}>
      <Text style={styles.text} numberOfLines={1}>
        {label}
      </Text>
      <TouchableOpacity
        onPress={onUndo}
        style={styles.undoButton}
        activeOpacity={0.7}
      >
        <Undo2 size={16} color="#FFFFFF" />
        <Text style={styles.undoText}>Undo</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  snackbar: {
    position: "absolute",
    left: 16,
    right: 16,
    bottom: 24,
    backgroundColor: "#1F2937",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    borderWidth: 1,
    borderColor: "#374151",
    elevation: 8,
    shadowColor: "#000",
    shadowOpacity: 0.4,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  text: {
    color: "#FFFFFF",
    fontSize: 14,
    flex: 1,
  },
  undoButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  undoText: {
    color: "#F97316",
    fontSize: 14,
    fontWeight: "700",
  },
});
