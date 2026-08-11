// mobile/src/components/ui/Screen.tsx
import React from "react";
import { ScrollView, StatusBar, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import type { RefreshControlProps } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ChevronLeft } from "lucide-react-native";
import type { LucideIcon } from "lucide-react-native";
import { AccentKey, colors, icons, spacing, typography } from "@/src/theme/tokens";

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
  /**
   * default true; pass false when the screen owns a FlatList/SectionList.
   * The header-only path applies neither the horizontal gutter nor the bottom
   * inset that the scrolling path gets for free — when false, the screen's own
   * list must supply both itself: `paddingHorizontal: spacing.screenGutter`
   * and `paddingBottom: insets.bottom + spacing.xxl` in its `contentContainerStyle`.
   */
  scroll?: boolean;
  /** Forwarded to the internal ScrollView (scroll=true only). Closes the gap
   *  recorded in the style-guide amendments (pull-to-refresh screens).
   *  The `scroll={false}` path renders no ScrollView, so it ignores this.
   *  Typed `ReactElement<RefreshControlProps>` rather than a bare
   *  `ReactElement`: React 19's types default element props to `unknown`, so
   *  the looser form is not assignable to what `ScrollView` accepts. */
  refreshControl?: React.ReactElement<RefreshControlProps>;
  children: React.ReactNode;
}

export function Screen({
  variant, title, accent, icon: Icon, onBack, headerCenter, headerRight,
  scroll = true, refreshControl, children,
}: ScreenProps) {
  const insets = useSafeAreaInsets();
  const titleGlyphColor = colors.accents[accent ?? "brand"];
  const backButton = onBack ? (
    <TouchableOpacity onPress={onBack} style={styles.back} activeOpacity={0.7}
      accessibilityRole="button" accessibilityLabel="Back">
      <ChevronLeft size={icons.lg} color={colors.text} strokeWidth={icons.strokeWidth} />
    </TouchableOpacity>
  ) : null;
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
          {variant === "detail" ? (
            <>
              <View style={styles.flank}>{backButton}</View>
              <Text style={[typography.titleBar, styles.barTitle]} numberOfLines={1}>{title}</Text>
              <View style={[styles.flank, styles.flankRight]}>{headerRight}</View>
            </>
          ) : (
            <>
              {backButton}
              <View style={styles.center}>{headerCenter}</View>
              {headerRight}
            </>
          )}
        </View>
        {scroll ? (
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + spacing.xxl }]}
            showsVerticalScrollIndicator={false}
            refreshControl={refreshControl}
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
  flank: { flex: 1, minWidth: 32, alignItems: "flex-start" },
  flankRight: { alignItems: "flex-end" },
  barTitle: { flexShrink: 1, textAlign: "center", color: colors.text },
  titleRow: {
    flexDirection: "row", alignItems: "center", gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  titleText: { color: colors.text },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: spacing.screenGutter, gap: spacing.lg },
});
