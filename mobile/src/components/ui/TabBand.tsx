// The horizontal filter band that sits under a page title.
//
// Food Inventory and the Meal Library each had their own copy of this — same
// pill-shaped count, same brand underline, same hairline closing the row — so
// a change to one silently made the two pages disagree. One component now
// owns the shape; callers supply nothing but a list and a selection.
//
// The band scrolls the selected tab into view from a real measurement rather
// than a guess at tab width, because labels here run from "Dairy" to
// "Emergency Calories" and a fixed stride puts the wrong tab under your eye.
import React, { useCallback, useEffect, useRef, useState } from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View, type StyleProp, type ViewStyle } from "react-native";
import { colors, radii, spacing, tint, typography } from "@/src/theme/tokens";

export interface TabBandItem {
  /** Identity, and what `onSelect` hands back. */
  key: string;
  label: string;
  /** Omit entirely to render a bare label — 0 still renders as "0". */
  count?: number;
}

interface TabBandProps {
  items: TabBandItem[];
  selectedKey: string | null;
  onSelect: (key: string) => void;
  /** What a count counts, for screen readers: "3 items", "3 meals". */
  countNoun?: string;
  style?: StyleProp<ViewStyle>;
}

export function TabBand({
  items,
  selectedKey,
  onSelect,
  countNoun = "items",
  style,
}: TabBandProps) {
  const scrollRef = useRef<ScrollView>(null);
  // Measured lazily as each tab lays out; a tab that has never been on screen
  // has no entry, and scrolling to it is skipped rather than guessed.
  const layouts = useRef(new Map<string, { x: number; width: number }>());
  const [viewportWidth, setViewportWidth] = useState(0);

  const rememberLayout = useCallback((key: string, x: number, width: number) => {
    layouts.current.set(key, { x, width });
  }, []);

  // Identity of the tab set, so the scroll re-runs when the tabs themselves
  // change and not merely when the selection does. Switching segment can swap
  // the whole row, which moves the selected tab without changing its key.
  const itemKeys = items.map((i) => i.key).join("\u0000");

  useEffect(() => {
    // Measurements for tabs that have gone are worse than none: a key that
    // returns later would be scrolled to where it used to be.
    for (const key of layouts.current.keys()) {
      if (!items.some((i) => i.key === key)) layouts.current.delete(key);
    }
    if (!selectedKey || viewportWidth === 0) return;
    const spot = layouts.current.get(selectedKey);
    if (!spot) return;
    // Centre it, then clamp: a tab near either end should sit at its end
    // rather than drag empty space into view.
    const centred = spot.x + spot.width / 2 - viewportWidth / 2;
    scrollRef.current?.scrollTo({ x: Math.max(0, centred), animated: true });
    // `items` is covered by `itemKeys`; depending on the array itself would
    // re-run this on every render, since callers build it inline.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedKey, viewportWidth, itemKeys]);

  return (
    <View style={[s.band, style]}>
      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        // A horizontal scroller inside a `flexGrow: 1` content container will
        // otherwise absorb whatever vertical space is going spare.
        style={s.scroller}
        contentContainerStyle={s.row}
        onLayout={(e) => setViewportWidth(e.nativeEvent.layout.width)}
      >
        {items.map((item) => {
          const selected = item.key === selectedKey;
          return (
            <TouchableOpacity
              key={item.key}
              style={s.tab}
              onPress={() => onSelect(item.key)}
              onLayout={(e) =>
                rememberLayout(item.key, e.nativeEvent.layout.x, e.nativeEvent.layout.width)
              }
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={
                item.count === undefined
                  ? item.label
                  : `${item.label}, ${item.count} ${countNoun}`
              }
            >
              {/* The count is a badge rather than trailing digits: a name and
                  a quantity are two data of different kinds and should not
                  share one text run. The pill gives the number a shape the
                  eye can skip when it is scanning names. */}
              <View style={s.tabRow}>
                <Text style={[s.label, selected && s.labelSelected]}>{item.label}</Text>
                {item.count !== undefined && (
                  <View style={[s.badge, selected && s.badgeSelected]}>
                    <Text style={[s.count, selected && s.countSelected]}>{item.count}</Text>
                  </View>
                )}
              </View>
              {selected && <View style={s.underline} />}
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  band: {
    backgroundColor: colors.bg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  scroller: { flexGrow: 0 },
  row: {
    paddingHorizontal: spacing.md,
    gap: spacing.xs,
  },
  tab: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    position: "relative",
  },
  tabRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  label: { fontSize: 15, fontWeight: "500", color: colors.textMuted },
  labelSelected: { fontWeight: "600", color: colors.text },
  badge: {
    minWidth: spacing.xl,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radii.pill,
    backgroundColor: colors.surface2,
    alignItems: "center",
  },
  // Selected is a control state, so the badge follows the underline to brand.
  badgeSelected: { backgroundColor: tint(colors.brand) },
  count: { ...typography.caption, fontWeight: "600" },
  countSelected: { color: colors.brand },
  // Brand, not the page's accent: an active tab is a control state (§6).
  underline: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: colors.brand,
  },
});
