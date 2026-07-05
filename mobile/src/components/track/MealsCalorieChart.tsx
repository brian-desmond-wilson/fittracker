import React from "react";
import { View, StyleSheet } from "react-native";
import Svg, { Rect, Line, Text as SvgText } from "react-native-svg";
import { colors } from "@/src/lib/colors";
import { MealsSeriesEntry } from "@/src/lib/mealStats";

interface MealsCalorieChartProps {
  series: MealsSeriesEntry[];
  referenceGoalCal: number;
  height?: number;
}

const VIEW_WIDTH = 300;
// Bars are normalized so a day at goal reaches the reference line at
// roughly 75% of chart height. Days that exceed the goal visually
// overshoot the line — useful signal for fueling adherence.
const VISUAL_SCALE = 1.33;

export function MealsCalorieChart({
  series,
  referenceGoalCal,
  height = 130,
}: MealsCalorieChartProps) {
  const padding = { top: 14, bottom: 22, left: 8, right: 8 };
  const innerWidth = VIEW_WIDTH - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const slotWidth = innerWidth / Math.max(series.length, 1);
  const barWidth = slotWidth * 0.65;
  const baseY = padding.top + chartHeight;
  const goalLineY = baseY - chartHeight * (1 / VISUAL_SCALE);

  const labelIndices =
    series.length > 0
      ? Array.from(
          new Set([0, Math.floor((series.length - 1) / 2), series.length - 1]),
        )
      : [];

  return (
    <View style={styles.wrap}>
      <Svg width="100%" height={height} viewBox={`0 0 ${VIEW_WIDTH} ${height}`}>
        {/* Goal reference line */}
        {referenceGoalCal > 0 && (
          <Line
            x1={padding.left}
            x2={VIEW_WIDTH - padding.right}
            y1={goalLineY}
            y2={goalLineY}
            stroke="rgba(255,255,255,0.25)"
            strokeWidth={1}
            strokeDasharray="3,3"
          />
        )}
        {series.map((d, i) => {
          const ratio =
            referenceGoalCal > 0
              ? Math.min(d.calories / referenceGoalCal, VISUAL_SCALE) /
                VISUAL_SCALE
              : Math.min(d.calories / 2000, VISUAL_SCALE) / VISUAL_SCALE;
          const barHeight = chartHeight * ratio;
          const x = padding.left + i * slotWidth + (slotWidth - barWidth) / 2;
          const y = baseY - barHeight;
          const hit = d.calorieGoal > 0 && d.calories >= d.calorieGoal;
          const fill =
            d.calories === 0
              ? "rgba(249, 115, 22, 0.18)"
              : hit
                ? "#22C55E"
                : "#F97316";
          if (d.calories === 0) {
            return (
              <Rect
                key={d.date}
                x={x}
                y={baseY - 2}
                width={barWidth}
                height={2}
                fill={fill}
                rx={1}
              />
            );
          }
          return (
            <Rect
              key={d.date}
              x={x}
              y={y}
              width={barWidth}
              height={Math.max(barHeight, 2)}
              fill={fill}
              rx={2}
            />
          );
        })}
        {labelIndices.map((i) => {
          const d = series[i];
          if (!d) return null;
          const [, month, day] = d.date.split("-").map(Number);
          const label = `${month}/${day}`;
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
              {label}
            </SvgText>
          );
        })}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: "100%" },
});
