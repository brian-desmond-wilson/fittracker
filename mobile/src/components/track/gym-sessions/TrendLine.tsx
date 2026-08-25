// One line over the period's buckets, gaps where there is no data. Used for
// est. 1RM and body weight — one measure, one axis, per chart.
import React from "react";
import Svg, { Circle, Polyline, Text as SvgText } from "react-native-svg";
import { colors } from "@/src/lib/colors";

const VIEW_WIDTH = 300;

export function TrendLine({
  values,
  labels,
  color = colors.primary,
  height = 120,
  formatValue = (v) => String(Math.round(v)),
}: {
  values: (number | null)[];
  labels: string[];
  color?: string;
  height?: number;
  formatValue?: (v: number) => string;
}) {
  const padding = { top: 16, bottom: 20, left: 8, right: 8 };
  const innerWidth = VIEW_WIDTH - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const slotWidth = innerWidth / Math.max(values.length, 1);
  const known = values.filter((v): v is number => v !== null);
  if (known.length === 0) return null;
  const min = Math.min(...known);
  const max = Math.max(...known);
  const span = max - min || 1;
  const xOf = (i: number) => padding.left + i * slotWidth + slotWidth / 2;
  const yOf = (v: number) =>
    padding.top + chartHeight - ((v - min) / span) * chartHeight;

  const points = values
    .map((v, i) => (v === null ? null : `${xOf(i)},${yOf(v)}`))
    .filter(Boolean)
    .join(" ");
  const firstIdx = values.findIndex((v) => v !== null);
  let lastIdx = -1;
  values.forEach((v, i) => { if (v !== null) lastIdx = i; });

  return (
    <Svg width="100%" height={height} viewBox={`0 0 ${VIEW_WIDTH} ${height}`}>
      <Polyline points={points} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" />
      {values.map((v, i) =>
        v === null ? null : (
          <Circle key={i} cx={xOf(i)} cy={yOf(v)} r={i === firstIdx || i === lastIdx ? 3.5 : 2} fill={color} />
        ),
      )}
      {[firstIdx, lastIdx].filter((i, n, a) => i >= 0 && a.indexOf(i) === n).map((i) => (
        <SvgText
          key={`v${i}`}
          x={xOf(i)}
          y={yOf(values[i] as number) - 8}
          fontSize={9}
          fill={colors.mutedForeground}
          textAnchor="middle"
        >
          {formatValue(values[i] as number)}
        </SvgText>
      ))}
      {labels.map((l, i) => (
        <SvgText key={`l${i}`} x={xOf(i)} y={height - 6} fontSize={9} fill={colors.mutedForeground} textAnchor="middle">
          {l}
        </SvgText>
      ))}
    </Svg>
  );
}
