// A history row you can swipe left to delete (spec 2026-09-14 §4.1). The
// row's own tap still opens the session; the swipe reveals the shared red
// Delete panel, confirms, deletes, and asks the list to reload. Mirrors
// training/daily/SwipeableCatalogCard.
import React, { useRef } from "react";
import { Alert } from "react-native";
import { Swipeable } from "react-native-gesture-handler";
import { SwipeDeleteAction } from "@/src/components/ui/SwipeDeleteAction";
import { SessionRow } from "./SessionRow";
import { deleteGymSession } from "@/src/lib/supabase/gymSessions";
import { sessionTitle } from "@/src/lib/sessionPresentation";
import type { HistorySession } from "@/src/types/gymSessions";

interface SwipeableSessionRowProps {
  session: HistorySession;
  today: string;
  prCount: number;
  showDate?: boolean;
  onPress: () => void;
  /** Reload the list — the header aggregates come from it. */
  onDeleted: () => void;
}

export function SwipeableSessionRow({
  session, today, prCount, showDate, onPress, onDeleted,
}: SwipeableSessionRowProps) {
  const swipeableRef = useRef<Swipeable>(null);
  const close = () => swipeableRef.current?.close();
  const title = sessionTitle(session);

  const handleDelete = () => {
    Alert.alert(
      "Delete this session?",
      `This removes ${title} from your history for good — its score, notes, and sets. This can't be undone.`,
      [
        { text: "Cancel", style: "cancel", onPress: close },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            const result = await deleteGymSession(session);
            if (result.ok) {
              onDeleted();
            } else {
              Alert.alert("Couldn't delete it", "Something went wrong. Try again.");
              close();
            }
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
          radius={0}
          accessibilityLabel={`Delete ${title}`}
        />
      )}
      overshootRight={false}
      friction={2}
    >
      <SessionRow
        session={session}
        today={today}
        prCount={prCount}
        showDate={showDate}
        onPress={onPress}
      />
    </Swipeable>
  );
}
