import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { Sliders } from "lucide-react-native";
import { colors, radii, spacing, typography } from "@/src/theme/tokens";
import { Card, IconButton, SectionHeader } from "@/src/components/ui";
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
    <Card variant="panel" style={styles.card}>
      <View style={styles.header}>
        <SectionHeader
          title="Quick Add"
          action={
            <IconButton
              icon={Sliders}
              variant="circle"
              onPress={onOpenEditor}
              accessibilityLabel="Customize quick-add buttons"
            />
          }
        />
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
    </Card>
  );
}

const styles = StyleSheet.create({
  // Placement only — `Card variant="panel"` owns surface, radius and padding.
  card: {
    marginHorizontal: spacing.screenGutter,
    marginBottom: spacing.lg,
  },
  header: {
    marginBottom: spacing.sm,
  },
  buttons: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  // Neutral chrome, not an accent control: a two-line label (name + amount) is
  // something `Button` cannot express, so the pill stays bespoke and tokenized.
  button: {
    flex: 1,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.md,
    borderRadius: radii.control,
    alignItems: "center",
  },
  buttonText: {
    ...typography.buttonSm,
    color: colors.text,
  },
  buttonSubText: {
    ...typography.caption,
    marginTop: spacing.xs,
  },
});
