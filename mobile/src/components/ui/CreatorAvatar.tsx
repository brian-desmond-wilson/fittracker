// A creator's face in a circle, or their initial when we have no picture:
// before the image lands, when the row has none, or when the load fails.
// The letter circle is the one the Creator picker drew before avatars
// existed, so a creator without one looks exactly as they did.
import React, { useState } from "react";
import { Image, StyleSheet, Text, View } from "react-native";
import { colors } from "@/src/theme/tokens";
import { avatarLetter, avatarUri } from "@/src/lib/creatorHandle";

interface CreatorAvatarProps {
  /** Display form is fine ("@onlinewod"); only the first letter is used. */
  handle: string;
  url: string | null;
  fetchedAt?: string | null;
  size: number;
}

export function CreatorAvatar({ handle, url, fetchedAt = null, size }: CreatorAvatarProps) {
  const uri = avatarUri(url, fetchedAt);
  // Load state belongs to ONE picture. When the picture changes under a
  // mounted instance (the detail screen moving to another workout) it is
  // reset during render — React's sanctioned way to derive state from a
  // prop without an extra effect pass — and a late load or error event
  // from the previous picture is ignored by the uri check in the setters.
  const [state, setState] = useState({ uri, loaded: false, failed: false });
  if (state.uri !== uri) setState({ uri, loaded: false, failed: false });
  const showImage = uri !== null && !state.failed;
  const round = { width: size, height: size, borderRadius: size / 2 };
  return (
    <View style={[styles.circle, round]} accessibilityIgnoresInvertColors>
      {/* The letter sits underneath until the image has painted, so the
          circle is never blank for a beat. */}
      {(!showImage || !state.loaded) && (
        <Text style={[styles.letter, { fontSize: Math.round(size * 0.43) }]}>{avatarLetter(handle)}</Text>
      )}
      {showImage && (
        <Image
          source={{ uri }}
          style={[StyleSheet.absoluteFill, round]}
          onLoad={() => setState((s) => (s.uri === uri ? { ...s, loaded: true } : s))}
          onError={() => setState((s) => (s.uri === uri ? { ...s, failed: true } : s))}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  circle: {
    backgroundColor: colors.surface2, alignItems: "center", justifyContent: "center",
    overflow: "hidden",
  },
  letter: { fontWeight: "700", color: colors.textMuted },
});
