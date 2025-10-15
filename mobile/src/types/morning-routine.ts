export type TaskType = 'simple' | 'checklist' | 'weight_entry' | 'medication';

export interface MorningRoutineTemplate {
  id: string;
  user_id: string;
  name: string;
  is_default: boolean;
  target_completion_time: string | null; // HH:MM:SS format
  created_at: string;
  updated_at: string;
}

export interface MorningRoutineTask {
  id: string;
  template_id: string;
  title: string;
  description: string | null;
  order_index: number;
  estimated_minutes: number;
  is_required: boolean;
  task_type: TaskType;
  checklist_items: string[] | null; // For checklist tasks
  created_at: string;
  updated_at: string;
}

export interface TaskCompletionData {
  task_id: string;
  completed_at: string; // ISO timestamp
  skipped: boolean;
  data?: {
    // For weight_entry tasks
    weight?: number;
    weight_unit?: 'lbs' | 'kg';

    // For checklist tasks
    checklist_completed?: string[]; // Array of completed items

    // For medication tasks
    medications_taken?: string[];

    // Any other custom data
    [key: string]: any;
  };
}

export interface MorningRoutineCompletion {
  id: string;
  user_id: string;
  template_id: string;
  date: string; // YYYY-MM-DD format
  started_at: string; // ISO timestamp
  completed_at: string | null; // ISO timestamp
  total_minutes: number | null;
  tasks_completed: TaskCompletionData[];
  created_at: string;
  updated_at: string;
}

export interface CreateMorningRoutineCompletionInput {
  template_id: string;
  started_at?: string; // Defaults to now
}

export interface UpdateMorningRoutineCompletionInput {
  completed_at?: string;
  total_minutes?: number;
  tasks_completed?: TaskCompletionData[];
}

export interface MorningRoutineWithTasks extends MorningRoutineTemplate {
  tasks: MorningRoutineTask[];
}

export interface MorningRoutineProgress {
  totalTasks: number;
  completedTasks: number;
  skippedTasks: number;
  remainingTasks: number;
  estimatedTimeRemaining: number; // minutes
  elapsedTime: number; // minutes
  isOnTrack: boolean; // Based on target completion time
  minutesAheadOrBehind: number; // Positive = ahead, negative = behind
}

export interface DefaultTaskConfig {
  title: string;
  description: string;
  estimated_minutes: number;
  is_required: boolean;
  task_type: TaskType;
  checklist_items?: string[];
}
