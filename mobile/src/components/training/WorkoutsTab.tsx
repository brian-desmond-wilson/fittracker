import React from "react";
import { View, Text, StyleSheet, ScrollView } from "react-native";
import { Calendar } from "lucide-react-native";
import { colors } from "@/src/lib/colors";

export default function WorkoutsTab() {
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.comingSoonCard}>
        <View style={styles.iconContainer}>
          <Calendar size={48} color="#3B82F6" strokeWidth={1.5} />
        </View>
        <Text style={styles.comingSoonTitle}>Coming Soon</Text>
        <Text style={styles.comingSoonText}>
          Standalone workouts and workout calendar features are currently under development.
        </Text>
        <Text style={styles.comingSoonDescription}>
          This tab will show your scheduled workouts, custom workouts, and workout history across
          all programs.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: 20,
  },
  comingSoonCard: {
    marginTop: 60,
    padding: 32,
    backgroundColor: "rgba(59, 130, 246, 0.1)",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(59, 130, 246, 0.3)",
    alignItems: "center",
  },
  iconContainer: {
    marginBottom: 20,
    padding: 16,
    backgroundColor: "rgba(59, 130, 246, 0.15)",
    borderRadius: 50,
  },
  comingSoonTitle: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#3B82F6",
    marginBottom: 12,
  },
  comingSoonText: {
    fontSize: 16,
    color: colors.foreground,
    textAlign: "center",
    marginBottom: 16,
  },
  comingSoonDescription: {
    fontSize: 14,
    color: colors.mutedForeground,
    textAlign: "center",
    lineHeight: 20,
  },
});
