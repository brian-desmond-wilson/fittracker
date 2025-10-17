import React from "react";
import { View, Text, StyleSheet, ScrollView } from "react-native";
import { Dumbbell } from "lucide-react-native";
import { colors } from "@/src/lib/colors";

export default function ExercisesTab() {
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.comingSoonCard}>
        <View style={styles.iconContainer}>
          <Dumbbell size={48} color="#8B5CF6" strokeWidth={1.5} />
        </View>
        <Text style={styles.comingSoonTitle}>Coming Soon</Text>
        <Text style={styles.comingSoonText}>
          Exercise library and exercise history features are currently under development.
        </Text>
        <Text style={styles.comingSoonDescription}>
          This tab will show the complete exercise library with video demonstrations, your personal
          records, and exercise performance history.
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
    backgroundColor: "rgba(139, 92, 246, 0.1)",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(139, 92, 246, 0.3)",
    alignItems: "center",
  },
  iconContainer: {
    marginBottom: 20,
    padding: 16,
    backgroundColor: "rgba(139, 92, 246, 0.15)",
    borderRadius: 50,
  },
  comingSoonTitle: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#8B5CF6",
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
