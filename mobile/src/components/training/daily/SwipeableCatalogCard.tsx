// A captured exercise card that can be swiped away.
//
// The confirmation is worth its length: "delete" means two different things
// here depending on how the exercise got into the catalog, and the person
// should know which one they are about to do before they do it.
import React, { useRef } from "react";
import { StyleSheet, Alert } from "react-native";
import { Swipeable } from "react-native-gesture-handler";
import { ChevronRight } from "lucide-react-native";
import { colors, spacing } from "@/src/theme/tokens";
import { supabase } from "@/src/lib/supabase";
import { deleteCatalogExercise } from "@/src/lib/supabase/capture";
import { catalogCardFacts } from "@/src/lib/catalogCardFacts";
import { SwipeDeleteAction } from "@/src/components/ui/SwipeDeleteAction";
import { ExerciseCardContent } from "@/src/components/training/daily/ExerciseCardContent";
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
  const facts = catalogCardFacts(entry);
  const a11y = [
    entry.name,
    facts.badge?.label,
    facts.skillLevel,
    facts.equipment.length ? facts.equipment.join(", ") : null,
    facts.primaryMuscle ? `Primary ${facts.primaryMuscle}` : null,
    facts.secondaryMuscles.length ? `also ${facts.secondaryMuscles.join(", ")}` : null,
    facts.scoringTypes.length ? `scored by ${facts.scoringTypes.join(" and ")}` : null,
  ].filter(Boolean).join(". ") + ". Open the exercise.";

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
      <ExerciseCardContent
        name={entry.name}
        imageUrl={entry.imageUrl}
        facts={facts}
        onPress={onPress}
        accessibilityLabel={a11y}
        right={<ChevronRight size={18} color={colors.textMuted} />}
      />
    </Swipeable>
  );
}

const styles = StyleSheet.create({
  // The gap between cards lives out here: inside the Swipeable it would leave
  // a stripe of red showing under the next card.
  swipeContainer: { marginBottom: spacing.md },
});
