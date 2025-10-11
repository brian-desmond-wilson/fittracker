import { ScheduleEvent, EventPosition } from "@/types/schedule";

const HOUR_HEIGHT = 80; // Must match time-grid.tsx

export function calculateEventPosition(event: ScheduleEvent): {
  top: number;
  height: number;
} {
  const [startHours, startMinutes] = event.start_time.split(":").map(Number);
  const [endHours, endMinutes] = event.end_time.split(":").map(Number);

  // Calculate hours from 5am
  let hoursFrom5am = startHours - 5;
  if (hoursFrom5am < 0) hoursFrom5am += 24;

  const top = (hoursFrom5am * HOUR_HEIGHT) + ((startMinutes / 60) * HOUR_HEIGHT);

  // Calculate duration in hours
  let duration = (endHours - startHours) + ((endMinutes - startMinutes) / 60);
  if (duration < 0) duration += 24; // Handle events crossing midnight

  const height = duration * HOUR_HEIGHT;

  // Minimum height is 15 minutes: (15/60) * 80px = 20px
  const MIN_DISPLAY_HEIGHT = (15 / 60) * HOUR_HEIGHT; // 20px

  return { top, height: Math.max(height, MIN_DISPLAY_HEIGHT) };
}

export function detectOverlappingEvents(events: ScheduleEvent[]): EventPosition[] {
  const positions = events.map((event) => ({
    event,
    ...calculateEventPosition(event),
    column: 0,
    totalColumns: 1,
  }));

  // Sort by start time
  positions.sort((a, b) => a.top - b.top);

  // Detect overlaps and assign columns
  for (let i = 0; i < positions.length; i++) {
    const current = positions[i];
    const overlapping: EventPosition[] = [current];

    // Find all overlapping events
    for (let j = i + 1; j < positions.length; j++) {
      const next = positions[j];
      // Check if next event starts before current event ends
      if (next.top < current.top + current.height) {
        overlapping.push(next);
      } else {
        break;
      }
    }

    // Assign columns to overlapping events
    if (overlapping.length > 1) {
      overlapping.forEach((pos, index) => {
        pos.column = index;
        pos.totalColumns = overlapping.length;
      });
    }
  }

  return positions;
}

export function shouldEventRecur(
  event: ScheduleEvent,
  targetDate: Date
): boolean {
  if (!event.is_recurring) {
    // One-time event: check if date matches
    if (!event.date) return false;

    // Parse date string as local date (YYYY-MM-DD)
    const [year, month, day] = event.date.split('-').map(Number);
    const eventDate = new Date(year, month - 1, day); // month is 0-indexed

    return (
      eventDate.getFullYear() === targetDate.getFullYear() &&
      eventDate.getMonth() === targetDate.getMonth() &&
      eventDate.getDate() === targetDate.getDate()
    );
  }

  // Recurring event
  if (!event.recurrence_days || event.recurrence_days.length === 0) {
    // Recurs every day
    return true;
  }

  // Check if target date's day of week is in recurrence_days
  const dayOfWeek = targetDate.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
  return event.recurrence_days.includes(dayOfWeek);
}

export function getEventsForDate(
  allEvents: ScheduleEvent[],
  targetDate: Date
): ScheduleEvent[] {
  return allEvents.filter((event) => shouldEventRecur(event, targetDate));
}

export function formatDateHeader(date: Date): string {
  return date.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export function isToday(date: Date): boolean {
  const today = new Date();
  return (
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate()
  );
}
