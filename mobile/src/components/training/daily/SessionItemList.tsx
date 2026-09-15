// One session section's items as a rich, draggable, swipe-to-remove list —
// the shared list UI behind both the block-day cards (BlockCard) and the
// blockless "from your catalog" fallback (TodayTab). It hosts a
// DraggableFlatList of SessionExerciseCard; the list is nested inside the
// tab's ScrollView, so it never scrolls itself.
import React, { useCallback } from "react";
import { StyleSheet } from "react-native";
import DraggableFlatList, { type RenderItemParams } from "react-native-draggable-flatlist";
import { SessionExerciseCard } from "./SessionExerciseCard";
import type { SessionSection, StoredSessionItem } from "@/src/types/daily";

interface SessionItemListProps {
  items: StoredSessionItem[];
  section: SessionSection;
  onOpen: (exerciseId: string) => void;
  onRemove: (item: StoredSessionItem) => void;
  onReorder: (section: SessionSection, orderedIds: string[]) => void;
}

export function SessionItemList({
  items, section, onOpen, onRemove, onReorder,
}: SessionItemListProps) {
  // Stable so SessionExerciseCard's React.memo isn't defeated on every render.
  const renderItem = useCallback(
    ({ item, drag, isActive }: RenderItemParams<StoredSessionItem>) => (
      <SessionExerciseCard
        item={item}
        drag={drag}
        isActive={isActive}
        onOpen={onOpen}
        onRemove={onRemove}
      />
    ),
    [onOpen, onRemove],
  );

  return (
    <DraggableFlatList
      data={items}
      keyExtractor={(item) => item.id}
      onDragEnd={({ data }) => onReorder(section, data.map((d) => d.id))}
      renderItem={renderItem}
      scrollEnabled={false}
      activationDistance={12}
      containerStyle={styles.dragList}
    />
  );
}

const styles = StyleSheet.create({
  // No fixed height: the nested list lays out inline so its host grows to fit
  // its rows inside the tab's ScrollView.
  dragList: { marginTop: 4 },
});
