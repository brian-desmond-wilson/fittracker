"use client";

import { useEffect, useRef, useState } from "react";
import { ScheduleEvent, EventCategory, EventTemplate } from "@/types/schedule";
import { TimeGrid, HOUR_HEIGHT } from "./time-grid";
import { CurrentTimeIndicator } from "./current-time-indicator";
import { EventCard } from "./event-card";
import { EventDetailModal } from "./event-detail-modal";
import { EditEventModal } from "./edit-event-modal";
import { QuickAddModal } from "./quick-add-modal";
import { TemplatesDrawer } from "./templates-drawer";
import { detectOverlappingEvents } from "@/lib/schedule-utils";
import { Zap } from "lucide-react";

interface ScheduleViewProps {
  events: ScheduleEvent[];
  categories: EventCategory[];
  templates: EventTemplate[];
}

export function ScheduleView({ events, categories, templates }: ScheduleViewProps) {
  const [selectedEvent, setSelectedEvent] = useState<ScheduleEvent | null>(null);
  const [editingEvent, setEditingEvent] = useState<ScheduleEvent | null>(null);
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [quickAddModalOpen, setQuickAddModalOpen] = useState(false);
  const [templatesDrawerOpen, setTemplatesDrawerOpen] = useState(false);
  const [quickAddTime, setQuickAddTime] = useState<{ hour: number; minute: number } | undefined>();
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

  const handleTimeSlotClick = (hour: number, minute: number) => {
    setQuickAddTime({ hour, minute });
    setQuickAddModalOpen(true);
  };

  const handleSwipeComplete = async (eventId: string) => {
    try {
      const response = await fetch(`/app2/api/schedule/events/${eventId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "completed" }),
      });

      if (response.ok) {
        window.location.reload();
      }
    } catch (error) {
      console.error("Failed to complete event:", error);
    }
  };

  const handleSwipeCancel = async (eventId: string) => {
    try {
      const response = await fetch(`/app2/api/schedule/events/${eventId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "cancelled" }),
      });

      if (response.ok) {
        window.location.reload();
      }
    } catch (error) {
      console.error("Failed to cancel event:", error);
    }
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
      {/* Floating Templates Button - positioned to avoid bottom nav (80px) */}
      <button
        onClick={() => setTemplatesDrawerOpen(true)}
        className="fixed bottom-14 right-4 z-20 flex items-center gap-2 px-4 py-3 bg-primary hover:bg-primary/90 text-gray-950 font-medium rounded-full shadow-lg transition-all"
      >
        <Zap className="w-5 h-5" />
        <span>Templates</span>
      </button>

      <div
        ref={scrollContainerRef}
        className="relative h-full overflow-y-auto overflow-x-hidden scrollbar-hide"
      >
        <div className="relative" style={{ height: `${timelineHeight}px` }}>
          <TimeGrid onTimeSlotClick={handleTimeSlotClick} />

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
                    onSwipeComplete={() => handleSwipeComplete(event.id)}
                    onSwipeCancel={() => handleSwipeCancel(event.id)}
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

      {/* Quick Add Modal */}
      <QuickAddModal
        open={quickAddModalOpen}
        onOpenChange={setQuickAddModalOpen}
        categories={categories}
        prefilledTime={quickAddTime}
        onEventCreated={() => {}}
      />

      {/* Templates Drawer */}
      <TemplatesDrawer
        open={templatesDrawerOpen}
        onOpenChange={setTemplatesDrawerOpen}
        templates={templates}
        categories={categories}
        onTemplateSelect={() => {}}
      />
    </div>
  );
}
