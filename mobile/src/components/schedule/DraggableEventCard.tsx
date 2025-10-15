import React, { useRef, useState, useMemo } from "react";
import { PanResponder, View, StyleSheet } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";
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
  const translateY = useSharedValue(0);
  const [isDragging, setIsDragging] = useState(false);
  const isDraggingRef = useRef(false);
  const originalTopRef = useRef(style.top);
  const currentDragY = useRef(0);

  // Update originalTop when the component re-renders with new position
  React.useEffect(() => {
    if (!isDragging) {
      originalTopRef.current = style.top;
      translateY.value = 0;
      currentDragY.current = 0;
    }
  }, [style.top, isDragging, translateY]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onStartShouldSetPanResponderCapture: () => false,
        onMoveShouldSetPanResponder: (_, gestureState) => {
          const isDraggingVertically = Math.abs(gestureState.dy) > 5;
          if (isDraggingVertically && !isDraggingRef.current) {
            isDraggingRef.current = true;
            setIsDragging(true);
            if (onDragStart) {
              // Use setTimeout to ensure state update propagates
              setTimeout(() => onDragStart(), 0);
            }
          }
          return isDraggingVertically;
        },
        onMoveShouldSetPanResponderCapture: () => false,
        onPanResponderTerminationRequest: () => false,
        onShouldBlockNativeResponder: () => true,

        onPanResponderGrant: () => {
          // Don't set dragging yet, wait for move
          currentDragY.current = translateY.value;
        },

        onPanResponderMove: (evt, gestureState) => {
          // Update pan position when dragging vertically
          const isDraggingVertically = Math.abs(gestureState.dy) > 5;
          if (isDraggingVertically) {
            // Disable scroll if not already disabled
            if (!isDraggingRef.current) {
              isDraggingRef.current = true;
              setIsDragging(true);
              if (onDragStart) {
                setTimeout(() => onDragStart(), 0);
              }
            }
            translateY.value = gestureState.dy;
            currentDragY.current = gestureState.dy;
          }
        },

        onPanResponderRelease: (_, gestureState) => {
          // Check if there was significant vertical movement
          const hadVerticalMovement = Math.abs(gestureState.dy) > 5;

          // If was dragging or had vertical movement, handle the drop
          if (isDraggingRef.current || hadVerticalMovement) {
            // Continue with drag logic below
          } else {
            // Was a tap - call onClick
            translateY.value = 0;
            currentDragY.current = 0;
            onClick();
            return;
          }

          // Calculate new time based on drag distance
          const draggedY = currentDragY.current;
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
          const targetY = snappedTop - originalTopRef.current;
          translateY.value = withSpring(targetY, {
            damping: 15,
            stiffness: 150,
          }, () => {
            isDraggingRef.current = false;
            setIsDragging(false);
            onDragEnd?.();

            // Only update if time changed
            if (newStartTime !== event.start_time) {
              onDrop(event, newStartTime, newEndTime);
            } else {
              translateY.value = 0;
              currentDragY.current = 0;
            }
          });
        },
      }),
    [translateY, event, onClick, onDrop, onDragStart, onDragEnd]
  );

  const animatedStyle = useAnimatedStyle(() => {
    return {
      transform: [{ translateY: translateY.value }],
      zIndex: isDragging ? 1000 : 1,
      opacity: isDragging ? 0.8 : 1,
    };
  });

  return (
    <Animated.View
      style={[style, animatedStyle]}
      {...panResponder.panHandlers}
    >
      <View style={styles.card}>
        <EventCard event={event} style={styles.eventCard} onClick={() => {}} />
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
  },
  eventCard: {
    flex: 1,
  },
});
