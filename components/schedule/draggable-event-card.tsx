"use client";

import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { EventCard } from "./event-card";
import { ScheduleEvent } from "@/types/schedule";

interface DraggableEventCardProps {
  event: ScheduleEvent;
  style: React.CSSProperties;
  onClick: () => void;
  onSwipeComplete?: () => void;
  onSwipeCancel?: () => void;
  isDragging?: boolean;
}

export function DraggableEventCard({
  event,
  style,
  onClick,
  onSwipeComplete,
  onSwipeCancel,
  isDragging,
}: DraggableEventCardProps) {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({
    id: event.id,
  });

  const draggableStyle: React.CSSProperties = {
    ...style,
    position: 'absolute',
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.5 : 1,
    cursor: isDragging ? "grabbing" : "grab",
  };

  return (
    <div ref={setNodeRef} style={draggableStyle} {...attributes} {...listeners}>
      <EventCard
        event={event}
        style={{ position: 'relative', top: 0, left: 0, right: 0 }}
        onClick={onClick}
        onSwipeComplete={onSwipeComplete}
        onSwipeCancel={onSwipeCancel}
      />
    </div>
  );
}
