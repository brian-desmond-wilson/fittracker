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
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const uri = failed ? null : avatarUri(url, fetchedAt);
  const round = { width: size, height: size, borderRadius: size / 2 };
  return (
    <View style={[styles.circle, round]} accessibilityIgnoresInvertColors>
      {/* The letter sits underneath until the image has painted, so the
          circle is never blank for a beat. */}
      {(!uri || !loaded) && (
        <Text style={[styles.letter, { fontSize: Math.round(size * 0.43) }]}>{avatarLetter(handle)}</Text>
      )}
      {uri && (
        <Image
          source={{ uri }}
          style={[StyleSheet.absoluteFill, round]}
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
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
