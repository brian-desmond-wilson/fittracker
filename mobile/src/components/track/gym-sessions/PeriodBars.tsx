// One series of bars over the period's buckets. Single series, single axis —
// magnitude only, so the bar color is the brand green and the chart needs no
// legend (the panel title names the series).
import React from "react";
import Svg, { Rect, Text as SvgText } from "react-native-svg";
import { colors } from "@/src/lib/colors";

const VIEW_WIDTH = 300;

export function PeriodBars({
  values,
  labels,
  height = 120,
  formatValue,
}: {
  values: number[];
  labels: string[];
  height?: number;
  /** Direct label for the max bar — selective labeling, not every bar. */
  formatValue?: (v: number) => string;
}) {
  const padding = { top: 16, bottom: 20, left: 8, right: 8 };
  const innerWidth = VIEW_WIDTH - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const slotWidth = innerWidth / Math.max(values.length, 1);
  const barWidth = Math.min(slotWidth * 0.6, 26);
  const baseY = padding.top + chartHeight;
  const max = Math.max(...values, 1);
  const maxIndex = values.indexOf(Math.max(...values));

  return (
    <Svg width="100%" height={height} viewBox={`0 0 ${VIEW_WIDTH} ${height}`}>
      {values.map((v, i) => {
        const barHeight = v > 0 ? Math.max((v / max) * chartHeight, 2) : 2;
        const x = padding.left + i * slotWidth + (slotWidth - barWidth) / 2;
        return (
          <React.Fragment key={i}>
            <Rect
              x={x}
              y={baseY - barHeight}
              width={barWidth}
              height={barHeight}
              rx={3}
              fill={v > 0 ? colors.primary : colors.muted}
            />
            {i === maxIndex && v > 0 && formatValue && (
              <SvgText
                x={x + barWidth / 2}
                y={baseY - barHeight - 5}
                fontSize={9}
                fill={colors.mutedForeground}
                textAnchor="middle"
              >
                {formatValue(v)}
              </SvgText>
            )}
            <SvgText
              x={x + barWidth / 2}
              y={height - 6}
              fontSize={9}
              fill={colors.mutedForeground}
              textAnchor="middle"
            >
              {labels[i] ?? ""}
            </SvgText>
          </React.Fragment>
        );
      })}
    </Svg>
  );
}
