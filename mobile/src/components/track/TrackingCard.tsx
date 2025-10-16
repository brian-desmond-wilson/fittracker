import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { LucideIcon } from "lucide-react-native";
import { colors } from "@/src/lib/colors";

interface TrackingCardProps {
  title: string;
  icon: LucideIcon;
  iconColor: string;
  backgroundColor: string;
  onPress: () => void;
}

export function TrackingCard({
  title,
  icon: Icon,
  iconColor,
  backgroundColor,
  onPress,
}: TrackingCardProps) {
  return (
    <TouchableOpacity
      style={[styles.card, { backgroundColor }]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={styles.iconContainer}>
        <Icon size={32} color={iconColor} strokeWidth={2} />
      </View>
      <Text style={styles.title}>{title}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    aspectRatio: 1,
    borderRadius: 16,
    padding: 16,
    justifyContent: "space-between",
    minHeight: 140,
    maxHeight: 180,
  },
  iconContainer: {
    alignSelf: "flex-start",
  },
  title: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.foreground,
    marginTop: 8,
  },
});
