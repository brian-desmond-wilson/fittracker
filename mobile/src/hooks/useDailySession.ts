// Drives the daily loop for TODAY: React state, the gates that decide whether
// the day is composable at all, and the run-id guard that keeps a superseded
// load from publishing. Event-driven recompute — never timers.
// The pipeline itself lives in lib/composeDay.ts, and so does everything
// operational it owns: the signature cache, in-flight coalescing, and the one
// retry. The single clock sample taken here is threaded down as `date`.
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
// Canonical home for the calendar-date helpers — lib/dates.ts, not the
// workout-session re-export, which exists only for older call sites.
import { getLocalDateString } from "../lib/dates";
import { composeDay } from "../lib/composeDay";
import {
  fetchGyms,
  fetchTodayCheckin,
  fetchTodaySession,
} from "../lib/supabase/daily";
import type { BlockRole } from "../types/dailyBlocks";
import type {
  DailyCheckin,
  GymProfile,
  StoredSession,
} from "../types/daily";

export interface UseDailySessionValue {
  session: StoredSession | null;
  checkin: DailyCheckin | null;
  activeGym: GymProfile | null;
  gyms: GymProfile[];
  loading: boolean;
  error: Error | null;
  /** Call after any input changes (check-in saved, gym switched). */
  refetch: () => void;
  /** Compose a fresh session on a day already trained. The completed session
   *  keeps its record; a new suggestion is built beside it, steered by what
   *  today's ledger now says was hit. Only meaningful when the day's session
   *  is completed — a no-op otherwise. */
  composeAnother: () => void;
  /** Recompose after a BLOCK-scoped adjust instruction: every other block of
   *  the current suggestion is held fixed for this one compose, so the
   *  instruction can only move the block it was aimed at. Day-scoped
   *  instructions just use refetch — the new instruction already changes the
   *  signature. */
  recomposeBlock: (block: BlockRole) => void;
}

export function useDailySession(refreshKey = 0): UseDailySessionValue {
  const [session, setSession] = useState<StoredSession | null>(null);
  const [checkin, setCheckin] = useState<DailyCheckin | null>(null);
  const [gyms, setGyms] = useState<GymProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const runIdRef = useRef(0);
  // One-shot: set by composeAnother, consumed by the next load() run. A ref,
  // not state — it must not survive the run it was asked for, and it must
  // never itself trigger a render.
  const composeAnotherRef = useRef(false);
  // One-shot, same shape: the block a block-scoped adjust wants re-picked.
  // Consumed by the next run, which holds every OTHER block fixed for that
  // one compose.
  const adjustFocusRef = useRef<BlockRole | null>(null);

  const load = useCallback(async () => {
    const runId = ++runIdRef.current;
    try {
      // Every run re-enters the loading state, not just the first mount: a
      // recompute (check-in saved, gym switched) takes as long as the AI ask,
      // and without this the tab renders its "nothing yet" empty state for the
      // whole wait before snapping to the finished session.
      setLoading(true);
      setError(null);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("not signed in");
      const today = getLocalDateString(); // one clock sample per compute

      const [gymList, todayCheckin, existing] = await Promise.all([
        fetchGyms(user.id),
        fetchTodayCheckin(user.id, today),
        fetchTodaySession(user.id, today),
      ]);
      if (runId !== runIdRef.current) return;
      setGyms(gymList);
      setCheckin(todayCheckin);

      // No check-in yet → nothing to compose; the sheet gates the day.
      if (!todayCheckin) {
        setSession(existing);
        setLoading(false);
        return;
      }
      // Already accepted/completed → show it as stored, never recompose.
      // A workout you picked yourself is never recomposed either, whatever its
      // status: recomposing would quietly undo the choice the moment the tab
      // reloaded or the check-in changed.
      //
      // The one sanctioned way past this gate is composeAnother on a COMPLETED
      // day — a second session composed beside the record, not over it. The
      // flag is consumed here so a pull-to-refresh a minute later goes back to
      // showing the stored day. Completed only: an accepted day is still in
      // progress, and the pending-per-day index couldn't hold two anyway.
      const appendToDay =
        composeAnotherRef.current && existing?.status === "completed";
      composeAnotherRef.current = false;
      // Consumed whether or not this run can honor it — a stale focus must
      // not leak into some later, unrelated recompose.
      const adjustFocus = adjustFocusRef.current;
      adjustFocusRef.current = null;
      if (
        !appendToDay &&
        existing && (existing.status !== "suggested" || existing.source === "user_pick")
      ) {
        setSession(existing);
        setLoading(false);
        return;
      }

      const activeGym = gymList.find((g) => g.isActive) ?? null;
      let composed: { sessionId: string | null };
      try {
        composed = await composeDay({
          userId: user.id,
          date: today,
          checkin: todayCheckin,
          checkinId: todayCheckin.id,
          activeGymId: activeGym?.id ?? null,
          existing,
          appendToDay,
          adjustFocus,
          isStale: () => runId !== runIdRef.current,
        });
      } catch (e) {
        // The pipeline's read-failure aborts published the stored day before
        // throwing when it lived here; keep that contract.
        if (runId === runIdRef.current) setSession(existing);
        throw e;
      }
      if (runId !== runIdRef.current) return;
      if (composed.sessionId) {
        setSession((await fetchTodaySession(user.id, today)) ?? existing);
      } else {
        setSession(existing);
      }
    } catch (e) {
      if (runId === runIdRef.current) setError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      if (runId === runIdRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load, refreshKey]);

  const composeAnother = useCallback(() => {
    composeAnotherRef.current = true;
    load();
  }, [load]);

  const recomposeBlock = useCallback((block: BlockRole) => {
    adjustFocusRef.current = block;
    load();
  }, [load]);

  return {
    session,
    checkin,
    gyms,
    activeGym: gyms.find((g) => g.isActive) ?? null,
    loading,
    error,
    refetch: load,
    composeAnother,
    recomposeBlock,
  };
}
