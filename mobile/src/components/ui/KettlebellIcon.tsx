// A kettlebell drawn the way lucide draws things.
//
// The header's other two modes are stroked icons that can be filled on demand;
// the kettlebell was a PNG, so it read as permanently filled and could not
// join in. Redrawn here on lucide's terms — 24-unit box, 2-unit stroke, round
// caps — it takes the same size/color/fill props and sits beside Flame and
// Dumbbell without looking like a guest.
//
// The handle stays an outline even when the body fills: a bell with a solid
// handle reads as a blob, and the gap you can see through is what makes the
// shape legible at 24 points.
import React from "react";
import Svg, { Path } from "react-native-svg";

interface KettlebellIconProps {
  size?: number;
  color?: string;
  strokeWidth?: number;
  /** A color fills the bell; "none" leaves it hollow. */
  fill?: string;
}

export function KettlebellIcon({
  size = 24,
  color = "currentColor",
  strokeWidth = 2,
  fill = "none",
}: KettlebellIconProps) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {/* Handle: an arch springing from the shoulders of the bell. */}
      <Path d="M8.8 8.6V7a3.2 3.2 0 0 1 6.4 0v1.6" />
      {/* Bell: shoulders in, sides out, flat foot. */}
      <Path
        d="M9 8.5C6 10.2 4.2 13.2 4.2 16.4A3.6 3.6 0 0 0 7.8 20h8.4a3.6 3.6 0 0 0 3.6-3.6c0-3.2-1.8-6.2-4.8-7.9z"
        fill={fill}
      />
    </Svg>
  );
}
