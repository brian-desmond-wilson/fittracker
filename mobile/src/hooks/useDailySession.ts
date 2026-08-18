// Orchestrates the daily loop: rules tier → one AI ask → persisted session.
// Operational scaffolding copies useFuelPlan: module-scope signature cache +
// in-flight coalescing, exactly one retry (token refresh survival),
// event-driven recompute — never timers, one clock sample per compute.
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
// Canonical home for the calendar-date helpers — lib/dates.ts, not the
// workout-session re-export, which exists only for older call sites.
import { addDays, getLocalDateString, parseLocalDate } from "../lib/dates";
import { rampWeek } from "../lib/dailySplit";
import { muscleCoverage } from "../lib/dailyCoverage";
import { blockEnvelopes } from "../lib/dailyBlockBudget";
import { isRecoveryDay, buildBlockShortlists } from "../lib/dailyBlockShortlist";
import {
  composeBlockFallback,
  validateBlockComposition,
  BLOCK_ORDER,
  SECTION_FOR_BLOCK,
} from "../lib/dailyBlockCompose";
import {
  blockPicksToItems,
  fetchGyms,
  fetchTodayCheckin,
  fetchTodaySession,
  saveGeneratedSession,
} from "../lib/supabase/daily";
import {
  classifyWorkout,
  fetchMuscleRegionNames,
  fetchTaggedWorkouts,
  fetchUsage,
} from "../lib/supabase/workoutTags";
import { fetchCapturedWorkouts } from "../lib/supabase/capture";
import type { BlockPick } from "../types/dailyBlocks";
import type {
  DailyCheckin,
  GymProfile,
  SectionMinutes,
  StoredSession,
} from "../types/daily";

const AI_RETRY_DELAY_MS = 1_200;
const aiAnswerBySignature = new Map<string, BlockPick[] | null>();
const aiAskInFlight = new Map<string, Promise<unknown>>();

/**
 * How far back the ledger read reaches. `muscleCoverage` weighs performances
 * 0-7 days old and discards the rest, so seven would do; the extra day means
 * the edge of the window is the arithmetic's and never the read's. Nothing
 * here needs to reach further — a workout's own last performance arrives with
 * `fetchTaggedWorkouts`, which keeps its own 30-day horizon.
 */
const COVERAGE_WINDOW_DAYS = 8;

/**
 * Attempts per workout per day. Not one, deliberately: `classifyWorkout`
 * answers null for a caption the model made nothing of AND for a call that
 * never reached it, and a single attempt treats those the same — eleven
 * workouts failing together on a spotty connection would bench the whole
 * catalog until tomorrow, and the pull-to-refresh that follows the signal
 * coming back would compose a built-ins-only day instead of repairing it.
 * Three attempts cost three calls in the worst case and cover a transient
 * failure; a caption that can never be classified still stops costing calls.
 */
const CLASSIFY_ATTEMPTS_PER_DAY = 3;
/** In-flight classify calls at once. Each is an OpenAI round trip, and the
 *  compose blocks on all of them. */
const CLASSIFY_POOL = 4;
/**
 * Workouts one compose will try to classify. The backfill exists to bring
 * today's catalog into play, not to process a library: today's eleven fit
 * inside this in a single run, and the share extension's several hundred would
 * otherwise mean several hundred concurrent OpenAI calls, near-certain rate
 * limiting, and a spinner measured in minutes. The overflow is not lost — the
 * catalog arrives newest-first, so a run takes the most recently captured, and
 * the rest are picked up by the loads that follow.
 */
const CLASSIFY_PER_RUN = 12;

/** What a workout's classification has cost today, and the call still on the
 *  wire if there is one. Module scope, so tomorrow or a restart starts over. */
interface ClassifyState {
  date: string;
  attempts: number;
  inFlight: Promise<unknown> | null;
}

/**
 * Lazy classification state, keyed by workout id.
 *
 * `inFlight` coalesces overlapping loads onto one call, because the run-id
 * guard cannot cancel a request already on the wire — it only stops the caller
 * from reading the answer, so a pull-to-refresh during a first-run backfill
 * would otherwise put a second copy of every classify call out there.
 * `attempts` is what stops a workout that can never be classified from costing
 * a call on every single refresh, forever.
 */
const classifyByWorkout = new Map<string, ClassifyState>();

/** Run `task` over `items`, at most `limit` at a time. `next++` needs no lock:
 *  the read and the increment are one synchronous step. */
