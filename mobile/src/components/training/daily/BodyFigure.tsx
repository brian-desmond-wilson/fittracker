// A stylized, tappable muscle figure — front and back views over the
// muscle_regions vocabulary (TRAINABLE_MUSCLES). 2D for now, by design: the
// approved mockup E frames this page for a rotatable 3D figure later, and
// this component is the slot it will drop into. The region → path data is the
// only thing a 3D swap should have to replace.
//
// Colors arrive from the caller per region — this component knows shapes and
// taps, never what a fill means (heat vs soreness).
import React from "react";
import Svg, { Circle, Path, Rect } from "react-native-svg";
import { colors } from "@/src/theme/tokens";

export type BodyView = "front" | "back";

interface RegionShape {
  /** muscle_regions.name, verbatim. */
  muscle: string;
  d: string;
}

// Mirror helper at authoring time only: the figure is symmetric about x=100.
// Not a general SVG transform — the paths below are authored in absolute
// M/L/Q commands whose coordinates alternate x y, so mirroring is flipping
// every x about the centerline.
const mirror = (d: string): string =>
  d.replace(/([MLQ])\s*([\d. ]+)/g, (_, cmd: string, nums: string) => {
    const parts = nums.trim().split(/\s+/).map(Number);
    const flipped = parts.map((n, i) => (i % 2 === 0 ? 200 - n : n));
    return `${cmd}${flipped.join(" ")} `;
  }).trim();

const pair = (muscle: string, d: string): RegionShape[] => [
  { muscle, d },
  { muscle, d: mirror(d) },
];

/** Front view: what you can point at in a mirror. The lower leg is mapped to
 *  Calves so every region stays reachable from either side. */
const FRONT: RegionShape[] = [
  { muscle: "Neck / Traps", d: "M84 50 Q100 44 116 50 L111 62 Q100 58 89 62 Z" },
  ...pair("Shoulders", "M78 64 Q68 58 60 66 Q58 74 64 78 L76 76 Z"),
  { muscle: "Chest", d: "M79 66 Q100 60 121 66 L118 94 Q100 104 82 94 Z" },
  ...pair("Biceps", "M59 70 Q52 90 55 108 L67 106 Q69 88 72 74 Z"),
  ...pair("Forearms / Grip", "M53 112 Q48 134 52 152 L62 150 Q64 132 65 113 Z"),
  { muscle: "Core", d: "M88 98 Q100 106 112 98 L110 146 Q100 152 90 146 Z" },
  ...pair("Obliques", "M79 97 Q84 100 86 102 L88 145 Q81 138 78 128 Z"),
  ...pair("Hip Flexors", "M87 150 Q93 156 98 157 L96 169 Q89 164 85 157 Z"),
  ...pair("Hip Abductors", "M77 149 Q72 160 74 172 L82 170 Q80 158 83 151 Z"),
  ...pair("Hip Adductors", "M98 172 L96 206 L90 202 L94 172 Z"),
  ...pair("Quads", "M80 158 Q75 202 82 234 L94 234 Q97 198 95 166 L88 168 Q83 164 80 158 Z"),
  ...pair("Calves", "M84 240 Q81 274 86 300 L94 300 Q95 268 94 240 Z"),
];

/** Back view. Shoulders reappear (rear delts); abductors stay a front story. */
const BACK: RegionShape[] = [
  { muscle: "Neck / Traps", d: "M82 48 Q100 42 118 48 L110 78 Q100 84 90 78 Z" },
  ...pair("Shoulders", "M78 64 Q68 58 60 66 Q58 74 64 78 L76 76 Z"),
  { muscle: "Upper Back", d: "M81 66 Q100 62 119 66 L115 96 Q100 102 85 96 Z" },
  ...pair("Lats", "M80 98 Q87 104 96 106 L94 138 Q83 128 78 112 Z"),
  ...pair("Triceps", "M59 70 Q52 90 55 108 L67 106 Q69 88 72 74 Z"),
  ...pair("Forearms / Grip", "M53 112 Q48 134 52 152 L62 150 Q64 132 65 113 Z"),
  { muscle: "Lower Back", d: "M92 110 Q100 114 108 110 L106 146 Q100 150 94 146 Z" },
  { muscle: "Glutes", d: "M84 150 Q100 144 116 150 Q119 172 100 177 Q81 172 84 150 Z" },
  ...pair("Hamstrings", "M82 182 Q78 214 84 238 L95 238 Q98 210 96 184 Z" ),
  ...pair("Calves", "M84 244 Q80 276 86 302 L95 302 Q97 272 94 244 Z"),
];

interface BodyFigureProps {
  view: BodyView;
  /** Fill for a region, by muscle_regions.name. */
  fillFor: (muscle: string) => string;
  onPressRegion?: (muscle: string) => void;
  width?: number;
}

export function BodyFigure({ view, fillFor, onPressRegion, width = 230 }: BodyFigureProps) {
  const regions = view === "front" ? FRONT : BACK;
  return (
    <Svg width={width} height={(width / 200) * 330} viewBox="0 0 200 330">
      {/* Silhouette — never tappable, never colored by data. */}
      <Circle cx={100} cy={24} r={17} fill={colors.surface2} />
      <Rect x={92} y={40} width={16} height={10} fill={colors.surface2} />
      <Path
        d="M60 66 Q100 52 140 66 L146 152 L136 152 L124 100 L122 150 Q128 210 120 240 Q118 280 122 302 L98 302 L102 240 L98 240 L102 302 L78 302 Q82 280 80 240 Q72 210 78 150 L76 100 L64 152 L54 152 Z"
        fill={colors.surface2}
        opacity={0.55}
      />
      {regions.map((r, i) => (
        <Path
          key={`${r.muscle}-${i}`}
          d={r.d}
          fill={fillFor(r.muscle)}
          stroke={colors.border}
          strokeWidth={1}
          onPress={onPressRegion ? () => onPressRegion(r.muscle) : undefined}
        />
      ))}
    </Svg>
  );
}
