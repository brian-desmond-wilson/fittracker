import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { colors } from "@/src/lib/colors";

export default function TodayTab() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Today's session</Text>
      <Text style={styles.text}>
        The daily recommender arrives in Phase 2. Start capturing exercises in
        the Catalog tab — everything you save becomes raw material for it.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, padding: 40, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 18, fontWeight: "bold", color: colors.foreground, marginBottom: 8 },
  text: { fontSize: 14, color: colors.mutedForeground, textAlign: "center", lineHeight: 20 },
});
