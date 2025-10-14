import React, { useRef, useState, useMemo } from "react";
import { Animated, PanResponder, View, StyleSheet } from "react-native";
import { EventCard } from "./EventCard";
import { ScheduleEvent } from "../../types/schedule";
import { HOUR_HEIGHT } from "./TimeGrid";

interface DraggableEventCardProps {
  event: ScheduleEvent;
  style: any;
  onClick: () => void;
  onDrop: (event: ScheduleEvent, newStartTime: string, newEndTime: string) => void;
  onDragStart?: () => void;
  onDragEnd?: () => void;
}

export function DraggableEventCard({
  event,
  style,
  onClick,
  onDrop,
  onDragStart,
  onDragEnd,
}: DraggableEventCardProps) {
  const pan = useRef(new Animated.ValueXY()).current;
  const [isDragging, setIsDragging] = useState(false);
  const originalTopRef = useRef(style.top);

  // Update originalTop when the component re-renders with new position
  React.useEffect(() => {
    if (!isDragging) {
      originalTopRef.current = style.top;
      pan.setValue({ x: 0, y: 0 });
    }
  }, [style.top, isDragging, pan]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onStartShouldSetPanResponderCapture: () => false,
        onMoveShouldSetPanResponder: (_, gestureState) => {
          // Only start dragging if vertical movement is significant
          return Math.abs(gestureState.dy) > 5;
        },
        onMoveShouldSetPanResponderCapture: (_, gestureState) => {
          return Math.abs(gestureState.dy) > 5;
        },
        onPanResponderTerminationRequest: () => false,
        onShouldBlockNativeResponder: () => true,

        onPanResponderGrant: () => {
          setIsDragging(true);
          onDragStart?.();
          pan.setOffset({
            x: 0,
            y: (pan.y as any)._value,
          });
          pan.setValue({ x: 0, y: 0 });
        },

        onPanResponderMove: Animated.event(
          [
            null,
            {
              dy: pan.y,
            },
          ],
          { useNativeDriver: false }
        ),

        onPanResponderRelease: (_, gestureState) => {
          pan.flattenOffset();

          // Check if it was a tap (minimal movement)
          if (Math.abs(gestureState.dy) < 5 && Math.abs(gestureState.dx) < 5) {
            setIsDragging(false);
            pan.setValue({ x: 0, y: 0 });
            onDragEnd?.();
            onClick();
            return;
          }

          // Calculate new time based on drag distance
          const draggedY = (pan.y as any)._value;
          const newTop = originalTopRef.current + draggedY;

          // Snap to 15-minute intervals
          const minutesFromTop = (newTop / HOUR_HEIGHT) * 60;
          const snappedMinutes = Math.round(minutesFromTop / 15) * 15;
          const snappedTop = (snappedMinutes / 60) * HOUR_HEIGHT;

          // Calculate new start and end times
          const hoursFrom5am = Math.floor(snappedMinutes / 60);
          const minutes = snappedMinutes % 60;

          let newHour = (5 + hoursFrom5am) % 24;
          const newStartTime = `${newHour.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:00`;

          // Calculate duration from original event
          const [startH, startM] = event.start_time.split(":").map(Number);
          const [endH, endM] = event.end_time.split(":").map(Number);
          const durationMinutes = (endH * 60 + endM) - (startH * 60 + startM);

          // Calculate new end time
          const endTotalMinutes = snappedMinutes + durationMinutes;
          const endHoursFrom5am = Math.floor(endTotalMinutes / 60);
          const endMinutes = endTotalMinutes % 60;
          let newEndHour = (5 + endHoursFrom5am) % 24;
          const newEndTime = `${newEndHour.toString().padStart(2, "0")}:${endMinutes.toString().padStart(2, "0")}:00`;

          // Animate to snapped position
          Animated.spring(pan, {
            toValue: { x: 0, y: snappedTop - originalTopRef.current },
            useNativeDriver: false,
            friction: 7,
          }).start(() => {
            setIsDragging(false);
            onDragEnd?.();

            // Only update if time changed
            if (newStartTime !== event.start_time) {
              onDrop(event, newStartTime, newEndTime);
            } else {
              pan.setValue({ x: 0, y: 0 });
            }
          });
        },
      }),
    [pan, event, onClick, onDrop, onDragStart, onDragEnd, originalTopRef]
  );

  return (
    <Animated.View
      style={[
        style,
        {
          transform: [{ translateY: pan.y }],
          zIndex: isDragging ? 1000 : 1,
          opacity: isDragging ? 0.8 : 1,
        },
      ]}
      {...panResponder.panHandlers}
    >
      <EventCard event={event} style={styles.card} onClick={() => {}} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
  },
});
