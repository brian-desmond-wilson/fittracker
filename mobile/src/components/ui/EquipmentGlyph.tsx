// mobile/src/components/ui/EquipmentGlyph.tsx
// One glyph per equipment or surface name, shared by the exercise page and the
// filter sheet so both read the same. Glyphs come from three sources: Lucide
// line icons, Material Community icons ({ mci }), and hand-drawn SVGs for gym
// gear the libraries lack ({ xml }, from equipmentCustomIcons). Anything
// unknown falls back to a box.
import React from "react";
import type { ComponentProps } from "react";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { SvgXml } from "react-native-svg";
import {
  Box, Cog, Disc3, Dumbbell, Hexagon, Minus, PanelBottom, PersonStanding, Rows2, Spline,
} from "lucide-react-native";
import type { LucideIcon } from "lucide-react-native";
import { CUSTOM_EQUIPMENT_SVG } from "./equipmentCustomIcons";

type Mci = { mci: ComponentProps<typeof MaterialCommunityIcons>["name"] };
type Custom = { xml: string };
type Glyph = LucideIcon | Mci | Custom;

const C = CUSTOM_EQUIPMENT_SVG;

export const EQUIPMENT_ICONS: Record<string, Glyph> = {
  Kettlebell: { mci: "kettlebell" },
  Dumbbell,
  Barbell: { mci: "weight-lifter" },
  "Fixed Barbell": { xml: C.fixedbar },
  "EZ Bar": { xml: C.ezbar },
  Bodyweight: PersonStanding,
  Bands: { xml: C.bands_loop },
  Bar: Minus,
  Box,
  "Jump Rope": { mci: "jump-rope" },
  Bench: { mci: "bench" },
  Sled: { xml: C.sled },
  Cable: { mci: "cable-data" },
  Machine: Cog,
  Rings: { xml: C.rings },
  "Med Ball": { mci: "circle-slice-8" },
  Bike: { mci: "bicycle" },
  Rower: { mci: "rowing" },
  "Trap Bar": Hexagon,
  Landmine: { xml: C.landmine },
  Plate: { xml: C.plate },
  Sandbag: { mci: "sack" },
  "Weight Vest": { mci: "tshirt-crew" },
  Rope: Spline,
  Parallettes: Rows2,
  Ski: { mci: "ski" },
  "Smith Machine": { xml: C.smith },
  Treadmill: { mci: "run" },
  "Ab Roller": Disc3,
  "Dip Bars": { xml: C.dipbars },
  GHD: { xml: C.ghd },
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
  if (typeof g === "object" && "xml" in g) {
    return <SvgXml xml={g.xml} width={size} height={size} color={color} />;
  }
  const Icon = g;
  return <Icon size={size} color={color} strokeWidth={strokeWidth} />;
}
