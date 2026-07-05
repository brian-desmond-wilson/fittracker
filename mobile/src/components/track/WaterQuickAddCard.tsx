import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { Sliders } from "lucide-react-native";
import { colors } from "@/src/lib/colors";
import {
  WaterUnit,
  formatAmount,
  BeverageType,
  beverageColor,
} from "@/src/lib/waterUnits";

interface WaterQuickAddCardProps {
  amounts: number[];
  names: string[];
  types: BeverageType[];
  displayUnit: WaterUnit;
  onLog: (amount: number, type: BeverageType) => void;
  onOpenEditor: () => void;
}

export function WaterQuickAddCard({
  amounts,
  names,
  types,
  displayUnit,
  onLog,
  onOpenEditor,
}: WaterQuickAddCardProps) {
  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.label}>Quick Add</Text>
        <TouchableOpacity
          onPress={onOpenEditor}
          style={styles.gearButton}
          activeOpacity={0.7}
        >
          <Sliders size={16} color={colors.mutedForeground} />
        </TouchableOpacity>
      </View>
      <View style={styles.buttons}>
        {amounts.map((amount, i) => {
          const name = names[i];
          const type = types[i] || "water";
          const primaryText = name ? name : formatAmount(amount, displayUnit);
          const subText = name ? formatAmount(amount, displayUnit) : null;
          return (
            <TouchableOpacity
              key={`${amount}-${i}`}
              style={[
                styles.button,
                type !== "water" && {
                  borderColor: beverageColor(type),
                  borderLeftWidth: 3,
                },
              ]}
              onPress={() => onLog(amount, type)}
              activeOpacity={0.7}
            >
              <Text style={styles.buttonText} numberOfLines={1}>
                {primaryText}
              </Text>
              {subText && (
                <Text style={styles.buttonSubText} numberOfLines={1}>
                  {subText}
                </Text>
              )}
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 20,
    marginBottom: 16,
    padding: 16,
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  label: {
    fontSize: 14,
    color: colors.mutedForeground,
  },
  gearButton: {
    padding: 4,
  },
  buttons: {
    flexDirection: "row",
    gap: 8,
  },
  button: {
    flex: 1,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: "center",
  },
  buttonText: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.foreground,
  },
  buttonSubText: {
    fontSize: 11,
    color: colors.mutedForeground,
    marginTop: 2,
  },
});
