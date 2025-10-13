export interface EventCategory {
  id: string;
  user_id: string | null;
  name: string;
  color: string;
  icon: string | null;
  is_default: boolean;
  created_at: string;
}

export interface ScheduleEvent {
  id: string;
  user_id: string;
  category_id: string | null;
  title: string;
  start_time: string; // HH:MM:SS format
  end_time: string; // HH:MM:SS format
  date: string | null; // YYYY-MM-DD format, null for recurring
  is_recurring: boolean;
  recurrence_days: number[] | null; // [0=Sun, 1=Mon, ..., 6=Sat]
  status: "pending" | "in_progress" | "completed" | "cancelled";
  notes: string | null;
  created_at: string;
  updated_at: string;
  category?: EventCategory; // Joined data
}

export interface EventTemplate {
  id: string;
  user_id: string | null;
  category_id: string | null;
  title: string;
  default_duration_minutes: number;
  is_system_template: boolean;
  created_at: string;
  category?: EventCategory; // Joined data
}

export interface TimeSlot {
  hour: number; // 0-23
  minute: number; // 0, 15, 30, 45
}

export interface EventPosition {
  event: ScheduleEvent;
  top: number; // Pixels from top
  height: number; // Height in pixels
  column: number; // For overlapping events (0, 1, 2...)
  totalColumns: number; // Total overlapping events at this time
}
