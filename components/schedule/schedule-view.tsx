"use client";

import { useEffect, useRef, useState } from "react";
import { ScheduleEvent, EventCategory } from "@/types/schedule";
import { TimeGrid, HOUR_HEIGHT } from "./time-grid";
import { CurrentTimeIndicator } from "./current-time-indicator";
import { EventCard } from "./event-card";
import { EventDetailModal } from "./event-detail-modal";
import { EditEventModal } from "./edit-event-modal";
import { detectOverlappingEvents } from "@/lib/schedule-utils";

interface ScheduleViewProps {
  events: ScheduleEvent[];
  categories: EventCategory[];
}

export function ScheduleView({ events, categories }: ScheduleViewProps) {
  const [selectedEvent, setSelectedEvent] = useState<ScheduleEvent | null>(null);
  const [editingEvent, setEditingEvent] = useState<ScheduleEvent | null>(null);
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const timelineHeight = 24 * HOUR_HEIGHT;

  // Enhance events with category data
  const enhancedEvents = events.map((event) => ({
    ...event,
    category: categories.find((c) => c.id === event.category_id),
  }));

  // Calculate positions for all events, handling overlaps
  const eventPositions = detectOverlappingEvents(enhancedEvents);

  const handleEventClick = (event: ScheduleEvent) => {
    setSelectedEvent(event);
    setDetailModalOpen(true);
  };

  const handleEditEvent = (event: ScheduleEvent) => {
    setEditingEvent(event);
    setEditModalOpen(true);
  };

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const now = new Date();
    const hours = now.getHours();
    const minutes = now.getMinutes();

    // Calculate offset from 5am
    let hoursFrom5am = hours - 5;
    if (hoursFrom5am < 0) hoursFrom5am += 24;

    const scrollPosition =
      hoursFrom5am * HOUR_HEIGHT + (minutes / 60) * HOUR_HEIGHT - 100;

    const maxScroll = container.scrollHeight - container.clientHeight;
    const clampedPosition = Math.min(Math.max(0, scrollPosition), maxScroll);

    container.scrollTop = clampedPosition;
  }, []);

  return (
    <div className="relative w-full h-full">
      <div
        ref={scrollContainerRef}
        className="relative h-full overflow-y-auto overflow-x-hidden scrollbar-hide"
      >
        <div className="relative" style={{ height: `${timelineHeight}px` }}>
          <TimeGrid />

          {/* Events container */}
          <div className="absolute inset-0 pl-12 pointer-events-none">
            <div className="relative h-full">
              {eventPositions.map(
                ({ event, top, height, column, totalColumns }) => (
                  <EventCard
                    key={event.id}
                    event={event}
                    style={{
                      top: `${top}px`,
                      height: `${height}px`,
                      left: `${48 + column * (100 / totalColumns)}px`,
                      width:
                        totalColumns > 1
                          ? `${100 / totalColumns}%`
                          : undefined,
                      right: totalColumns === 1 ? "8px" : undefined,
                    }}
                    onClick={() => handleEventClick(event)}
                  />
                ),
              )}

              {/* Current time indicator on top of events */}
              <CurrentTimeIndicator />
            </div>
          </div>
        </div>
      </div>

      {/* Event Detail Modal */}
      <EventDetailModal
        event={selectedEvent}
        open={detailModalOpen}
        onOpenChange={setDetailModalOpen}
        onEdit={handleEditEvent}
      />

      {/* Edit Event Modal */}
      <EditEventModal
        event={editingEvent}
        categories={categories}
        open={editModalOpen}
        onOpenChange={setEditModalOpen}
      />
    </div>
  );
}
