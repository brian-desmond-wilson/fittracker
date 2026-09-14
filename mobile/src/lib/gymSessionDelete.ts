// mobile/src/lib/gymSessionDelete.ts
// What deleting one gym session removes, and in what order. Pure — the
// executor (supabase/gymSessions.ts deleteGymSession) runs these; the pixels
// confirm and reload. Spec 2026-09-14 §5.2.
//
// The order is forced by the FK rules. `captured_workout_usage.session_id`
// is SET NULL on a generated-session delete, so the ledger row must be
// removed FIRST, while the link still points at the session — this is the
// "forget it fully" step, a no-op for program/manual sessions. Then the
// generated session (cascades its blocks, items, debrief, ratings, score),
// then the workout instance (cascades the workout_session, exercises, sets).
// A generated-session delete does NOT remove the instance (the FK the other
// way is SET NULL), so both are deleted explicitly.

export interface DeleteOp {
  table: string;
  column: string;
  id: string;
}

export interface DeletableSession {
  workoutInstanceId: string | null;
  generatedSessionId: string | null;
}

export function gymSessionDeletePlan(session: DeletableSession): DeleteOp[] {
  const ops: DeleteOp[] = [];
  if (session.generatedSessionId) {
    ops.push({ table: "captured_workout_usage", column: "session_id", id: session.generatedSessionId });
    ops.push({ table: "generated_sessions", column: "id", id: session.generatedSessionId });
  }
  if (session.workoutInstanceId) {
    ops.push({ table: "workout_instances", column: "id", id: session.workoutInstanceId });
  }
  return ops;
}
