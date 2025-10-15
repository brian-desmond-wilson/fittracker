export interface SleepSession {
  id: string;
  user_id: string;
  date: string; // YYYY-MM-DD format - date user woke up
  bedtime: string | null; // ISO timestamp
  wake_time: string; // ISO timestamp
  total_hours: number | null; // Decimal hours
  quality_rating: number | null; // 1-5
  notes: string | null;
  manually_entered: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateSleepSessionInput {
  bedtime?: string; // ISO timestamp
  wake_time: string; // ISO timestamp
  quality_rating?: number; // 1-5
  notes?: string;
  manually_entered?: boolean;
}

export interface UpdateSleepSessionInput {
  bedtime?: string;
  wake_time?: string;
  quality_rating?: number;
  notes?: string;
}

export interface SleepStats {
  averageHours: number;
  averageQuality: number;
  totalNights: number;
  bestNight: SleepSession | null;
  worstNight: SleepSession | null;
}
