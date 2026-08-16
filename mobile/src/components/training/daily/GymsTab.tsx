import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { colors } from "@/src/lib/colors";

export default function GymsTab() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Gyms</Text>
      <Text style={styles.text}>
        Gym equipment profiles arrive in Phase 2 — set what each gym has, and
        the recommender only programs what you can actually do there.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, padding: 40, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 18, fontWeight: "bold", color: colors.foreground, marginBottom: 8 },
  text: { fontSize: 14, color: colors.mutedForeground, textAlign: "center", lineHeight: 20 },
});
