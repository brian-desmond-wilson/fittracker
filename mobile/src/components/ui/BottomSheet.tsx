// mobile/src/components/ui/BottomSheet.tsx
//
// The one bottom-sheet frame: a translucent scrim that closes on tap, a
// panel that rises from the bottom with the grab handle, and a bottom inset
// that clears the home indicator. Every picker and short form in the app
// comes up this way (the rule in WhenSheet's header), and before this file
// six of them each drew the frame by hand with different radii, handle
// widths and bottom padding.
//
// What stays with the caller: the header row. Some sheets close with an X,
// some with Done, one centres its title — that is content, not frame.
//
// The keyboard is always avoided. On a sheet without a text field the
// avoiding view never moves, so the cost of not asking is nothing and the
// forms that need it cannot forget to.
import React from "react";
import {
  KeyboardAvoidingView, Modal, Platform, StyleSheet, TouchableOpacity, View,
} from "react-native";
import type { StyleProp, ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, radii, spacing } from "@/src/theme/tokens";

interface BottomSheetProps {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
  /** Read out for the scrim. Say what closes: "Close sort", not "Close". */
  closeLabel?: string;
  /** Inset the content on all sides. Pass false for full-bleed rows that
   *  carry their own gutters. */
  padded?: boolean;
  /** Cap the panel's height; anything taller scrolls inside the caller's
   *  own ScrollView. */
  maxHeight?: ViewStyle["maxHeight"];
  /** Last word on the panel's style — a different padding or a gap. */
  style?: StyleProp<ViewStyle>;
}

export function BottomSheet({
  visible, onClose, children, closeLabel = "Close", padded = true, maxHeight, style,
}: BottomSheetProps) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.scrim}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        {/* Tapping the dimmed area is the gesture people try first. */}
        <TouchableOpacity
          style={styles.scrimTap}
          activeOpacity={1}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={closeLabel}
        />
        <View
          style={[
            styles.panel,
            padded && styles.padded,
            maxHeight !== undefined && { maxHeight },
            // The larger of the old fixed padding and the real inset: a
            // phone with a home indicator gets clearance, one without keeps
            // the room the layouts were drawn with.
            { paddingBottom: Math.max(spacing.xxxl, insets.bottom + spacing.lg) },
            style,
          ]}
        >
          <View style={styles.grab} />
          {children}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: colors.scrim, justifyContent: "flex-end" },
  scrimTap: { flex: 1 },
  panel: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radii.panel,
    borderTopRightRadius: radii.panel,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  padded: { paddingHorizontal: spacing.xl, paddingTop: spacing.xl },
  grab: {
    width: 36, height: 4, borderRadius: 2, backgroundColor: colors.textFaint,
    alignSelf: "center", marginBottom: spacing.md,
  },
});
