"use client";

import { useState } from "react";
import { ScheduleEvent, EventCategory } from "@/types/schedule";
import { TimeGrid } from "./time-grid";
import { CurrentTimeIndicator } from "./current-time-indicator";
import { EventCard } from "./event-card";
import { detectOverlappingEvents } from "@/lib/schedule-utils";

interface ScheduleViewProps {
  events: ScheduleEvent[];
  categories: EventCategory[];
}

export function ScheduleView({ events, categories }: ScheduleViewProps) {
  const [selectedEvent, setSelectedEvent] = useState<ScheduleEvent | null>(null);

  // Enhance events with category data
  const enhancedEvents = events.map((event) => ({
    ...event,
    category: categories.find((c) => c.id === event.category_id),
  }));

  // Calculate positions for all events, handling overlaps
  const eventPositions = detectOverlappingEvents(enhancedEvents);

  const handleEventClick = (event: ScheduleEvent) => {
    setSelectedEvent(event);
    // TODO: Open event detail modal
    console.log("Event clicked:", event);
  };

  return (
    <div className="relative">
      <TimeGrid />

      {/* Events container */}
      <div className="absolute top-0 left-0 right-0 pointer-events-none" style={{ height: `${24 * 80}px` }}>
        <div className="relative h-full pointer-events-auto">
          {eventPositions.map(({ event, top, height, column, totalColumns }) => (
            <EventCard
              key={event.id}
              event={event}
              style={{
                top: `${top}px`,
                height: `${height}px`,
                left: `${64 + (column * (100 / totalColumns))}px`,
                width: totalColumns > 1 ? `${100 / totalColumns}%` : undefined,
                right: totalColumns === 1 ? "8px" : undefined,
              }}
              onClick={() => handleEventClick(event)}
            />
          ))}

          {/* Current time indicator on top of events */}
          <CurrentTimeIndicator />
        </div>
      </div>

      {/* Empty state */}
      {events.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-center p-8">
            <p className="text-gray-400 text-lg mb-2">No events scheduled</p>
            <p className="text-gray-500 text-sm">
              Tap a time slot or use the + button to add an event
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
