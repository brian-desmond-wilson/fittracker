import { Stack } from "expo-router";

export default function TrackLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen name="food-inventory" />
      <Stack.Screen name="meals" />
      <Stack.Screen name="water" />
      <Stack.Screen name="weight" />
      <Stack.Screen name="measurements" />
      <Stack.Screen name="photos" />
      <Stack.Screen name="workouts" />
      <Stack.Screen name="sleep" />
    </Stack>
  );
}