async function pooled<T>(
  items: T[],
  limit: number,
  task: (item: T) => Promise<unknown>,
): Promise<void> {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) await task(items[next++]);
    }),
  );
}

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
      // Calendar arithmetic, not 24-hour arithmetic: a day either side of a
      // clock change is still a day, and formatting the result back through
      // toISOString would hand the database a UTC date, which is the wrong day
      // for half the world.
      const sinceDate = getLocalDateString(
        addDays(parseLocalDate(today), -COVERAGE_WINDOW_DAYS),
      );
      const [captured, usage, muscleNames, firstRow] = await Promise.all([
        fetchCapturedWorkouts(user.id),
        fetchUsage(user.id, sinceDate),
        fetchMuscleRegionNames(),
        supabase
          .from("generated_sessions")
          .select("session_date")
          .eq("user_id", user.id)
          .order("session_date", { ascending: true })
          .limit(1)
          .maybeSingle()
          .then((r) => r.data),
      ]);
      if (runId !== runIdRef.current) return;

      // ---- Lazy classification backfill (spec §3.1, §8): tag what isn't
      // tagged, in place, before shortlisting. A failure leaves that workout
      // out of play today; the next refresh retries it, up to its budget, and
      // tomorrow starts over. See classifyByWorkout and the three constants
      // above for what bounds this.
      if (muscleNames.length > 0) {
        const due = captured
          .filter((w) => w.tags.classifiedAt === null)
          .filter((w) => {
            const s = classifyByWorkout.get(w.workoutId);
            // Fresh, still on the wire, or with budget left. A workout that
            // has spent today's budget takes no slot, so it can't crowd out
            // one that has never been tried.
            return !s || s.date !== today
              || s.inFlight !== null || s.attempts < CLASSIFY_ATTEMPTS_PER_DAY;
          })
          .slice(0, CLASSIFY_PER_RUN);
        await pooled(due, CLASSIFY_POOL, (w) => {
          const prior = classifyByWorkout.get(w.workoutId);
          const state: ClassifyState = prior && prior.date === today
            ? prior
            : { date: today, attempts: 0, inFlight: null };
          classifyByWorkout.set(w.workoutId, state);
          // Join the call already out there rather than adding to it; it is
          // the same question and it already spent an attempt.
          if (state.inFlight) return state.inFlight;
          if (state.attempts >= CLASSIFY_ATTEMPTS_PER_DAY) return Promise.resolve(null);
          state.attempts += 1;
          // The catch precedes the bookkeeping, so nothing here can reject and
          // leave `inFlight` pointing at a settled call forever.
          const done = classifyWorkout(w, muscleNames)
            .catch(() => null)
            .then((tags) => {
              state.inFlight = null;
              return tags;
            });
          state.inFlight = done;
          return done;
        });
      }
      const tagged = await fetchTaggedWorkouts(user.id, today);
      if (runId !== runIdRef.current) return;
      // null = the read FAILED, which is not the same as an empty catalog.
      // An empty catalog composes a legitimate built-ins-only day, so saving
      // one on a network blip would persist a recovery-shaped day the user
      // never had. Abort instead — the tab reports it and a pull-to-refresh
      // retries, which is honest in a way a wrong day would not be.
      if (tagged === null) throw new Error("couldn't read your workout catalog");
      // Same for the ledger: recency-blind, every workout reads as
      // never-performed, the 4-day repeat gate stops holding and the recency
      // score saturates for everything. `[]` is a real state (a week of rest).
      if (usage === null) throw new Error("couldn't read your training history");

      // ---- Rules tier ----
      const week = rampWeek(firstRow?.session_date ?? null, today);
      const recovery = isRecoveryDay(todayCheckin);
      const coverage = muscleCoverage(usage, today);
      const envelopes = blockEnvelopes(todayCheckin.minutesAvailable, recovery);
      const { shortlists, relaxedMain } = buildBlockShortlists(tagged, {
        coverage,
        soreness: todayCheckin.soreness,
        envelopes,
        rampWeek: week,
        // Told, not inferred: spec §6's "recovery days are mobility and
        // cool-down only" is a rule about the day, not a consequence of the
        // envelope array's shape.
        recoveryDay: recovery,
      });
      // Budget-aware: the fallback runs precisely when the model's answer was
      // rejected, often for overrunning, so handing back the same overrun
      // would make the rejection meaningless.
      const fallbackPicks = composeBlockFallback(
        shortlists, todayCheckin.minutesAvailable,
      );

      // ---- AI tier: one ask per question signature ----
      // Each id carries the block it was offered for, then the whole lot is
      // sorted. Sorting makes the key a function of what was offered rather
      // than of the order the shortlist builder inserts its keys in; the block
      // prefix is what keeps the sort from also erasing WHICH block each id
      // was offered for, so a retag that moves a workout from conditioning to
      // main is a different question and reads as one.
      const shortlistIds = BLOCK_ORDER
        .flatMap((block) => (shortlists[block] ?? []).map(
          (c) => `${block}:${c.workoutId ?? c.builtinKey ?? ""}`,
        ))
        .sort()
        .join(",");
      // The question the composer was asked, and nothing else.
      //
      // The active gym was part of it for the exercise-level engine and is
      // deliberately not part of it here: a block day picks whole workouts,
      // which are never equipment-filtered, so switching gyms cannot change
      // the answer — and recomposing anyway would spend an AI call and throw
      // away a reroll to arrive back at the same day. The row keeps the gym it
      // was stamped with until something that IS an input changes.
      //
      // Three more things reach the model but are deliberately NOT in the key,
      // so two questions that differ only in these share a cache entry and a
      // stored day. All three are judged worth less than the recompute and the
      // lost reroll they would cost, and all three are recorded here rather
      // than discovered later:
      //   - `soreness` — it steers the shortlists, so any soreness edit that
      //     changes what is on offer already moves `shortlistIds`. One that
      //     doesn't could still change the model's phrasing.
      //   - `relaxedMain` — derived from the same shortlists, and it only
      //     changes how the day is described, never which workouts are in it.
      //   - within-block RANK. The sort discards the order the rules tier put
      //     the candidates in, so a coverage shift that re-ranks an unchanged
      //     set reads as the same question. Same property the exercise-level
      //     signature had, kept knowingly.
      const signature = [
        today, todayCheckin.id, todayCheckin.minutesAvailable,
        todayCheckin.energy, recovery ? "recovery" : "train", shortlistIds,
      ].join("::");

      // A reroll is a user decision, and recomposing would overwrite it: the
      // hook recomposes any still-suggested session on every load, and
      // saveGeneratedSession replaces the block rows wholesale. So stop early
      // when the day already on file was composed from exactly these inputs —
      // a changed check-in, or a catalog change that moved the shortlists,
      // changes the signature, which is precisely when a recompose IS wanted.
      if (
        existing &&
        existing.blocks.length > 0 &&
        existing.composeSignature === signature
      ) {
        setSession(existing);
        setLoading(false);
        return;
      }

      const aiBody = {
        mode: "blocks",
        minutes: todayCheckin.minutesAvailable,
        energy: todayCheckin.energy,
        soreness: todayCheckin.soreness,
        relaxedMain,
        coverage: {
          neglected: coverage.neglected.slice(0, 8),
          yesterday: [...coverage.yesterday],
        },
        shortlists: Object.fromEntries(
          Object.entries(shortlists).map(([block, list]) => [
            block,
            (list ?? []).map((c) => ({
              id: c.workoutId ?? c.builtinKey,
              name: c.name,
              minutes: c.minutes,
              roundsNote: c.roundsNote,
              focus: c.focus,
              builtin: c.builtinKey !== null,
              muscles: c.muscles.filter((m) => m.isPrimary).map((m) => m.name),
              // Null for a built-in, which has no history to have — and the
              // edge function drops the field for one anyway, because "never
              // done" on a generic reads as an argument for it over a capture.
              lastPerformedDaysAgo:
                tagged.find((w) => w.workoutId === c.workoutId)?.lastPerformedDaysAgo ?? null,
              score: c.score,
            })),
          ]),
        ),
      };

      let picks: BlockPick[] = fallbackPicks;
      let source: "ai" | "rules_fallback" = "rules_fallback";
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
          cached = validateBlockComposition(
            raw, shortlists, todayCheckin.minutesAvailable,
          );
          aiAnswerBySignature.set(signature, cached);
        }
        if (cached) {
          picks = cached;
          source = "ai";
        }
      } catch (e) {
        // AI failure is not an error state — rules stand alone (spec §5).
        console.warn("compose-session ask failed:", e);
      }
      if (runId !== runIdRef.current) return;

      const items = await blockPicksToItems(picks);
      // Guarded here and not only before the ask: this is the last await before
      // the day is written, and a stale run that got past it would persist a
      // plan built from inputs the user has already changed.
      if (runId !== runIdRef.current) return;
      // blockPicksToItems answers `[]` for a failed read and for a day of
      // built-ins alike, and only one of those is fine — a pick that names a
      // catalog workout always has movements to contribute. The plan is still
      // written, because it is correct and worth showing, but it goes in
      // unclaimed: the gate above would otherwise refuse to recompose it, and
      // a blip would leave the day with a full block plan and nothing under it
      // to log, all day.
      const itemsMissing = items.length === 0 && picks.some((p) => p.workoutId !== null);
      if (itemsMissing) {
        console.warn(
          "compose: no loggable items for a plan with catalog workouts —",
          "saving unclaimed so the next load repairs it",
        );
      }
      // One entry per block, and no two blocks share a section — conditioning
      // is the only block that lands in `accessory`, and `bfr` has no block at
      // all — so nothing here can overwrite anything else.
      const sectionMinutes: SectionMinutes = Object.fromEntries(
        picks.map((p) => [SECTION_FOR_BLOCK[p.block], p.minutes]),
      );
      const sessionId = await saveGeneratedSession({
        userId: user.id,
        date: today,
        gymProfileId: activeGym?.id ?? null,
        checkinId: todayCheckin.id,
        session: {
          splitDay: null, // block sessions never move the PPL rotation
          rampWeek: week,
          source,
          servedCapturedWorkoutId: null,
          items,
          sectionMinutes,
        },
        blocks: picks,
        // Written to its own column, LAST, after the items and blocks land —
        // so a partial failure leaves it null and the next load recomposes
        // rather than trusting a plan that was never finished. Withheld here
        // for the same reason when we can already see that they didn't.
        composeSignature: itemsMissing ? null : signature,
        // Shortlists ride along for reroll; aiBody for audit, same as before.
        inputsSnapshot: { aiBody, shortlists },
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
