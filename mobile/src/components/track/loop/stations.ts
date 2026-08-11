// mobile/src/components/track/loop/stations.ts
// The ONE mapping from engine station keys to their presentation (accent +
// glyph). Both loop components and the hub screen read from here, so a station
// cannot wear one accent in a row and another in its sheet, and cannot pick up
// an icon in one place and lose it in another.
//
// Lives on the COMPONENTS side of the layering rule, not in `src/lib/`: these
// are presentation choices, and `src/lib/` must never import from
// `src/components/` (the same rule that makes the engine declare its own
// `StationTone` instead of importing `BadgeTone`). Keyed by `StationKey`, so
// adding a seventh station fails to compile here until it is given both.
import {
  ClipboardList, Package, ShoppingCart, TrendingUp, Utensils, Zap,
} from "lucide-react-native";
import type { LucideIcon } from "lucide-react-native";
import type { AccentKey } from "@/src/theme/tokens";
import type { StationKey } from "@/src/lib/loopStatus";

export const STATION_ACCENTS: Record<StationKey, AccentKey> = {
  inventory: "inventory", library: "meals", eatNext: "brand",
  pace: "meals", forecast: "shopping", shopping: "shopping",
};

export const STATION_ICONS: Record<StationKey, LucideIcon> = {
  inventory: Package, library: Utensils, eatNext: Zap,
  pace: ClipboardList, forecast: TrendingUp, shopping: ShoppingCart,
};
