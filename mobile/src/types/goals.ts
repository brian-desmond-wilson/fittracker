// A weekly training goal and its history. Targets are per calendar week.
export interface WeeklyGoal {
  id: string;
  /** The Sunday starting the first week this goal governs (YYYY-MM-DD). */
  effectiveFrom: string;
  sessionsTarget: number;
  /** Null means this metric is not part of the goal — not a target of zero. */
  volumeTargetLbs: number | null;
  regionTarget: number | null;
}

/** What the user can change; the effective date is derived, never typed. */
export interface WeeklyGoalDraft {
  sessionsTarget: number;
  volumeTargetLbs: number | null;
  regionTarget: number | null;
}
