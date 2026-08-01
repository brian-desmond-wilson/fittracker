import { Tabs } from "expo-router";
import { Home, Calendar, Plus, Dumbbell } from "lucide-react-native";
import { TabBarIcon } from "@/src/components/TabBarIcon";
import { colors, spacing } from "@/src/theme/tokens";

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: colors.surface2,
          borderTopWidth: 1,
          borderTopColor: colors.border,
          paddingBottom: spacing.xxl,
          paddingTop: spacing.md,
          // Fixed bar height; the bar is not absolutely positioned, so screens
          // clear it without extra padding (verified in Task 7).
          height: 88,
          // No shadow: the token system has no elevation scale (deliberately
          // flat), and the border above already separates the bar. `elevation:
          // 0` is retained to keep Android's default tab-bar shadow suppressed.
          elevation: 0,
        },
        tabBarActiveTintColor: colors.brand,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarLabelStyle: {
          // 12/500 held: `typography.caption` carries `color: textMuted`, which
          // would override the active/inactive tint props above. See the
          // `typography.label` proposal in docs/STYLE_GUIDE.md.
          fontSize: 12,
          fontWeight: "500",
          marginBottom: spacing.xs,
        },
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: "Home",
          tabBarIcon: ({ color, focused }) => (
            <TabBarIcon Icon={Home} color={color} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="schedule"
        options={{
          title: "Schedule",
          tabBarIcon: ({ color, focused }) => (
            <TabBarIcon Icon={Calendar} color={color} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="track"
        options={{
          title: "Track",
          tabBarIcon: ({ color, focused }) => (
            <TabBarIcon Icon={Plus} color={color} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="training"
        options={{
          title: "Training",
          tabBarIcon: ({ color, focused }) => (
            <TabBarIcon Icon={Dumbbell} color={color} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="progress"
        options={{
          href: null, // Hidden until the Progress charts are built (currently a stub)
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          href: null, // Hide from tab bar
        }}
      />
    </Tabs>
  );
}
