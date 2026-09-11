// The exercise page's skill note: the latest rating row for (user, exercise)
// with its session's date, and a re-rate that overwrites that row and then
// REPLAYS every row for the exercise into exercise_skill_state. The
// session-end batch path (saveMovementRatings) is untouched.
import { supabase } from "../supabase";
import { replayRatings } from "../skillReplay";
import type { MovementRating } from "../dailySkill";

export interface LatestRating {
  rating: MovementRating;
  sessionId: string;
  /** YYYY-MM-DD of the generated session the rating belongs to. */
  sessionDate: string;
}

interface RatingRow {
  rating: MovementRating;
  session_id: string;
  created_at: string;
  session: { session_date: string; created_at: string } | { session_date: string; created_at: string }[] | null;
}

const sessionOf = (r: RatingRow): { session_date: string; created_at: string } | null =>
  Array.isArray(r.session) ? (r.session[0] ?? null) : r.session;

/** Every rating row for the pair, oldest first (session date, then session
 *  creation, then the row's own creation). Throws on error. */
async function fetchRatingRows(userId: string, exerciseId: string): Promise<RatingRow[]> {
  const { data, error } = await supabase
    .from("movement_ratings")
    .select("rating, session_id, created_at, session:generated_sessions!inner(session_date, created_at)")
    .eq("user_id", userId)
    .eq("exercise_id", exerciseId);
  if (error) throw error;
  const rows = (data ?? []) as unknown as RatingRow[];
  return rows
    .filter((r) => sessionOf(r) !== null)
    .sort((a, b) => {
      const sa = sessionOf(a)!;
      const sb = sessionOf(b)!;
      if (sa.session_date !== sb.session_date) return sa.session_date < sb.session_date ? -1 : 1;
      if (sa.created_at !== sb.created_at) return sa.created_at < sb.created_at ? -1 : 1;
      return a.created_at < b.created_at ? -1 : 1;
    });
}

/** The most recent rating, or null when the reader never rated this exercise
 *  (or the read failed — the note fails closed). */
export async function fetchLatestRating(
  userId: string,
  exerciseId: string,
): Promise<LatestRating | null> {
  try {
    const rows = await fetchRatingRows(userId, exerciseId);
    const last = rows[rows.length - 1];
    if (!last) return null;
    return { rating: last.rating, sessionId: last.session_id, sessionDate: sessionOf(last)!.session_date };
  } catch (e) {
    console.error("fetchLatestRating failed:", e);
    return null;
  }
}

export interface RerateInput {
  userId: string;
  sessionId: string;
  exerciseId: string;
  rating: MovementRating;
}

/** Overwrite the (session, exercise) row, replay, upsert the state.
 *  False = nothing changed (the row was not found or a write failed). */
export async function rerateMovement(input: RerateInput): Promise<boolean> {
  try {
    const { data: updated, error: upError } = await supabase
      .from("movement_ratings")
      .update({ rating: input.rating })
      .eq("user_id", input.userId)
      .eq("session_id", input.sessionId)
      .eq("exercise_id", input.exerciseId)
      .select("id");
    if (upError) throw upError;
    if (!updated || updated.length === 0) throw new Error("rating row not found");

    const rows = await fetchRatingRows(input.userId, input.exerciseId);
    const next = replayRatings(rows.map((r) => r.rating));

    const { error: stateError } = await supabase.from("exercise_skill_state").upsert(
      {
        user_id: input.userId,
        exercise_id: input.exerciseId,
        current_level: next.currentLevel,
        consecutive_too_easy: next.consecutiveTooEasy,
        last_rating: next.lastRating,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,exercise_id" },
    );
    if (stateError) throw stateError;
    return true;
  } catch (e) {
    const err = e as { code?: string; message?: string };
    console.error("rerateMovement failed:", err?.code ?? "", err?.message ?? String(e));
    return false;
  }
}
