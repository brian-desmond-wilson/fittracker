import { type LucideIcon } from "lucide-react-native";
import { View } from "react-native";
import { icons } from "@/src/theme/tokens";

/**
 * Sanctioned exception to §4.6's "strokeWidth 2 everywhere": the focused tab
 * icon thickens to 2.5. It is the only weight signal the tab bar has once the
 * label and glyph have both taken the active tint, so it is not drift.
 */
const FOCUSED_STROKE_WIDTH = 2.5;

interface TabBarIconProps {
  Icon: LucideIcon;
  color: string;
  focused: boolean;
}

export function TabBarIcon({ Icon, color, focused }: TabBarIconProps) {
  return (
    <View>
      <Icon
        size={icons.lg}
        color={color}
        strokeWidth={focused ? FOCUSED_STROKE_WIDTH : icons.strokeWidth}
      />
    </View>
  );
}
