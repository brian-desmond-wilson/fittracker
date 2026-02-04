export type DevTaskSection =
  | "home"
  | "schedule"
  | "track"
  | "progress"
  | "profile"
  | "settings"
  | "training"
  | "other";

export type DevTaskStatus = "open" | "in_progress" | "done";
export type DevTaskPriority = "low" | "medium" | "high";

export interface DevTask {
  id: string;
  user_id: string;
  section: DevTaskSection;
  title: string;
  description: string | null;
  status: DevTaskStatus;
  priority: DevTaskPriority;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}
