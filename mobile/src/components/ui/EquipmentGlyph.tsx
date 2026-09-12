// mobile/src/components/ui/EquipmentGlyph.tsx
// One glyph per equipment or surface name, shared by the exercise page and the
// filter sheet so both read the same. Glyphs come from three sources: Lucide
// line icons, Material Community icons ({ mci } — used where a real gym glyph
// exists), and the Wall/Floor surfaces. Anything unknown falls back to a box.
import React from "react";
import type { ComponentProps } from "react";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import {
  AudioWaveform, Box, Circle, Cog, Disc, Disc3, Dumbbell, Frame, Hexagon, Minus, Move,
  PanelBottom, PersonStanding, Rows2, Spline, Weight,
} from "lucide-react-native";
import type { LucideIcon } from "lucide-react-native";

/** A Material Community icon name. */
type Mci = { mci: ComponentProps<typeof MaterialCommunityIcons>["name"] };
type Glyph = LucideIcon | Mci;

export const EQUIPMENT_ICONS: Record<string, Glyph> = {
  Kettlebell: { mci: "kettlebell" },
  Dumbbell,
  Barbell: { mci: "weight-lifter" },
  "Fixed Barbell": Weight,
  "EZ Bar": AudioWaveform,
  Bodyweight: PersonStanding,
  Bands: Spline,
  Bar: Minus,
  Box,
  "Jump Rope": { mci: "jump-rope" },
  Bench: { mci: "bench" },
  Sled: Move,
  Cable: { mci: "cable-data" },
  Machine: Cog,
  Rings: Circle,
  "Med Ball": { mci: "circle-slice-8" },
  Bike: { mci: "bicycle" },
  Rower: { mci: "rowing" },
  "Trap Bar": Hexagon,
  Landmine: { mci: "anchor" },
  Plate: Disc,
  Sandbag: { mci: "sack" },
  "Weight Vest": { mci: "tshirt-crew" },
  Rope: Spline,
  Parallettes: Rows2,
  Ski: { mci: "ski" },
  "Smith Machine": Frame,
  Treadmill: { mci: "run" },
  "Ab Roller": Disc3,
  "Dip Bars": Rows2,
  Wall: { mci: "wall" },
  Floor: PanelBottom,
};

function resolve(name: string): Glyph {
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
  const g = resolve(name);
  if (typeof g === "object" && "mci" in g) {
    return <MaterialCommunityIcons name={g.mci} size={size} color={color} />;
  }
  const Icon = g;
  return <Icon size={size} color={color} strokeWidth={strokeWidth} />;
}
