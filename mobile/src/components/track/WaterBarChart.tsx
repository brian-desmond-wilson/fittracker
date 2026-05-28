import React from "react";
import { View, StyleSheet } from "react-native";
import Svg, { Rect, Line, Text as SvgText } from "react-native-svg";
import { colors } from "@/src/lib/colors";

interface WaterBarChartProps {
  // Oldest -> newest. Each entry: { date: "YYYY-MM-DD", total: oz }.
  series: { date: string; total: number }[];
  goalOz: number;
  height?: number;
}

const VIEW_WIDTH = 300;

export function WaterBarChart({
  series,
  goalOz,
  height = 130,
}: WaterBarChartProps) {
  const padding = { top: 14, bottom: 22, left: 8, right: 8 };
  const innerWidth = VIEW_WIDTH - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const slotWidth = innerWidth / Math.max(series.length, 1);
  const barWidth = slotWidth * 0.65;
  const goalY = padding.top;
  const baseY = padding.top + chartHeight;

  const labelIndices = series.length > 0
    ? Array.from(new Set([0, Math.floor((series.length - 1) / 2), series.length - 1]))
    : [];

  return (
    <View style={styles.wrap}>
      <Svg width="100%" height={height} viewBox={`0 0 ${VIEW_WIDTH} ${height}`}>
        {/* Goal reference line */}
        <Line
          x1={padding.left}
          x2={VIEW_WIDTH - padding.right}
          y1={goalY}
          y2={goalY}
          stroke="rgba(255,255,255,0.25)"
          strokeWidth={1}
          strokeDasharray="3,3"
        />
        {/* Bars */}
        {series.map((d, i) => {
          const ratio = goalOz > 0 ? Math.min(d.total / goalOz, 1) : 0;
          const barHeight = chartHeight * ratio;
          const x = padding.left + i * slotWidth + (slotWidth - barWidth) / 2;
          const y = baseY - barHeight;
          const hit = goalOz > 0 && d.total >= goalOz;
          const fill = d.total === 0
            ? "rgba(59, 130, 246, 0.18)"
            : hit
              ? "#22C55E"
              : "#3B82F6";
          // Render a thin baseline rect for zero-data days so the slot is visible.
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
  wrap: {
    width: "100%",
  },
});
