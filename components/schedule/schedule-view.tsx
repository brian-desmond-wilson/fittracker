"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ScheduleEvent, EventCategory, EventTemplate } from "@/types/schedule";
import { TimeGrid, HOUR_HEIGHT } from "./time-grid";
import { CurrentTimeIndicator } from "./current-time-indicator";
import { EventCard } from "./event-card";
import { DraggableEventCard } from "./draggable-event-card";
import { EventDetailModal } from "./event-detail-modal";
import { EditEventModal } from "./edit-event-modal";
import { QuickAddModal } from "./quick-add-modal";
import { TemplatesDrawer } from "./templates-drawer";
import { EmptyState } from "./empty-state";
import { detectOverlappingEvents } from "@/lib/schedule-utils";
import { Loader2, Zap } from "lucide-react";
import {
  DndContext,
  DragEndEvent,
  DragStartEvent,
  DragOverlay,
  useSensor,
  useSensors,
  PointerSensor,
  closestCenter,
} from "@dnd-kit/core";

interface ScheduleViewProps {
  events: ScheduleEvent[];
  categories: EventCategory[];
  templates: EventTemplate[];
}

export function ScheduleView({ events, categories, templates }: ScheduleViewProps) {
  const router = useRouter();
  const [selectedEvent, setSelectedEvent] = useState<ScheduleEvent | null>(null);
  const [editingEvent, setEditingEvent] = useState<ScheduleEvent | null>(null);
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [quickAddModalOpen, setQuickAddModalOpen] = useState(false);
  const [templatesDrawerOpen, setTemplatesDrawerOpen] = useState(false);
  const [quickAddTime, setQuickAddTime] = useState<{ hour: number; minute: number } | undefined>();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [pendingUpdates, setPendingUpdates] = useState<Set<string>>(new Set());
  const [isRefreshing, startRefresh] = useTransition();
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const timelineHeight = 24 * HOUR_HEIGHT;

  // Configure drag sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8, // Require 8px movement before drag starts (helps distinguish from click)
      },
    })
  );

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

  const markPending = (eventId: string) => {
    setPendingUpdates((prev) => {
      if (prev.has(eventId)) return prev;
      const next = new Set(prev);
      next.add(eventId);
      return next;
    });
  };

  const clearPending = (eventId: string) => {
    setPendingUpdates((prev) => {
      if (!prev.has(eventId)) return prev;
      const next = new Set(prev);
      next.delete(eventId);
      return next;
    });
  };

  const handleSwipeComplete = async (eventId: string) => {
    try {
      markPending(eventId);
      const response = await fetch(`/app2/api/schedule/events/${eventId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "completed" }),
      });

      if (response.ok) {
        startRefresh(() => router.refresh());
      } else {
        clearPending(eventId);
      }
    } catch (error) {
      console.error("Failed to complete event:", error);
      clearPending(eventId);
    }
  };

  const handleSwipeCancel = async (eventId: string) => {
    try {
      markPending(eventId);
      const response = await fetch(`/app2/api/schedule/events/${eventId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "cancelled" }),
      });

      if (response.ok) {
        startRefresh(() => router.refresh());
      } else {
        clearPending(eventId);
      }
    } catch (error) {
      console.error("Failed to cancel event:", error);
      clearPending(eventId);
    }
  };

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, delta } = event;
    setActiveId(null);

    if (!delta.y) return;

    // Calculate how many pixels the event was moved
    const pixelsMoved = delta.y;

    // Convert pixels to minutes (each hour is HOUR_HEIGHT pixels, so 80px = 60min)
    const minutesMoved = (pixelsMoved / HOUR_HEIGHT) * 60;

    // Round to nearest 15 minutes
    const roundedMinutes = Math.round(minutesMoved / 15) * 15;

    if (roundedMinutes === 0) return; // No significant movement

    // Find the event being dragged
    const draggedEvent = enhancedEvents.find((e) => e.id === active.id);
    if (!draggedEvent) return;

    // Calculate new start and end times
    const [startHours, startMinutes, startSeconds] = draggedEvent.start_time.split(':').map(Number);
    const [endHours, endMinutes, endSeconds] = draggedEvent.end_time.split(':').map(Number);

    const startTotalMinutes = startHours * 60 + startMinutes + roundedMinutes;
    const endTotalMinutes = endHours * 60 + endMinutes + roundedMinutes;

    // Ensure times are within valid range (0-1439 minutes in a day)
    if (startTotalMinutes < 0 || endTotalMinutes >= 1440) return;

    const newStartHours = Math.floor(startTotalMinutes / 60);
    const newStartMinutes = startTotalMinutes % 60;
    const newEndHours = Math.floor(endTotalMinutes / 60);
    const newEndMinutes = endTotalMinutes % 60;

    const newStartTime = `${String(newStartHours).padStart(2, '0')}:${String(newStartMinutes).padStart(2, '0')}:00`;
    const newEndTime = `${String(newEndHours).padStart(2, '0')}:${String(newEndMinutes).padStart(2, '0')}:00`;

    // Update the event in the database
    try {
      markPending(active.id as string);
      const response = await fetch(`/app2/api/schedule/events/${active.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          start_time: newStartTime,
          end_time: newEndTime,
        }),
      });

      if (response.ok) {
        startRefresh(() => router.refresh());
      } else {
        clearPending(active.id as string);
      }
    } catch (error) {
      console.error("Failed to reschedule event:", error);
      clearPending(active.id as string);
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

  useEffect(() => {
    if (!isRefreshing) {
      setPendingUpdates((prev) => (prev.size === 0 ? prev : new Set<string>()));
    }
  }, [isRefreshing]);

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="relative w-full h-full">
        {(pendingUpdates.size > 0 || isRefreshing) && (
          <div className="pointer-events-none fixed top-24 right-4 z-30 flex items-center gap-2 rounded-full bg-gray-900/95 px-3 py-2 text-xs font-medium text-gray-300 shadow-lg backdrop-blur-sm">
            <Loader2 className="h-4 w-4 text-primary animate-spin" />
            <span>{isRefreshing ? "Refreshing schedule…" : "Updating event…"}</span>
          </div>
        )}

        {/* Floating Templates Button - positioned to avoid bottom nav (80px) */}
        <button
          onClick={() => setTemplatesDrawerOpen(true)}
          className="fixed right-4 z-20 flex items-center gap-2 px-4 py-3 bg-primary hover:bg-primary/90 text-gray-950 font-medium rounded-full shadow-lg transition-all"
          style={{
            bottom:
              "calc(96px + env(safe-area-inset-bottom, 0px) + var(--app-keyboard-offset, 0px))",
          }}
        >
          <Zap className="w-5 h-5" />
          <span>Templates</span>
        </button>

        {events.length === 0 ? (
          <EmptyState
            onAddEvent={() => setQuickAddModalOpen(true)}
            onOpenTemplates={() => setTemplatesDrawerOpen(true)}
          />
        ) : (
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
                      <DraggableEventCard
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
                        isDragging={activeId === event.id}
                        isPending={pendingUpdates.has(event.id)}
                      />
                    ),
                  )}

                  {/* Current time indicator on top of events */}
                  <CurrentTimeIndicator />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Drag Overlay */}
        <DragOverlay>
          {activeId ? (
            <div className="opacity-90">
              {(() => {
                const activeEvent = enhancedEvents.find((e) => e.id === activeId);
                if (!activeEvent) return null;
                const activePosition = eventPositions.find((p) => p.event.id === activeId);
                if (!activePosition) return null;
                return (
                  <EventCard
                    event={activeEvent}
                    style={{
                      position: "relative",
                      height: `${activePosition.height}px`,
                      width: "300px",
                    }}
                    onClick={() => {}}
                  />
                );
              })()}
            </div>
          ) : null}
        </DragOverlay>
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
    </DndContext>
  );
}
