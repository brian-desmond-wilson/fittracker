"use client";

import { ScheduleEvent } from "@/types/schedule";
import { Check, X, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import * as LucideIcons from "lucide-react";

interface EventCardProps {
  event: ScheduleEvent;
  style: React.CSSProperties;
  onClick: () => void;
}

export function EventCard({ event, style, onClick }: EventCardProps) {
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

  return (
    <button
      onClick={onClick}
      style={{
        ...style,
        borderLeftColor: event.category?.color || "#6B7280",
      }}
      className={cn(
        "absolute left-16 right-2 rounded-lg p-2 text-left transition-all",
        "border-l-4 bg-gray-900/90 hover:bg-gray-800/90",
        "border border-gray-800 shadow-lg",
        "pointer-events-auto",
        "flex flex-col gap-1",
        event.status === "completed" && "opacity-60",
        event.status === "cancelled" && "opacity-40",
        event.status === "in_progress" && "ring-2 ring-primary/50",
        isPast() && event.status === "pending" && "opacity-40"
      )}
    >
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
  );
}
