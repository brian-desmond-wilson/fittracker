// mobile/src/components/training/item-detail/DemoVideoCard.tsx
// Spec §4.7: a preview card (neutral tile, play glyph, source label) that
// opens the video, and under it "Find a demo ›" — a YouTube search for the
// exercise name that renders whether or not a video is set, so a poor
// default can always be replaced through the edit wizard (decision 8).
import React from "react";
import { View, Text, StyleSheet, TouchableOpacity, Linking } from "react-native";
import { ChevronRight, Play } from "lucide-react-native";
import { colors, radii, spacing } from "@/src/theme/tokens";
import { demoSearchUrl, videoSourceLabel } from "@/src/lib/demoVideo";

interface DemoVideoCardProps {
  videoUrl: string | null;
  exerciseName: string;
}

export function DemoVideoCard({ videoUrl, exerciseName }: DemoVideoCardProps) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Demo Video</Text>
      {videoUrl && (
        <TouchableOpacity style={styles.card} onPress={() => Linking.openURL(videoUrl)} activeOpacity={0.8}
          accessibilityRole="link" accessibilityLabel={`Watch the demo on ${videoSourceLabel(videoUrl)}`}>
          <View style={styles.play}>
            <Play size={22} color={colors.onBrand} fill={colors.onBrand} />
          </View>
          <View style={styles.sourceTag}>
            <Text style={styles.sourceText}>{videoSourceLabel(videoUrl)}</Text>
          </View>
        </TouchableOpacity>
      )}
      <TouchableOpacity style={styles.find} onPress={() => Linking.openURL(demoSearchUrl(exerciseName))}
        accessibilityRole="link" accessibilityLabel="Find a demo on YouTube">
        <Text style={styles.findText}>Find a demo</Text>
        <ChevronRight size={16} color={colors.brand} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { padding: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.border },
  sectionTitle: { fontSize: 18, fontWeight: "600", color: colors.text, marginBottom: spacing.md },
  card: {
    height: 160, borderRadius: radii.row, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border,
    alignItems: "center", justifyContent: "center", overflow: "hidden",
  },
  play: { width: 52, height: 52, borderRadius: 26, backgroundColor: colors.brand, alignItems: "center", justifyContent: "center", paddingLeft: 3 },
  sourceTag: {
    position: "absolute", left: spacing.md, bottom: spacing.md,
    paddingHorizontal: spacing.sm, paddingVertical: 3, borderRadius: radii.control, backgroundColor: colors.surface,
  },
  sourceText: { fontSize: 11, fontWeight: "700", color: colors.textMuted, letterSpacing: 0.5 },
  find: { flexDirection: "row", alignItems: "center", gap: 2, paddingTop: spacing.md, alignSelf: "flex-start" },
  findText: { fontSize: 14, fontWeight: "600", color: colors.brand },
});
