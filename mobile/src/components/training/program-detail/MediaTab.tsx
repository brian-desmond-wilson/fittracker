import React from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from "react-native";
import { Play, FileText, Download } from "lucide-react-native";
import { colors } from "@/src/lib/colors";

interface MediaTabProps {
  programId: string;
}

// Mock media data
const MOCK_VIDEOS = [
  { id: "1", title: "Program Overview & Introduction", duration: "12:34" },
  { id: "2", title: "Exercise Technique Demonstrations", duration: "25:11" },
  { id: "3", title: "Progressive Overload Strategies", duration: "18:45" },
];

const MOCK_RESOURCES = [
  { id: "1", title: "Training Log Template", size: "245 KB" },
  { id: "2", title: "Nutrition Guidelines", size: "1.2 MB" },
  { id: "3", title: "Exercise Library PDF", size: "3.8 MB" },
];

export default function MediaTab({ programId }: MediaTabProps) {
  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {/* Instructional Videos */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Instructional Videos</Text>
        {MOCK_VIDEOS.map((video) => (
          <TouchableOpacity key={video.id} style={styles.videoCard} activeOpacity={0.7}>
            <View style={styles.videoThumbnail}>
              <Play size={28} color="#FFFFFF" fill="#FFFFFF" />
            </View>
            <View style={styles.videoInfo}>
              <Text style={styles.videoTitle}>{video.title}</Text>
              <Text style={styles.videoDuration}>{video.duration}</Text>
            </View>
          </TouchableOpacity>
        ))}
      </View>

      {/* Program Resources */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Program Resources</Text>
        {MOCK_RESOURCES.map((resource) => (
          <TouchableOpacity key={resource.id} style={styles.resourceCard} activeOpacity={0.7}>
            <View style={styles.resourceIcon}>
              <FileText size={24} color={colors.primary} />
            </View>
            <View style={styles.resourceInfo}>
              <Text style={styles.resourceTitle}>{resource.title}</Text>
              <Text style={styles.resourceSize}>{resource.size}</Text>
            </View>
            <Download size={20} color={colors.mutedForeground} />
          </TouchableOpacity>
        ))}
      </View>

      <View style={{ height: 40 }} />
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
  section: {
    marginBottom: 32,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: colors.foreground,
    marginBottom: 16,
  },
  videoCard: {
    flexDirection: "row",
    backgroundColor: colors.secondary,
    borderRadius: 12,
    overflow: "hidden",
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  videoThumbnail: {
    width: 120,
    height: 80,
    backgroundColor: "#1a1a1a",
    justifyContent: "center",
    alignItems: "center",
  },
  videoInfo: {
    flex: 1,
    padding: 12,
    justifyContent: "center",
  },
  videoTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: colors.foreground,
    marginBottom: 6,
  },
  videoDuration: {
    fontSize: 13,
    color: colors.mutedForeground,
  },
  resourceCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.secondary,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 12,
  },
  resourceIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "rgba(34, 197, 94, 0.15)",
    justifyContent: "center",
    alignItems: "center",
  },
  resourceInfo: {
    flex: 1,
  },
  resourceTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: colors.foreground,
    marginBottom: 4,
  },
  resourceSize: {
    fontSize: 13,
    color: colors.mutedForeground,
  },
});
