import React from "react";
import { View, Text, StyleSheet } from "react-native";
import Svg, { Rect, Text as SvgText } from "react-native-svg";
import { colors } from "@/src/lib/colors";
import { MealsSeriesEntry } from "@/src/lib/mealStats";

interface MealsMacroChartProps {
  series: MealsSeriesEntry[];
  height?: number;
}

const VIEW_WIDTH = 300;

const COLORS = {
  protein: "#22C55E", // green
  carbs: "#F59E0B",   // amber
  fats: "#3B82F6",    // blue
};

/**
 * Stacked-bar chart of daily macro split (% of calories from P/C/F).
 * Each day's bar fills 100% of the chart height when there's any data,
 * with segments sized by per-macro calorie share. Empty days show a
 * thin baseline.
 */
export function MealsMacroChart({ series, height = 130 }: MealsMacroChartProps) {
  const padding = { top: 14, bottom: 22, left: 8, right: 8 };
  const innerWidth = VIEW_WIDTH - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const slotWidth = innerWidth / Math.max(series.length, 1);
  const barWidth = slotWidth * 0.65;
  const baseY = padding.top + chartHeight;

  const labelIndices =
    series.length > 0
      ? Array.from(
          new Set([0, Math.floor((series.length - 1) / 2), series.length - 1]),
        )
      : [];

  return (
    <View style={styles.wrap}>
      <Svg width="100%" height={height} viewBox={`0 0 ${VIEW_WIDTH} ${height}`}>
        {series.map((d, i) => {
          const pCal = d.protein * 4;
          const cCal = d.carbs * 4;
          const fCal = d.fats * 9;
          const total = pCal + cCal + fCal;
          const x = padding.left + i * slotWidth + (slotWidth - barWidth) / 2;
          if (total <= 0) {
            return (
              <Rect
                key={d.date}
                x={x}
                y={baseY - 2}
                width={barWidth}
                height={2}
                fill="rgba(249, 115, 22, 0.18)"
                rx={1}
              />
            );
          }
          const pH = chartHeight * (pCal / total);
          const cH = chartHeight * (cCal / total);
          const fH = chartHeight * (fCal / total);
          // Bottom-up stack: protein (largest priority on bottom), then carbs, then fats.
          const pY = baseY - pH;
          const cY = pY - cH;
          const fY = cY - fH;
          return (
            <React.Fragment key={d.date}>
              <Rect x={x} y={pY} width={barWidth} height={pH} fill={COLORS.protein} />
              <Rect x={x} y={cY} width={barWidth} height={cH} fill={COLORS.carbs} />
              <Rect x={x} y={fY} width={barWidth} height={fH} fill={COLORS.fats} rx={2} />
            </React.Fragment>
          );
        })}
        {labelIndices.map((i) => {
          const d = series[i];
          if (!d) return null;
          const [, month, day] = d.date.split("-").map(Number);
          const x = padding.left + i * slotWidth + slotWidth / 2;
          return (
            <SvgText
              key={`label-${i}`}
              x={x}
              y={height - 6}
              fill={colors.mutedForeground}
              fontSize="9"
              textAnchor="middle"
            >
              {`${month}/${day}`}
            </SvgText>
          );
        })}
      </Svg>
      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={[styles.legendSwatch, { backgroundColor: COLORS.protein }]} />
          <Text style={styles.legendText}>Protein</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendSwatch, { backgroundColor: COLORS.carbs }]} />
          <Text style={styles.legendText}>Carbs</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendSwatch, { backgroundColor: COLORS.fats }]} />
          <Text style={styles.legendText}>Fats</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: "100%" },
  legend: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 14,
    marginTop: 4,
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  legendSwatch: {
    width: 10,
    height: 10,
    borderRadius: 2,
  },
  legendText: {
    fontSize: 10,
    color: colors.mutedForeground,
  },
});
