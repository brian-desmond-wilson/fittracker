"use client";

import { useState, memo } from "react";
import { useSwipeable } from "react-swipeable";
import { ScheduleEvent } from "@/types/schedule";
import { Check, X, Clock, Repeat, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import * as LucideIcons from "lucide-react";

interface EventCardProps {
  event: ScheduleEvent;
  style: React.CSSProperties;
  onClick: () => void;
  onSwipeComplete?: () => void;
  onSwipeCancel?: () => void;
  isPending?: boolean;
}

export const EventCard = memo(function EventCard({
  event,
  style,
  onClick,
  onSwipeComplete,
  onSwipeCancel,
  isPending,
}: EventCardProps) {
  const [swipeOffset, setSwipeOffset] = useState(0);
  const [isSwiping, setIsSwiping] = useState(false);

  const handlers = useSwipeable({
    onSwiping: (eventData) => {
      // Only respond to mostly horizontal swipes
      const absX = Math.abs(eventData.deltaX);
      const absY = Math.abs(eventData.deltaY);

      // If vertical movement is greater than horizontal, don't interfere with scrolling
      if (absY > absX) {
        return;
      }

      setIsSwiping(true);
      // Right swipe = complete (positive offset)
      // Left swipe = cancel (negative offset)
      const offset = eventData.deltaX;
      // Limit swipe to reasonable bounds
      if (offset > 0) {
        setSwipeOffset(Math.min(offset, 120)); // Right swipe (complete)
      } else {
        setSwipeOffset(Math.max(offset, -120)); // Left swipe (cancel)
      }
    },
    onSwiped: (eventData) => {
      setIsSwiping(false);

      // Only trigger actions for horizontal swipes
      const absX = Math.abs(eventData.deltaX);
      const absY = Math.abs(eventData.deltaY);

      if (absY > absX) {
        setSwipeOffset(0);
        return;
      }

      const threshold = 80;

      if (eventData.deltaX > threshold && onSwipeComplete) {
        // Right swipe - mark complete
        onSwipeComplete();
      } else if (eventData.deltaX < -threshold && onSwipeCancel) {
        // Left swipe - mark cancelled
        onSwipeCancel();
      }

      // Reset swipe offset
      setSwipeOffset(0);
    },
    trackMouse: false,
    trackTouch: true,
    preventScrollOnSwipe: false,
    delta: 10, // Minimum distance before swipe is detected
  });
  const formatTime = (time: string) => {
    const [hours, minutes] = time.split(":");
    const h = parseInt(hours);
    const ampm = h >= 12 ? "PM" : "AM";
    const displayHour = h === 0 ? 12 : h > 12 ? h - 12 : h;
    return `${displayHour}:${minutes} ${ampm}`;
  };

  const getStatusIcon = () => {
    switch (event.status) {
      case "completed":
        return <Check className="w-4 h-4" />;
      case "cancelled":
        return <X className="w-4 h-4" />;
      case "in_progress":
        return <Clock className="w-4 h-4 animate-pulse" />;
      default:
        return null;
    }
  };

  // Get icon component from lucide-react
  const IconComponent = event.category?.icon
    ? (LucideIcons as any)[event.category.icon]
    : null;

  const isPast = () => {
    const now = new Date();
    const [endHours, endMinutes] = event.end_time.split(":").map(Number);
    const eventEnd = new Date();
    eventEnd.setHours(endHours, endMinutes, 0, 0);
    return now > eventEnd;
  };

  // Background color based on swipe direction
  const getSwipeBackgroundColor = () => {
    if (swipeOffset > 40) return "rgba(34, 197, 94, 0.2)"; // Green for complete
    if (swipeOffset < -40) return "rgba(239, 68, 68, 0.2)"; // Red for cancel
    return undefined;
  };

  return (
    <div
      {...handlers}
      className="pointer-events-auto"
      style={{
        ...style,
        transform: `translateX(${swipeOffset}px)`,
        transition: isSwiping ? "none" : "transform 0.2s ease-out",
      }}
    >
      {/* Swipe background indicators */}
      {swipeOffset > 40 && (
        <div className="absolute inset-0 flex items-center justify-start pl-4 bg-green-600/20 rounded-lg">
          <Check className="w-6 h-6 text-green-500" />
        </div>
      )}
      {swipeOffset < -40 && (
        <div className="absolute inset-0 flex items-center justify-end pr-4 bg-red-600/20 rounded-lg">
          <X className="w-6 h-6 text-red-500" />
        </div>
      )}

      <button
        onClick={onClick}
        style={{
          borderLeftColor: event.category?.color || "#6B7280",
          backgroundColor: getSwipeBackgroundColor(),
        }}
        className={cn(
          "relative w-full rounded-lg p-2 text-left transition-colors",
          "border-l-4 bg-gray-900/90 hover:bg-gray-800/90",
          "border border-gray-800 shadow-lg",
          "flex flex-col gap-1",
          "overflow-hidden",
          event.status === "completed" && "opacity-60",
          event.status === "cancelled" && "opacity-40",
          event.status === "in_progress" && "ring-2 ring-primary/50",
          isPast() && event.status === "pending" && "opacity-40"
        )}
        disabled={isPending}
        aria-busy={isPending}
        aria-live="polite"
      >
        {isPending && (
          <div className="absolute inset-0 z-30 flex items-center justify-center bg-gray-900/70 backdrop-blur-sm pointer-events-none">
            <Loader2 className="w-4 h-4 text-primary animate-spin" />
            <span className="ml-2 text-xs font-medium text-gray-300">Updating</span>
          </div>
        )}
      {/* Header with title and status */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          {IconComponent && (
            <IconComponent
              className="w-4 h-4 flex-shrink-0"
              style={{ color: event.category?.color }}
            />
          )}
          <span
            className={cn(
              "text-sm font-medium text-white truncate",
              event.status === "cancelled" && "line-through"
            )}
          >
            {event.title}
          </span>
          {event.is_recurring && (
            <Repeat className="w-3 h-3 text-gray-500 flex-shrink-0" />
          )}
        </div>
        {getStatusIcon() && (
          <div
            className="flex-shrink-0"
            style={{ color: event.category?.color }}
          >
            {getStatusIcon()}
          </div>
        )}
      </div>

      {/* Time range */}
      <div className="text-xs text-gray-400">
        {formatTime(event.start_time)} - {formatTime(event.end_time)}
      </div>

      {/* Category name (if height allows) */}
      {event.category && (
        <div className="text-xs text-gray-500 truncate">{event.category.name}</div>
      )}
    </button>
    </div>
  );
});
