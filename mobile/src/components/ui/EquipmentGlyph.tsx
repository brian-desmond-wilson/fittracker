// mobile/src/components/ui/EquipmentGlyph.tsx
// One glyph per equipment or surface name, shared by the exercise page and the
// filter sheet so both read the same. The kettlebell is the app's own icon; the
// rest are the nearest lucide shapes. Surfaces (Wall, Floor) live here too.
// Anything unknown falls back to a box.
import React from "react";
import {
  Anchor, AudioWaveform, Bike, Box, BrickWall, Cable, Circle, CircleDashed, CircleDot, Cog, Disc, Disc3,
  Dumbbell, Equal, Footprints, Frame, Hexagon, Minus, Move, Package, PanelBottom, PersonStanding,
  RectangleHorizontal, Repeat, Rows2, Shirt, Snowflake, Spline, Waves, Weight,
} from "lucide-react-native";
import type { LucideIcon } from "lucide-react-native";
import { KettlebellIcon } from "./KettlebellIcon";

/** A glyph per known name, covering both the equipment vocabularies and the
 *  Wall/Floor surfaces. "kettlebell" is a sentinel for the app's own icon. */
export const EQUIPMENT_ICONS: Record<string, LucideIcon | "kettlebell"> = {
  Kettlebell: "kettlebell", Dumbbell, Barbell: Weight, "Fixed Barbell": Weight, "EZ Bar": AudioWaveform,
  Bodyweight: PersonStanding, Bands: CircleDashed,
  Bar: Minus, Box, "Jump Rope": Repeat, Bench: RectangleHorizontal, Sled: Move, Cable, Machine: Cog,
  Rings: Circle, "Med Ball": CircleDot, Bike, Rower: Waves,
  "Trap Bar": Hexagon, Landmine: Anchor, Plate: Disc, Sandbag: Package, "Weight Vest": Shirt,
  Rope: Spline, Parallettes: Equal, Ski: Snowflake, "Smith Machine": Frame, Treadmill: Footprints,
  "Ab Roller": Disc3, "Dip Bars": Rows2,
  Wall: BrickWall, Floor: PanelBottom,
};

function resolve(name: string): LucideIcon | "kettlebell" {
  const exact = EQUIPMENT_ICONS[name];
  if (exact) return exact;
  const key = Object.keys(EQUIPMENT_ICONS).find((k) => k.toLowerCase() === name.toLowerCase());
  return key ? EQUIPMENT_ICONS[key] : Box;
}

interface EquipmentGlyphProps {
  name: string;
  size?: number;
  color?: string;
  strokeWidth?: number;
}

/** Renders the glyph for an equipment or surface name at the given size/color. */
export function EquipmentGlyph({ name, size = 24, color, strokeWidth = 1.6 }: EquipmentGlyphProps) {
  const icon = resolve(name);
  if (icon === "kettlebell") return <KettlebellIcon size={size} color={color} />;
  const Icon = icon;
  return <Icon size={size} color={color} strokeWidth={strokeWidth} />;
}
