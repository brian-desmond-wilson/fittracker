// One Today-session item as the rich captured-exercise card, made draggable
// and swipe-to-remove. It reuses ExerciseCardContent for the body and mirrors
// SwipeableCatalogCard's swipe geometry; the DraggableFlatList that hosts it
// lives in BlockCard/TodayTab, so this component only renders the row.
import React, { useRef } from "react";
import { StyleSheet, Pressable } from "react-native";
import { Swipeable } from "react-native-gesture-handler";
import { ScaleDecorator } from "react-native-draggable-flatlist";
import { GripVertical } from "lucide-react-native";
import { colors, spacing } from "@/src/theme/tokens";
import { catalogCardFacts } from "@/src/lib/catalogCardFacts";
import { sessionItemToCatalogEntry } from "@/src/lib/sessionItemFacts";
import { SwipeDeleteAction } from "@/src/components/ui/SwipeDeleteAction";
import { ExerciseCardContent } from "@/src/components/training/daily/ExerciseCardContent";
import type { StoredSessionItem } from "@/src/types/daily";

const CARD_RADIUS = 12;

interface SessionExerciseCardProps {
  item: StoredSessionItem;
  onOpen: (exerciseId: string) => void;
  /** Caller does the actual delete (with or without a confirm). */
  onRemove: (item: StoredSessionItem) => void;
  /** From DraggableFlatList's renderItem. */
  drag: () => void;
  /** From DraggableFlatList's renderItem. */
  isActive: boolean;
}

// The same sets × reps · rest string BlockCard builds, kept in step so the
// wording matches across the two places a session prescription shows.
function prescriptionLine(item: StoredSessionItem): string | null {
  const line = [
    item.targetSets
      ? `${item.targetSets} × ${item.targetReps ?? "?"}`
      : item.targetReps,
    item.restSeconds ? `${item.restSeconds}s` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  return line.length > 0 ? line : (item.reason ?? null);
}

function SessionExerciseCardBase({
  item,
  onOpen,
  onRemove,
  drag,
  isActive,
}: SessionExerciseCardProps) {
  const swipeableRef = useRef<Swipeable>(null);
  const facts = catalogCardFacts(sessionItemToCatalogEntry(item));
  const prescription = prescriptionLine(item);

  const a11y =
    [
      item.name,
      facts.badge?.label,
      facts.skillLevel,
      facts.equipment.length ? facts.equipment.join(", ") : null,
      facts.primaryMuscle ? `Primary ${facts.primaryMuscle}` : null,
      facts.secondaryMuscles.length ? `also ${facts.secondaryMuscles.join(", ")}` : null,
      facts.scoringTypes.length ? `scored by ${facts.scoringTypes.join(" and ")}` : null,
    ]
      .filter(Boolean)
      .join(". ") + ". Open the exercise. Hold to reorder.";

  return (
    <ScaleDecorator>
      <Swipeable
        ref={swipeableRef}
        renderRightActions={(progress) => (
          <SwipeDeleteAction
            progress={progress}
            onPress={() => {
              swipeableRef.current?.close();
              onRemove(item);
            }}
            radius={CARD_RADIUS}
            accessibilityLabel={`Remove ${item.name} from today`}
          />
        )}
        overshootRight={false}
        friction={2}
        containerStyle={styles.swipeContainer}
      >
        <ExerciseCardContent
          name={item.name}
          imageUrl={item.imageUrl}
          facts={facts}
          prescription={prescription}
          onPress={() => onOpen(item.exerciseId)}
          onLongPress={drag}
          accessibilityLabel={a11y}
          right={
            <Pressable
              onPressIn={drag}
              disabled={isActive}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              accessibilityRole="button"
              accessibilityLabel={`Reorder ${item.name}`}
              style={isActive ? styles.handleActive : undefined}
            >
              <GripVertical size={18} color={colors.textFaint} />
            </Pressable>
          }
        />
      </Swipeable>
    </ScaleDecorator>
  );
}

export const SessionExerciseCard = React.memo(SessionExerciseCardBase);

const styles = StyleSheet.create({
  // The gap between cards lives out here: inside the Swipeable it would leave
  // a stripe of red showing under the next card.
  swipeContainer: { marginBottom: spacing.md },
  handleActive: { opacity: 0.4 },
});
