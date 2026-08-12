// The back of the packet.
//
// A faithful Nutrition Facts panel rather than a themed card: black on white,
// the regulated rule weights, the regulated order. It is reproduced because
// people read a panel by its shape — you find the calories by where they sit,
// not by reading the label text — and a dark rounded card with the same
// numbers loses exactly that.
//
// What it will NOT do is invent the fields we do not store. A panel is read
// literally, so the nutrients we hold no value for are named as absent at the
// foot instead of being printed as zeroes.
import React from "react";
import { Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { colors, radii, spacing } from "@/src/theme/tokens";
import { buildNutritionLabel, type LabelSource } from "@/src/lib/nutritionLabel";

interface NutritionFactsCardProps {
  item: LabelSource;
  /** Rendered top-right, in the same spot the front face keeps its flip control. */
  corner?: React.ReactNode;
}

// The panel is set in a condensed grotesque; Helvetica is the closest thing
// present on iOS, and Android's Roboto Condensed is the closest there.
const PANEL_FONT = Platform.OS === "ios" ? "Helvetica" : "sans-serif-condensed";

export function NutritionFactsCard({ item, corner }: NutritionFactsCardProps) {
  const label = buildNutritionLabel(item);

  return (
    <View style={styles.paper}>
      {corner ? <View style={styles.corner}>{corner}</View> : null}
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
      >
        <Text style={styles.title}>Nutrition Facts</Text>
        <View style={styles.ruleThin} />

        {label.servingSize && (
          <View style={styles.servingRow}>
            <Text style={styles.servingLabel}>Serving size</Text>
            <Text style={styles.servingValue}>{label.servingSize}</Text>
          </View>
        )}

        <View style={styles.ruleThick} />

        <Text style={styles.amountPer}>Amount per serving</Text>
        <View style={styles.caloriesRow}>
          <Text style={styles.caloriesLabel}>Calories</Text>
          <Text style={styles.caloriesValue}>{label.calories ?? "—"}</Text>
        </View>

        <View style={styles.ruleMedium} />
        <Text style={styles.dvHeader}>% Daily Value*</Text>
        <View style={styles.ruleThin} />

        {label.rows.map((row) => (
          <View key={row.label}>
            <View style={styles.row}>
              <Text style={[styles.rowLabel, row.indented && styles.rowLabelIndented]}>
                {row.indented ? "" : ""}
                <Text style={row.indented ? styles.rowLabelPlain : styles.rowLabelBold}>
                  {row.label}
                </Text>
                <Text style={styles.rowAmount}> {row.amount}</Text>
              </Text>
              <Text style={styles.rowDv}>{row.dv === null ? "" : `${row.dv}%`}</Text>
            </View>
            <View style={styles.ruleHair} />
          </View>
        ))}

        <View style={styles.ruleThick} />

        <Text style={styles.note}>
          Not recorded here: {label.missing.join(", ")}.
        </Text>

        <View style={styles.ruleThin} />
        <Text style={styles.footnote}>
          *The % Daily Value tells you how much a nutrient in a serving of food
          contributes to a daily diet. 2,000 calories a day is used for general
          nutrition advice.
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  paper: {
    flex: 1,
    backgroundColor: colors.labelPaper,
    borderRadius: radii.panel,
    borderWidth: 1,
    borderColor: colors.labelInk,
    overflow: "hidden",
  },
  corner: { position: "absolute", top: spacing.md, right: spacing.md, zIndex: 1 },
  scroll: { padding: spacing.lg, paddingBottom: spacing.xxl },

  title: {
    fontFamily: PANEL_FONT, fontWeight: "900", color: colors.labelInk,
    fontSize: 38, letterSpacing: -1,
  },
  ruleHair: { height: 1, backgroundColor: colors.labelInk, opacity: 0.35 },
  ruleThin: { height: 1, backgroundColor: colors.labelInk, marginVertical: spacing.xs },
  ruleMedium: { height: 5, backgroundColor: colors.labelInk, marginVertical: spacing.xs },
  ruleThick: { height: 10, backgroundColor: colors.labelInk, marginVertical: spacing.xs },

  servingRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" },
  servingLabel: { fontFamily: PANEL_FONT, fontWeight: "700", fontSize: 17, color: colors.labelInk },
  servingValue: { fontFamily: PANEL_FONT, fontWeight: "700", fontSize: 17, color: colors.labelInk },

  amountPer: { fontFamily: PANEL_FONT, fontWeight: "700", fontSize: 12, color: colors.labelInk },
  caloriesRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" },
  caloriesLabel: {
    fontFamily: PANEL_FONT, fontWeight: "900", fontSize: 32, color: colors.labelInk,
    letterSpacing: -0.5,
  },
  caloriesValue: {
    fontFamily: PANEL_FONT, fontWeight: "900", fontSize: 38, color: colors.labelInk,
    letterSpacing: -1,
  },

  dvHeader: {
    fontFamily: PANEL_FONT, fontWeight: "700", fontSize: 12, color: colors.labelInk,
    textAlign: "right",
  },

  row: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "baseline",
    paddingVertical: spacing.xs,
  },
  rowLabel: { flex: 1, minWidth: 0 },
  rowLabelIndented: { paddingLeft: spacing.lg },
  rowLabelBold: { fontFamily: PANEL_FONT, fontWeight: "700", fontSize: 15, color: colors.labelInk },
  rowLabelPlain: { fontFamily: PANEL_FONT, fontWeight: "400", fontSize: 15, color: colors.labelInk },
  rowAmount: { fontFamily: PANEL_FONT, fontWeight: "400", fontSize: 15, color: colors.labelInk },
  rowDv: { fontFamily: PANEL_FONT, fontWeight: "700", fontSize: 15, color: colors.labelInk },

  note: {
    fontFamily: PANEL_FONT, fontSize: 12, lineHeight: 16, color: colors.labelInk,
    paddingVertical: spacing.xs,
  },
  footnote: {
    fontFamily: PANEL_FONT, fontSize: 11, lineHeight: 14, color: colors.labelInk,
    paddingTop: spacing.xs,
  },
});
