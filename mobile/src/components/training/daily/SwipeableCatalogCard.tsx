// A captured exercise card that can be swiped away.
//
// The confirmation is worth its length: "delete" means two different things
// here depending on how the exercise got into the catalog, and the person
// should know which one they are about to do before they do it.
import React, { useRef } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Alert, Image } from "react-native";
import { Swipeable } from "react-native-gesture-handler";
import { ChevronRight } from "lucide-react-native";
import { colors } from "@/src/lib/colors";
import { supabase } from "@/src/lib/supabase";
import { deleteCatalogExercise } from "@/src/lib/supabase/capture";
import { SwipeDeleteAction } from "@/src/components/ui/SwipeDeleteAction";
import type { CatalogEntry } from "@/src/types/capture";

const CARD_RADIUS = 12;

interface SwipeableCatalogCardProps {
  entry: CatalogEntry;
  onPress: () => void;
  /** Reload the list — the tab's count comes from it. */
  onDeleted: () => void;
}

export function SwipeableCatalogCard({
  entry,
  onPress,
  onDeleted,
}: SwipeableCatalogCardProps) {
  const swipeableRef = useRef<Swipeable>(null);
  const close = () => swipeableRef.current?.close();

  const handleDelete = () => {
    Alert.alert(
      "Remove exercise",
      `Remove "${entry.name}" from your catalog? If this capture created it, the exercise goes; if it matched something already in your library, only the link to the post goes.`,
      [
        { text: "Cancel", style: "cancel", onPress: close },
        {
          text: "Remove",
          style: "destructive",
          onPress: async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) {
              Alert.alert("Not signed in", "Sign in again and try that once more.");
              close();
              return;
            }
            const result = await deleteCatalogExercise(entry.exerciseId, user.id);
            if (!result.ok) {
              Alert.alert("Kept it", result.reason);
              close();
              return;
            }
            onDeleted();
          },
        },
      ],
    );
  };

  return (
    <Swipeable
      ref={swipeableRef}
      renderRightActions={(progress) => (
        <SwipeDeleteAction
          progress={progress}
          onPress={handleDelete}
          radius={CARD_RADIUS}
          accessibilityLabel={`Remove ${entry.name}`}
        />
      )}
      overshootRight={false}
      friction={2}
      containerStyle={styles.swipeContainer}
    >
      <TouchableOpacity
        style={styles.card}
        activeOpacity={0.7}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`${entry.name}. Open the exercise.`}
      >
        {entry.sources[0]?.thumbnailUrl && (
          <Image source={{ uri: entry.sources[0].thumbnailUrl }} style={styles.thumb} />
        )}
        <View style={styles.cardBody}>
          <Text style={styles.cardName}>{entry.name}</Text>
          <Text style={styles.cardMeta}>
            {[
              entry.skillLevel,
              entry.muscles.filter((m) => m.isPrimary).map((m) => m.name).join(", ") || null,
              entry.equipmentTypes.join(", ") || "no equipment",
            ].filter(Boolean).join(" · ")}
          </Text>
          {/* Credit where it's due, but not a second tap target: the whole
              card belongs to the exercise page. */}
          {entry.sources[0] && (
            <Text style={styles.sourceText}>
              {entry.sources[0].posterHandle ?? entry.sources[0].platform}
            </Text>
          )}
        </View>
        <View style={styles.chevron}>
          <ChevronRight size={18} color={colors.mutedForeground} />
        </View>
      </TouchableOpacity>
    </Swipeable>
  );
}

const styles = StyleSheet.create({
  // The gap between cards lives out here: inside the Swipeable it would leave
  // a stripe of red showing under the next card.
  swipeContainer: { marginBottom: 12 },
  card: {
    flexDirection: "row", backgroundColor: colors.muted,
    borderRadius: CARD_RADIUS, borderWidth: 1, borderColor: colors.border,
    overflow: "hidden",
  },
  thumb: { width: 72, height: 72 },
  cardBody: { flex: 1, padding: 12 },
  cardName: { fontSize: 16, fontWeight: "600", color: colors.foreground },
  cardMeta: { fontSize: 13, color: colors.mutedForeground, marginTop: 2 },
  chevron: { alignSelf: "center", paddingRight: 12 },
  sourceText: { fontSize: 13, color: colors.mutedForeground, marginTop: 6 },
});
