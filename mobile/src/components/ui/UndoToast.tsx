// mobile/src/components/ui/UndoToast.tsx
//
// What just happened, what it left behind, and a way back — stated once and
// then gone. An alert would be worse than the problem it reports: it demands a
// dismissal for something the user meant to do. This is the idiom for a small
// target's mis-tap, where the correction otherwise means opening the thing and
// editing a number back up.
//
// The bar owns its own animation and its own clock so the screens that raise it
// only decide what it says. It also keeps a private copy of that content: a
// caller who clears the toast the instant Undo is pressed still gets the exit
// animation rather than a component that vanishes mid-fade.
import React, { useEffect, useRef, useState } from "react";
import { Animated, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Undo2, type LucideIcon } from "lucide-react-native";
import { colors, elevation, icons, radii, spacing, tint, typography } from "@/src/theme/tokens";

export interface UndoToastContent {
  title: string;
  detail: string;
  /** Present only when the action is reversible. */
  undo?: () => void;
}

interface UndoToastProps {
  /** The live message, or null to take it down. */
  toast: UndoToastContent | null;
  /** Fired once the bar has left of its own accord, so the caller can clear state. */
  onDismissed: () => void;
  /** The verb that produced it — a minus for a decrement, a check for a log. */
  icon: LucideIcon;
  /** Long enough to read the line and reach Undo. */
  durationMs?: number;
  /**
   * Distance from the bottom of the parent. The default suits a screen laid out
   * inside the tab navigator's content area, whose own bottom edge already sits
   * above the tab bar — no clearance for it, and no safe-area inset either.
   */
  bottom?: number;
}

const FADE_MS = 180;

export function UndoToast({
  toast,
  onDismissed,
  icon: Icon,
  durationMs = 2400,
  bottom = spacing.xl,
}: UndoToastProps) {
  const [shown, setShown] = useState<UndoToastContent | null>(toast);
  const anim = useRef(new Animated.Value(0)).current;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Held in a ref so a caller's inline arrow doesn't restart the clock on every
  // render of the screen above.
  const onDismissedRef = useRef(onDismissed);
  onDismissedRef.current = onDismissed;

  useEffect(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }

    if (toast) {
      setShown(toast);
      Animated.timing(anim, { toValue: 1, duration: FADE_MS, useNativeDriver: true }).start();
      timer.current = setTimeout(() => {
        Animated.timing(anim, { toValue: 0, duration: FADE_MS, useNativeDriver: true })
          .start(({ finished }) => {
            if (!finished) return;
            setShown(null);
            onDismissedRef.current();
          });
      }, durationMs);
    } else {
      Animated.timing(anim, { toValue: 0, duration: FADE_MS, useNativeDriver: true })
        .start(({ finished }) => { if (finished) setShown(null); });
    }

    // A pending timer outliving the screen would set state on an unmounted tree.
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [toast, durationMs, anim]);

  if (!shown) return null;

  return (
    <Animated.View
      // "box-none", not "none": the bar itself must stay transparent to taps
      // aimed at whatever is beneath it, but Undo has to be reachable.
      pointerEvents="box-none"
      style={[
        styles.toast,
        {
          bottom,
          opacity: anim,
          transform: [{
            translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }),
          }],
        },
      ]}
      accessibilityLiveRegion="polite"
    >
      <Icon size={icons.sm} color={colors.brand} strokeWidth={icons.strokeWidth} />
      <View style={styles.text}>
        <Text style={styles.title} numberOfLines={1}>{shown.title}</Text>
        <Text style={typography.caption} numberOfLines={1}>{shown.detail}</Text>
      </View>
      {shown.undo && (
        <TouchableOpacity
          onPress={shown.undo}
          style={styles.undo}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          accessibilityRole="button"
          accessibilityLabel="Undo"
        >
          <Undo2 size={icons.sm} color={colors.brand} strokeWidth={icons.strokeWidth} />
          <Text style={styles.undoLabel}>Undo</Text>
        </TouchableOpacity>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  // Fill alone could not separate this from the page: the palette has three
  // neutrals and `surface2`, the lightest, is what every other raised panel
  // already uses. `elevation.overlay` is the answer — the toast floats rather
  // than sits. The outline is brand at low alpha rather than `border`, which on
  // this fill differs by about one step per channel and would contribute
  // nothing; it also ties the edge to the green glyph.
  toast: {
    position: "absolute",
    left: spacing.screenGutter, right: spacing.screenGutter,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radii.row,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: tint(colors.brand, 0.4),
    ...elevation.overlay,
  },
  text: { flex: 1, minWidth: 0 },
  title: { ...typography.buttonSm, color: colors.text },
  undo: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  undoLabel: { ...typography.buttonSm, color: colors.brand },
});
