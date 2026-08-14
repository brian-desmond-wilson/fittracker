import { ScheduleEvent, EventPosition } from "../types/schedule";

export const HOUR_HEIGHT = 80; // Must match TimeGrid component

export function calculateEventPosition(event: ScheduleEvent): {
  top: number;
  height: number;
} {
  const [startHours, startMinutes] = event.start_time.split(":").map(Number);
  const [endHours, endMinutes] = event.end_time.split(":").map(Number);

  // Calculate hours from 5am
  let hoursFrom5am = startHours - 5;
  if (hoursFrom5am < 0) hoursFrom5am += 24;

  const top = hoursFrom5am * HOUR_HEIGHT + (startMinutes / 60) * HOUR_HEIGHT;

  // Calculate duration in hours
  let duration =
    endHours - startHours + (endMinutes - startMinutes) / 60;
  if (duration < 0) duration += 24; // Handle events crossing midnight

  const height = duration * HOUR_HEIGHT;

  // Minimum height is 15 minutes: (15/60) * 80px = 20px
  const MIN_DISPLAY_HEIGHT = (15 / 60) * HOUR_HEIGHT; // 20px

  return { top, height: Math.max(height, MIN_DISPLAY_HEIGHT) };
}

/**
 * Lay overlapping events out side by side.
 *
 * The old pass assigned columns once per event and let later passes overwrite
 * earlier ones: with A 9–11, B 10–12, C 11:30–12:30, the A/B pass put B in
 * column 1, then the B/C pass moved B back to column 0 — on top of A, which
 * it overlaps. Two events drawn in the same column is the one thing this
 * function exists to prevent.
 *
 * The standard calendar layout instead: group events into clusters of
 * transitively overlapping ones, and inside a cluster give each event the
 * first column free at its start time. Every event in a cluster then shares
 * one `totalColumns`, so the columns line up down the whole group rather than
 * changing width partway.
 */
export function detectOverlappingEvents(
  events: ScheduleEvent[]
): EventPosition[] {
  const positions = events.map((event) => ({
    event,
    ...calculateEventPosition(event),
    column: 0,
    totalColumns: 1,
  }));

  // By start, then longest first so the event that spans the cluster takes the
  // leftmost column and the short ones stack to its right.
  positions.sort((a, b) => a.top - b.top || b.height - a.height);

  let cluster: EventPosition[] = [];
  let clusterEnd = -Infinity;
  /** Where each column is free from, for the cluster being built. */
  let columnEnds: number[] = [];

  const closeCluster = () => {
    for (const pos of cluster) pos.totalColumns = columnEnds.length;
    cluster = [];
    columnEnds = [];
    clusterEnd = -Infinity;
  };

  for (const pos of positions) {
    // A gap with nothing running through it ends the group: what follows can
    // start again from the left edge.
    if (pos.top >= clusterEnd) closeCluster();

    let column = columnEnds.findIndex((freeFrom) => freeFrom <= pos.top);
    if (column === -1) {
      column = columnEnds.length;
      columnEnds.push(0);
    }
    columnEnds[column] = pos.top + pos.height;
    pos.column = column;
    cluster.push(pos);
    clusterEnd = Math.max(clusterEnd, pos.top + pos.height);
  }
  closeCluster();

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
    const [year, month, day] = event.date.split("-").map(Number);
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

/** Takes `today` like everything else here, so a screen can hand the same
 *  instant to every question it asks. */
export function isToday(date: Date, today: Date = new Date()): boolean {
  return (
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate()
  );
}
