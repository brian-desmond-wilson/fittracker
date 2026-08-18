// Orchestrates the daily loop: rules tier → one AI ask → persisted session.
// Operational scaffolding copies useFuelPlan: module-scope signature cache +
// in-flight coalescing, exactly one retry (token refresh survival),
// event-driven recompute — never timers, one clock sample per compute.
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import { getLocalDateString } from "../components/workout-session/helpers";
import { nextSplitDay, rampWeek } from "../lib/dailySplit";
import { buildCandidatePools, resolveProgressions } from "../lib/dailyCandidates";
import { sessionBudget } from "../lib/dailyBudget";
import { composeFallback, validateAiSession } from "../lib/dailyCompose";
import { estimateSectionMinutes } from "../lib/dailySectionMinutes";
import {
  fetchBfrFlag,
  fetchCandidateData,
  fetchGyms,
  fetchTodayCheckin,
  fetchTodaySession,
  saveGeneratedSession,
} from "../lib/supabase/daily";
import { fetchCapturedWorkouts } from "../lib/supabase/capture";
import type {
  ComposedSession,
  DailyCheckin,
  GymProfile,
  StoredSession,
} from "../types/daily";

const AI_RETRY_DELAY_MS = 1_200;
const aiAnswerBySignature = new Map<string, ComposedSession | null>();
const aiAskInFlight = new Map<string, Promise<unknown>>();

async function askComposeSession(body: object): Promise<unknown> {
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, AI_RETRY_DELAY_MS));
    try {
      const { data, error } = await supabase.functions.invoke("compose-session", { body });
      if (error) throw error;
      return data?.composition ?? null;
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError;
}

export interface UseDailySessionValue {
  session: StoredSession | null;
  checkin: DailyCheckin | null;
  activeGym: GymProfile | null;
  gyms: GymProfile[];
  loading: boolean;
  error: Error | null;
  /** Call after any input changes (check-in saved, gym switched). */
  refetch: () => void;
}

export function useDailySession(refreshKey = 0): UseDailySessionValue {
  const [session, setSession] = useState<StoredSession | null>(null);
  const [checkin, setCheckin] = useState<DailyCheckin | null>(null);
  const [gyms, setGyms] = useState<GymProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const runIdRef = useRef(0);

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
      if (existing && (existing.status !== "suggested" || existing.source === "user_pick")) {
        setSession(existing);
        setLoading(false);
        return;
      }

      const activeGym = gymList.find((g) => g.isActive) ?? null;
      const [data, bfr, capturedWorkouts] = await Promise.all([
        fetchCandidateData(user.id),
        fetchBfrFlag(user.id),
        fetchCapturedWorkouts(user.id),
      ]);
      if (runId !== runIdRef.current) return;

      // ---- Rules tier ----
      const splitDay = nextSplitDay(data.lastCompletedSplitDay);
      const week = rampWeek(data.firstSessionDate, today);
      const gymEquipment = new Set(activeGym?.equipmentNames ?? []);
      if (gymEquipment.size === 0) {
        // No gym configured: assume bodyweight basics rather than nothing.
        ["Bodyweight", "Floor", "Wall", "Mat"].forEach((n) => gymEquipment.add(n));
      }
      if (bfr) gymEquipment.add("Bands");

      const pools = buildCandidatePools(data.candidates, {
        splitDay,
        gymEquipment,
        soreness: todayCheckin.soreness,
      });
      pools.main = resolveProgressions(pools.main, {
        skillState: data.skillState,
        regressions: data.regressions,
        byExerciseId: data.byExerciseId,
      });
      const budget = sessionBudget({
        minutes: todayCheckin.minutesAvailable,
        rampWeek: week,
        energy: todayCheckin.energy,
      });
      const fallbackItems = composeFallback(pools, budget);

      // ---- AI tier: one ask per question signature ----
      const offeredIds = new Set(
        [...pools.warmup, ...pools.main, ...pools.cooldown].map((c) => c.exerciseId),
      );
      const offeredWorkoutIds = new Set(capturedWorkouts.map((w) => w.workoutId));
      const signature = [
        today, splitDay, todayCheckin.id, activeGym?.id ?? "no-gym",
        todayCheckin.minutesAvailable, todayCheckin.energy,
        [...offeredIds].sort().join(","),
      ].join("::");

      let composed: ComposedSession = {
        splitDay, rampWeek: week, source: "rules_fallback",
        servedCapturedWorkoutId: null, items: fallbackItems,
        sectionMinutes: estimateSectionMinutes(fallbackItems),
      };

      const aiBody = {
        splitDay,
        minutes: todayCheckin.minutesAvailable,
        budget,
        candidates: [
          ...pools.warmup, ...pools.main, ...pools.cooldown,
        ].map((c) => ({
          id: c.exerciseId,
          name: c.name,
          pool: c.section,
          isCapture: c.isCapture,
          skillLevel: c.skillLevel,
          muscles: c.muscles.filter((m) => m.isPrimary).map((m) => m.name),
          lastPerformedDaysAgo: c.lastPerformedDaysAgo,
          regressedFrom: c.regressedFromId,
          equipmentUnknown: c.equipmentUnknown,
        })),
        capturedWorkouts: capturedWorkouts.map((w) => ({
          id: w.workoutId,
          name: w.name,
          itemCount: w.items.length,
          muscles: "",
        })),
      };

      try {
        let cached = aiAnswerBySignature.get(signature);
        if (cached === undefined) {
          let ask = aiAskInFlight.get(signature);
          if (!ask) {
            ask = askComposeSession(aiBody);
            aiAskInFlight.set(signature, ask);
            ask.finally(() => aiAskInFlight.delete(signature));
          }
          const raw = await ask;
          const validated = validateAiSession(
            raw, offeredIds, offeredWorkoutIds, todayCheckin.minutesAvailable,
          );
          cached = validated
            ? { splitDay, rampWeek: week, source: "ai" as const,
                servedCapturedWorkoutId: validated.servedCapturedWorkoutId,
                items: validated.items,
                // The model's own timings when they held up; our arithmetic
                // when they didn't, so the sections are never left untimed.
                sectionMinutes: validated.sectionMinutes
                  ?? estimateSectionMinutes(validated.items) }
            : null;
          aiAnswerBySignature.set(signature, cached);
        }
        if (cached) composed = cached;
      } catch (e) {
        // AI failure is not an error state — rules stand alone (spec §5.4).
        console.warn("compose-session ask failed:", e);
      }
      if (runId !== runIdRef.current) return;

      const sessionId = await saveGeneratedSession({
        userId: user.id,
        date: today,
        gymProfileId: activeGym?.id ?? null,
        checkinId: todayCheckin.id,
        session: composed,
        // Exercise-level composition has no block plan. Task 13 wires the
        // block engine in here.
        blocks: [],
        composeSignature: signature,
        inputsSnapshot: aiBody,
      });
      if (runId !== runIdRef.current) return;
      if (sessionId) {
        setSession(await fetchTodaySession(user.id, today));
      }
    } catch (e) {
      if (runId === runIdRef.current) setError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      if (runId === runIdRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load, refreshKey]);

  return {
    session,
    checkin,
    gyms,
    activeGym: gyms.find((g) => g.isActive) ?? null,
    loading,
    error,
    refetch: load,
  };
}
