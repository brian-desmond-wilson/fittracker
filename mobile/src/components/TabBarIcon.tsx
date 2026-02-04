import { type LucideIcon } from "lucide-react-native";
import { View } from "react-native";

interface TabBarIconProps {
  Icon: LucideIcon;
  color: string;
  focused: boolean;
}

export function TabBarIcon({ Icon, color, focused }: TabBarIconProps) {
  return (
    <View>
      <Icon
        size={24}
        color={color}
        strokeWidth={focused ? 2.5 : 2}
      />
    </View>
  );
}
