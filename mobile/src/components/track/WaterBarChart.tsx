import React from "react";
import { View, StyleSheet } from "react-native";
import Svg, { Rect, Line, Text as SvgText } from "react-native-svg";
import { colors } from "@/src/theme/tokens";

interface WaterBarChartProps {
  // Oldest -> newest. Each entry: { date: "YYYY-MM-DD", total: oz, goal: oz }.
  // The per-day `goal` is used to color bars green when hit.
  series: { date: string; total: number; goal: number }[];
  // The dashed reference line shows the BASE goal — bonus days where
  // total exceeds base will visually overshoot this line.
  referenceGoalOz: number;
  height?: number;
}

const VIEW_WIDTH = 300;
// Bars cap visually at 133% of base goal so bonus days can overshoot
// the reference line, but extreme outliers don't break the chart.
const VISUAL_SCALE = 1.33;

export function WaterBarChart({
  series,
  referenceGoalOz,
  height = 130,
}: WaterBarChartProps) {
  const padding = { top: 14, bottom: 22, left: 8, right: 8 };
  const innerWidth = VIEW_WIDTH - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const slotWidth = innerWidth / Math.max(series.length, 1);
  const barWidth = slotWidth * 0.65;
  const baseY = padding.top + chartHeight;
  // Reference line position: bar at 100% of base goal reaches this Y.
  const goalLineY = baseY - chartHeight * (1 / VISUAL_SCALE);

  const labelIndices = series.length > 0
    ? Array.from(new Set([0, Math.floor((series.length - 1) / 2), series.length - 1]))
    : [];

  return (
    <View style={styles.wrap}>
      <Svg width="100%" height={height} viewBox={`0 0 ${VIEW_WIDTH} ${height}`}>
        {/* Goal reference line (at base goal) */}
        <Line
          x1={padding.left}
          x2={VIEW_WIDTH - padding.right}
          y1={goalLineY}
          y2={goalLineY}
          stroke={colors.textFaint}
          strokeWidth={1}
          strokeDasharray="3,3"
        />
        {/* Bars */}
        {series.map((d, i) => {
          const ratio = referenceGoalOz > 0
            ? Math.min(d.total / referenceGoalOz, VISUAL_SCALE) / VISUAL_SCALE
            : 0;
          const barHeight = chartHeight * ratio;
          const x = padding.left + i * slotWidth + (slotWidth - barWidth) / 2;
          const y = baseY - barHeight;
          const hit = d.goal > 0 && d.total >= d.goal;
          // A zero day renders a 2pt stub — an empty track, not a fill.
          const fill = d.total === 0
            ? colors.surface2
            : hit
              ? colors.success
              : colors.accents.water;
          if (d.total === 0) {
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
        {/* X-axis date labels */}
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
              fill={colors.textMuted}
              // Chart-fitted: §4.5 defines no token below `caption` (12), and
              // fourteen columns in a 300-unit viewBox cannot hold one.
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
  wrap: {
    width: "100%",
  },
});
