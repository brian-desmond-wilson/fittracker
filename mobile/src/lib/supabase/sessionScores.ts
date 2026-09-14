// mobile/src/lib/supabase/sessionScores.ts
// The read and the two writes behind session scores. Reads fail closed to
// "no scores" — the history block then draws days without bars, which is a
// state it already has. Writes report failure as a message the sheet shows
// inline. Spec: docs/superpowers/specs/2026-09-13-session-score-capture-design.md §5.3
import { supabase } from "../supabase";
import { rowFromScore, scoreFromRow } from "../workoutScore";
import type { Score, ScoreRow } from "../workoutScore";

/** generated session id → score, for one workout. */
export async function fetchWorkoutScores(userId: string, workoutId: string): Promise<Map<string, Score>> {
  const { data, error } = await supabase
    .from("session_scores")
    .select("session_id, score_type, value_a, value_b, quality, capped")
    .eq("user_id", userId)
    .eq("workout_id", workoutId);
  if (error) {
    console.error("fetchWorkoutScores failed:", error.message, error.details ?? "");
    return new Map();
  }
  const out = new Map<string, Score>();
  for (const r of (data ?? []) as (ScoreRow & { session_id: string })[]) {
    const s = scoreFromRow(r);
    if (s) out.set(r.session_id, s);
  }
  return out;
}

export type ScoreWriteResult = { ok: true } | { ok: false; message: string };

const FAILED = "Couldn't save the score. Try again.";

export interface UpsertScoreInput {
  userId: string;
  /** generated_sessions.id */
  sessionId: string;
  workoutId: string;
  score: Score;
}

/** One row per session: a second save for the same session replaces it. */
export async function upsertSessionScore(input: UpsertScoreInput): Promise<ScoreWriteResult> {
  const { error } = await supabase
    .from("session_scores")
    .upsert(
      {
        user_id: input.userId,
        session_id: input.sessionId,
        workout_id: input.workoutId,
        ...rowFromScore(input.score),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "session_id" },
    );
  if (error) {
    console.error("upsertSessionScore failed:", error.code ?? "", error.message, error.details ?? "");
    return { ok: false, message: FAILED };
  }
  return { ok: true };
}

export async function deleteSessionScore(sessionId: string): Promise<ScoreWriteResult> {
  const { error } = await supabase.from("session_scores").delete().eq("session_id", sessionId);
  if (error) {
    console.error("deleteSessionScore failed:", error.code ?? "", error.message, error.details ?? "");
    return { ok: false, message: "Couldn't remove the score. Try again." };
  }
  return { ok: true };
}
