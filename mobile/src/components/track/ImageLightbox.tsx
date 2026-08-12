// Full-screen product photos.
//
// The detail page shows images in a contained well, which is right for the
// page — it keeps a white band from flooding a dark theme — but too small to
// read what is printed on a packet. Tapping one opens it here at full size,
// where the point is the photograph and nothing else competes with it.
import React, { useRef, useState } from "react";
import {
  Dimensions, Image, Modal, NativeScrollEvent, NativeSyntheticEvent,
  ScrollView, StyleSheet, Text, TouchableOpacity, View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { X } from "lucide-react-native";
import { colors, icons, radii, spacing, typography } from "@/src/theme/tokens";

interface ImageLightboxProps {
  visible: boolean;
  images: string[];
  /** Which image was tapped, so it opens on that one rather than the first. */
  initialIndex: number;
  onClose: () => void;
}

const { width: SCREEN_WIDTH } = Dimensions.get("window");

export function ImageLightbox({ visible, images, initialIndex, onClose }: ImageLightboxProps) {
  const insets = useSafeAreaInsets();
  const [index, setIndex] = useState(initialIndex);
  const scrollRef = useRef<ScrollView>(null);

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    setIndex(Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH));
  };

  return (
    <Modal
      visible={visible}
      animationType="fade"
      // Full screen rather than a sheet: this is the photograph, not a panel
      // about the photograph. onRequestClose carries the Android back button.
      onRequestClose={onClose}
      // Remounting on each open is what makes `contentOffset` land on the
      // tapped image — a persistent scroller would keep its old position.
      key={`${visible}:${initialIndex}`}
    >
      <View style={styles.backdrop}>
        <ScrollView
          ref={scrollRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={onScroll}
          contentOffset={{ x: initialIndex * SCREEN_WIDTH, y: 0 }}
        >
          {images.map((uri, i) => (
            // Tapping the image itself dismisses, the way every photo viewer
            // behaves. The close button stays for discoverability.
            <TouchableOpacity
              key={`${uri}:${i}`}
              style={styles.page}
              activeOpacity={1}
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel={`Close photo ${i + 1} of ${images.length}`}
            >
              <Image source={{ uri }} style={styles.image} resizeMode="contain" />
            </TouchableOpacity>
          ))}
        </ScrollView>

        <TouchableOpacity
          style={[styles.close, { top: insets.top + spacing.md }]}
          onPress={onClose}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          accessibilityRole="button"
          accessibilityLabel="Close"
        >
          <X size={icons.md} color={colors.text} strokeWidth={icons.strokeWidth} />
        </TouchableOpacity>

        {images.length > 1 && (
          <Text style={[styles.counter, { bottom: insets.bottom + spacing.xl }]}>
            {index + 1} of {images.length}
          </Text>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  // Not `bg`: a product shot is a photograph, and photographs are shown on
  // black so nothing around them tints what you are trying to read.
  backdrop: { flex: 1, backgroundColor: colors.labelInk },
  page: { width: SCREEN_WIDTH, flex: 1, alignItems: "center", justifyContent: "center" },
  image: { width: SCREEN_WIDTH, height: "100%" },
  close: {
    position: "absolute", right: spacing.screenGutter,
    width: 36, height: 36, borderRadius: radii.pill,
    alignItems: "center", justifyContent: "center",
    backgroundColor: colors.surface,
    borderWidth: 1, borderColor: colors.border,
  },
  counter: {
    ...typography.caption, color: colors.textMuted,
    position: "absolute", alignSelf: "center",
  },
});
