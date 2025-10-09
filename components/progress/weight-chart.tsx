"use client";

import { WeightLog } from "@/types/database";
import { formatDate } from "@/lib/utils";

interface WeightChartProps {
  data: WeightLog[];
  targetWeight?: number | null;
}

export function WeightChart({ data, targetWeight }: WeightChartProps) {
  if (data.length === 0) return null;

  const weights = data.map((d) => d.weight_kg);
  const minWeight = Math.min(...weights, targetWeight || Infinity);
  const maxWeight = Math.max(...weights, targetWeight || -Infinity);
  const range = maxWeight - minWeight;
  const padding = range * 0.1 || 1;

  const chartMin = minWeight - padding;
  const chartMax = maxWeight + padding;
  const chartRange = chartMax - chartMin;

  // Simple line chart with SVG
  const points = data
    .map((log, i) => {
      const x = (i / (data.length - 1 || 1)) * 100;
      const y = 100 - ((log.weight_kg - chartMin) / chartRange) * 100;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <div className="space-y-4">
      {/* Chart */}
      <div className="relative h-64 bg-gray-800 rounded-lg p-4">
        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          className="w-full h-full"
        >
          {/* Target line */}
          {targetWeight && (
            <line
              x1="0"
              y1={100 - ((targetWeight - chartMin) / chartRange) * 100}
              x2="100"
              y2={100 - ((targetWeight - chartMin) / chartRange) * 100}
              stroke="rgb(34 197 94)"
              strokeWidth="0.5"
              strokeDasharray="2,2"
              opacity="0.5"
            />
          )}

          {/* Weight line */}
          <polyline
            points={points}
            fill="none"
            stroke="rgb(34 197 94)"
            strokeWidth="1"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Data points */}
          {data.map((log, i) => {
            const x = (i / (data.length - 1 || 1)) * 100;
            const y = 100 - ((log.weight_kg - chartMin) / chartRange) * 100;
            return (
              <circle
                key={log.id}
                cx={x}
                cy={y}
                r="1.5"
                fill="rgb(34 197 94)"
              />
            );
          })}
        </svg>

        {/* Y-axis labels */}
        <div className="absolute left-0 top-0 bottom-0 flex flex-col justify-between text-xs text-gray-500 pr-2">
          <span>{chartMax.toFixed(1)}</span>
          <span>{((chartMax + chartMin) / 2).toFixed(1)}</span>
          <span>{chartMin.toFixed(1)}</span>
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center justify-center gap-6 text-sm">
        <div className="flex items-center gap-2">
          <div className="w-8 h-0.5 bg-primary"></div>
          <span className="text-gray-400">Weight</span>
        </div>
        {targetWeight && (
          <div className="flex items-center gap-2">
            <div className="w-8 h-0.5 bg-green-500 opacity-50" style={{ borderTop: "2px dashed" }}></div>
            <span className="text-gray-400">Target</span>
          </div>
        )}
      </div>

      {/* Stats */}
      <div className="flex justify-between text-sm">
        <div>
          <p className="text-gray-500">First log</p>
          <p className="text-white font-medium">
            {formatDate(data[0].logged_at)}
          </p>
        </div>
        <div className="text-right">
          <p className="text-gray-500">Latest log</p>
          <p className="text-white font-medium">
            {formatDate(data[data.length - 1].logged_at)}
          </p>
        </div>
      </div>
    </div>
  );
}
