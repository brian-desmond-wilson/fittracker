import { Stack } from "expo-router";

export default function TrackLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen name="food-inventory/index" />
      <Stack.Screen name="food-inventory/[id]" />
      <Stack.Screen name="food-inventory/edit/[id]" />
      <Stack.Screen name="food-inventory/add" />
      <Stack.Screen name="food-inventory/preview" />
      <Stack.Screen name="food-inventory/delivery" />
      <Stack.Screen name="deliveries/index" />
      <Stack.Screen name="deliveries/edit/[id]" />
      <Stack.Screen name="shopping/index" />
      <Stack.Screen name="loop" />
      <Stack.Screen name="fuel" />
      <Stack.Screen name="meal-library/index" />
      <Stack.Screen name="meal-library/[id]" />
      <Stack.Screen name="meal-library/new" />
      <Stack.Screen name="water" />
      <Stack.Screen name="weight" />
      <Stack.Screen name="measurements" />
      <Stack.Screen name="photos" />
      <Stack.Screen name="gym-sessions/index" />
      <Stack.Screen name="gym-sessions/[id]" />
    </Stack>
  );
}
