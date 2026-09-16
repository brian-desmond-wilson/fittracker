import React, { useEffect } from "react";
import { View, Text, StyleSheet, ScrollView } from "react-native";
import { Calendar } from "lucide-react-native";
import { colors, tint } from "@/src/theme/tokens";

interface WorkoutsTabProps {
  onCountUpdate?: (count: number) => void;
}

export default function WorkoutsTab({ onCountUpdate }: WorkoutsTabProps) {
  useEffect(() => {
    onCountUpdate?.(0);
  }, []);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.comingSoonCard}>
        <View style={styles.iconContainer}>
          <Calendar size={48} color={colors.tier} strokeWidth={1.5} />
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
    backgroundColor: colors.bg,
  },
  content: {
    padding: 20,
  },
  comingSoonCard: {
    marginTop: 60,
    padding: 32,
    backgroundColor: tint(colors.tier, 0.1),
    borderRadius: 16,
    borderWidth: 1,
    borderColor: tint(colors.tier, 0.3),
    alignItems: "center",
  },
  iconContainer: {
    marginBottom: 20,
    padding: 16,
    backgroundColor: tint(colors.tier),
    borderRadius: 50,
  },
  comingSoonTitle: {
    fontSize: 24,
    fontWeight: "bold",
    color: colors.tier,
    marginBottom: 12,
  },
  comingSoonText: {
    fontSize: 16,
    color: colors.text,
    textAlign: "center",
    marginBottom: 16,
  },
  comingSoonDescription: {
    fontSize: 14,
    color: colors.textMuted,
    textAlign: "center",
    lineHeight: 20,
  },
});
