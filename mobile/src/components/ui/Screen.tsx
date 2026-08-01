// mobile/src/components/ui/Screen.tsx
import React from "react";
import { ScrollView, StatusBar, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ChevronLeft } from "lucide-react-native";
import type { LucideIcon } from "lucide-react-native";
import { AccentKey, colors, icons, radii, spacing, typography } from "@/src/theme/tokens";

interface ScreenProps {
  variant: "root" | "detail";
  title: string;
  /** root: colors the title glyph */
  accent?: AccentKey;
  /** root: glyph rendered beside the 28pt title */
  icon?: LucideIcon;
  onBack?: () => void;
  /** root: chrome-bar middle slot (e.g. search pill); detail: unused */
  headerCenter?: React.ReactNode;
  /** both: right slot (IconButton, ghost action, etc.) */
  headerRight?: React.ReactNode;
  /** default true; pass false when the screen owns a FlatList/SectionList */
  scroll?: boolean;
  children: React.ReactNode;
}

export function Screen({
  variant, title, accent, icon: Icon, onBack, headerCenter, headerRight,
  scroll = true, children,
}: ScreenProps) {
  const insets = useSafeAreaInsets();
  const titleGlyphColor = colors.accents[accent ?? "brand"];
  const body = variant === "root" ? (
    <>
      <View style={styles.titleRow}>
        {Icon ? <Icon size={26} color={titleGlyphColor} strokeWidth={icons.strokeWidth} /> : null}
        <Text style={[typography.titleRoot, styles.titleText]}>{title}</Text>
      </View>
      {children}
    </>
  ) : (
    children
  );
  return (
    <>
      <StatusBar barStyle="light-content" />
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={[styles.chrome, variant === "detail" && styles.chromeBordered]}>
          {onBack ? (
            <TouchableOpacity onPress={onBack} style={styles.back} activeOpacity={0.7}
              accessibilityRole="button" accessibilityLabel="Back">
              <ChevronLeft size={icons.lg} color={colors.text} strokeWidth={icons.strokeWidth} />
            </TouchableOpacity>
          ) : variant === "detail" ? (
            <View style={styles.back} />
          ) : null}
          {variant === "detail" ? (
            <Text style={[typography.titleBar, styles.barTitle]} numberOfLines={1}>{title}</Text>
          ) : (
            <View style={styles.center}>{headerCenter}</View>
          )}
          {headerRight ?? (variant === "detail" ? <View style={styles.back} /> : null)}
        </View>
        {scroll ? (
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + spacing.xxl }]}
            showsVerticalScrollIndicator={false}
          >
            {body}
          </ScrollView>
        ) : (
          <View style={styles.scroll}>{body}</View>
        )}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  chrome: {
    flexDirection: "row", alignItems: "center", gap: spacing.sm,
    paddingHorizontal: spacing.screenGutter, paddingVertical: spacing.md,
  },
  chromeBordered: { borderBottomWidth: 1, borderBottomColor: colors.border },
  back: { width: 32, alignItems: "flex-start", justifyContent: "center" },
  center: { flex: 1 },
  barTitle: { flex: 1, textAlign: "center", color: colors.text },
  titleRow: {
    flexDirection: "row", alignItems: "center", gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  titleText: { color: colors.text },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: spacing.screenGutter, gap: spacing.lg },
});
