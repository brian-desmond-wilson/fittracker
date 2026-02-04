import { Tabs } from "expo-router";
import { Home, Calendar, Plus, TrendingUp, Dumbbell } from "lucide-react-native";
import { TabBarIcon } from "@/src/components/TabBarIcon";

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: "hsl(217.2, 32.6%, 17.5%)",
          borderTopWidth: 1,
          borderTopColor: "#64748B",
          paddingBottom: 24,
          paddingTop: 12,
          height: 88,
          shadowColor: "#64748B",
          shadowOffset: { width: 0, height: -1 },
          shadowOpacity: 0.3,
          shadowRadius: 0,
          elevation: 0,
        },
        tabBarActiveTintColor: "hsl(142, 76%, 36%)",
        tabBarInactiveTintColor: "hsl(215, 20.2%, 65.1%)",
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: "500",
          marginBottom: 4,
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
          title: "Progress",
          tabBarIcon: ({ color, focused }) => (
            <TabBarIcon Icon={TrendingUp} color={color} focused={focused} />
          ),
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
