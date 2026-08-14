import React from "react";
import { StyleSheet, Text, View } from "react-native";
import type { LucideIcon } from "lucide-react-native";
import { AccentKey, colors, icons, spacing, typography } from "@/src/theme/tokens";
import { Card } from "@/src/components/ui";

interface TrackingCardProps {
  title: string;
  icon: LucideIcon;
  accent: AccentKey;
  onPress: () => void;
  /**
   * One quiet line under the title, for a tile with something live to say
   * ("7 meals · Sun 7:00 PM").
   *
   * Optional and absent by default, because most tiles have nothing to report
   * and a caption slot held open with a placeholder is worse than no slot at
   * all. A caption is decoration in the strict sense: it must never be the only
   * way to learn something, and a tile whose data failed to load simply has no
   * caption rather than an error where its subtitle goes.
   */
  caption?: string | null;
}

export function TrackingCard({
  title, icon: Icon, accent, onPress, caption,
}: TrackingCardProps) {
  return (
    <Card variant="tile" accent={accent} onPress={onPress} style={styles.grow}>
      <Icon size={icons.xl} color={colors.accents[accent]} strokeWidth={icons.strokeWidth} />
      {/* Grouped so `space-between` on the tile keeps the pair together at the
          bottom rather than pushing the caption away from its own title. */}
      <View>
        <Text style={styles.title}>{title}</Text>
        {caption ? (
          <Text style={styles.caption} numberOfLines={1}>{caption}</Text>
        ) : null}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  grow: { flex: 1 },
  title: { ...typography.rowTitle, color: colors.text, marginTop: spacing.sm },
  caption: { ...typography.caption, fontSize: 11, marginTop: 2 },
});
